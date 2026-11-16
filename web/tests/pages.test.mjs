import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
const palette=Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map((m)=>[m[1],m[2]]));
test('sampled normal-text palette pairs meet 4.5:1 contrast',()=>{
  const luminance=(hex)=>{const v=[1,3,5].map((i)=>parseInt(hex.slice(i,i+2),16)/255).map((c)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
  for(const [fg,bg] of [['ink','bg'],['muted','bg'],['muted-2','bg'],['sig-ink','sig-bg'],['warn-ink','warn-bg'],['err-ink','err-bg'],['peach-ink','peach']]){
    const a=luminance(palette[fg]),b=luminance(palette[bg]);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${fg}/${bg}`);
  }
});

// Fixed pastel backgrounds keep their colour in both themes; a theme token (var(--ink)) on their text turns
// near-white in dark mode and the text vanishes (chat result chips, Home's last step marker). Text on them must
// use a fixed colour that is readable on that background.
test('text on fixed pastel backgrounds uses fixed, readable ink in both themes',()=>{
  const luminance=(hex)=>{const v=[1,3,5].map((i)=>parseInt(hex.slice(i,i+2),16)/255).map((c)=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
  const rule=(sel)=>css.match(new RegExp(sel.replace(/[.>]/g,(c)=>'\\'+c)+'\\s*\\{([^}]*)\\}'))?.[1]??'';
  for(const [bgSel,fgSel] of [['.ev-facts > span','.ev-facts > span'],['.ev-facts > span','.ev-facts b'],['.hstep-num.last','.hstep-num.last']]){
    const bg=rule(bgSel).match(/background:\s*(#[\da-f]{6})/i)?.[1];
    assert.ok(bg,`${bgSel} background is a fixed colour`);
    const fg=rule(fgSel).match(/(?:^|;)\s*color:\s*(#[\da-f]{6})/i)?.[1];
    assert.ok(fg,`${fgSel} uses a fixed colour, not a theme token`);
    const a=luminance(fg),b=luminance(bg);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${fgSel} on ${bg}`);
  }
});

// Offline component integration only: no browser, effects, network, or Gemini calls.
const region = { id:'mekong_delta',name:'Mekong Delta',bbox:[104.4,8.5,106.9,11.1],is_demo:false };
const variable = { id:'imerg_precip',parameter:'precipitation',parameter_name:'Precipitation',dataset_name:'GPM IMERG',name:'Precipitation',category:'water',description_simple:'Monthly precipitation',description_technical:'Monthly estimate',units:'mm/month',display_units:'mm/month',spatial_resolution_deg:1,native_resolution_deg:.1,coverage:{start:'2001-01',end:'2024-12'},extent:[-180,-90,180,90],available:true,source:{product:'GPM_3IMERGM',version:'07',provider:'NASA GES DISC',url:'https://gpm.nasa.gov/data/imerg'} };
const quality={n_months:288,missing_months:0,coverage_fraction:1,sufficient:true};
const trend={trend_id:'tr_fixture',variable_id:variable.id,region:{type:'preset',...region},start:'2001-01',end:'2024-12',units:'mm/month',method:'seasonal_mk',slope_method:'sen_seasonal',slope_per_decade:3.16,slope_ci:[-1,19],ci_method:'ols_anomaly',ci_level:.95,p_value:.11,p_value_autocorr_adjusted:.45,alpha:.05,autocorrelation_adjusted:false,significant:false,direction:'no_trend',n:288,trend_line:[{t:'2001-01',value:100},{t:'2024-12',value:107}],quality,plain_summary:'Estimated positive trend is not statistically significant.',source:variable.source,warnings:[]};
const series={variable_id:variable.id,region:trend.region,units:'mm/month',points:[{t:'2001-01',value:100,anomaly:0,valid_fraction:1},{t:'2001-02',value:110,anomaly:1,valid_fraction:1}],climatology:Array(12).fill(100),quality,source:variable.source,warnings:[]};
const place={ref:{type:'preset',id:region.id},label:region.name,bbox:region.bbox};
const run={key:trend.trend_id,trend,series,variable,place};
const noop=()=>{};
globalThis.phase6Store={page:'home',ready:true,variables:[variable],regions:[region],variable,sel:{variableId:variable.id,parameter:'precipitation',startYear:2001,endYear:2024,place},run,history:[run],go:noop,setSel:noop,runAnalysis:async()=>true,showError:noop,clearToast:noop,toast:null,tempUnit:'C',setTempUnit:noop,running:false,chatTurns:[{id:'chat1',question:'Explain the trend',context:{},response:{answer:trend.plain_summary,mode:'template',evidence:[{trend,cited_numbers:[]}],warnings:[],actions:[],disclaimer:'Backend evidence'}}],chatBusy:false,sendChat:async()=>{},clearChat:noop,chatContext:null,huntSelection:null,setHuntSelection:noop,progress:null,cancelAnalysis:noop,comparisons:[],addComparison:noop,removeReportItem:noop,backendVersion:'0.2.0',makeCase:()=>null,openCase:async()=>({ok:0,failed:0,changed:[]}),audience:'scientist',setAudience:noop};
const cachePrefix=join(resolve(tmpdir()),'terrascope-page-qa-');
const qaCache=await mkdtemp(cachePrefix);
const server=await createServer({cacheDir:qaCache,server:{middlewareMode:true,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},plugins:[{
  name:'phase6-offline-store',enforce:'pre',
  resolveId(source){if(/(?:^|\/)store(?:\.tsx)?$/.test(source))return '\0phase6-store';},
  load(id){if(id==='\0phase6-store')return `export const useStore=()=>globalThis.phase6Store; export const WORLD={ref:{type:'preset',id:'global'},label:'Whole world',bbox:[-180,-90,180,90]}; export const cellPlace=(lon,lat)=>({ref:{type:'bbox',bbox:[lon,lat,lon+1,lat+1]},label:'Cell',bbox:[lon,lat,lon+1,lat+1]}); export const areaPlace=(bbox)=>({ref:{type:'bbox',bbox},label:'Area',bbox});`;},
}]});
try {
  for(const [name,text] of [['Home','Start'],['Explore','Raw Seasonal MK p'],['Hunt','Investigate differences in environmental trends'],['Detective','Ask Terra'],['Report','95% CI for the OLS anomaly slope']]) {
    const module=await server.ssrLoadModule(`/src/pages/${name}.tsx`);
    test(`${name} renders offline with selected evidence and semantic controls`,()=>{
      if(name==='Report'){module.reportDraft.step=3;module.reportDraft.edition=null;}
      const html=renderToStaticMarkup(createElement(module[name]));
      assert.ok(html.includes(text),name);
      assert.ok(html.includes('<button'),name);
      if(name==='Report'){assert.ok(html.includes('Scientist edition report'));assert.ok(html.includes('GPM_3IMERGM'));assert.ok(html.includes('Raw Seasonal MK p'));assert.ok(html.includes('not the Sen slope'));assert.ok(html.includes('Download PDF'));assert.ok(html.includes('Data file (.json)'));assert.ok(html.includes('Abstract'));assert.ok(html.includes('References'));assert.ok(html.includes('the null hypothesis of no monotonic trend is not rejected'));}
      if(name==='Detective'){assert.ok(html.includes('role="log"'));assert.ok(html.includes('not statistically significant'));assert.ok(html.includes('Details and method'));assert.ok(!html.includes('seasonal_mk'));}
    });
  }
  // Explorer presentation of the SAME fixture: plain wording first, same backend numbers kept in the page.
  for(const [name,text] of [['Explore','What did we find?'],['Hunt','environmental stories don'],['Report','Explorer edition report']]) {
    const module=await server.ssrLoadModule(`/src/pages/${name}.tsx`);
    test(`${name} renders the Explorer presentation of the same evidence`,()=>{
      globalThis.phase6Store={...globalThis.phase6Store,audience:'explorer'};
      if(name==='Report'){module.reportDraft.step=3;module.reportDraft.edition=null;}
      try {
        const html=renderToStaticMarkup(createElement(module[name]));
        assert.ok(html.includes(text),name);
        assert.ok(!html.includes('—'),`${name}: no long dash`);
        if(name==='Explore'){assert.ok(html.includes('+3.16'));assert.ok(html.includes('not strong enough to confirm'));assert.ok(!html.includes('clear upward trend'));}
        if(name==='Report'){assert.ok(html.includes('The discovery'));assert.ok(html.includes('0.110'));assert.ok(html.includes('Statistical test outcome'));assert.ok(!html.includes('Strength of evidence'));assert.ok(html.includes('Behind the discovery'));
          assert.ok(html.includes('Explore the story behind this result'));for(const q of ['What is a trend?','What is a p-value?','How was this calculated?','Why does this result matter?','What are the limitations?'])assert.ok(html.includes(q),q);assert.ok(html.includes('<details'));}
      } finally { globalThis.phase6Store={...globalThis.phase6Store,audience:'scientist'}; }
    });
  }
  const routes=await server.ssrLoadModule('/src/pageRouting.ts');
  test('direct hashes and browser navigation resolve only supported pages',()=>{
    for(const page of ['home','explore','hunt','detective','report'])assert.equal(routes.pageFromHash('#'+page),page);
    assert.equal(routes.pageFromHash('#unknown'),'home');
    // Phase 7: the public landing page is the entry route; app pages keep their deep links.
    for(const h of ['','#','#/','#landing','#/landing'])assert.equal(routes.pageFromHash(h),'landing');
    assert.equal(routes.pageFromHash('#/explore'),'explore');assert.equal(routes.pageFromHash('#/detective'),'detective');
  });
  const places=await server.ssrLoadModule('/src/places.ts');
  const {poleOf}=await server.ssrLoadModule('/src/PolarMap.tsx');
  const {geoArea}=await import('d3-geo');
  test('sea-ice polar grid: projection matches NSIDC, places carry exact pixels, the pole switch follows the place',()=>{
    const near=(a,b,eps=1e-6)=>a.every((v,i)=>Math.abs(v-b[i])<eps);
    assert.ok(near(places.polarPixel(90,0,'N'),[234,154]),'North Pole at row 234, col 154');
    assert.ok(near(places.polarPixel(-90,0,'S'),[174,158]),'South Pole at row 174, col 158');
    for(const [h,r,c] of [['N',10.5,20.5],['N',300.5,250.5],['N',234.5,100.5],['S',50.5,60.5],['S',300.5,300.5]]){
      const [lon,lat]=places.polarLonLat(r,c,h);
      assert.ok(near(places.polarPixel(lat,lon,h),[r,c],1e-6),`${h} ${r},${c} round trip`);
    }
    const one=places.polarPlace('N',[100,100],[120,120]);
    assert.deepEqual(one.ref,{type:'polar',hemi:'N',rows:[100,100],cols:[120,120]});
    assert.ok(!/Area around/.test(one.label),one.label);
    const pole=places.polarPlace('N',[220,250],[140,170]);
    assert.match(pole.label,/^Area around/);
    assert.equal(pole.bbox[0],-180);assert.equal(pole.bbox[2],180);assert.equal(pole.bbox[3],90);
    const shape=places.placeShape(pole);
    assert.equal(shape.geometry.type,'Polygon');assert.ok(geoArea(shape)<2*Math.PI,'ring winds around the square, not the rest of the Earth');
    assert.equal(places.polarPointPlace(30,0),undefined,'30°N is off the Arctic grid');
    assert.equal(places.polarPointPlace(-75,170).ref.hemi,'S');
    assert.equal(poleOf(pole),'N');assert.equal(poleOf(places.polarPlace('S',[1,2],[3,4])),'S');
    assert.equal(poleOf({ref:{type:'preset',id:'arctic'},label:'Arctic',bbox:[-180,66.5,180,90]}),'N');
    assert.equal(poleOf({ref:{type:'preset',id:'global'},label:'Whole world',bbox:[-180,-90,180,90]}),undefined);
    assert.equal(poleOf({ref:{type:'preset',id:'mekong_delta'},label:'Mekong Delta',bbox:[104.4,8.5,106.9,11.1]}),undefined);
  });
  const {api}=await server.ssrLoadModule('/src/api.ts');
  test('API timeout surfaces a retryable error and a subsequent request can succeed',async()=>{
    const oldFetch=globalThis.fetch,oldTimer=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
    try {
      globalThis.setTimeout=(callback)=>{queueMicrotask(callback);return 1;};
      globalThis.clearTimeout=()=>{};
      globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>{
        const stop=()=>reject(new DOMException('Aborted','AbortError'));
        if(init.signal.aborted)stop();else init.signal.addEventListener('abort',stop,{once:true});
      });
      await assert.rejects(api.variables(),(e)=>e.code==='NETWORK_ERROR' && e.retryable);
      globalThis.setTimeout=oldTimer;globalThis.clearTimeout=oldClear;
      globalThis.fetch=async()=>({ok:true,json:async()=>({variables:[variable]})});
      assert.deepEqual(await api.variables(),[variable]);
    } finally {globalThis.fetch=oldFetch;globalThis.setTimeout=oldTimer;globalThis.clearTimeout=oldClear;}
  });
} finally { await server.close();assert.ok(resolve(qaCache).startsWith(cachePrefix));await rm(qaCache,{recursive:true,force:true}); }
