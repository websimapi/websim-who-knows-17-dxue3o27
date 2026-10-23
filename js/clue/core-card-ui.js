import {SUSPECT_BY_ID} from './data.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=c=>c.objective?'Private objective':c.witness?'Witness · 100%':c.belief==null?'Open question':`${c.belief}% ${['Room visit','Company','Alibi'].includes(c.category)?'recollection support':'belief'}`;
// Vector faces stay legible on small portrait cards. Detail lives on the back
// (hover/focus/tap), never in a permanent paragraph on the play HUD.
const paths={
 eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
 person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
 house:'<path d="m2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7"/>',
 weapon:'<path d="m4 21 5-5M7 14l4 4M9 16 20 3c1 6-2 10-8 14"/>',
 shield:'<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Z"/><path d="m8 11 3 3 5-6"/>',
 drop:'<path d="M12 2S4 11 4 16a8 8 0 0 0 16 0c0-5-8-14-8-14Z"/><path d="M8 15c-1 2 0 4 2 4"/>',
 question:'<path d="M8 7a4 4 0 1 1 7 3c-3 2-3 2-3 5M12 20h.01"/>',
 clue:'<path d="M5 3h14v18H5zM8 7h8M8 11h5M8 15h8M8 18h5"/>',
 meeting:'<circle cx="8" cy="5" r="2"/><circle cx="16" cy="5" r="2"/><path d="M4 12v-1a4 4 0 0 1 8 0M12 11a4 4 0 0 1 8 0v1M2 14h20M5 14v8M19 14v8"/>',
 sofa:'<path d="M5 12V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6M2 10h4v6h12v-6h4v10H2V10ZM5 20v3M19 20v3"/>',
 stairs:'<path d="M2 22h20V2h-5v5h-5v5H7v5H2v5Z"/>',
 mask:'<path d="M3 4c6 3 12 3 18 0v8c0 6-9 10-9 10S3 18 3 12V4ZM6 10h4M14 10h4M8 15c3-2 5-2 8 0"/>',
 hourglass:'<path d="M5 2h14M5 22h14M7 2v4c0 3 10 9 10 12v4M17 2v4c0 3-10 9-10 12v4M9 18h6"/>',
 book:'<path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z"/>',
 plate:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
 brush:'<path d="m10 14 9-12 3 3-10 11M10 14c-6-2-3 5-8 7 8 2 12-3 8-7Z"/>',
 desk:'<path d="M2 9h20M4 9v12M20 9v12M8 3h8v6H8zM14 13h6v4h-6z"/>',
 chair:'<path d="M5 12V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8M3 12h18v5H3zM5 17v5M19 17v5M6 7h12"/>',
 pawn:'<circle cx="12" cy="5" r="3"/><path d="M8 10h8M9 10v4l-4 6v2h14v-2l-4-6v-4"/>',
 tub:'<path d="M2 12h20l-2 7H4l-2-7ZM5 19v3M19 19v3M5 12V5a3 3 0 0 1 6 0M9 6h4"/>',
 door:'<path d="M4 22V2h16v20M7 22V5h10v17M13 14h1"/>',
 pan:'<path d="M2 12h14a7 7 0 0 1-14 0ZM16 13l6-3M6 7V3M11 7V2"/>',
 star:'<path d="m12 2 2.5 6.5L22 12l-7.5 3.5L12 22l-2.5-6.5L2 12l7.5-3.5L12 2Z"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.clue}</svg>`;
const roomSymbol=room=>({library:'book',dining:'plate',art:'brush',office:'desk',conference:'meeting',game:'pawn',bathroom:'tub',kitchen:'pan',lounge:'sofa',hallway:'door',cellar:'stairs'}[room]||'house');
const faces=c=>c.empty?['hourglass']:c.objective?[c.category==='Witness threat'?'eye':'mask','person']:c.category==='Flicker watch'?[roomSymbol(c.room),'eye']:c.category==='Flicker company'?['person','eye']:c.category==='Secure weapon'?['weapon','shield']:c.witness?['eye','star']:c.category==='Accusation'?['person',roomSymbol(c.room),'weapon']:c.category==='Location theory'?[roomSymbol(c.room),'question']:c.category==='Room visit'?[roomSymbol(c.room),'hourglass']:c.category==='Company'?[roomSymbol(c.room),'person']:c.category==='Alibi'?[roomSymbol(c.room),'shield']:c.category==='Suspect'?['person','question']:c.category==='Evidence'?[c.factKeys.some(k=>k.startsWith('blood|'))?'drop':'clue','search']:c.category==='Investigation'?['search','clue']:c.weapon?['weapon','question']:['clue','search'];
const faceLabel=c=>c.empty?'GATHERING':c.category==='Room visit'?'ROOM VISIT':c.category==='Company'?'COMPANY':c.category==='Alibi'?'ALIBI':c.witness?'WITNESS':c.category==='Witness threat'?'WITNESS THREAT':c.category==='Frame plan'?'FRAME PLAN':c.category==='Cover story'?'COVER STORY':c.category==='Flicker watch'?'FLICKER WATCH':c.category==='Flicker company'?'FLICKER COMPANY':c.category==='Secure weapon'?'WEAPON WATCH':c.category==='Location theory'?'LOCATION':c.category.toUpperCase();
export const coreRoomIcon=room=>icon(roomSymbol(room));
// Read-only help samples share the exact HUD symbols and category labels.
export function coreCardExample(card){
 const c={factKeys:[],...card},symbols=faces(c),tone=c.witness?'witness':c.category==='Accusation'?'accusation':c.empty?'question':c.category==='Alibi'?'alibi':c.category==='Room visit'?'visit':c.category==='Company'?'company':'evidence';
 return `<span class="core-card core-${tone}" aria-hidden="true"><span class="core-card-pip">${icon(symbols[0])}</span><span class="core-card-symbols core-symbols-${symbols.length}">${symbols.map(icon).join('')}</span><span class="core-card-label">${esc(faceLabel(c))}</span></span>`;
}
export function renderCoreHud(hud){
  const root=hud.$('.core-story');if(!root)return;
  const s=hud.core;
  const slots=s?.slots||3;
  const cards=Array.from({length:slots},(_,i)=>s?.archive.find(c=>c.id===s.active[i]&&c.valid)||{id:`preparing:${i}`,category:'Collecting',empty:true,title:s?.status==='collecting'?'Collecting the first minute of memories':'Not enough useful information yet',summary:s?.status==='collecting'?'Notes are being collected. Core Cards can begin after one minute of active play, once sustained visits, meaningful company or significant evidence support them.':'This slot is waiting for a meaningful memory or clue. Routine sightings and repeated notes will not fill it just to reach three cards.',belief:null,factKeys:[]});
  const signature=JSON.stringify(cards.map(c=>[c.id,c.title,c.summary,c.category,c.belief,c.witness,c.person,c.room]));
  if(signature===hud.coreHudSignature)return;hud.coreHudSignature=signature;
  root.innerHTML=`<button type="button" class="cards-h core-story-notes" aria-label="Open Today's Story Core Cards in Notes">Today's story</button><div class="core-story-grid">${cards.map((c,i)=>{
    const tip=`core-detail-${hud.char}-${i}`,symbols=faces(c),tone=c.witness?'witness':c.category==='Accusation'?'accusation':c.empty?'question':c.category==='Alibi'?'alibi':c.category==='Room visit'?'visit':c.category==='Company'?'company':'evidence';
    return `<div class="core-card-wrap"><button type="button" class="core-card core-${tone}" aria-label="${esc(c.category+': '+c.title)}" aria-describedby="${tip}" aria-expanded="false"><span class="core-card-pip">${icon(symbols[0])}</span><span class="core-card-symbols core-symbols-${symbols.length}">${symbols.map(icon).join('')}</span>${c.person&&SUSPECT_BY_ID[c.person]?`<span class="core-person-marker" style="--person-color:${SUSPECT_BY_ID[c.person].color}" aria-hidden="true">${icon('person')}</span>`:''}<span class="core-card-label" aria-hidden="true">${esc(faceLabel(c))}</span></button><aside class="core-card-detail" role="tooltip" id="${tip}"><strong>${esc(c.category)} · ${c.empty?'No card drawn':esc(label(c))}</strong><b>${esc(c.title)}</b><p>${esc(c.summary)}</p><small>${c.factKeys.length} supporting note(s) · Manage cards in Notes</small></aside></div>`;
  }).join('')}</div>`;
  root.querySelector('.core-story-notes').onclick=()=>{hud.tab='core';hud.toggleBook(true);};
  const closeOthers=button=>root.querySelectorAll('.core-card-wrap.open').forEach(w=>{if(w!==button.parentElement){w.classList.remove('open');w.querySelector('button').setAttribute('aria-expanded','false');}});
  root.querySelectorAll('.core-card').forEach(button=>{
    button.onpointerenter=e=>{if(e.pointerType!=='touch')closeOthers(button);};button.onfocus=()=>closeOthers(button);
    button.onclick=()=>{const wrap=button.parentElement,open=!wrap.classList.contains('open');root.querySelectorAll('.core-card-wrap.open').forEach(w=>{w.classList.remove('open');w.querySelector('button').setAttribute('aria-expanded','false');});wrap.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open));};
    button.onkeydown=e=>{if(e.key==='Escape'){button.parentElement.classList.remove('open');button.setAttribute('aria-expanded','false');button.blur();e.stopPropagation();}};
  });
}
export function renderCoreBook(hud){
 const body=hud.$('.book-body'),s=hud.core;
 if(!s){body.innerHTML='<p>Core thoughts are being prepared.</p>';return;}
 const all=s.archive.slice().sort((a,b)=>Number(s.active.includes(b.id))-Number(s.active.includes(a.id))||Number(b.valid)-Number(a.valid)||b.score-a.score);
 const pages=Math.max(1,Math.ceil(all.length/20));hud.corePage=Math.min(hud.corePage||0,pages-1);
 const shown=all.slice(hud.corePage*20,(hud.corePage+1)*20);
 body.innerHTML=`<section class="core-book"><p>Belief reflects your character’s evidence and judgment, not a guaranteed probability of guilt. Empty card backs wait for useful information; they are not generated clues. A visit is a self-account; an alibi identifies potential corroboration rather than proof of innocence. Room + hourglass means a room visit; room + person means company; room + shield means a potential alibi. A colored person marker identifies the companion. Recollection support is confidence in the remembered account, not proof of innocence. Direct answers in conversation take priority.</p><div class="core-tools"><button data-recompile>Recompile now</button><button data-refresh>Refresh journal</button><button data-slots="3" ${s.slots===3?'disabled':''}>3 slots</button><button data-slots="4" ${s.slots===4?'disabled':''}>4 slots</button></div><p>${s.compiledDay?`Compiled night ${s.compiledDay}.`:s.status==='collecting'?'Collecting the first minute of memories.':'Waiting for enough useful information.'} Page ${hud.corePage+1} / ${pages}. Choose a slot below to restore or replace a thought. Generation starts after one minute of active day-one play and requires useful support. Recompiles have a 10-second cooldown. Manual slot choices stay in place during opening-day updates; recompile to draw a fresh hand.</p>${shown.map(c=>`<article class="core-record ${c.valid?'':'invalid'}"><header>${esc(c.category)} · ${esc(label(c))}${s.active.includes(c.id)?' · ACTIVE':''}</header><h4>${esc(c.title)}</h4><p>${esc(c.summary)}</p>${c.conflicts?.length?'<p>Conflicting direct evidence reduces confidence.</p>':''}<details><summary>${c.factKeys.length} supporting note(s)</summary>${c.factKeys.map(k=>`<p>${esc(hud.facts.get(k)?.text||'Note retained by the host; request a journal refresh if disconnected.')}</p>`).join('')}</details>${c.valid?Array.from({length:s.slots},(_,i)=>`<button data-card="${esc(c.id)}" data-slot="${i}" ${s.active[i]===c.id?'disabled':''}>Slot ${i+1}</button>`).join(''):`<p>${esc(c.invalidReason)}</p>`}</article>`).join('')}<div class="core-tools"><button data-page="-1" ${hud.corePage===0?'disabled':''}>Previous page</button><button data-page="1" ${hud.corePage+1>=pages?'disabled':''}>Next page</button></div></section>`;
 body.querySelector('[data-refresh]').onclick=()=>hud.send({type:'coreJournal'});
 body.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{hud.corePage+=Number(b.dataset.page);renderCoreBook(hud);});
 body.querySelector('[data-recompile]').onclick=()=>hud.send({type:'coreRecompile'});
 body.querySelectorAll('[data-slots]').forEach(b=>b.onclick=()=>hud.send({type:'coreSlots',slots:Number(b.dataset.slots)}));
 body.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>hud.send({type:'coreEquip',id:b.dataset.card,slot:Number(b.dataset.slot)}));
 hud.bookCols=null;hud.focus.set([...body.querySelectorAll('button')],true);
}
