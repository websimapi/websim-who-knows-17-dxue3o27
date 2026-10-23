import {renderCoreHud,renderCoreBook} from './core-card-ui.js';
import {emitDiagnostic} from './diagnostics.js';
import {addressDialogue} from './dialogue-address.js';
import {pocketTrace} from './pocket-diagnostics.js';
// HUD and overlays. One PlayerHud per local player (placed in that player's
// half of the screen), plus shared cutscene and accusation-table overlays.
import { SUSPECTS, SUSPECT_BY_ID, WEAPONS, WEAPON_BY_ID, ROOM_LIST, DAY_SECONDS, LAST_DAY, roomName, weaponName, personName, itemName } from "./data.js";
import { voice, voiceChoices, prepareDialogue, dialogueJob, innerVoice, taskThoughts, inspectionThought, witnessThought, itemThought, pocketThought } from "./talk.js";
import { rollDice } from "./dice3d.js";
import { speak, narrate, stopSpeak, sfx } from "./audio.js";
import { TASK_BY_ID, TOOL_NAME } from './tasks.js';
import { PoolPanel } from './pool-ui.js';
import { TaskPanel } from './task-ui.js';
import {BarberPanel} from './barber-ui.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const chip = (id) => `<span class="pchip" style="--c:${SUSPECT_BY_ID[id]?.color}">${esc(SUSPECT_BY_ID[id]?.short || id)}</span>`;
export const portrait = (id, cls = "") => `<div class="portrait ${cls}" style="--c:${SUSPECT_BY_ID[id].color}"><div class="sil"></div><span>${esc(SUSPECT_BY_ID[id].short)}</span></div>`;
const WEAPON_ICON = { flashlight: "🔦", knife: "🔪", broken_pipe: "╱", pistol: "🔫", hammer: "🔨", kitchen_knife: "🔪", rope: "➰", two_handed_sword: "⚔", halberd: "🪓" };
const VISUAL_FACTS = new Set(["saw", "ran", "held", "body", "kill", "wound", "blood", "bleach", "cleaning", "caught", "binned", "knocked", "missing", "watched", "burned", "threw", "dragged", "ghost", "talked", "inbin", "peekCaught"]);
const pocketSpeechJobs=new Map();
const INNER_THOUGHT_GAP = 42000;
const IMPORTANT_THOUGHT_GAP = 18000;

// Keyboard/controller focus over a set of buttons.
export class Focus {
  constructor() { this.items = []; this.i = 0; }
  set(items, keep = false) { this.items = items.filter(b=>b&&!b.disabled); if (!keep) this.i = 0; this.i = Math.min(this.i, Math.max(0, this.items.length - 1)); this.paint(); }
  paint() { this.items.forEach((b, i) => b.classList.toggle("focus", i === this.i)); this.items[this.i]?.scrollIntoView?.({ block: "nearest" }); }
  handle(inp, { grid = null } = {}) {
    if (!this.items.length) return false;
    if (grid) return this.handleGrid(inp, grid);
    if (inp.up) { this.i = (this.i - 1 + this.items.length) % this.items.length; this.paint(); }
    if (inp.down) { this.i = (this.i + 1) % this.items.length; this.paint(); }
    if (inp.num >= 0 && this.items[inp.num]) { this.items[inp.num].click(); return true; }
    if (inp.confirm) { this.items[this.i]?.click(); return true; }
    return false;
  }
  handleGrid(inp, cols) {
    cols=cols.map(col=>col.filter(b=>this.items.includes(b)&&!b.disabled)).filter(col=>col.length);if(!cols.length)return false;
    // cols: array of arrays of buttons
    let c = cols.findIndex((col) => col.includes(this.items[this.i]));
    let r = c >= 0 ? cols[c].indexOf(this.items[this.i]) : 0;
    if (c < 0) c = 0;
    if (inp.left) c = (c - 1 + cols.length) % cols.length;
    if (inp.right) c = (c + 1) % cols.length;
    if (inp.up) r--;
    if (inp.down) r++;
    const col = cols[c];
    r = (r + col.length) % col.length;
    const next = col[Math.min(r, col.length - 1)];
    if (inp.left || inp.right || inp.up || inp.down) { this.i = this.items.indexOf(next); this.paint(); }
    if (inp.confirm) { this.items[this.i]?.click(); return true; }
    return false;
  }
}

export class PlayerHud {
  constructor({ index, char, device, send, root, names, secret = false }) {
    this.index = index; this.char = char; this.device = device; this.send = send; this.names = names || {};
    this.secret = secret; this.peek = false; this.peekForced = false; this.decideState = null; this.flickerOn = false; this.ghost = null;
    this.role = null; this.facts = new Map(); this.privateFinds = new Map(); this.marks = {}; this.held = null; this.alive = true;
    this.controllerActive=!!device?.startsWith('pad:');
    this.convo = null; this.accState = null; this.rebuts = []; this.myProposal = null;
    this.el = h("div", "phud");
    this.el.innerHTML = `
      <div class="ph-top">
        <div class="role"></div>
        <button class="note-indicator" type="button" aria-label="Open detective notes"><span aria-hidden="true">▤</span> Notes <small class="note-count">0</small></button>
        <div class="daily-task hidden" aria-live="polite"></div>
        <div class="team-badge hidden" aria-live="polite"></div>
        <div class="cards core-story" aria-label="Today’s Story Core Cards"></div>
      </div>
      <div class="inv"></div>
      <div class="stamina hidden" aria-label="Stamina"><span class="stamina-fill"></span><small></small></div>
      <div class="crouch-status hidden" role="status">Crouching · ½ speed</div>
      <div class="toasts"></div>
      <div class="prompt hidden"></div>
      <div class="noted hidden"></div>
      <div class="dlg hidden">
        <div class="d-caption"><div class="d-name"></div>
        <div class="d-line" aria-live="off"></div></div>
        <div class="d-timer hidden"></div>
        <div class="d-opts hidden" role="group" aria-label="Choose your response"></div>
      </div>
      <div class="body-menu hidden"></div>
      <div class="book hidden">
        <div class="book-head"><b>Detective's Notes</b><span class="book-tabs"><button data-tab="sheet" class="on">Sheet</button><button data-tab="clues">Investigation Log</button><button data-tab="core">Core Cards</button></span><button class="book-x">✕</button></div>
        <div class="book-body"></div>
      </div>
      <div class="accp hidden"></div>
      <div class="deadcard hidden"></div>
      <div class="kocard hidden"><b>Out cold</b><span>Your head rings in the dark. Someone could shake you awake — otherwise you'll come round when the night moves on.</span></div>
      <div class="decide hidden"></div>
      <div class="gstat hidden"></div>
      <div class="reticle"></div>
      <div class="rolecard hidden"></div>`;
    root.append(this.el);
    this.$ = (s) => this.el.querySelector(s);
    this.poolPanel = new PoolPanel(this.el, this.send, (event, task) => this.taskReflection(event, task));
    this.taskPanel = new TaskPanel(this.el, this.send, (event, task) => this.taskReflection(event, task));
    this.barberPanel=new BarberPanel(this.el,this.send);
    this.focus = new Focus();
    this.tab = "sheet";
    this.$(".book-x").onclick = () => this.toggleBook(false);
    this.$(".note-indicator").onclick = () => this.toggleBook(true);
    this.noteCueAt = new Map(); this.lastThoughtAt = -Infinity; this.witnessVoiceBusy = false; this.pendingItemThoughts = [];
    this.el.querySelectorAll(".book-tabs button").forEach((b) => b.onclick = () => { this.tab = b.dataset.tab; this.renderBook(); });
    this.renderCards();
    this.inv = { hands: [null, null], pockets: [null, null] };
    this.renderInv();
  }
  setRect(r) { Object.assign(this.el.style, { left: `${r.x}px`, top: `${innerHeight - r.y - r.h}px`, width: `${r.w}px`, height: `${r.h}px` }); this.el.classList.toggle("narrow", r.w < 620); }
  setStamina(s) {
    const el = this.$(".stamina");
    const show = !!s && (s.value < 99 || s.running || s.exhausted);
    el.classList.toggle("hidden", !show);
    if (!show) return;
    el.classList.toggle("exhausted", s.exhausted);
    el.querySelector(".stamina-fill").style.width = `${Math.round(s.value)}%`;
    el.querySelector("small").textContent = s.exhausted ? "OUT OF BREATH" : s.running ? "RUNNING" : "RECOVERING";
  }
  setCrouched(on) {
    if (this.crouched === on) return;
    this.crouched = on; this.$('.crouch-status').classList.toggle('hidden', !on);
  }

