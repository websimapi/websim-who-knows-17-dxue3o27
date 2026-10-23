// Separate append-only diagnostic archive; never used to authorize game actions.
export const auditSchema=`
CREATE TABLE IF NOT EXISTS game_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT NOT NULL UNIQUE,
 session_id TEXT NOT NULL,round_id TEXT NOT NULL,build TEXT NOT NULL,
 kind TEXT NOT NULL,event_at TEXT NOT NULL,body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_round ON game_audit(round_id,id);
CREATE INDEX IF NOT EXISTS audit_build ON game_audit(build,kind,id);
`;
const rates=new Map(),uuid=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/.test(s),name=s=>typeof s==='string'&&/^[-a-z0-9_.]{1,80}$/.test(s);
const redact=s=>s.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi,'[redacted]').replace(/\b(?:sk-|sk_)[A-Za-z0-9_-]{16,}\b/g,'[redacted]');
function clean(body){
 const out={};
 for(const k of ['actor','target','speaker','listener','intent','reason','outcome','phase','role','source','stage','mode','room','weapon','victim','strategy'])if(typeof body?.[k]==='string')out[k]=body[k].slice(0,96);
 for(const k of ['line','canonical','proposed'])if(typeof body?.[k]==='string')out[k]=redact(body[k]).slice(0,1600);
 for(const k of ['day','coverage','bonus','dc','roll','durationMs','count','revision','gap','roundNumber'])if(Number.isFinite(body?.[k]))out[k]=Math.max(-1e6,Math.min(1e9,body[k]));
 for(const k of ['concern','witness','success','afterKill'])if(typeof body?.[k]==='boolean')out[k]=body[k];
 for(const k of ['cards','notes'])if(Array.isArray(body?.[k]))out[k]=body[k].slice(0,24).filter(x=>typeof x==='string').map(x=>x.slice(0,250));
 if(Array.isArray(body?.options))out.options=body.options.slice(0,8).map(o=>({kind:String(o?.kind||'').slice(0,40),text:String(o?.text||'').slice(0,450)}));
 out.provenance='client_report';return out;
}
export async function gameAudit(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/game-audit'&&request.method==='POST'){
  if(Number(request.headers.get('content-length'))>60000)return Response.json({error:'Too large'},{status:413});
  const text=await request.text();if(text.length>60000)return Response.json({error:'Too large'},{status:413});
  let data;try{data=JSON.parse(text);}catch{return Response.json({error:'Invalid JSON'},{status:400});}
  if(!Array.isArray(data.events)||!data.events.length||data.events.length>12)return Response.json({error:'Invalid events'},{status:400});
  const now=Date.now(),session=data.events[0].session,prior=rates.get(session);
  if(!uuid(session)||prior&&now-prior.at<1000||prior&&now-prior.hour<3600000&&prior.count>=720)return Response.json({error:'Rate limited or invalid session'},{status:429});
  const rows=[];for(const row of data.events){if(!uuid(row.round)||!uuid(row.session)||row.session!==session||typeof row.id!=='string'||!row.id.startsWith(row.session+':')||row.id.length>100||!name(row.kind)||!name(row.build)||!Number.isFinite(Date.parse(row.at))||Date.parse(row.at)>now+60000)return Response.json({error:'Invalid event'},{status:400});rows.push(env.DB.prepare('INSERT OR IGNORE INTO game_audit (event_id,session_id,round_id,build,kind,event_at,body) VALUES (?,?,?,?,?,?,?)').bind(row.id,row.session,row.round,row.build,row.kind,row.at,JSON.stringify(clean(row.body))));}
  for(const row of rows)await row.run();rates.set(session,{at:now,hour:prior&&now-prior.hour<3600000?prior.hour:now,count:prior&&now-prior.hour<3600000?prior.count+1:1});if(rates.size>1000)for(const [id,v]of rates)if(now-v.at>3600000)rates.delete(id);
  return Response.json({ok:true,accepted:rows.length});
 }
 if(request.method==='GET'){
  const owner=request.headers.get('x-websim-project-owner-id');if(!owner||request.headers.get('x-websim-user-id')!==owner)return Response.json({error:'Owner only'},{status:403});
  if(url.pathname==='/api/debug/game-rounds'){const before=Math.max(0,Number(url.searchParams.get('before'))||0);const {results}=await env.DB.prepare('SELECT round_id,MIN(event_at) AS started,MAX(event_at) AS latest,MAX(id) AS cursor,COUNT(*) AS events,COUNT(DISTINCT session_id) AS reporters FROM game_audit GROUP BY round_id'+(before?' HAVING MAX(id) < ?':'')+' ORDER BY MAX(id) DESC LIMIT 200').bind(...(before?[before]:[])).all();return Response.json({rounds:results,nextBefore:results.at(-1)?.cursor||null,provenance:'client_report',coverage:'partial'});}
  const filters=[],args=[];for(const [q,col]of [['round','round_id'],['build','build'],['kind','kind'],['session','session_id']]){const value=url.searchParams.get(q);if(value){filters.push(col+' = ?');args.push(value.slice(0,100));}}
  const after=Math.max(0,Number(url.searchParams.get('after'))||0);if(url.searchParams.has('after')){filters.push('id > ?');args.push(after);}
  const limit=Math.max(1,Math.min(500,Number(url.searchParams.get('limit'))||100)),where=filters.length?' WHERE '+filters.join(' AND '):'';
  const {results}=await env.DB.prepare('SELECT * FROM game_audit'+where+' ORDER BY id '+(url.searchParams.has('after')?'ASC':'DESC')+' LIMIT ?').bind(...args,limit).all();return Response.json({events:results.map(r=>({...r,body:JSON.parse(r.body)})),nextAfter:results.length?Math.max(...results.map(r=>r.id)):after,coverage:'partial',provenance:'client_report'});
 }
 return Response.json({error:'Method not allowed'},{status:405});
}
