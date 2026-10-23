import {emitDiagnostic} from './diagnostics.js';
// Bounded stage counters only: no dialogue, inventory or player identity.
const session=crypto.randomUUID();let count=0;const stages=[];
export function pocketTrace(stage,extra={}){
 emitDiagnostic('pocket.stage',{stage,...extra});
 const row={phase:stage,ageSec:Math.round(performance.now()/1000),...extra};
 stages.push(row);if(stages.length>16)stages.shift();
 document.body.dataset.pocketCheck=JSON.stringify(stages);
 if(count++>=24)return;
 fetch('/api/performance-log',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session,report:{kind:'pockets',version:'cinematic-chat-v3',...row}}),signal:AbortSignal.timeout(5000),keepalive:true}).then(r=>{document.body.dataset.pocketLog=r.ok?'stored':`unavailable-${r.status}`;}).catch(()=>{document.body.dataset.pocketLog='offline';});
}
