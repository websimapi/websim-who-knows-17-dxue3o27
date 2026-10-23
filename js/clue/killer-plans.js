import {short} from './facts.js';
import {trait} from './souls.js';
export function frameTarget(match,c){
 const notes=[...match.notes.get(c.id).facts.values()];
 return match.living().filter(p=>!match.killers.includes(p.id)).map(p=>{
  const evidence=notes.filter(f=>f.about===p.id&&!f.private&&['held','caught','dragged','cleaning','ran','watched'].includes(f.kind));
  const score=evidence.reduce((n,f)=>n+(f.bloody?6:f.kind==='held'?3:1),0)+(c.social[p.id]||0)*.35-(c.trust[p.id]||0)*.2+(1-trait(p.id,'persuasion'));
  return {person:p.id,score,keys:evidence.map(f=>f.key)};
 }).sort((a,b)=>b.score-a.score)[0]||null;
}
export function killerCards(match,c){
 if(!c.isKiller)return [];
 const target=frameTarget(match,c),cards=[{id:'plan:cover',category:'Cover story',title:'Build a credible account',summary:'Keep track of places and company that genuinely support my account. Conceal my role without claiming a fabricated alibi is established fact.',belief:null,factKeys:[],conflicts:[],score:125,objective:true}];
 if(target){c.scapegoat=target.person;cards.push({id:`plan:frame:${target.person}`,category:'Frame plan',title:`Divert attention toward ${short(target.person)}`,summary:target.keys.length?'Use the observations I actually have as a starting point for a plausible accusation. Any invented detail remains a deliberate lie, not discovered evidence.':'I do not yet have supporting observations. Find a plausible opportunity to redirect attention; do not treat the plan as evidence.',person:target.person,belief:null,factKeys:target.keys,conflicts:[],score:150,objective:true});}
 const witness=[...(c.knownWitnesses||[])].find(id=>match.chars.get(id)?.alive);
 if(witness)cards.push({id:`plan:witness:${witness}`,category:'Witness threat',title:`${short(witness)} can identify me`,summary:'I observed this witness or heard their firsthand account. Prioritize them when another kill is legal, while avoiding new witnesses. This is a private objective.',person:witness,belief:null,factKeys:[],conflicts:[],score:250,objective:true});
 return cards;
}
