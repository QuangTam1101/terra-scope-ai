/**
 * Product demo video configuration (Landing page, "Watch Demo").
 *
 * The landing page plays the video configured below. With { kind: "none" } it shows an explicit
 * "Product Demo: Coming Soon" frame instead. To change the video, change DEMO_VIDEO only:
 *
 *   // A local file placed in web/public/demo/ (served as /demo/...)
 *   export const DEMO_VIDEO: DemoVideo = {
 *     kind: "file", title: "Terra-scope demo", src: "/demo/terra-scope-demo.mp4",
 *     poster: "/demo/poster.jpg", captions: "/demo/terra-scope-demo.en.vtt",
 *   };
 *
 *   // Or a YouTube video (11-character id from the share link)
 *   export const DEMO_VIDEO: DemoVideo = { kind: "youtube", title: "Terra-scope demo", id: "XXXXXXXXXXX" };
 *
 *   // Or a Google Drive video shared as "Anyone with the link" (the id between /d/ and /view in the share link)
 *   export const DEMO_VIDEO: DemoVideo = { kind: "drive", title: "Terra-scope demo", id: "1AbC..." };
 *
 * Submission rule (Space Apps): the demo video must be 30 seconds or shorter and in English or with
 * English subtitles. Provide a captions file (WebVTT) for the local MP4 option.
 */
export type DemoVideo =
  | { kind: "none" }
  | { kind: "file"; title: string; src: string; poster?: string; captions?: string }
  | { kind: "youtube"; title: string; id: string }
  | { kind: "drive"; title: string; id: string };

// Team demo video "Demo_final.mp4" on Google Drive (shared as "Anyone with the link", checked 15/11/2026), played in
// Drive's own embedded player. The earlier local pitch video stays in web/public/demo/ as a fallback:
// { kind: "file", title: "Terra-Scope AI: pitch video", src: "/demo/terra-scope-ai-pitch.mp4", poster: "/demo/pitch-poster.jpg" }.
export const DEMO_VIDEO: DemoVideo = { kind: "drive", title: "Terra-Scope AI: demo video", id: "1MhZZS5Ej8kTOD07FhYtWfzXJ7EBYB8oc" };

/** Only well-formed YouTube ids produce an embed URL (privacy-enhanced domain); anything else is rejected. */
export function youtubeEmbedUrl(id: string): string | null {
  return /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** Only well-formed Drive file ids produce an embed URL (Drive's preview player); anything else is rejected. */
export function driveEmbedUrl(id: string): string | null {
  return /^[\w-]{25,80}$/.test(id) ? `https://drive.google.com/file/d/${id}/preview` : null;
}

/** True when the configured video can actually be played. */
export function hasPlayableVideo(v: DemoVideo): boolean {
  if (v.kind === "file") return /^(\/|https:\/\/)[^\s]+\.(mp4|webm)$/i.test(v.src);
  if (v.kind === "youtube") return youtubeEmbedUrl(v.id) !== null;
  if (v.kind === "drive") return driveEmbedUrl(v.id) !== null;
  return false;
}
