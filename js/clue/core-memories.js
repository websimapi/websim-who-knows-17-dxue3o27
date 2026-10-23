// Summarize sustained experiences. A confident trivial observation is not an
// important clue, and seeing someone does not prove they will vouch for us.
import {roomName} from './data.js';
import {short} from './facts.js';
const span=f=>[Number(f.t0)||0,Number(f.t1??f.t0)||0];
const seconds=xs=>{const merged=[];for(const [a,b]of xs.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0])){const last=merged.at(-1);if(last&&a<=last[1]+1)last[1]=Math.max(last[1],b);else merged.push([a,b]);}return merged.reduce((n,[a,b])=>n+b-a,0);};
export function compileMemories(c,notes,assessments){
 const cards=[],groups=new Map();
 for(const f of notes)if(f.kind==='saw'&&f.src==='self'&&f.about===c.id){const key=`${f.day}:${f.room}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 for(const own of groups.values()){
  const first=own[0],duration=seconds(own.map(span));if(duration<20)continue;
  const keys=own.map(f=>f.key),where=roomName(first.room),confidence=Math.round(Math.min(...own.map(f=>assessments[f.key]?.belief??80)));
  const length=duration>=45?'a substantial part of the evening':'a sustained stretch of the evening';
  cards.push({id:`memory:visit:${first.day}:${first.room}`,category:'Room visit',title:`My time in ${where}`,summary:`On night ${first.day}, I spent ${length} in ${where}${own.length>1?', across the recorded parts of my visit':''}. This is my own account, not an independently confirmed alibi.`,belief:confidence,room:first.room,durationSec:duration,factKeys:keys,conflicts:[],score:65+Math.min(20,duration/3),day:first.day,valid:true});
  const people=new Map();
  for(const f of notes)if(f.kind==='saw'&&f.src==='self'&&f.about!==c.id&&f.day===first.day&&f.room===first.room&&(f.clear??0)>=.5){
   const overlap=seconds(own.map(o=>[Math.max(span(o)[0],span(f)[0]),Math.min(span(o)[1],span(f)[1])]));
   if(overlap>0){if(!people.has(f.about))people.set(f.about,[]);people.get(f.about).push(f);}
  }
  for(const [person,seen]of people){
   const intersections=seen.flatMap(f=>own.map(o=>[Math.max(span(o)[0],span(f)[0]),Math.min(span(o)[1],span(f)[1])]));
   const together=seconds(intersections);if(together<12)continue;
   const talk=notes.filter(f=>f.kind==='talked'&&f.src==='self'&&f.day===first.day&&f.room===first.room&&[f.about,f.with].includes(c.id)&&[f.about,f.with].includes(person));
   const potential=talk.length>0;
   cards.push({id:`memory:company:${first.day}:${first.room}:${person}`,category:potential?'Alibi':'Company',title:`${short(person)} · ${where}`,summary:`On night ${first.day}, I remember ${short(person)} alongside me in ${where} for part of my visit. ${potential?'We spoke there, so they may be able to corroborate that part of my account.':'I saw them; that does not establish that they noticed or remember me.'} This does not cover the whole night or prove either of us innocent.`,belief:Math.round(Math.min(confidence,...seen.map(f=>assessments[f.key]?.belief??70))),person,room:first.room,durationSec:together,factKeys:[...keys,...seen.map(f=>f.key),...talk.map(f=>f.key)],conflicts:[],score:(potential?100:88)+Math.min(12,together/3),day:first.day,valid:true});
  }
 }
 return cards;
}
