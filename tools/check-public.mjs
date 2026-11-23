import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base='https://jinwoon-bot.github.io/ghost-exhibitions/';
const manifest=JSON.parse(await fs.readFile(path.join(repo,'docs/SITE_ASSETS.json'),'utf8'));
const files=manifest.files.filter(f=>!f.path.endsWith('.nojekyll')),results=[],retries=[];let cursor=0;
async function check(f){let r,buffer,err;for(let attempt=0;attempt<2;attempt++){try{r=await fetch(new URL(f.path,base),{signal:AbortSignal.timeout(45000),redirect:'follow'});buffer=Buffer.from(await r.arrayBuffer());err=null;break;}catch(e){err=e.message;retries.push({path:f.path,attempt:attempt+1,error:err});}}
 if(err){results.push({path:f.path,error:err,pass:false});return;}
 const hash=createHash('sha256').update(buffer).digest('hex'),type=r.headers.get('content-type');let expectedHash=f.sha256,expectedBytes=f.bytes,lineEndings='unchanged';
 if(hash!==expectedHash&&/\.(?:json|js|mjs|css|html|md|txt)$/.test(f.path)){
  const working=await fs.readFile(path.join(repo,'site',f.path)),normalized=Buffer.from(working.toString('utf8').replaceAll('\r\n','\n'));
  const committed=execFileSync('git',['show','HEAD:site/'+f.path],{cwd:repo,windowsHide:true,maxBuffer:25*1024*1024});
  if(normalized.equals(committed)){expectedHash=createHash('sha256').update(committed).digest('hex');expectedBytes=committed.length;lineEndings='Git committed LF; verified only CRLF-to-LF difference';}
 }
 results.push({path:f.path,status:r.status,bytes:buffer.length,sha256:hash,content_type:type,line_endings:lineEndings,pass:r.status===200&&buffer.length===expectedBytes&&hash===expectedHash&&(!f.path.endsWith('.wasm')||type?.includes('application/wasm'))});
}
await Promise.all(Array.from({length:6},async()=>{while(cursor<files.length){const f=files[cursor++];await check(f);if(results.length%40===0)console.log('Checked '+results.length+'/'+files.length);}}));
const report={checkedAt:new Date().toISOString(),base,anonymous:true,authorization_header:false,cookies_sent:false,files:files.length,pass:results.every(r=>r.pass),failures:results.filter(r=>!r.pass),transientRetries:retries,results:results.sort((a,b)=>a.path.localeCompare(b.path)),limitations:['Not a test on a second physical PC','Not a real webcam audience test','Does not guarantee future GitHub service availability']};
await fs.writeFile(path.join(repo,'docs/PUBLIC_ACCESS_VALIDATION.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({base,anonymous:true,files:files.length,pass:report.pass,failures:report.failures,retries:retries.length},null,2));if(!report.pass)process.exitCode=1;
