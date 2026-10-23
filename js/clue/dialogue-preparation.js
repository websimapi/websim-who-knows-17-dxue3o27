import {knownTime} from './time-knowledge.js';
// Host-owned preparation and countdown leases. Preparation never rolls dice,
// delivers facts, changes relationships, starts a conversation or holds time.
import {soulLine} from './souls.js';
import {short} from './facts.js';
import {clockLabel} from './data.js';
import {describeActivity} from './observe.js';
import {losClear} from './nav.js';
export const DialogueMethods={
 dialogueStamp(c,o){
  if(o.id==='butler')return JSON.stringify([this.day,this.phase,c.temper,c.hands,c.pockets,o.coin?.from,o.coinTold?.has(c.id),this.living().map(p=>p.id),this.kills.length]);
  return JSON.stringify([this.day,this.phase,c.room,o.room,c.temper,o.temper,c.isKiller,o.alive,o.ko,o.task?.id,o.task?.complete,o.trust?.[c.id],c.team,o.team,this.coreState(c.id).revision,
   [...this.notes.get(c.id).facts.values()].map(f=>[f.key,f.bloody,f.wet,f.lie]),
   [c,o].map(p=>[p.hands,p.pockets,p.seat,p.anim,(p.pockets||[]).map(id=>{const it=this.props.byId.get(id);return[it?.kind,it?.bloody,it?.wet];})]),
   describeActivity(this,o,c)]);
 },
 engagePayload(c,o,cv){
  const line=soulLine(c.id,'greeting',short(o.id))||`Good evening, ${short(o.id)}.`;
  return {with:o.id,speaker:c.id,line,ai:false,opening:true,options:this.optionsFor(c,o,cv),history:[],day:this.day,clock:knownTime(this,c)?.label||"time unknown",...this.talkCtx(c,o),firstLook:cv.firstLook?.[c.id]||''};
 },
 prepareEngage(c,target){
  const o=target==='butler'?this.butler:this.chars.get(target),now=Date.now();
  if(!c.human||!c.alive||c.ko||c.convo||!o?.alive||o.ko||o.human||o.convo||o.chat||o.outside||this.phase!=='day')return;
  const dx=o.x-c.x,dz=o.z-c.z,yaw=Math.atan2(dx,dz),angle=Math.abs(Math.atan2(Math.sin(yaw-c.yaw),Math.cos(yaw-c.yaw)));
  if(target!=='butler'&&this.perceive(c,o)<=.12)return;
  if(Math.hypot(dx,dz)>2.4||angle>.34||!losClear(c.x,c.z,o.x,o.z,this.doors))return;
  if(now-(c.engageRequestedAt||0)<10000)return;c.engageRequestedAt=now;
  const cv={a:c.id,b:o.id,turns:0,history:[],options:{},firstLook:{[c.id]:describeActivity(this,o,c)}};
  const token=`engage-${c.id}-${c.engageSeq=(c.engageSeq||0)+1}`;
  const draft={target,token,at:now,stamp:this.dialogueStamp(c,o),cv,payload:target==='butler'?this.butlerEngagePayload(c,cv):this.engagePayload(c,o,cv)};
  c.engageDraft=draft;this.toSeat(c.id,{type:'engagePrepared',target,token,payload:draft.payload});
 },
 takeEngage(c,o){
  const d=c.engageDraft;c.engageDraft=null;
  return d&&d.target===o.id&&Date.now()-d.at<12000&&d.stamp===this.dialogueStamp(c,o)?d:null;
 },
 setAIWait(c,a){
  if(!c.human||typeof a.token!=='string'||a.token.length>100)return;
  this.aiWaits ||=new Map();const key=`${c.id}:${a.token}`;
  if(!a.on){this.aiWaits.delete(key);return;}
  const cv=this.convos.get(a.convo);
  if(!c.alive||!cv||c.convo!==a.convo||![cv.a,cv.b].includes(c.id))return;
  // Lease renewal prevents a disconnected or closed client holding the clock.
  if(!this.aiWaits.has(key)&&[...this.aiWaits.values()].filter(w=>w.char===c.id).length>=4)return;
  this.aiWaits.set(key,{char:c.id,convo:a.convo,until:Date.now()+9000});
 },
 clearAIWaitForConvo(id){for(const [key,w]of this.aiWaits||[])if(w.convo===id)this.aiWaits.delete(key);},
 dialogueClockRate(){
  const now=Date.now();for(const [key,w]of this.aiWaits||[])if(w.until<now||!this.chars.get(w.char)?.human||!this.chars.get(w.char)?.alive||this.chars.get(w.char)?.convo!==w.convo||!this.convos.has(w.convo))this.aiWaits.delete(key);
  this.aiWaitCount=this.aiWaits?.size||0;return this.aiWaitCount ? .1 : 1;
 }
};
