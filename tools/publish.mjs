import {execFileSync,spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(args)=>execFileSync('git',args,{cwd:repo,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const actual=run(['rev-parse','--show-toplevel']);if(path.resolve(actual).toLowerCase()!==repo.toLowerCase())throw Error('Refusing parent repository');
const target='https://github.com/jinwoon-bot/ghost-exhibitions.git';
if(process.argv.includes('--prepare')){
 run(['config','--local','user.name','jinwoon-bot']);run(['config','--local','user.email','359047697+jinwoon-bot@users.noreply.github.com']);run(['config','--local','credential.username','jinwoon-bot']);run(['config','--local','credential.useHttpPath','false']);
 let existing='';try{existing=run(['remote','get-url','origin']);}catch{}
 if(existing&&existing!==target)throw Error('Unexpected origin');if(!existing)run(['remote','add','origin',target]);
 run(['add','--','site','tools','docs','README.md','.github','.gitignore','.gitattributes']);
 const status=run(['diff','--cached','--name-only']);if(!status){console.log('No new staged changes');process.exit(0);}
 console.log(run(['commit','-m','Collect six exhibitions with shared local models and a single public entrance']));console.log(run(['rev-parse','HEAD']));
}else if(process.argv.includes('--push')){
 if(run(['remote','get-url','origin'])!==target)throw Error('Unexpected origin');
 const p=spawn('git',['-c','credential.username=jinwoon-bot','push','-u','origin','main'],{cwd:repo,windowsHide:true,stdio:'inherit',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});p.on('error',e=>{console.error(e.message);process.exitCode=1;});p.on('close',code=>{process.exitCode=code;});
}else console.log('Use --prepare or --push. Only jinwoon-bot/ghost-exhibitions is targeted.');
