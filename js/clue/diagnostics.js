// Structured diagnostics shared by rendering, rules, dialogue and audio.
// No dialogue text, inventory, account identity, or world coordinates are accepted.
export const BUILD='clue-flashlight-escort-20261020-g';
export const diagnosticSession=globalThis.crypto?.randomUUID?.()||'';
const queue=[],recent=new Map();let sequence=0,dropped=0,pending=false,lastFlush=0;
const TEXT=new Set(['round','trace','screen','reason','category','intent','stage','outcome','mode','phase','avatarMode','quality','source','errorName','action','engine']);
const NUMBER=new Set(['durationMs','count','distance','allowed','correction','interval','work','update','render','ageSec','line','column','status','queueDepth','attempt','dropped','longestTask']);
let context={};
export function diagnosticContext(){return {...context};}
export function setDiagnosticContext(next){context={...context,...next};}
export function emitDiagnostic(event,details={}){
 if(!diagnosticSession||!/^[-a-z0-9_.]{1,64}$/.test(event))return;
 const safe={};for(const [key,value]of Object.entries({...context,...details})){
  if(TEXT.has(key)&&typeof value==='string')safe[key]=value.replace(/[^a-zA-Z0-9_.:/ -]/g,'').slice(0,96);
  if(NUMBER.has(key)&&Number.isFinite(value))safe[key]=Math.max(-1e9,Math.min(1e9,value));
 }
 const now=Date.now(),signature=event+JSON.stringify(safe),prior=recent.get(signature)||0;
 if(now-prior<3000)return;recent.set(signature,now);
 if(recent.size>256)for(const [key,at]of recent)if(now-at>30000)recent.delete(key);
 if(queue.length>=128){queue.shift();dropped++;}
 queue.push({id:`${diagnosticSession}:${++sequence}`,event,at:new Date(now).toISOString(),details:safe});
}
export async function flushDiagnostics(final=false){
 if(pending||!queue.length||!diagnosticSession||!final&&Date.now()-lastFlush<10000)return;
 pending=true;lastFlush=Date.now();const rows=queue.slice(0,24),lost=dropped;
 try{
  const response=await fetch('/api/diagnostics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:diagnosticSession,build:BUILD,dropped:lost,events:rows}),keepalive:final,signal:AbortSignal.timeout(8000)});
  if(response.ok){const ids=new Set(rows.map(r=>r.id));for(let i=queue.length-1;i>=0;i--)if(ids.has(queue[i].id))queue.splice(i,1);dropped=Math.max(0,dropped-lost);}
  if(globalThis.document)document.body.dataset.diagnosticLog=response.ok?'stored':`unavailable-${response.status}`;
 }catch{if(globalThis.document)document.body.dataset.diagnosticLog='offline';}finally{pending=false;}
}
if(globalThis.document){
 setInterval(()=>flushDiagnostics(),10000);
 document.addEventListener('visibilitychange',()=>{emitDiagnostic('page.visibility',{stage:document.hidden?'hidden':'visible'});if(document.hidden)flushDiagnostics(true);});
 globalThis.addEventListener('pagehide',()=>flushDiagnostics(true));
 globalThis.addEventListener('error',e=>emitDiagnostic('runtime.error',{errorName:e.error?.name||'Error',source:String(e.filename||'').split('/').pop(),line:e.lineno,column:e.colno}));
 globalThis.addEventListener('unhandledrejection',e=>emitDiagnostic('runtime.rejection',{errorName:e.reason?.name||'UnknownRejection'}));
}
