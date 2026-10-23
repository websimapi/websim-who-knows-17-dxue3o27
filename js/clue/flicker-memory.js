// Continuity, not room membership. Unknown/occluded intervals remain gaps.
import {roomName,weaponName} from './data.js';
import {short} from './facts.js';
import {auditEvent} from './game-audit.js';
import {tracePoints} from './trace-survey.js';
export const FlickerMethods={
 beginFlickerMemory(afterKill){this.flickerRecord={id:`${this.day}:${this.flickerMemorySeq=(this.flickerMemorySeq||0)+1}`,day:this.day,afterKill,start:this.time,observers:new Map()};},
 observeFlicker(dt){
  const window=this.flickerRecord;if(!window||!this.flickerSealed)return;
  for(const c of this.living()){
   let r=window.observers.get(c.id);if(!r){r={room:c.room,elapsed:0,clearTime:0,people:new Map(),weapons:new Map(),survey:new Set(),surveyAt:-99,gap:false};window.observers.set(c.id,r);}
   r.elapsed+=dt;if(c.ko||c.room!==r.room){r.gap=true;continue;}
   // A lighted patch in front of us is not the whole room.
   const selfClear=this.perceiveAt(c,c.x+Math.sin(c.yaw),c.z+Math.cos(c.yaw),c.room)>.5;if(selfClear)r.clearTime+=dt;
   if(this.time-r.surveyAt>=1){r.surveyAt=this.time;tracePoints(r.room).forEach((p,i)=>{if(Math.hypot(p.x-c.x,p.z-c.z)<=7&&this.perceiveAt(c,p.x,p.z,r.room)>.5)r.survey.add(i);});}
   for(const p of this.living())if(p!==c&&p.room===r.room&&this.perceive(c,p)>.55){const e=r.people.get(p.id)||{seen:0,longest:0,run:0,last:-99};e.run=this.time-e.last<.25?e.run+dt:dt;e.seen+=dt;e.longest=Math.max(e.longest,e.run);e.last=this.time;r.people.set(p.id,e);}
   for(const p of this.weapons.values())if(!p.hidden&&!p.gone&&!p.stash&&p.room===r.room&&this.perceiveAt(c,p.x,p.z,p.room)>.6){let e=r.weapons.get(p.id);if(!e){e={seen:0,first:this.time,last:-99,continuous:true,unhandled:true,x:p.x,z:p.z};r.weapons.set(p.id,e);}if(this.time-e.last>.25&&e.seen>0)e.continuous=false;if(p.holder||Math.hypot(p.x-e.x,p.z-e.z)>.15)e.unhandled=false;e.seen+=dt;e.last=this.time;}
   for(const e of r.weapons.values())if(e.last!==this.time)e.continuous=false;
  }
 },
 finishFlickerMemory(){
  const window=this.flickerRecord;if(!window)return;this.flickerRecord=null;
  for(const [id,r]of window.observers){const c=this.chars.get(id);if(!c?.alive||r.elapsed<2)continue;
   const scope=window.afterKill?'during the later flicker':'during the sealed flicker';
   const coverage=Math.min(r.gap?.5:.95,r.clearTime/r.elapsed),surveyCoverage=r.survey.size/Math.max(1,tracePoints(r.room).length),people=[...r.people].filter(([,e])=>e.seen>=Math.min(3,r.elapsed*.4));
   const weapons=[...r.weapons].map(([weapon,e])=>({weapon,coverage:Math.min(.99,e.seen/r.elapsed),continuous:e.continuous&&e.unhandled&&e.seen/r.elapsed>.98&&!r.gap&&e.first-window.start<.25&&this.time-e.last<.25}));
   const facts=people.map(([person,e])=>({kind:'flickerMemory',window:window.id,day:window.day,room:r.room,about:person,coverage:Math.min(.95,e.seen/r.elapsed),scope,afterKill:window.afterKill,summary:`I kept ${short(person)} in view for part of the time ${scope} in ${roomName(r.room)}. Unseen intervals remain unaccounted for.`}));
   for(const e of weapons)facts.push({kind:'flickerMemory',window:window.id,day:window.day,room:r.room,weapon:e.weapon,coverage:e.coverage,continuous:e.continuous,scope,afterKill:window.afterKill,summary:e.continuous?`I kept the ${weaponName(e.weapon)} in view, unmoved and unhandled, throughout my recorded watch ${scope} in ${roomName(r.room)}. This does not rule out earlier use.`:`I saw the ${weaponName(e.weapon)} ${scope} in ${roomName(r.room)}, with gaps in my view. I cannot certify it stayed secure.`});
   facts.push({kind:'flickerMemory',window:window.id,day:window.day,room:r.room,coverage,surveyCoverage,scope,afterKill:window.afterKill,summary:`${r.gap?'My watch began':'I stayed'} in ${roomName(r.room)} ${scope}. ${people.length?'I recorded the company I could actually see.':'I did not establish a continuously visible companion.'} My recorded scan covered about ${Math.round(surveyCoverage*100)}% of accessible floor samples; this does not certify hidden areas or continuous safety.`});
   if(!this.demo)auditEvent('memory.flicker',{round:this.auditRound,actor:id,day:this.day,room:r.room,coverage,afterKill:window.afterKill,count:facts.length,notes:facts.map(f=>f.summary)});
   for(const f of facts)this.learn(id,f,'self');this.compileCore(id,{background:true,reason:'flicker'});
  }
 }
};
