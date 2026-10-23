// Owner-readable game diagnostics. No account IDs, mic recordings or external
// messages. IndexedDB preserves unsent game events across reloads when available.
import {BUILD,diagnosticSession,diagnosticContext} from './diagnostics.js';
const queue=[],sent=new Set();let seq=0,pending=false,dbPromise,projectPromise,persistTimer;
const project=()=>projectPromise??=(globalThis.websim?.getCurrentProject?.().then(p=>p?.id||'').catch(()=>'')||Promise.resolve(''));
function db(){return dbPromise??=new Promise(resolve=>{if(!globalThis.indexedDB)return resolve(null);const r=indexedDB.open('who-knows-game-audit',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('events',{keyPath:'id'});s.createIndex('project','project');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);r.onblocked=()=>resolve(null);});}
const plain=s=>String(s??'').replace(/(?:Bearer\s+)[A-Za-z0-9._~-]+/gi,'[redacted]').replace(/\b(?:sk-|sk_)[A-Za-z0-9_-]{16,}\b/g,'[redacted]').slice(0,1600);
export function auditEvent(kind,details={}){
 const context=diagnosticContext(),round=details.round||context.round;if(!round||!diagnosticSession)return;
 const safe={};for(const k of ['actor','target','speaker','listener','intent','reason','outcome','phase','role','source','stage','mode','room','weapon','victim','strategy'])if(typeof details[k]==='string')safe[k]=plain(details[k]).slice(0,96);
 for(const k of ['line','canonical','proposed'])if(typeof details[k]==='string')safe[k]=plain(details[k]);
 for(const k of ['day','coverage','bonus','dc','roll','durationMs','count','revision','gap','roundNumber'])if(Number.isFinite(details[k]))safe[k]=details[k];
 for(const k of ['concern','witness','success','afterKill'])if(typeof details[k]==='boolean')safe[k]=details[k];
 for(const k of ['cards','notes'])if(Array.isArray(details[k]))safe[k]=details[k].slice(0,24).map(v=>plain(v).slice(0,250));
 if(Array.isArray(details.options))safe.options=details.options.slice(0,8).map(o=>({kind:plain(o.kind).slice(0,40),text:plain(o.text).slice(0,450)}));
 if(queue.length>=1000){const dropped=queue.shift();db().then(d=>{if(d)d.transaction('events','readwrite').objectStore('events').delete(dropped.id);});safe.gap=(safe.gap||0)+1;}
 const row={id:`${diagnosticSession}:${++seq}`,session:diagnosticSession,round,build:BUILD,kind,at:new Date().toISOString(),body:{...safe,mode:context.mode||safe.mode||''}};queue.push(row);
 clearTimeout(persistTimer);persistTimer=setTimeout(()=>persist(),250);
}
async function persist(){const [database,pid]=await Promise.all([db(),project()]);if(!database||!pid)return;const tx=database.transaction('events','readwrite');for(const row of queue)if(!sent.has(row.id))tx.objectStore('events').put({...row,project:pid});}
async function restore(){const [database,pid]=await Promise.all([db(),project()]);if(!database||!pid)return;const request=database.transaction('events').objectStore('events').index('project').getAll(pid,1000);request.onsuccess=()=>{for(const row of request.result)if(!sent.has(row.id)&&!queue.some(q=>q.id===row.id))queue.push(row);};}
export async function flushAudit(final=false){
 if(pending||!queue.length)return;pending=true;const rows=[];let bytes=0;for(const row of queue){if(row.session!==queue[0].session)continue;const size=new TextEncoder().encode(JSON.stringify(row)).length;if(rows.length>=12||bytes+size>48000)break;rows.push(row);bytes+=size;}
 try{await persist();const r=await fetch('/api/game-audit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events:rows}),keepalive:final,signal:AbortSignal.timeout(8000)});if(!r.ok)return;const result=await r.json();if(!result.ok)return;
  const ids=new Set(rows.map(x=>x.id));ids.forEach(id=>sent.add(id));for(let i=queue.length-1;i>=0;i--)if(ids.has(queue[i].id))queue.splice(i,1);
  const database=await db();if(database){const tx=database.transaction('events','readwrite');ids.forEach(id=>tx.objectStore('events').delete(id));}if(sent.size>3000)sent.clear();
 }catch{}finally{pending=false;}
}
if(globalThis.document){restore();setInterval(()=>flushAudit(),5000);document.addEventListener('visibilitychange',()=>{if(document.hidden)flushAudit(true);});globalThis.addEventListener('pagehide',()=>{persist();flushAudit(true);});}
