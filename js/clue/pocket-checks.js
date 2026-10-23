// Authoritative consent -> spoken response -> opposed inspection. No model
// output chooses a roll, grants consent, or invents pocket contents.
import {trait,soulLine} from './souls.js';
import {itemName} from './data.js';
import {losClear} from './nav.js';
import {bumpSocial,bumpTrust} from './ai.js';
export function pocketRoll(id,defending=false){
 const score=defending?trait(id,'observation')*.5+trait(id,'skepticism')*.3+trait(id,'boldness')*.2:trait(id,'observation')*.45+trait(id,'stealth')*.35+trait(id,'persuasion')*.2;
 const mode=score>=.75?'advantage':score<=.35?'disadvantage':'normal';
 const dice=[1+Math.floor(Math.random()*20)];if(mode!=='normal')dice.push(1+Math.floor(Math.random()*20));
 const roll=mode==='advantage'?Math.max(...dice):Math.min(...dice),bonus=Math.round((score-.5)*8);
 return{roll,dice,bonus,total:roll+bonus,mode,stats:defending?'observation, skepticism, boldness':'observation, stealth, persuasion'};
}
export const PocketMethods={
 beginPocketRequest(asker,target,cv,line){
  if(!cv||cv.pocket||!asker?.alive||!target?.alive||asker.ko||target.ko)return;
  if(target.searchedBy?.has(`${asker.id}:${this.day}`)){this.toast(asker,'You have already checked those pockets today.');return;}
  cv.pocket={asker:asker.id,target:target.id,accepted:false};cv.responseDue=cv.readyFor=cv.waitingFor=null;
  cv.history.push({speaker:asker.id,text:line});cv.turns++;
  this.pocketSpeak(cv,asker,line,'requestSpeech');
 },
 pocketSpeak(cv,speaker,line,stage){
  const p=cv.pocket;if(!p)return;
  p.stage=stage;p.token=`${cv.id}:${cv.pocketSeq=(cv.pocketSeq||0)+1}:${this.time}`;
  for(const id of [cv.a,cv.b])if(this.chars.get(id)?.human)this.toSeat(id,{type:'pocketStatus',stage});
  p.acks=new Set([cv.a,cv.b].filter(id=>this.chars.get(id)?.human));
  if(!p.acks.size)for(const c of this.living())if(c.human&&!c.convo&&Math.hypot(c.x-speaker.x,c.z-speaker.z)<12&&losClear(c.x,c.z,speaker.x,speaker.z,this.doors))p.acks.add(c.id);
  p.deadline=this.time+65;p.wallDeadline=Date.now()+65000;
  cv.waitingFor=cv.readyFor=cv.responseDue=null;this.say(speaker,line,5);
  for(const id of [cv.a,cv.b])if(this.chars.get(id)?.human)this.toSeat(id,{type:'pocketSpeech',id:cv.id,with:id===cv.a?cv.b:cv.a,speaker:speaker.id,line,token:p.token});
  for(const id of p.acks)if(![cv.a,cv.b].includes(id))this.toSeat(id,{type:'pocketAmbientSpeech',id:cv.id,speaker:speaker.id,line,token:p.token});
  if(!p.acks.size)p.ambientUntil=this.time+Math.max(2,line.split(/\s+/).length*.45);
 },
 pocketSpeechDone(c,convo,token){
  const cv=this.convos.get(convo),p=cv?.pocket;
  if(!p||p.token!==token||!p.acks?.has(c.id)||!p.stage.endsWith('Speech'))return;
  p.acks.delete(c.id);if(!p.acks.size)this.advancePocket(cv);
 },
 advancePocket(cv){
  const p=cv.pocket;if(!p)return;const asker=this.chars.get(p.asker),target=this.chars.get(p.target);
  if(!asker?.alive||!target?.alive||asker.ko||target.ko)return this.endConvo(cv.id);
  if(p.stage==='responseSpeech')return this.resolvePocket(cv);
  for(const id of [cv.a,cv.b])if(this.chars.get(id)?.human)this.toSeat(id,{type:'pocketStatus',stage:'response'});
  p.stage='response';p.deadline=this.time+45;p.wallDeadline=Date.now()+60000;
  if(target.human){
   cv.waitingFor=target.id;
   this.toSeat(target.id,{type:'convo',id:cv.id,with:asker.id,speaker:asker.id,line:'May I check your pockets?',options:this.optionsFor(target,asker,cv),pocketResponse:true,...this.talkCtx(target,asker)});
   this.toSeat(asker.id,{type:'convo',id:cv.id,with:target.id,speaker:target.id,line:'…',options:[],waiting:true});
  }else{
   const suspicious=(target.pockets||[]).some(id=>{const it=this.props.byId.get(id);return it&&(it.bloody||it.wet||it.kind==='bleach');});
   const chance=Math.max(.06,Math.min(.9,.45+trait(target.id,'sociability')*.25-trait(target.id,'skepticism')*.25+(target.trust?.[asker.id]||0)*.08-(suspicious?.5:0)));
   this.answerPocket(target,cv,Math.random()<chance);
  }
 },
 answerPocket(target,cv,accept,line=null){
  const p=cv.pocket;if(!p||p.stage!=='response'||p.target!==target.id)return;
  p.accepted=!!accept;const text=line||soulLine(target.id,accept?'pocketYes':'pocketNo')||(accept?'Yes, you may look.':'No. I would rather keep my pockets to myself.');
  cv.history.push({speaker:target.id,text});this.pocketSpeak(cv,target,text,'responseSpeech');
 },
 resolvePocket(cv){
  const p=cv.pocket;if(!p||p.resolved)return;p.resolved=true;
  const asker=this.chars.get(p.asker),target=this.chars.get(p.target);
  const request=p.accepted?null:pocketRoll(asker.id),defense=p.accepted?null:pocketRoll(target.id,true);
  // A tied total preserves the refusal. No natural-roll override.
  const success=p.accepted||request.total>defense.total;
  (target.searchedBy ||=new Set()).add(`${asker.id}:${this.day}`);
  const found=success?(target.pockets||[]).map(id=>this.props.byId.get(id)).filter(Boolean).map(it=>({kind:it.kind,name:itemName(it.kind),bloody:!!it.bloody,wet:!!it.wet})):null;
  if(!p.accepted&&!success){bumpSocial(target,asker.id,.8);bumpTrust(target,asker.id,-.4);}
  // A successful unnoticed glance does not create suspicion or trust damage.
  if(success)for(const it of found)this.learn(asker.id,{kind:'caught',about:target.id,weapon:it.kind,bloody:it.bloody,room:target.room,day:this.day,searched:1,pocketCheck:true,private:!p.accepted,weak:p.accepted?0:1},'self');
  const common={type:'pocketResult',by:asker.id,target:target.id,consent:p.accepted,success,request,defense,day:this.day};
  this.endConvo(cv.id,true);
  this.toSeat(asker.id,{...common,found});this.toSeat(target.id,{...common});
  asker.wait=target.wait=1;target.path=target.auto=null;
 },
 updatePocket(cv){
  const p=cv.pocket;if(!p)return false;
  const a=this.chars.get(p.asker),b=this.chars.get(p.target);
  if(!a?.alive||!b?.alive||a.ko||b.ko||this.time>p.deadline||Date.now()>p.wallDeadline){for(const id of [cv.a,cv.b])if(this.chars.get(id)?.human){this.toSeat(id,{type:'pocketStatus',stage:'interrupted'});this.toast(this.chars.get(id),'Pocket check interrupted. Nothing was revealed.');}this.endConvo(cv.id);return true;}
  if(p.ambientUntil&&this.time>=p.ambientUntil){p.ambientUntil=null;this.advancePocket(cv);}
  return true;
 }
};
