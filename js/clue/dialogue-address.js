// Apply perspective to grammatical references, never to every occurrence of a
// name: "I saw Tomas" -> "I saw you", but "Thanks, Tomas" keeps the name.
import {SUSPECT_BY_ID} from './data.js';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const names=id=>{const p=SUSPECT_BY_ID[id];return p?[...new Set([p.name,p.short])].filter(Boolean).sort((a,b)=>b.length-a.length).map(escape).join('|'):'';};
const listenerVerbs=[['was','were'],['is','are'],['has','have'],['does','do'],["wasn't","weren't"],["isn't","aren't"],["hasn't","haven't"],["doesn't","don't"],['knows','know'],['thinks','think'],['wants','want'],['seems','seem'],['looks','look'],['needs','need'],['keeps','keep'],['says','say'],['carries','carry'],['remembers','remember'],['sees','see'],['suspects','suspect'],['trusts','trust'],['believes','believe'],['feels','feel'],...['had','were','did','ran','killed','wounded','handled','told','said','talked','chatted','knocked','tossed','threw','dragged','moved','stuck','died','bled','scrubbed','cleaned','stood','looked','carried'].map(v=>[v,v])];
export function addressDialogue(text,speaker,listener){
 if(!text||!listener||speaker===listener)return text;
 const listenerNames=names(listener),speakerNames=names(speaker);if(!listenerNames)return text;
 const change=part=>{
  const n=`\\b(?:${listenerNames})\\b`;
  // Dialogue has its own speaker chip. Generated script labels are not speech.
  if(speakerNames)part=part.replace(new RegExp(`^\\s*(?:${speakerNames})\\s*:\\s*`,'i'),'');
  // A name followed by an ordinary spoken question is a vocative, not a label.
  part=part.replace(new RegExp(`(${n})\\s*:\\s*(what|where|how|when|why|who|can|could|would|will|do|did|have|are|is|please|let|tell)\\b`,'gi'),(_,name,word)=>`${name}, ${word.toLowerCase()}`);
  part=part.replace(new RegExp(`Have you seen ${n}(?: anywhere)?( today| tonight)?\\?`,'gi'),(_,when)=>`Where have you been${when||''}?`);
  part=part.replace(new RegExp(`Any idea where ${n} has got to\\?`,'gi'),'Where have you been?');
  part=part.replace(new RegExp(`What['’]s ${n} been up to`,'gi'),'What have you been up to');
  part=part.replace(new RegExp(`${n}['’]s(?=\\s+(?:been|gone|got)\\b)`,'gi'),"you've");
  part=part.replace(new RegExp(`${n}['’]s(?=\\s+(?:looking|holding|carrying|talking|standing|walking|running)\\b)`,'gi'),"you're");
  part=part.replace(new RegExp(`${n}['’]s`,'gi'),'your');
  for(const [verb,replacement]of listenerVerbs)part=part.replace(new RegExp(`${n} ${verb}\\b`,'gi'),`you ${replacement}`);
  part=part.replace(new RegExp(`\\b(saw|seen|noticed|heard|overheard|tell|told|ask|asked|blame|blamed|accuse|accused|with|about|to|from|near|at|of|by) ${n}`,'gi'),'$1 you');
  part=part.replace(new RegExp(`${n} and I\\b`,'gi'),'you and I');
  // No catch-all name replacement: commas, colons and standalone names may
  // mark direct address, not a third-person reference.
  if(speakerNames){
   const own=`\\b(?:${speakerNames})\\b`;
   part=part.replace(new RegExp(`${own}['’]s`,'gi'),'my');
   for(const [verb,replacement]of [['was','was'],['is','am'],['has','have'],['does','do'],['told','told'],['said','said'],['killed','killed'],['wounded','wounded'],['handled','handled']])part=part.replace(new RegExp(`${own} ${verb}\\b`,'gi'),`I ${replacement}`);
   part=part.replace(new RegExp(`\\b(with|about|to|from|near|told|heard|accusing|blaming) ${own}`,'gi'),'$1 me');
  }
  // Repair the narrow malformed patterns produced by the older formatter if
  // they reappear in generation based on a previous conversation line.
  part=part.replace(/\b(you too|thank you|thanks),\s+you(?=[,.!?:]|$)/gi,'$1');
  const name=SUSPECT_BY_ID[listener].short;
  part=part.replace(/\b(off the record),\s+you:/gi,(_,prefix)=>`${name}, can we talk off the record?`);
  return part.replace(/([.!?]\s+)([a-z])/g,(_,stop,letter)=>stop+letter.toUpperCase());
 };
 return String(text).split(/("[^"\n]*"|“[^”\n]*”)/g).map((part,i)=>i%2?part:change(part)).join('').replace(/(^|[.!?]\s+)(you|your)\b/g,(_,a,b)=>a+b[0].toUpperCase()+b.slice(1));
}