  // ---------- messages from the rules engine ----------
  onMsg(m) {
    switch (m.type) {
      case 'barberOpen':this.barberPanel.open(m).catch(error=>{console.error('Haircut view failed',error);this.barberPanel.close(true);});break;
      case 'barberProgress':this.barberPanel.progress(m.progress);break;
      case 'barberClose':this.barberPanel.close();break;
      case "role": this.role = m.killer ? "killer" : "savior"; this.partner = m.partner || null; this.duo = !!m.duo; this.lastDay = m.lastDay || LAST_DAY; this.renderRole(); this.showRoleCard(); break;
      case 'voteGuide': {this.voteGuide=m;const key=`${m.day}:${m.stage}:${m.round}`;if(this.voteGuideKey!==key&&this.accState?.stage===m.stage){this.voteGuideKey=key;this.pick=m.recommended?{...m.recommended}:null;}if(this.accState)this.renderAcc();break;}
      case 'team': this.teamWith = m.on ? m.with : null; this.renderTeam(); break;
      case 'task': this.task = m.task; this.workProgress = m.task?.progress || {}; this.renderTask(); if (m.task?.id === 'pool' && m.task.complete) this.poolPanel.finishReflection(); break;
      case 'coreJournal': for(const f of m.facts||[])this.facts.set(f.key,f);this.core=m.core;this.updateNoteCount();renderCoreHud(this);if(this.bookOpen)this.renderBook();break;
      case 'coreCards': this.core=m;renderCoreHud(this);if(this.bookOpen)this.renderBook();break;
      case 'taskInvestigation': rollDice(this.el,{roll:m.die,bonus:m.bonus,dc:m.dc,success:m.success,head:'Room investigation',result:m.line});this.toast(`Room investigation: ${m.die} + ${m.bonus} vs ${m.dc} · ${m.success?'success':'miss'} · quality ${m.quality}%`);this.thought(m.line,{important:true});break;
      case 'investigationReflection': if(!this.convo&&this.alive)this.thought(m.line,{important:true});break;
      case "fact": this.facts.set(m.fact.key, m.fact); this.updateNoteCount(); if(!m.replay&&!m.fact.pocketCheck)this.onFact(m.fact, m.privateContext); if (this.bookOpen) this.renderBook(); break;

      case "inv": this.inv = m; this.held = m.hands.find((x) => WEAPON_BY_ID[x?.kind])?.kind || null; this.renderInv(); break;
      case "wound": this.bleeding = !!m.bleeding; this.renderInv(); break;
      case "attackLock": this.lockedTarget = m.target || null; break;
      case "drag": this.dragLeft = m.left; this.renderInv(); break;
      case 'engagePrepared':this.prepareEngage(m);break;
      case 'pocketStatus':pocketTrace(m.stage);break;
      case 'pocketSpeech':this.playPocketSpeech(m);break;
      case 'pocketAmbientSpeech':this.playPocketSpeech(m,true);break;
      case 'pocketResult':this.showPocketResult(m);break;
      case "dice": this.showDice(m); break;
      case "dialogueDice": rollDice(this.el, { roll: m.roll, bonus: m.bonus, dc: m.dc, success: m.success, head: m.tag === "Pass on" ? `You pass word to ${chip(m.target)}` : `You ${esc(m.tag.toLowerCase())} with ${chip(m.target)}`, result: m.result }); break;
      case "peekResult": this.peekForced = !m.success && !!m.killRequired; this.showPeekResult(m); this.renderDecide(); break;
      case "ko": this.ko = !!m.on; this.$(".kocard").classList.toggle("hidden", !this.ko); if (!m.on && m.text) this.toast(m.text); break;
      case "toast": this.toast(m.text); break;
      case "ashes": this.showAshes(m); break;
      case "noted": this.noted(m.text, m.from); break;
      case "convo": this.openConvo(m); break;
      case "convoTimer": if (this.convo?.id === m.id) this.startConvoTimer(m.secs); break;
      case "convoEnd": if (this.convo?.id === m.id) this.closeConvo(); break;
      case "dead": this.alive = false; this.caught = !!m.caught; this.poolPanel.close(); this.taskPanel.close(); this.renderTask(); this.renderTeam(); this.closeConvo(); this.closeBodyMenu(); this.showDead(); this.renderInv(); break;
      case "voteRejected":this.submitted=false;this.renderAcc();break;
      case "rebutOptions": this.rebuts = m.options; if (this.accState?.stage === "rebut") this.renderAcc(); break;
      case "decide": this.decideState = m.target ? { ...m, at: performance.now() } : null; this.renderDecide(); break;
      case "ghost": this.ghost = m.carrying ? { until: performance.now() + (m.until || 15) * 1000 } : m.used ? { used: true } : null; this.renderGhost(); break;
    }
  }
  setPeek(on) { if (on === this.peek) return; this.peek = on; this.renderRole(); this.renderTask(); }
  setNightTravel(on){if(this.nightTravel===on)return;this.nightTravel=on;this.renderDecide();}
  setFlicker(on, afterKill = false) { this.flickerOn = on; this.flickerAfterKill = afterKill; if (!on || afterKill) { this.decideState = null; this.peekForced = false; } this.renderDecide(); }
  pad(b) { return this.device?.startsWith("pad:") ? `<kbd class="pad">${b}</kbd>` : `<kbd>${{ "Ⓐ": this.device === "kb2" ? "Enter" : "E", "Ⓑ": this.device === "kb2" ? "Bksp" : "Q" }[b] || b}</kbd>${this.device === "all" ? `<kbd class="pad">${b}</kbd>` : ""}`; }
  renderDecide() {
    const el = this.$(".decide");
    const d = this.decideState;
    let html = "";
    if (this.flickerOn && this.alive) {
      if(this.role!=="killer"&&this.nightTravel)html=`<b>Stay with the light.</b><span>Hold your flashlight or keep close to your teamed light carrier. Doors and ladders are available.</span>`;
      else if (this.flickerAfterKill) html = this.role === "killer" ? `<b>Hide the body.</b><span>The halls are yours for a moment.</span>` : `<b>The halls are closed.</b><span>Stay inside until the lights steady.</span>`;
      else if (this.secret) html = `<b>The lights are failing…</b><span>${this.pad("Ⓐ")} Act · ${this.pad("Ⓑ")} Wait</span>`;
      else if (this.role === "killer" && this.peekForced) html = `<b>They spotted you.</b><span>You are rushing in to strike.</span>`;
      else if (this.role === "killer" && d) {
        const left = d.forced && d.until ? Math.max(0, Math.ceil(d.until - (performance.now() - d.at) / 1000)) : null;
        html = `<b>${esc(SUSPECT_BY_ID[d.target]?.short)} is with you in the dark.</b><span>${this.pad("Ⓐ")} Strike${d.forced ? "" : ` · ${this.pad("Ⓑ")} Stay your hand`}</span>${left !== null ? `<em>A kill is required · ${left}s</em>` : ""}`;
      }
      else if (this.role === "killer") html = `<b>Darkness.</b><span>Find a guest alone in a room.</span>`;
      else html = `<b>The lights are failing…</b><span>Stay where you are.</span>`;
    }
    el.classList.toggle("hidden", !html);
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }
  renderGhost() {
    const el = this.$(".gstat");
    const g = this.ghost;
    if (this.alive || !g) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    if (g.used) el.innerHTML = "Your strength is spent until the next night.";
    else el.innerHTML = `Spectral grasp · <b>${Math.max(0, Math.ceil((g.until - performance.now()) / 1000))}s</b>`;
  }
  tick() {
    if (this.decideState?.forced) this.renderDecide();
    if (this.ghost?.until) this.renderGhost();
    if (this.pendingItemThoughts.length && !this.convo && !this.bookOpen && performance.now() - (this.lastItemThoughtAt ?? -Infinity) > 1800) {
      const line = this.pendingItemThoughts.shift();
      if (this.thought(line, { reserved: true })) this.lastItemThoughtAt = performance.now();
    }
  }
  renderTeam() {
    const el = this.$('.team-badge');
    el.classList.toggle('hidden', !this.teamWith || !this.alive);
    if (this.teamWith) el.innerHTML = `<span class="task-icon">⛓</span><span><b>Sticking with ${esc(SUSPECT_BY_ID[this.teamWith]?.short || '')}</b><small>Stay in sight all day for an alibi</small></span>`;
  }
  renderTask() {
    const el = this.$('.daily-task'), t = this.task;
    // Shared-screen play hides every task with the role, so absence reveals nothing.
    const hide = !t || !this.alive || (this.secret && !this.peek);
    el.classList.toggle('hidden', hide);
    if (hide) return;
    const def = TASK_BY_ID[t.id];
    const icon = t.id === 'kill' ? '🗡' : t.id === 'cleanup' ? '⊘' : t.id === 'none' ? '☾' : def?.icon;
    const title = t.id === 'kill' ? (t.complete ? 'Kill complete' : 'Kill required') : t.id === 'cleanup' ? 'Optional kill / cleanup' : t.id === 'none' ? 'No Task' : def?.title;
    const detail = t.id === 'kill' ? (t.complete ? 'Kill complete · next due day '+t.nextKillDay : this.duo ? 'One kill between both killers' : 'Required today') : t.id === 'cleanup' ? `Kill optional · required by day ${t.nextKillDay} · cleanup ${t.complete ? 'complete ✓' : 'available'}` : t.id === 'none' ? 'Free day · no trust penalty' : t.complete ? 'Complete · +1 trust ✓' : t.id === 'grime' ? `${roomName(t.room)} · bleach, then wipe with a rag` : `${roomName(def.room)}${def.tool ? ` · needs ${TOOL_NAME[def.tool]}` : ''}`;
    el.className = `daily-task${t.complete ? ' complete' : ''}${t.id === 'kill' ? ' required' : ''}`;
    el.innerHTML = `<span class="task-icon">${icon}</span><span><b>${esc(title)}</b><small>${esc(detail)}</small></span>`;
  }
  renderRole() {
    const r = this.$(".role");
    const showRole = !this.secret || this.peek;
    r.className = `role ${showRole ? this.role || "" : ""}`;
    r.innerHTML = `${portrait(this.char, "mini")}<div><b>${esc(SUSPECT_BY_ID[this.char].name)}</b><small>${!showRole ? "" : this.role === "killer" ? (this.partner ? `KILLER · WITH ${esc(SUSPECT_BY_ID[this.partner].short.toUpperCase())}` : "THE KILLER") : this.role ? (this.duo ? "SAVIOR · 2 KILLERS" : "SAVIOR") : ""}</small></div>`;
  }
  // Two hands, two pockets. Click a slot to drop what's in it.
  renderInv() {
    const el = this.$(".inv");
    const inv = this.inv;
    if (!inv || !this.alive) { el.innerHTML = ""; return; }
    const tag = (d) => d.bloody ? `<em class="bl">bloodied</em>` : d.wet ? `<em class="wt">damp</em>` : d.kind === "bleach" ? `<em>${d.left ?? 0}s left</em>` : d.kind === "rag" && d.used ? `<em>used</em>` : "";
    const slot = (d, label, cls = "") => d
      ? `<button class="islot full ${cls} ${d.bloody ? "bloody" : ""}" data-id="${esc(d.id)}" title="Drop"><small>${label}</small><b>${esc(d.name)}</b>${tag(d)}</button>`
      : `<div class="islot ${cls}"><small>${label}</small><b class="dim">—</b></div>`;
    const [h0, h1] = inv.hands, big = h0 && h1 && h0.id === h1.id;
    const hands = big ? slot(h0, "Both hands", "wide") : slot(h0, "Left hand") + slot(h1, "Right hand");
    const status = (this.bleeding ? `<div class="inv-st bl">Bleeding · find a bandage before the next night ends</div>` : "") + (inv.dragging ? `<div class="inv-st">Dragging the body${this.dragLeft !== undefined ? ` · ${Math.ceil(this.dragLeft)}s` : ""}</div>` : inv.pouring ? `<div class="inv-st wt">Pouring bleach…</div>` : "");
    const html = `<div class="inv-row">${hands}<span class="sep"></span>${slot(inv.pockets[0], "Pocket")}${slot(inv.pockets[1], "Pocket")}</div>${status}`;
    if (el.dataset.h === html) return;
    el.dataset.h = html; el.innerHTML = html;
    el.querySelectorAll("button.islot").forEach((b) => b.onclick = (e) => { e.stopPropagation(); this.send({ type: "dropItem", id: b.dataset.id }); });
  }
  async playPocketSpeech(m,ambient=false){
    pocketTrace('speech-received');
    try{
    if(!ambient)await this.openConvo({...m,line:null,options:[],pocketStage:true});
    if(!ambient&&this.convo?.id!==m.id)return;
    let entry=pocketSpeechJobs.get(m.token);
    if(!entry){
      const watchers=new Set();entry={watchers};
      entry.promise=Promise.resolve().then(()=>speak(m.line,SUSPECT_BY_ID[m.speaker]?.voice,m.speaker,{onStart:e=>{for(const w of watchers)w.onStart(e);},onProgress:e=>{for(const w of watchers)w.onProgress(e);},onWaiting:on=>{for(const w of watchers)w.onWaiting?.(on);}}));
      pocketSpeechJobs.set(m.token,entry);entry.promise.finally(()=>setTimeout(()=>pocketSpeechJobs.delete(m.token),3000));
    }
    if(ambient){const played=await entry.promise;if(!played)await new Promise(r=>setTimeout(r,Math.min(8000,Math.max(1500,m.line.length*35))));}
    else await this.captionLine(m.line,m.speaker,{shared:entry});
    if(ambient||this.convo?.id===m.id){pocketTrace('speech-acknowledged');this.send({type:'pocketSpeechDone',convo:m.id,token:m.token});}
    }catch(error){pocketTrace('speech-failed');this.send({type:'pocketSpeechFailed',convo:m.id,token:m.token});if(this.convo?.id===m.id)this.closeConvo();}
  }
  showPocketResult(m){
    pocketTrace('result',{success:Number(!!m.success),consent:Number(!!m.consent)});
    const requester=m.by===this.char,who=SUSPECT_BY_ID[requester?m.target:m.by]?.short;
    if(!m.consent){
      const own=requester?m.request:m.defense,opponent=requester?m.defense:m.request;
      rollDice(this.el,{...own,dc:opponent.total,opponent,success:requester?m.success:!m.success,head:`Pockets · you vs ${esc(who)}`,result:m.success?(requester?'You caught an unnoticed glimpse.':'The question passes without raising your suspicion.'):(requester?'You learn nothing about their pockets.':'You keep your pockets private and become wary of the request.')});
    }else this.toast(requester?'Permission granted — no roll needed.':'You freely allow the pocket check.');
    // A failed requester gets no invented observation or private item thought.
    if(requester&&!m.success)return;
    const delay=m.consent?0:1650;
    setTimeout(async()=>{const line=await pocketThought({meId:this.char,...m,requester});if(this.alive&&this.day===m.day)this.thought(line,{reserved:true});},delay);
  }
  showDice(m) {
    const me = m.by === this.char;
    const who = SUSPECT_BY_ID[me ? m.target : m.by]?.short;
    const head = me ? `You try to search ${esc(who)}'s pockets` : `${esc(who)} tries to search your pockets`;
    const found = m.found?.length ? m.found.map((f) => `${f.bloody ? "a bloodied " : f.wet ? "a damp " : "a "}${esc(f.name)}`).join(", ") : "nothing of note";
    const result = m.success ? (me ? `Found: ${found}.` : `They found ${found}.`) : me ? "They twist away before you can look." : "You keep them off.";
    rollDice(this.el, { roll: m.roll, bonus: m.bonus, dc: m.dc, success: m.success, head, result });
    if (me) this.inspectLater(`${who}'s pockets`, m.success ? `You found ${m.found?.length ? m.found.map((f) => `${f.bloody ? 'bloodied ' : f.wet ? 'damp ' : ''}${f.name}`).join(', ') : 'nothing of note'}.` : 'They kept you from looking; you learned nothing about what they carry.');
  }
  showRoleCard() {
    const c = this.$(".rolecard");
    const killer = this.role === "killer";
    if (this.secret) {
      const pad = this.device?.startsWith("pad:");
      c.className = "rolecard secret";
      c.innerHTML = `<small>You are</small>${portrait(this.char)}<h2>${esc(SUSPECT_BY_ID[this.char].name)}</h2>
        <div class="buzz"><div><i>●</i><span>1 buzz</span><b>Savior</b></div><div><i>●●</i><span>2 buzzes</span><b>Killer</b></div></div>
        <p>${pad ? "Feel your controller. Press <kbd class=\"pad\">Back</kbd> to feel it again." : `Hold <kbd>${this.device === "kb2" ? "Home" : "C"}</kbd> to peek at your role — keep it hidden.`}</p>`;
      c.classList.remove("hidden");
      clearTimeout(this.roleT);
      this.roleT = setTimeout(() => c.classList.add("hidden"), 7000);
      return;
    }
    c.className = `rolecard ${killer ? "killer" : "savior"}`;
    c.innerHTML = `<small>You are</small>${portrait(this.char)}<h2>${esc(SUSPECT_BY_ID[this.char].name)}</h2>
      <div class="role-name">${killer ? (this.partner ? `Killer — with ${esc(SUSPECT_BY_ID[this.partner].short)}` : "The Killer") : this.duo ? "A Savior — two killers walk among you" : "A Savior"}</div>
      <p>${killer
        ? (this.duo ? `Two of you, at most one completed murder per day. A kill is first required by day 3; an early kill satisfies that slot and moves the deadline to day 6, then 9. You both need a kill by day ${this.lastDay} — a caught killer becomes a ghost. After a kill, you have 30 seconds to haul the body through a trapdoor. In the tunnels you can't kill, but you can knock a guest out.` : "Pick up a weapon and catch a guest alone in a room. You may kill on any day, at most once per day. A kill is first required by day 2; an early kill moves the deadline to day 4, then 6. After a kill, you have 30 seconds to haul the body through a trapdoor before the halls reopen. Lie to cover your tracks — the table votes on day 2 onward. In the tunnels you can't kill.")
        : (this.duo ? `Name the right killer, room and weapon to catch one. Catch both, or survive to day ${this.lastDay} before both have killed.` : "Explore, observe and compare accounts. Today’s Story shows your character’s Core Cards. Hover, focus or tap a card to read its details; manage your core thoughts in Notes.")}</p>`;
    c.classList.remove("hidden");
    clearTimeout(this.roleT);
    this.roleT = setTimeout(() => c.classList.add("hidden"), 5600);
  }
  renderCards() { renderCoreHud(this); }
  setDay(day) { this.day = day; this.lockedTarget = null; this.renderCards(); }
  async showAshes(m) {
    if (m.empty) { this.inspectLater(m.label, 'The ashes held no readable trace or object.'); return; }
    rollDice(this.el, { roll: m.roll, bonus: m.bonus, dc: m.dc, success: m.success, head: `You sift ${esc(m.label)}`, result: m.success ? "You can make out what burned…" : "Just cinders." });
    if (!this.reserveThought(true)) return;
    const [line] = await Promise.all([innerVoice({ meId: this.char, label: m.label, finds: m.finds, success: m.success, role: this.role }), new Promise((r) => setTimeout(r, 1700))]);
    this.thought(line, { reserved: true });
  }
  // Your own guest thinking aloud.
  reserveThought(important = false) {
    const now = performance.now();
    if (now - this.lastThoughtAt < (important ? IMPORTANT_THOUGHT_GAP : INNER_THOUGHT_GAP)) return false;
    this.lastThoughtAt = now;
    return true;
  }
  thought(text, { important = false, reserved = false } = {}) {
    if (!text || !this.alive || this.convo || this.bookOpen) return false;
    if (!reserved && !this.reserveThought(important)) return false;
    const t = h("div", "toast thought", `${chip(this.char)}<i>${esc(text)}</i>`);
    this.$(".toasts").append(t);
    if (!this.secret && !document.body.classList.contains("split")) narrate(text, SUSPECT_BY_ID[this.char]?.voice);
    setTimeout(() => t.classList.add("out"), 9000);
    setTimeout(() => t.remove(), 9600);
    return true;
  }
  updateNoteCount() { this.$(".note-count").textContent = String(this.facts.size + this.privateFinds.size); }
  noticeItem({ kind, day, room, point }) {
    const key = `${day}:${kind}`;
    if (this.privateFinds.has(key)) return;
    const label = itemName(kind);
    this.privateFinds.set(key, { kind: "personal", day, at: performance.now(), text: `I spotted ${label}${room ? ` in ${roomName(room)}` : ""}.` });
    this.updateNoteCount();
    this.noteCue(point);
    if (this.bookOpen) this.renderBook();
    itemThought({ meId: this.char, kind, role: this.role }).then((line) => {
      if (this.alive && (this.day ?? day) === day) this.pendingItemThoughts.push(line);
    });
  }
  onFact(fact, privateContext = null) {
    if (!this.alive || fact.src !== "self" || !VISUAL_FACTS.has(fact.kind)) return;
    if (fact.kind === "saw" && fact.about === this.char) return;
    if (["held", "cleaning", "binned", "threw", "dragged"].includes(fact.kind) && fact.about === this.char) return;
    if (fact.kind === "talked" && (fact.about === this.char || fact.with === this.char)) return;
    const key = `${fact.kind}:${fact.about || ""}:${fact.with || ""}:${fact.weapon || fact.item || ""}:${fact.room || ""}:${fact.day || ""}`;
    const now = performance.now();
    if (now - (this.noteCueAt.get(key) ?? -Infinity) < 60000) return;
    this.noteCueAt.set(key, now);
    if (now - (this.lastNoteCueAt ?? -Infinity) > 400) { this.lastNoteCueAt = now; this.noteCue(); }
    const urgent = ["kill", "wound", "body", "dragged", "blood"].includes(fact.kind);
    if (this.convo || this.bookOpen || this.witnessVoiceBusy || !this.reserveThought(urgent)) return;
    this.witnessVoiceBusy = true;
    const day = this.day;
    witnessThought({ meId: this.char, fact, day, role: this.role, privateContext }).then((line) => {
      if (this.alive && this.day === day && !this.convo && !this.bookOpen) this.thought(line, { reserved: true });
    }).finally(() => { this.witnessVoiceBusy = false; });
  }
  showPeekResult(m) {
    const people = m.people || [];
    const names = people.map((id) => SUSPECT_BY_ID[id]?.short || id);
    const result = m.success
      ? names.length ? `Unseen. ${names.join(" and ")} ${names.length === 1 ? "is" : "are"} inside.` : "Unseen. The room is empty."
      : m.killRequired ? "Spotted. You rush inside and must make the kill." : m.count ? "Spotted. You rush inside." : "Spotted. You rush into the empty room.";
    rollDice(this.el, { roll: m.roll, bonus: m.bonus, dc: m.dc, success: m.success, head: `Stealth · ${esc(roomName(m.room))}`, result });
    if (!m.success) return;
    const fact = { kind: "peek", room: m.room, people, text: names.length ? `I peeked into ${roomName(m.room)} and saw ${names.join(" and ")} inside.` : `I peeked into ${roomName(m.room)}; it was empty.` };
    const fallback = names.length > 1 ? `I saw ${names.join(" and ")} together in ${roomName(m.room)}. A kill there would leave a witness.`
      : names.length ? `${names[0]} is alone in ${roomName(m.room)}. No one else would see the strike.`
        : `${roomName(m.room)} is empty. There is no one to strike inside.`;
    const day = this.day;
    Promise.race([witnessThought({ meId: this.char, fact, day, role: this.role }), new Promise((resolve) => setTimeout(() => resolve(fallback), 1500))]).then((line) => {
      if (this.day === day) this.thought(names.length && !names.some((name) => line.includes(name)) ? fallback : line, { reserved: true });
    });
  }
  noteCue(point = null) {
    const book = this.$(".note-indicator"), bounds = this.el.getBoundingClientRect(), target = book.getBoundingClientRect();
    const x = point?.visible ? point.x : bounds.width * 0.5, y = point?.visible ? point.y : bounds.height * 0.5;
    const dx = target.left - bounds.left + target.width / 2 - x, dy = target.top - bounds.top + target.height / 2 - y;
    const glow = h("div", point?.visible ? "note-glow item-origin" : "note-glow");
    if (point?.visible) { glow.style.setProperty("--cue-x", `${x}px`); glow.style.setProperty("--cue-y", `${y}px`); }
    this.el.append(glow); setTimeout(() => glow.remove(), 800);
    if (point?.visible) {
      const halo = h("div", "item-glimpse"); halo.style.left = `${x}px`; halo.style.top = `${y}px`;
      this.el.append(halo); setTimeout(() => halo.remove(), 1050);
    }
    book.classList.remove("note-pulse"); void book.offsetWidth; book.classList.add("note-pulse");
    for (let i = 0; i < 7; i++) {
      const mote = h("span", "note-mote");
      mote.style.left = `${x + (Math.random() - 0.5) * 32}px`;
      mote.style.top = `${y + (Math.random() - 0.5) * 32}px`;
      mote.style.setProperty("--dx", `${dx + (Math.random() - 0.5) * 20}px`);
      mote.style.setProperty("--dy", `${dy + (Math.random() - 0.5) * 12}px`);
      mote.style.animationDelay = `${i * 45}ms`;
      this.el.append(mote); setTimeout(() => mote.remove(), 1050);
    }
  }
  async inspectLater(subject, detail) {
    if (!this.alive || this.convo || this.bookOpen || !this.reserveThought()) return;
    const serial = this.innerSerial = (this.innerSerial || 0) + 1;
    const day = this.day;
    const line = await inspectionThought({ meId: this.char, subject, detail, day: this.day, role: this.role });
    if (serial === this.innerSerial && day === this.day && this.alive && !this.convo) this.thought(line, { reserved: true });
  }
  taskReflection(event, task) {
    if (!task) return;
    if (event === 'start') {
      this.send({type:'taskBegin',id:task.id});
      const serial = this.taskSerial = (this.taskSerial || 0) + 1;
      this.pendingTaskThought = taskThoughts({ meId: this.char, task: { ...task, roomName: roomName(task.room) }, day: this.day, role: this.role });
      this.pendingTaskKey = `${serial}:${task.id}`;
      this.pendingTaskDay = this.day;
      return;
    }
    const key = this.pendingTaskKey;
    const pending = this.pendingTaskThought;
    const day = this.pendingTaskDay;
    this.pendingTaskKey = null;
    if (!pending || !key?.endsWith(`:${task.id}`)) return;
    pending.then((lines) => { if (day === this.day && this.alive && !this.convo && !this.pendingTaskKey) this.thought(lines[event], { important: true }); });
  }
  toast(text) {
    const t = h("div", "toast", esc(text));
    this.$(".toasts").append(t);
    setTimeout(() => t.classList.add("out"), 3600);
    setTimeout(() => t.remove(), 4200);
  }
  noted(text, from) {
    const n = this.$(".noted");
    n.innerHTML = `<b>✎ Noted</b> ${esc(text)}`;
    n.classList.remove("hidden"); n.classList.remove("pop"); void n.offsetWidth; n.classList.add("pop");
    sfx("card");
    clearTimeout(this.notedT);
    this.notedT = setTimeout(() => n.classList.add("hidden"), 4200);
  }
  prompt(text) {
    const p = this.$(".prompt");
    if (!text) { p.classList.add("hidden"); return; }
    if (p.dataset.t !== text) { p.dataset.t = text; p.innerHTML = text; }
    p.classList.remove("hidden");
  }

  // ---------- conversation (cutscene talk) ----------
  dialoguePhase(phase){
    const dlg=this.$('.dlg');dlg.dataset.phase=phase;dlg.setAttribute('aria-busy',String(phase==='preparing'||phase==='speaking'));
    this.$('.d-opts').classList.toggle('hidden',phase!=='choices');
  }
  // One transient encounter per HUD; no saved dialogue cache.
  lookEngage(target){
    const now=performance.now();
    if(this.lookTarget!==target){this.lookTarget=target;this.lookSince=now;}
    if(!target||this.convo||this.engage?.jobs.line?.pending||this.engage?.jobs.options?.pending||now-this.lookSince<650||now-(this.engageSentAt||-Infinity)<11000)return;
    this.engageSentAt=now;this.send({type:'prepareEngage',target});
  }
  prepareEngage(m){
    if(this.convo||this.lookTarget!==m.target)return;
    this.engage={token:m.token,target:m.target,at:performance.now(),jobs:prepareDialogue({...m.payload,role:this.role},this.char)};
    this.$('.dlg').dataset.preparation='working';
    Promise.all([this.engage.jobs.line?.promise,this.engage.jobs.options.promise]).then(()=>{if(this.engage?.token===m.token)this.$('.dlg').dataset.preparation='ready';}).catch(()=>{});
  }
  beginAIWait(convo=this.convo?.id){
    const token=`wait-${this.index}-${this.waitSeq=(this.waitSeq||0)+1}`;
    this.aiWaits ||=new Map();
    const renew=()=>this.send({type:'aiWait',convo,token,on:true});renew();
    const timer=setInterval(renew,3000);this.aiWaits.set(token,{timer,convo});
    this.$('.dlg').dataset.aiWaiting='true';
    return ()=>{clearInterval(timer);this.aiWaits.delete(token);this.send({type:'aiWait',convo,token,on:false});this.$('.dlg').dataset.aiWaiting=String(!!this.aiWaits.size);};
  }
  async waitAI(job,convo=this.convo?.id){
    if(!job)return null;if(!job.pending)return job.promise;const started=performance.now();
    const release=this.beginAIWait(convo);try{return await job.promise;}finally{release();emitDiagnostic('dialogue.foreground_wait',{trace:'convo-'+convo,durationMs:performance.now()-started});}
  }
  clearAIWaits(){for(const [token,w]of this.aiWaits||[]){clearInterval(w.timer);this.send({type:'aiWait',convo:w.convo,token,on:false});}this.aiWaits?.clear();this.$('.dlg').dataset.aiWaiting='false';}
  async captionLine(text,speaker,{thought=false,shared=null}={}){
    if(!thought)text=addressDialogue(text,speaker,speaker===this.char?this.convo?.with:this.char);
    const seq=this.convoRenderSeq,id=this.convo?.id,valid=()=>this.convo?.id===id&&this.convoRenderSeq===seq;
    const line=this.$('.d-line'),dlg=this.$('.dlg');let cursor=0,releaseAudioWait=null;
    line.textContent='';line.classList.add('thinking');dlg.dataset.speechRole=thought?'inner-thought':'spoken';this.dialoguePhase('preparing');
    this.$('.d-name').innerHTML=chip(speaker)+(thought?' <small>INNER THOUGHT · NOT SPOKEN ALOUD</small>':'');
    const observer={onWaiting:on=>{if(on&&valid()){releaseAudioWait?.();releaseAudioWait=this.beginAIWait(id);}else{releaseAudioWait?.();releaseAudioWait=null;}},onStart:()=>{if(!valid())return;this.dialogueSpeaker=speaker;line.classList.remove('thinking');this.dialoguePhase('speaking');},onProgress:e=>{if(!valid())return;cursor=Math.max(cursor,Math.min(text.length,e.charIndex||0));line.textContent=text.slice(0,cursor);dlg.dataset.captionSource=e.source||'playback';dlg.dataset.captionChars=String(cursor);}};
    let played=false;
    if(shared){shared.watchers.add(observer);played=await shared.promise;shared.watchers.delete(observer);}
    else if(!thought||!this.secret&&!document.body.classList.contains('split'))played=await speak(text,SUSPECT_BY_ID[speaker]?.voice,thought?null:speaker,observer);
    if(!valid())return false;
    if(!played&&cursor<text.length){
      observer.onStart();dlg.dataset.captionSource='text-fallback';
      const start=performance.now(),from=cursor;
      await new Promise(resolve=>{const tick=()=>{if(!valid()){resolve();return;}const at=Math.min(text.length,from+Math.floor((performance.now()-start)*.034));observer.onProgress({charIndex:at,source:'text-fallback'});if(at>=text.length)resolve();else setTimeout(tick,32);};tick();});
    }
    if(valid()){line.textContent=text;line.classList.remove('thinking');dlg.dataset.captionChars=String(text.length);}
    return played;
  }
  async openConvo(m) {
    this.poolPanel.close();this.taskPanel.close();
    this.clearAIWaits();
    const renderSeq=this.convoRenderSeq=(this.convoRenderSeq||0)+1;this.stopConvoTimer();
    emitDiagnostic('dialogue.stage',{trace:'convo-'+m.id,stage:m.closing?'closing':m.waiting?'waiting':m.ai?'npc_reply':'player_line'});
    const first=!this.convo||this.convo.id!==m.id;if(first)stopSpeak();
    this.convo={id:m.id,with:m.with};this.replyShotUntil=0;
    this.$('.dlg').classList.remove('hidden');this.el.classList.add('talking');
    const partner=SUSPECT_BY_ID[m.with],nameEl=this.$('.d-name'),lineEl=this.$('.d-line'),opts=this.$('.d-opts');
    opts.replaceChildren();this.focus.set([]);this.dialoguePhase('preparing');lineEl.textContent='…';lineEl.classList.add('thinking');nameEl.innerHTML=chip(m.with);
    const valid=()=>this.convo?.id===m.id&&this.convoRenderSeq===renderSeq;
    if(m.pocketStage)return;
    if(m.hairSpeech){
      let entry=pocketSpeechJobs.get(m.speechToken);
      if(!entry){
        const watchers=new Set();entry={watchers};
        entry.promise=Promise.resolve().then(()=>speak(m.line,SUSPECT_BY_ID[m.speaker]?.voice,m.speaker,{onStart:e=>{for(const w of watchers)w.onStart(e);},onProgress:e=>{for(const w of watchers)w.onProgress(e);},onWaiting:on=>{for(const w of watchers)w.onWaiting?.(on);}})).catch(()=>false);
        pocketSpeechJobs.set(m.speechToken,entry);entry.promise.then(()=>setTimeout(()=>pocketSpeechJobs.delete(m.speechToken),3000));
      }
      await this.captionLine(m.line,m.speaker,{shared:entry});
      if(valid())this.send({type:'hairSpeechDone',convo:m.id,token:m.speechToken});return;
    }
    if(m.waiting){this.dialoguePhase('waiting');return;}
    let line=m.line,options=m.options||[],thought=false,optionsJob=null;
    const prepared=m.preparedToken&&this.engage?.token===m.preparedToken?this.engage.jobs:null;
    this.engage=null;
    if(m.ai){
      const jobs=prepared||prepareDialogue({...m,role:this.role},this.char);optionsJob=jobs.options;
      // The line is independent of next-turn choices; start talking as soon as it is ready.
      const v=await this.waitAI(jobs.line);if(!valid())return;
      line=v.line;lineEl.dataset.emotion=v.emotion;
      this.send({type:'spokeAs',convo:m.id,token:m.speechToken,text:line});
    }else if(options.length){
      optionsJob=m.pocketResponse||m.hairResponse?null:prepared?.options||dialogueJob(voiceChoices({...m,role:this.role},this.char));
      if(optionsJob&&!m.opening)options=await this.waitAI(optionsJob);if(!valid())return;
      if(!m.speaker&&options.opening){line=options.opening;thought=true;}
    }
    const speaker=thought?this.char:m.speaker||m.with;
    if(line&&!m.pocketResponse&&!m.hairResponse)await this.captionLine(line,speaker,{thought});
    else {lineEl.textContent=m.pocketResponse||m.hairResponse?'How do you respond?':`You approach ${partner.short}.`;lineEl.classList.remove('thinking');}
    if(!valid())return;
    if(m.closing){this.dialoguePhase('waiting');this.send({type:'convoLineDone',convo:m.id});return;}
    // This job has been running throughout the spoken line. Only a remaining
    // gap after speech is a blocking wait that slows the shared countdown.
    if((m.ai||m.opening)&&optionsJob){options=await this.waitAI(optionsJob);if(!valid())return;}
    if(!valid())return;
    const buttons=options.map((o,i)=>{
      const category=(o.kind||'Leave').toLowerCase().replace(/[^a-z]+/g,'-');
      const b=h('button',`opt t-${o.tone||'neutral'} category-${category}`,`<span class="n">${i+1}</span><span class="pad-shortcut" data-choice="${i}" aria-hidden="true">${["A","B","X","Y","LB","RB","LT","RT"][i]}</span><span class="kind k-${category}">${esc(o.kind||'Leave')}</span><span class="txt">${esc(o.text)}</span>`);
      b.onclick=async()=>{
        if(!valid()||this.$('.dlg').dataset.phase!=='choices')return;
        this.stopConvoTimer();stopSpeak();opts.replaceChildren();this.focus.set([]);this.dialoguePhase('preparing');
        if(o.kind==='Search'||o.kind==='Share task'||m.pocketResponse||m.hairResponse){this.send({type:'choose',convo:m.id,i:o.i??i,text:o.text});return;}
        this.send({type:'convoSpeaking',convo:m.id,i:o.i??i});
        await this.captionLine(o.text,this.char);if(!valid())return;
        this.dialoguePhase('waiting');this.send({type:'choose',convo:m.id,i:o.i??i,text:o.text});
      };
      opts.append(b);return b;
    });
    opts.append(h('p','pad-only dialogue-pad-guide','Use the shown buttons to choose directly, or D-pad → to select the highlighted response.'));
    if(buttons.length){this.dialoguePhase('choices');this.focus.set(buttons);this.send({type:'convoReady',convo:m.id});}
    else this.dialoguePhase('waiting');
    if(first)sfx('card');
  }
  // The host sends the listener's actual patience after speech and options.
  startConvoTimer(secs) {
    if (this.convoTimer) clearInterval(this.convoTimer);
    const timer = this.$(".d-timer");
    const start = performance.now();
    timer.classList.remove("hidden");
    timer.textContent = String(secs);
    this.convoTimer = setInterval(() => { timer.textContent = String(Math.max(0, Math.ceil(secs - (performance.now() - start) / 1000))); }, 100);
  }
  stopConvoTimer() { if (this.convoTimer) clearInterval(this.convoTimer); this.convoTimer = null; this.$(".d-timer")?.classList.add("hidden"); }
  closeConvo() {
    this.clearAIWaits();this.engage=null;
    this.stopConvoTimer();
    this.convoRenderSeq = (this.convoRenderSeq || 0) + 1;
    this.convo = null;
    this.dialogueSpeaker=null;
    this.replyShotUntil = 0;
    this.$(".dlg").classList.add("hidden");
    this.el.classList.remove("talking");
    this.focus.set([]);
    stopSpeak();
  }

  openBodyMenu(victim, suspects) {
    if (this.role !== "killer" || !this.alive) return;
    this.bodyMenuVictim = victim;
    const el = this.$(".body-menu");
    el.classList.remove("hidden");
    el.innerHTML = `<b>${esc(SUSPECT_BY_ID[victim]?.short || victim)}'s body</b><div class="body-options"></div>`;
    const opts = el.querySelector(".body-options");
    const add = (label, action = null) => {
      const button = h("button", "opt", esc(label));
      button.onclick = () => { this.closeBodyMenu(); if (action) this.send(action); };
      opts.append(button);
      return button;
    };
    add("Drag body", { type: "drag", victim });
    add("Report finding the body", { type: "reportBody", victim });
    for (const suspect of suspects) add(`Report: I saw ${SUSPECT_BY_ID[suspect]?.short || suspect} near the body`, { type: "reportBody", victim, suspect });
    add("Leave it");
    this.focus.set([...opts.querySelectorAll("button")]);
  }
  closeBodyMenu() {
    this.bodyMenuVictim = null;
    this.$(".body-menu").classList.add("hidden");
    this.focus.set([]);
  }

  // ---------- notebook ----------
  toggleBook(on = !this.bookOpen) {
    this.bookOpen = on;
    this.$(".book").classList.toggle("hidden", !on);
    if (on) { if(!this.core)this.send({type:'coreJournal'});this.renderBook(); sfx("card"); }
    else this.focus.set(this.convo ? [...this.el.querySelectorAll(".d-opts button")] : []);
  }
  renderBook() {
    this.el.querySelectorAll(".book-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === this.tab));
    const body = this.$(".book-body");
    if(this.tab==='core'){renderCoreBook(this);return;}
    if (this.tab === "sheet") {
      const row = (kind, id, label) => {
        const m = this.marks[`${kind}:${id}`] || "";
        return `<button class="mark m${m ? "-" + m : ""}" data-k="${kind}:${id}"><span>${esc(label)}</span><i>${m === "x" ? "✕" : m === "v" ? "✓" : m === "q" ? "?" : ""}</i></button>`;
      };
      body.innerHTML = `<div class="sheet">
        <div><h4>Who?</h4>${SUSPECTS.map((s) => row("p", s.id, s.name)).join("")}</div>
        <div><h4>What?</h4>${WEAPONS.map((w) => row("w", w.id, w.name)).join("")}</div>
        <div><h4>Where?</h4>${ROOM_LIST.map((r) => row("r", r.id, r.name)).join("")}</div></div>`;
      const cols = [...body.querySelectorAll(".sheet > div")].map((d) => [...d.querySelectorAll("button")]);
      body.querySelectorAll(".mark").forEach((b) => b.onclick = () => {
        const order = ["", "x", "v", "q"];
        const k = b.dataset.k;
        this.marks[k] = order[(order.indexOf(this.marks[k] || "") + 1) % order.length];
        const keep = this.focus.i;
        this.renderBook();
        this.focus.i = keep; this.focus.paint();
      });
      this.bookCols = cols;
      this.focus.set(cols.flat(), true);
    } else {
      const facts = [...this.facts.values(), ...this.privateFinds.values()].sort((a, b) => (b.day - a.day) || ((b.at ?? b.t0 ?? b.t ?? 0) - (a.at ?? a.t0 ?? a.t ?? 0)));
      const important = facts.filter((f) => f.kind === "personal" || ["traceSurvey","toolKnowledge","investigation","theory","body", "kill", "wound", "tod", "missing", "held", "blood", "bleach", "caught", "binned", "inbin", "cleaning", "ran", "watched", "peek", "peekCaught"].includes(f.kind) || (f.kind === "saw" && f.doing) || f.src !== "self");
      const list = (important.length ? important : facts).slice(0, 60);
      body.innerHTML = list.length ? `<ul class="clues">${list.map((f) => `<li class="k-${f.kind}"><span>${esc(f.text)}</span><em>${f.kind === "personal" ? "Private" : esc(srcLabel(f.src))+((this.core?.assessments?.[f.key]||f.assessment)?` · belief ${(this.core?.assessments?.[f.key]||f.assessment).belief}%`:"")}</em></li>`).join("")}</ul>` : `<p class="empty">Nothing yet. Walk, look, listen.</p>`;
      this.bookCols = null;
      this.focus.set([]);
    }
  }

  // ---------- death ----------
  showDead() {
    const d = this.$(".deadcard");
    d.innerHTML = this.caught ? `<b>You've been caught.</b><span>Your partner fights on. As a ghost you may lift one object each night for ${15}s — then drop it or hurl it.</span>` : `<b>You were murdered.</b><span>You linger as a ghost, unseen by the living. Once each night you may lift one object for ${15}s — then drop it or hurl it.</span>`;
    setTimeout(() => d.classList.add("hidden"), 9000);
    this.renderDecide(); this.renderGhost();
    d.classList.remove("hidden");
  }

  // ---------- accusation ----------
  onAcc(a) {
    const prevStage = this.accState?.stage;
    this.accState = a;
    if (!a || a.stage === "done") { this.$(".accp").classList.add("hidden"); return; }
    if (prevStage !== a.stage || a.stage === "vote" && a.round !== this.accRound) { this.accRound = a.round; this.pick = null; this.submitted = false; this.rebutDone = false; }
    this.renderAcc();
  }
  renderAcc() {
    const a = this.accState, p = this.$(".accp");
    const seated = a.seated.includes(this.char) && this.alive;
    p.classList.toggle("hidden", !seated || a.stage === "tally" || a.stage === "reveal");
    if (!seated) return;
    if (a.stage === "propose" || a.stage === "vote") {
      const limits = a.stage === "vote" ? a.limits || {} : {},locked=a.stage==='vote'?a.locked||{}:{};
      const people=SUSPECTS.map(s=>({id:s.id,name:s.short}));
      const guide=this.voteGuide?.stage===a.stage&&this.voteGuide.round===(a.round||0)?this.voteGuide:null;
      const invalid=(k,id)=>guide?.excluded?.[k]?.[id]||(k==='p'&&(!a.seated.includes(id)||id===this.char)?'Dead, removed or yourself.':null);
      const strategic=(k,id)=>k==='p'&&guide?.protected?.includes(id);
      const lists={p:people,w:WEAPONS,r:ROOM_LIST},choices={};
      for(const k of ['p','w','r'])choices[k]=lists[k].filter(x=>!invalid(k,x.id)&&!strategic(k,x.id)).filter(x=>locked[k]?x.id===locked[k]:!limits[k]||limits[k].includes(x.id));
      const base=this.pick||guide?.recommended||a.proposals?.[this.char]||{};this.pick={};
      for(const k of ['p','w','r'])this.pick[k]=choices[k].some(x=>x.id===base[k])?base[k]:choices[k].length===1?choices[k][0].id:null;
      const disproved=(a.failed||[]).some(t=>t.p===this.pick.p&&t.w===this.pick.w&&t.r===this.pick.r);
      const complete=(this.pick.p||!choices.p.length)&&this.pick.w&&this.pick.r&&!disproved;
      const col=(k,label)=>`<div class="acol"><h4>${label}</h4>${lists[k].map(x=>{const reason=invalid(k,x.id),protectedAlly=strategic(k,x.id),available=choices[k].some(v=>v.id===x.id),likely=guide?.recommended?.[k]===x.id;return `<button data-k="${k}" data-v="${x.id}" title="${esc(reason|| (protectedAlly?'Protected ally: your framing strategy.':likely?guide.basis:''))}" class="${this.pick[k]===x.id?'on':''} ${reason?'proven-invalid':''} ${protectedAlly?'protected-ally':''} ${likely?'most-likely':''}" ${!available||locked[k]?'disabled':''}>${esc(x.name)}${likely?' ◇':''}</button>`;}).join('')}</div>`;
      const tieOnly=a.stage==='vote'&&Object.keys(limits).length;
      p.innerHTML=`<div class="acc-h">${a.stage==='propose'?'Your accusation':tieOnly?'Tie! Re-vote':'Final vote — change your mind?'}<span>${this.submitted?'Submitted ✓':a.left+'s'}</span></div>
      <p class="vote-guide">${esc(guide?.basis||'Choose a living guest other than yourself.')} Struck entries are ruled out; ◇ marks your leading choice. <span class="pad-only">A / Cross: select · LB/RB: columns · Y / Triangle: submit</span></p>
      <div class="acols">${col('p','Who')}${col('w','With')}${col('r','Where')}</div>
      ${disproved?'<p class="vote-warning" role="status">This exact combination was already disproved. Choose another; a new body discovery clears that record.</p>':''}
      <button class="acc-go" ${complete?'':'disabled'}>${this.submitted?'Update':a.stage==='propose'?'Accuse':'Cast vote'}</button>`;
      const cols = [...p.querySelectorAll(".acol")].map((c) => [...c.querySelectorAll("button:not([disabled])")]).filter((c) => c.length);
      p.querySelectorAll(".acol button").forEach((b) => b.onclick = () => { this.pick[b.dataset.k] = b.dataset.v; const keep = this.focus.i; this.renderAcc(); this.focus.i = Math.min(keep,Math.max(0,this.focus.items.length-1)); this.focus.paint(); });
      const go = p.querySelector(".acc-go");
      go.onclick = () => { if(go.disabled)return;this.send({ type: a.stage, ...this.pick }); this.submitted = true; sfx("card"); this.renderAcc(); };
      cols.push([go]);
      this.accCols = cols;
      this.focus.set(cols.flat(), true);
    } else if (a.stage === "rebut") {
      const done = this.rebutted;
      p.innerHTML = `<div class="acc-h">Prove someone wrong<span>${a.left}s</span></div>
        <div class="rebuts">${this.rebuts.length ? this.rebuts.map((r, i) => `<button data-i="${r.i}" class="${r.lie ? "lie" : ""}"><span class="n">${i + 1}</span>${esc(r.text)}</button>`).join("") : `<p class="empty">You hold no clue that disproves anyone.</p>`}
        <button class="pass" data-pass="1">Stay silent</button></div>`;
      const btns = [...p.querySelectorAll(".rebuts button")];
      btns.forEach((b) => b.onclick = () => {
        this.send(b.dataset.pass ? { type: "rebut", pass: true } : { type: "rebut", i: Number(b.dataset.i) });
        p.innerHTML = `<div class="acc-h">Waiting for the table…<span>${a.left}s</span></div>`;
        this.focus.set([]);
        this.rebutDone = true;
      });
      if (this.rebutDone) { p.innerHTML = `<div class="acc-h">Waiting for the table…<span>${a.left}s</span></div>`; this.focus.set([]); }
      else { this.accCols = null; this.focus.set(btns, true); }
    }
  }

  // ---------- per-frame input ----------
  handleInput(inp) {
    if(inp.controllerUsed){this.controllerActive=true;this.padFamily=inp.padFamily||'xbox';}
    if(inp.keyboardUsed)this.controllerActive=false;
    this.el.classList.toggle('controller-input',!!this.controllerActive);
    const labels=this.padFamily==='playstation'?['×','○','□','△','L1','R1','L2','R2']:['A','B','X','Y','LB','RB','LT','RT'];
    for(const badge of this.el.querySelectorAll('.pad-shortcut'))badge.textContent=labels[Number(badge.dataset.choice)];
    if(this.barberPanel.active)return this.barberPanel.input(inp);
    if (this.poolPanel.active) return this.poolPanel.input(inp);
    if (this.taskPanel.active) return this.taskPanel.input(inp);
    if (this.bodyMenuVictim) {
      if (inp.back) this.closeBodyMenu();
      else this.focus.handle(inp);
      return true;
    }
    if(this.convo){
      if(this.$('.dlg').dataset.phase==='choices'){
        if(inp.choice>=0&&this.focus.items[inp.choice])this.focus.items[inp.choice].click();
        else if(inp.controllerUsed&&inp.right)this.focus.items[this.focus.i]?.click();
        else this.focus.handle({...inp,confirm:inp.choice>=0?false:inp.confirm});
      }
      return true;
    }
    if (inp.notes && this.alive !== null && !(inp.controllerUsed&&['propose','vote'].includes(this.accState?.stage))) { this.toggleBook(); return true; }
    if (this.bookOpen) {
      if (inp.back) { this.toggleBook(false); return true; }
      if (inp.cycleL || inp.cycleR) { this.tab=["sheet","clues","core"][( ["sheet","clues","core"].indexOf(this.tab)+(inp.cycleL?2:1))%3]; this.renderBook(); }
      this.focus.handle(inp, { grid: this.tab === "sheet" ? this.bookCols : null });
      return true;
    }
    if (this.accState && !["tally", "reveal"].includes(this.accState.stage) && this.alive) {
      if (this.accState.stage === "rebut") this.focus.handle(inp);
      else if(inp.controllerUsed&&inp.notes){const go=this.$('.acc-go');if(go&&!go.disabled)go.click();}
      else this.focus.handle({...inp,left:inp.left||inp.cycleL,right:inp.right||inp.cycleR}, { grid: this.accCols });
      return true;
    }
    return false;
  }
}

