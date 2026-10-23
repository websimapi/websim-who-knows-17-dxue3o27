// Relevance comes from authoritative conversation intent and this speaker's
// notebook. The language model may rephrase these commitments, not invent them.
import {claimLine,short} from './facts.js';
export function contextualReplies(match,me,them,cv){
 const out=[],last=cv.last||{},topic=cv.topic,question=last.line||'';
 const facts=[...match.notes.get(me.id).facts.values()].filter(f=>!f.private&&!(f.lie&&f.src==='self')&&!(me.isKiller&&f.kind==='kill'&&f.about===me.id));
 const add=(text,weight,extra={})=>out.push({tag:'reply',kind:'Answer',tone:'neutral',text,weight,response:true,inReplyTo:question,...extra});
 if(last.kind==='ask'&&topic){
  const related=facts.filter(f=>{
   if(topic.kind==='where')return ['saw','held','talked'].includes(f.kind)&&f.about===me.id&&f.src==='self'&&(topic.day==null||f.day===topic.day)&&(topic.at==null||Math.abs(((f.t0??0)+(f.t1??f.t0??0))/2-topic.at)<=20);
   if(topic.kind==='person')return f.about===topic.id||f.victim===topic.id||f.with===topic.id;
   if(topic.kind==='weapon')return f.weapon===topic.id;
   if(topic.kind==='room')return f.room===topic.id;
   return false;
  }).sort((a,b)=>(b.kind==='kill')-(a.kind==='kill')||(b.day||0)-(a.day||0)||(b.t1??b.t0??0)-(a.t1??a.t0??0));
  for(const f of related.slice(0,3))add(claimLine(f,me.id,them.id),245+(f.src==='self'?10:0)+(f.kind==='kill'?20:0),{tag:'share',fact:f.key,kind:f.src==='self'?'Share':'Pass on',tone:f.kind==='kill'?'urgent':'neutral',witness:f.kind==='kill'&&f.witness===true&&f.src==='self'});
  const unknown=topic.kind==='person'?`I can't give you a reliable account of ${short(topic.id)}.`:topic.kind==='where'?"I can't place myself reliably at that time.":"I don't have anything I can confirm about that.";
  if(!related.length)add(unknown,230,{replyType:'unknown'});
  add("I'd rather not answer that question right now.",175,{replyType:'decline'});
 }else if(last.kind==='casual'&&/how (?:are you|you(?:'re| are))|holding up/i.test(question)){
  const uneasy=/rattled|frightened|guarded|irritable|uneasy/.test(me.temper||'');
  add(uneasy?"I'm on edge, honestly. Talking helps a little.":"I'm managing, thank you. It helps to have someone to talk to.",240,{replyType:'feeling'});
  add("I'd rather keep how I'm feeling to myself for now.",180,{replyType:'decline'});
 }else if(last.kind==='casual'){
  add("I'd feel more comfortable with some company here.",205,{replyType:'opinion'});
 }else if(cv.turns>0&&last.kind&&last.kind!=='goodbye'&&!['search','team_offer'].includes(last.kind)){
  const serious=['open_share','react_share','answer','caught','doubt','offended'].includes(last.kind);
  add(serious?"I'll keep what you've told me in mind.":"I understand. Thank you for telling me.",105,{replyType:'acknowledge'});
 }
 return out;
}
export function rankDialogueOptions(options,note,cv){
 const unique=new Map();
 const weight=o=>{
  if(o.weight!=null)return o.weight;
  if(['pocketYes','pocketNo','teamAccept','teamDecline'].includes(o.tag))return 1000;
  if(o.tag==='share'){
   const f=note.facts.get(o.fact);
   const base=f?.kind==='kill'&&f.src==='self'?220:f?.kind==='kill'?160:f?.kind==='body'?110:55;
   const topic=cv.topic,related=topic&&[f?.about,f?.victim,f?.with,f?.weapon,f?.room].includes(topic.id);
   return base+(related?60:0)+(o.core?45:0);
  }
  if(o.tag==='accuse')return o.witness?195:65;
  if(o.look)return 90;
  if(o.tag==='hairAsk'||o.tag==='team')return 70;
  if(o.kind==='Deceit')return cv.last?.kind==='ask'?125:80;
  if(o.tag==='ask')return 60;
  if(o.tag==='search')return 35;
  if(o.tag==='casual')return 25;
  return 10;
 };
 for(const [order,o]of options.entries()){
  const key=o.fact?`fact:${o.fact}`:JSON.stringify([o.tag,o.topic||null,o.replyType||null,o.target||null,o.bluff||null,o.text]);
  const row={o,order,weight:weight(o)},old=unique.get(key);if(!old||row.weight>old.weight)unique.set(key,row);
 }
 const sorted=[...unique.values()].sort((a,b)=>b.weight-a.weight||a.order-b.order);
 const exit=sorted.find(r=>r.o.tag==='end'),selected=sorted.filter(r=>r!==exit).slice(0,exit?7:8);
 if(exit)selected.push(exit);
 return selected.map(r=>({...r.o,weight:r.weight}));
}
