const fs=require('fs'),path=require('path'),crypto=require('crypto');
const W=process.argv[2],S=process.argv[3];
const r=require(W+'/scripts/generate-routing-surfaces.js');
const glob=fs.readFileSync(W+'/templates/global/kaola-workflow-global.md','utf8');
function section(file){const t=fs.readFileSync(file,'utf8');const a=t.indexOf('## Delegation');const b=t.indexOf('\n## ',t.indexOf('## Runtime adapter facts')+5);if(a<0||b<0)throw new Error('no delegation in '+file);return {src:file,text:t.slice(a,b).trimEnd()+'\n'};}
const src={
 claude:()=>section(W+'/commands/workflow-next.md'),
 codex:()=>section(W+'/plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md'),
 opencode:()=>section(S+'/tree/.opencode/commands/workflow-next.md'),
 kimi:()=>section(S+'/tree/.kimi/skills/workflow-next/SKILL.md'),
};
for(const rt of r.RECOVERY_FULL_DISPATCH_RUNTIMES) src[rt]=()=>({src:'renderCompactRecoveryPrompt('+rt+',github) = candidate always-loaded carrier',text:r.renderCompactRecoveryPrompt(rt,'github',{globalContract:glob})});
for(const [rt,f] of Object.entries(src)){
 const {src:s,text}=f();
 if(!/Runtime dispatch contract/.test(text)) throw new Error(rt+' missing contract');
 const d=path.join(S,rt); fs.mkdirSync(d,{recursive:true});
 const nonce='KW1101-'+rt.toUpperCase()+'-'+crypto.randomBytes(6).toString('hex');
 fs.writeFileSync(path.join(d,'AGENTS.md'),'# Smoke project instructions (#1101 AC7)\n\nThe section below is copied byte-for-byte from the Kaola-Workflow candidate\'s rendered surface for this runtime.\n\n'+text);
 fs.writeFileSync(path.join(d,'nonce.txt'),nonce+'\n');
 fs.writeFileSync(path.join(d,'.contract-source'),s+'\nsha256 '+crypto.createHash('sha256').update(text).digest('hex')+'\n');
 console.log(rt,nonce,s);
}