function srcLabel(src) {
  if (!src || src === "self") return "seen";
  if (src === "public") return "everyone knows";
  const [kind, id] = String(src).split(":");
  return `${kind === "overheard" ? "overheard" : "told by"} ${SUSPECT_BY_ID[id]?.short || id}`;
}

// ---------- shared overlays ----------
export class Cine {
  constructor(el) { this.el = el; }
  show(html, cls = "", ms = 0) {
    this.el.className = `cine ${cls}`;
    this.el.innerHTML = html;
    clearTimeout(this.t);
    if (ms) this.t = setTimeout(() => this.hide(), ms);
  }
  hide() { this.el.className = "cine hidden"; }
  night(m, names = {}) {
    const dead = SUSPECTS.filter((s) => !m.alive.includes(s.id));
    this.show(`<div class="cine-card">
      <small>${m.kind === "night" ? `Night falls on day ${m.day}` : "A scream echoes through the house"}</small>
      <h1>${esc(personName(m.victim))} is dead</h1>
      <p>${m.tod?`Time of death: around <b>${esc(m.tod)}</b>.`:"The exact time of death is not known."}${m.finder ? ` ${chip(m.finder)} found the body${names[m.finder] ? "" : ""}.` : ""}${m.claim ? ` ${chip(m.finder)} claims they saw ${chip(m.claim)} nearby.` : ""}</p>
      <div class="survivors">${SUSPECTS.map((s) => portrait(s.id, m.alive.includes(s.id) ? "" : "dead")).join("")}</div>
      <p class="sub">${m.kind === "night" ? `${m.alive.length} guests remain. Dawn of day ${m.day + 1}.` : "To the table."}</p>
    </div>`, "night", 7600);
  }
  day(m) {
    this.show(`<div class="cine-banner"><small>${m.killDay ? "A kill is required today" : "A kill may happen early"}</small><h1>Day ${m.day}${m.day >= (m.lastDay || LAST_DAY) ? " · Final" : ""}</h1></div>`, "banner", 2600);
  }
  reveal(m) {
    const t = m.triple;
    this.show(`<div class="cine-card ${m.correct ? "win" : "miss"}">
      <small>The accusation</small>
      <h1>${chip(t.p)} in the ${esc(roomName(t.r))} with the ${esc(weaponName(t.w))}</h1>
      <div class="envelope ${m.correct ? "open" : ""}">${m.correct ? "CORRECT" : "WRONG"}</div>
      <p>${m.correct ? "The envelope confirms it." : "The envelope says otherwise. Nothing happens… and the night goes on."}</p></div>`, "reveal", 6200);
  }
  over(m, myRoles) {
    const ks = m.killers?.length ? m.killers : [m.killer];
    const two = ks.length > 1;
    this.show(`<div class="cine-card over ${m.winner}">
      <small>${m.winner === "saviors" ? "Justice is served" : two ? "The killers win" : "The killer wins"}</small>
      <h1>${ks.map((k) => portrait(k)).join("")} ${ks.map((k) => esc(personName(k))).join(" & ")} ${two ? "were the killers" : "was the killer"}</h1>
      <p>${esc(m.reason)}</p>
      <ul class="kills">${m.kills.map((x) => `<li>Day ${x.day}: ${chip(x.victim)} — ${esc(roomName(x.room))}, ${esc(weaponName(x.weapon))}</li>`).join("")}</ul>
      ${myRoles || ""}
      <div class="over-btns"><button id="againBtn">Play again</button><button id="menuBtn2">Title</button></div></div>`, "over");
  }
}

