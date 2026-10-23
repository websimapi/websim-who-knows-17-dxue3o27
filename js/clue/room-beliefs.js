// Abductive game beliefs, deliberately fallible. Inputs are ONLY this notebook.
// A body's discovery location is an observation; its murder location is a theory.
import {trait} from './souls.js';
import {roomName,weaponName} from './data.js';
import {short} from './facts.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function roomBeliefs(id,notes,body,assessments={}) {
  const skepticism=trait(id,'skepticism'),observation=trait(id,'observation');
  const reasoning=.45*skepticism+.35*observation+.2*trait(id,'memory');
  const relevant=notes.filter(f=>f.day>=body.day),result=new Map();
  const weight=f=>(assessments[f.key]?.belief??f.assessment?.belief??(f.src==='self'?90:45))/100;
  const at=room=>{if(!result.has(room))result.set(room,{room,belief:room===body.room?(.67-.23*skepticism)*weight(body):.12,keys:room===body.room?[body.key]:[],reasons:[],counter:[]});return result.get(room);};
  const found=at(body.room);found.reasons.push('The body was found here; that alone does not establish the killing location.');
  const witnessed=relevant.find(f=>f.kind==='kill'&&f.victim===body.about&&f.witness&&f.src==='self');
  if(witnessed)return [{room:witnessed.room,belief:100,keys:[witnessed.key],reasons:['I directly witnessed the killing here.'],counter:[],witness:true}];
  // Observing a relocation establishes movement, NOT where the attack began.
  for(const f of relevant.filter(f=>f.kind==='dragged'&&f.victim===body.about)){
    const w=weight(f);found.belief-=(f.from&&f.room===body.room?.39:.2)*(.6+reasoning)*w;
    found.keys.push(f.key);found.counter.push(f.from?`The body was seen moving from ${roomName(f.from)} into ${roomName(f.room)}.`:'The body was seen being dragged. Its discovery location may be misleading.');
    if(f.from){const r=at(f.from);r.belief+=.28*w;r.keys.push(f.key);r.reasons.push('A known transfer came from this room; it is a lead, not proof of origin.');}
  }
  const counted=new Set();let cleaningPenalty=0,ragPenalty=0;
  for(const f of relevant){
    if(!f.room)continue;
    const r=at(f.room),w=weight(f);
    if(f.kind==='blood'){
      const patternKey=f.room+':'+(f.pattern||'unknown');if(counted.has(patternKey))continue;counted.add(patternKey);
      const strength=f.pattern==='pool'?.19:f.pattern==='smear'?.06:.04;
      r.belief+=strength*(.5+reasoning)*w;r.keys.push(f.key);
      r.reasons.push(f.hidden?'Blood was actually revealed with the Lens.':'Blood was actually observed here.');
      if(f.pattern==='smear'){found.belief-=.1*(.5+reasoning)*w;found.keys.push(f.key);found.counter.push('A blood smear may indicate transfer; it has not been linked to this victim.');}
      if(f.room!==body.room&&f.pattern==='pool'){r.belief+=.24*w;found.belief-=.06*reasoning*w;}
    }
    if(f.kind==='wound'&&f.victim===body.about){r.belief=Math.max(r.belief,.78*w+.12);r.keys.push(f.key);r.reasons.push('An assault on this victim was observed here.');if(f.room!==body.room){found.belief-=.3*w;found.keys.push(f.key);found.counter.push('An assault on this victim was observed in another room.');}}
    if(f.kind==='bleach'||f.kind==='cleaning'){
      // Cleaning may be a chore. Neither bleach nor a rag establishes murder.
      if(f.room===body.room){const penalty=Math.min(Math.max(0,.08-cleaningPenalty),.045*reasoning*w);found.belief-=penalty;cleaningPenalty+=penalty;found.keys.push(f.key);found.counter.push('Cleaning makes missing traces less informative; it may also be innocent.');}
    }
    if(f.bloody&&['caught','inbin','binned'].includes(f.kind)&&/rag|towel|mop/.test(f.weapon||'')){
      const penalty=Math.min(Math.max(0,.06-ragPenalty),.04*reasoning*w);found.belief-=penalty;ragPenalty+=penalty;found.keys.push(f.key);found.counter.push('A bloodied cleaning item raises a cleanup possibility, but its blood is not linked to this victim.');
    }
  }
  // Only a real, adequately covered search can supply negative evidence. No
  // note means NOT SEARCHED. A Lens search is more sensitive, never infallible.
  const surveys=new Map();
  for(const f of relevant.filter(f=>f.kind==='traceSurvey')){const k=f.room+':'+f.method;const old=surveys.get(k);if(!old||f.coverage>old.coverage||f.coverage===old.coverage&&f.t0>old.t0)surveys.set(k,f);}
  const expectsBlood=!!body.weapon&&!/rope/.test(body.weapon)||relevant.some(f=>f.kind==='wound'&&f.victim===body.about&&!/rope/.test(f.weapon||''));
  const bestSurvey=[...surveys.values()].filter(f=>f.room===body.room).sort((a,b)=>(b.method==='lens'?.19:.07)*b.coverage-(a.method==='lens'?.19:.07)*a.coverage)[0];
  for(const f of bestSurvey?[bestSurvey]:[])if(f.room===body.room&&!f.bloodSeen&&f.coverage>=.6&&expectsBlood){
    const knowsLens=notes.some(n=>n.kind==='toolKnowledge'&&n.tool==='lens');
    const sensitive=f.method==='lens'&&knowsLens;
    const observedBlood=relevant.some(n=>n.kind==='blood'&&n.room===body.room);
    // A new clean floor never erases a previous actual blood observation.
    if(!observedBlood){found.belief-=(sensitive?.19:.07)*f.coverage*(.5+reasoning)*weight(f);found.keys.push(f.key);found.counter.push(sensitive?'An actual Lens-assisted search found no blood in the inspected areas; removal or missed traces remain possible.':'An actual visual search found no visible blood in the inspected areas; hidden or removed traces remain possible.');}
  }
  return [...result.values()].map(r=>({...r,belief:Math.round(clamp(r.belief,.03,.94)*100),keys:[...new Set(r.keys)]})).filter(r=>r.keys.length).sort((a,b)=>b.belief-a.belief);
}
export function accusationTheory(c,notes,body,rooms,assessments){
  const skepticism=trait(c.id,'skepticism'),out=[];
  for(const person of new Set(notes.filter(f=>f.about&&f.about!==c.id).map(f=>f.about))){
    const own=notes.filter(f=>f.day===body.day&&f.about===person);
    const attacks=own.filter(f=>f.kind==='wound'&&f.victim===body.about&&f.weapon===body.weapon);
    const bloody=own.filter(f=>f.bloody&&['caught','binned','held'].includes(f.kind)&&f.weapon===body.weapon&&!f.weak);
    const held=own.filter(f=>f.kind==='held'&&f.weapon===body.weapon);
    if(!attacks.length&&(!bloody.length||!held.length))continue;
    const links=[...attacks,...bloody,...held];
    const credibility=Math.min(...links.map(f=>(assessments[f.key]?.belief??50)/100));
    const personConfidence=(attacks.length?.94:.85-.05*skepticism)*credibility;
    for(const room of rooms){
      // A suspect actually seen with the matching weapon in the discovery room
      // can persuade a less skeptical soul despite undetected body relocation.
      const coLocated=held.some(f=>f.room===room.room);
      const roomConfidence=clamp(room.belief/100+(coLocated?.22*(1-.25*skepticism):0),0,.94);
      const confidence=Math.round(Math.min(personConfidence,roomConfidence,.94*credibility)*100);
      if(confidence<=75)continue;
      out.push({id:`inference:${body.key}:${person}:${room.room}:${body.weapon}`,category:'Accusation',title:`${short(person)} · ${roomName(room.room)} · ${weaponName(body.weapon)}`,summary:'This is my best supported explanation of the person, room and weapon. The room is inferred and could be wrong if the scene was staged.',belief:confidence,witness:false,person,weapon:body.weapon,room:room.room,victim:body.about,factKeys:[...new Set([body.key,...links.map(f=>f.key),...room.keys])],conflicts:[],score:confidence+20});
    }
  }
  return out;
}

