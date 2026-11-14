// Minimal Chrome DevTools Protocol driver for end-to-end tests: launches the locally installed Chrome (headless),
// opens one page and exposes navigate / evaluate / waitFor / type / key / printToPDF / viewport. No npm dependency:
// Node 23 has a global WebSocket and fetch.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9333 + Math.floor(Math.random() * 400), width = 1440, height = 900 } = {}) {
  const exe = CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error("No Chrome or Edge found; set CHROME_PATH");
  const profile = await mkdtemp(join(tmpdir(), "terra-e2e-"));
  const proc = spawn(exe, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* starting */ }
    if (!target) await sleep(150);
  }
  if (!target) { proc.kill(); throw new Error("Chrome did not start"); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
  let id = 0;
  const pending = new Map(), listeners = [];
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { const { ok, bad } = pending.get(msg.id); pending.delete(msg.id); msg.error ? bad(new Error(msg.error.message)) : ok(msg.result); return; }
    if (msg.method === "Runtime.exceptionThrown") errors.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") errors.push(`log: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`);
    for (const l of listeners) l(msg);
  };
  // Every protocol call has a deadline, so a test fails with a message instead of hanging.
  const send = (method, params = {}, ms = 120000) => new Promise((ok, bad) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); bad(new Error(`${method} did not answer within ${ms} ms`)); }, ms);
    pending.set(n, { ok: (v) => { clearTimeout(timer); ok(v); }, bad: (e) => { clearTimeout(timer); bad(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });

  const loadAfter = async (action, ms = 30000) => {
    let f;
    const loaded = new Promise((ok, bad) => {
      const timer = setTimeout(() => bad(new Error(`page did not load within ${ms} ms`)), ms);
      f = (m) => { if (m.method === "Page.loadEventFired") { clearTimeout(timer); ok(); } };
      listeners.push(f);
    });
    try { await action(); await loaded; } finally { listeners.splice(listeners.indexOf(f), 1); }
  };
  const page = {
    errors,
    send,
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    async waitFor(condition, { timeout = 30000, label = condition } = {}) {
      const t0 = Date.now();
      for (;;) {
        if (await page.evaluate(`return !!(${condition});`).catch(() => false)) return Date.now() - t0;
        if (Date.now() - t0 > timeout) throw new Error(`timed out after ${timeout} ms waiting for: ${label}`);
        await sleep(200);
      }
    },
    /** Full page load (new document). A hash-only change on the same page fires no load event, so use reload(). */
    async goto(url) { await loadAfter(() => send("Page.navigate", { url })); },
    async reload() { await loadAfter(() => send("Page.reload", {})); },
    /** Waits (pages are lazy-loaded) until the element exists and is enabled, then clicks it like a user would. */
    async click(selectorJs, { timeout = 20000 } = {}) {
      await page.waitFor(`(() => { const el = ${selectorJs}; return el && !el.disabled; })()`, { timeout, label: `clickable: ${selectorJs}` });
      await page.evaluate(`const el = ${selectorJs}; el.scrollIntoView({block:"center"}); el.focus?.(); el.click(); return true;`);
    },
    async type(text) { await send("Input.insertText", { text }); },
    async key(key, code = key, keyCode = 13) {
      // Enter must carry a carriage return so a form submits implicitly, exactly as a real key press does.
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode, ...(key === "Enter" ? { text: String.fromCharCode(13), unmodifiedText: String.fromCharCode(13) } : {}) });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
    },
    async viewport(w, h, mobile = false) { await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile }); },
    async pdf() { return Buffer.from((await send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false })).data, "base64"); },
    async screenshot() { return Buffer.from((await send("Page.captureScreenshot", { format: "png" })).data, "base64"); },
    async close() { try { ws.close(); } catch { /* closed */ } proc.kill(); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => undefined); },
  };
  return page;
}

/** Helpers evaluated in the page. */
export const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.innerText.trim() === ${JSON.stringify(text)})`;
export const byTextStart = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.innerText.trim().startsWith(${JSON.stringify(text)}))`;