export class TableBoard {
  constructor(el) { this.el = el; }
  render(a, names = {}) {
    if (!a) { this.el.classList.add("hidden"); return; }
    this.el.classList.remove("hidden");
    const stage = { propose: "Accusations", rebut: "Rebuttals — prove them wrong", vote: (a.limits && Object.keys(a.limits).length) ? "Tie — re-vote" : "Final vote", tally: "The votes", reveal: "The envelope" }[a.stage] || "";
    const props = a.seated.map((id) => {
      const p = a.proposals?.[id];
      const v = a.stage === "tally" || a.stage === "reveal" ? a.votes?.[id] : null;
      const show = v || p;
      return `<div class="prop ${show ? "" : "wait"}">${chip(id)}${show ? `<span>${esc(SUSPECT_BY_ID[show.p].short)} · ${esc(weaponName(show.w))} · ${esc(roomName(show.r))}</span>` : "<span>thinking…</span>"}${a.votes?.[id] === true && a.stage === "vote" ? "<em>voted</em>" : ""}</div>`;
    }).join("");
    const reb = (a.rebuttals || []).slice(-4).map((r) => `<li>${chip(r.by)} <span>${esc(r.text)}</span></li>`).join("");
    let tally = "";
    if (a.stage === "tally" && a.tally) {
      tally = `<div class="tally">${["p", "w", "r"].map((k) => a.tally[k] ? `<div>${Object.entries(a.tally[k]).sort((x, y) => y[1] - x[1]).map(([id, n]) => `<span>${esc(k === "p" ? SUSPECT_BY_ID[id].short : k === "w" ? weaponName(id) : roomName(id))} <b>${n}</b></span>`).join("")}</div>` : "").join("")}</div>`;
    }
    this.el.innerHTML = `<div class="tb-h"><b>Day ${a.day}${a.final ? " · Final accusation" : ""}</b><span>${esc(stage)}</span><i>${a.left}s</i></div><div class="props">${props}</div>${tally}${reb ? `<ul class="rebs">${reb}</ul>` : ""}`;
  }
}
