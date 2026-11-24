import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import vm from 'node:vm';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),site=path.join(repo,'site'),files=[];
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isSymbolicLink())throw Error('Symlink not allowed: '+p);if(item.isDirectory())await walk(p);else{const b=await fs.readFile(p);files.push({path:path.relative(site,p).replaceAll('\\','/'),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}}}await walk(site);
const available=new Set(files.map(f=>f.path)),catalog=JSON.parse(await fs.readFile(path.join(site,'catalog.json'),'utf8'));if(catalog.length!==6)throw Error('Six works required');
for(const work of catalog)for(const p of [work.entry,work.extra].filter(Boolean))if(!available.has(p))throw Error('Missing entry '+p);
let syntaxChecks=0,links=0;const failures=[];
for(const f of files){if(/(^|\/)(\.env[^/]*|node_modules|\.git)(\/|$)|\.(exe|zip|blend|mov|psd)$/i.test(f.path))failures.push('Unwanted deployment file '+f.path);if(f.bytes>100*1024*1024)failures.push('File exceeds GitHub limit '+f.path);
 if(/\.(?:m?js)$/.test(f.path)&&!/(^|\/)(vendor|lib\/mediapipe)\//.test(f.path)){
  try{execFileSync(process.execPath,['--check',path.join(site,f.path)],{stdio:'pipe',windowsHide:true});syntaxChecks++;}catch(e){failures.push('Syntax '+f.path+' '+e.stderr);}
 }
 if(/\.html$/.test(f.path)){
  const s=await fs.readFile(path.join(site,f.path),'utf8');
  for(const match of s.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)){const raw=match[1];if(/^(?:https?:|data:|blob:|#|mailto:|javascript:|about:)/.test(raw))continue;if(raw.startsWith('/')){failures.push('Absolute HTML path '+f.path+' '+raw);continue;}const decoded=decodeURIComponent(raw.split(/[?#]/)[0]);if(!decoded)continue;let p=path.posix.normalize(path.posix.join(path.posix.dirname(f.path),decoded));if(p.endsWith('/'))p+='index.html';if(!available.has(p))failures.push('Broken HTML link '+f.path+' '+p);links++;}
 }
}
const workerPaths=['works/wedding/vision-worker.js','works/only-on-screen/vision-worker.js','works/forbidden-broadcast/vision-worker.js','works/only-on-screen-live/segment-worker.js'];let routes=0;
class OffscreenCanvasStub { getContext(){return {};}}
for(const p of workerPaths){const helper=p.includes('wedding')?'appURL':'local',context={self:{location:{href:'https://example.test/nested/repo/'+p}},URL,OffscreenCanvas:OffscreenCanvasStub};vm.createContext(context);vm.runInContext((await fs.readFile(path.join(site,p),'utf8'))+'\nself.resolveForCheck='+helper+';',context);for(const asset of ['models/pose_landmarker_lite.task','vendor/vision_bundle.js','vendor/wasm']){const u=new URL(context.self.resolveForCheck(asset)),relative=u.pathname.replace('/nested/repo/','');if(asset.endsWith('/wasm')){if(!available.has(relative+'/vision_wasm_internal.wasm'))failures.push('Bad wasm route '+relative);}else if(!available.has(relative))failures.push('Bad worker route '+relative);routes++;}}
const bytes=files.reduce((s,f)=>s+f.bytes,0);const report={checkedAt:new Date().toISOString(),works:catalog.length,files:files.length,bytes,syntaxChecks,htmlLinks:links,workerSharedRoutes:routes,failures};
await fs.mkdir(path.join(repo,'docs'),{recursive:true});await fs.writeFile(path.join(repo,'docs/STATIC_VALIDATION.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(repo,'docs/SITE_ASSETS.json'),JSON.stringify({files},null,2));console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