// Canonical spoken hypotheses keep uncertainty explicit. They are not new facts.
export function coreTheoryFact(c,card,day,concern=true){
 const memory=['Room visit','Company','Alibi'].includes(card.category);
 if(memory){const where=roomName(card.room),person=card.person?short(card.person):'some company';const line=card.category==='Room visit'?`I spent a while in ${where} earlier.`:card.category==='Alibi'?`I spoke with ${person} in ${where} earlier.${concern?' They may remember that part of the evening too.':''}`:`I remember seeing ${person} in ${where} while I was there.`;return {kind:'theory',memory:true,about:c.id,victim:null,room:card.room,belief:Math.min(94,card.belief||0),origin:c.id,day,line};}
 const room=roomName(card.room),victim=card.victim?short(card.victim):'the victim';
 const line=card.category==='Accusation'?`I suspect ${short(card.person)}, with the ${weaponName(card.weapon)} in ${room}. That's my explanation, not something I witnessed.`:card.belief>=55?`I think ${room} may be where ${victim} was killed, but the scene could be misleading.`:`I'm not convinced ${room} is where ${victim} was killed. I would like to check the scene more carefully.`;
 return {kind:'theory',about:c.id,victim:card.victim||null,room:card.room,suspect:card.person||null,weapon:card.weapon||null,belief:Math.min(94,card.belief||0),origin:c.id,day,line};
}
