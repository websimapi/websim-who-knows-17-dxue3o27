import {auditEvent} from './game-audit.js';
import {emitDiagnostic} from './diagnostics.js';
// Sound effects, the mansion ambience bed, and spoken AI lines.
const files = Object.fromEntries(["scream", "chime", "thunder", "card", "gavel", "step", "door_open", "door_close", "fire", "flicker", "ghost", "pool", "stove", "thud", "hiss", "ladder", "knock", "pant", "dart", "chop", "scrub", "beep", "done", "scrape"].map((n) => [n, `${n}.wav`]));
const cache = {};
let ambience = null;
let music = null;
let rain = null, exteriorRain = true;
let audioContext = null;
let muted = localStorage.getItem("clue.muted") === "1";

export function sfx(name, vol = 0.7) {
  if (muted || !files[name]) return;
  const base = cache[name] ||= new Audio(`./sfx/${files[name]}`);
  const a = base.cloneNode();
  a.volume = vol;
  a.play().catch(() => {});
}
export function startAmbience() {
  if (muted) return;
  if (!ambience) { ambience = new Audio("./sfx/mansion.wav"); ambience.loop = true; ambience.volume = 0.32; }
  if (!rain) { rain = new Audio("./sfx/rain.wav"); rain.loop = true; }
  ambience.volume = music ? 0.12 : 0.32;
  rain.volume = caveOn ? 0.02 : exteriorRain ? 0.28 : 0.08;
  ambience.play().catch(() => {});
  rain.play().catch(() => {});
}
export function setExteriorRain(on) {
  exteriorRain = !!on;
  if (rain) rain.volume = caveOn ? 0.02 : exteriorRain ? 0.28 : 0.08;
}
export function startGameMusic() {
  if (muted) return;
  if (!music) { music = new Audio("./audio/conservatory.ogg"); music.loop = true; music.volume = 0.32; }
  music.play().catch(() => {});
  if (ambience) ambience.volume = 0.12;
}
export function stopGameMusic() {
  music?.pause();
  if (music) music.currentTime = 0;
  cave?.pause(); caveOn = false;
  if (ambience) ambience.volume = 0.32;
}
export function stopAmbience() { ambience?.pause(); rain?.pause(); cave?.pause(); music?.pause(); }
// Underground: the house bed fades out and dripping tunnel air fades in.
let cave = null, caveOn = false;
export function setUnderground(on) {
  if (on === caveOn || muted) return;
  caveOn = on;
  if (!cave) { cave = new Audio("./sfx/tunnel.wav"); cave.loop = true; }
  cave.volume = 0.45;
  if (on) { cave.play().catch(() => {}); if (ambience) ambience.volume = 0.08; if (music) music.volume = 0.1; }
  else { cave.pause(); if (ambience) ambience.volume = music ? 0.12 : 0.32; if (music) music.volume = 0.32; }
  if (rain) rain.volume = on ? 0.02 : exteriorRain ? 0.28 : 0.08;
}

// One-shot sound with a ray-tested acoustic path supplied by the game.
export function spatialSfx(name, vol, pan = 0, occluded = false) {
  if (muted || !files[name] || vol <= 0) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    const a = new Audio(`./sfx/${files[name]}`);
    const source = audioContext.createMediaElementSource(a);
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = occluded ? 650 : 12000;
    const gain = audioContext.createGain(); gain.gain.value = Math.min(1, vol) * (occluded ? 0.48 : 1);
    const stereo = audioContext.createStereoPanner(); stereo.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(stereo).connect(audioContext.destination);
    a.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); };
    a.play().catch(() => { source.disconnect(); filter.disconnect(); gain.disconnect(); stereo.disconnect(); });
  } catch { sfx(name, vol * (occluded ? 0.4 : 1)); }
}

let speechCancel=null;
let speechGen=0,speechBusy=false,speechAudio=null,speechState=null,speechQueue=Promise.resolve(),queuedSpeech=0;
function speechApi(){try{return window.websim||window.parent?.websim;}catch{return window.websim;}}
function phonemes(text){
  const sounds=[];const map={a:'aa',e:'E',i:'I',o:'O',u:'U',y:'I',p:'PP',b:'PP',m:'PP',f:'FF',v:'FF',t:'DD',d:'DD',k:'kk',g:'kk',q:'kk',c:'kk',j:'CH',s:'SS',z:'SS',n:'nn',l:'nn',r:'RR',w:'U',h:'aa'};
  const input=text.toLowerCase();
  for(let i=0;i<input.length;i++){
    const startChar=i,pair=input.slice(i,i+2);let shape,weight=1;
    if(['th','sh','ch','oo','ee','ph'].includes(pair)){shape={th:'TH',sh:'CH',ch:'CH',oo:'U',ee:'I',ph:'FF'}[pair];i++;weight=1.5;}
    else {shape=map[input[i]]||'sil';weight=/[.,!?;:]/.test(input[i])?2.3:input[i]===' '?.6:1;}
    sounds.push({shape,weight,startChar,endChar:i+1});
  }
  const total=sounds.reduce((s,p)=>s+p.weight,0)||1;let cursor=0;
  return sounds.map(p=>{const start=cursor/total;cursor+=p.weight;return{...p,start,end:cursor/total};});
}
export function speechPose(characterId){
  const s=speechState;
  if(s?.native){
    if(s.id!==characterId)return {};
    if(!s.playing||s.pausedAt||window.speechSynthesis.paused)return {};
    // Word boundary events are optional for device voices. Keep advancing through
    // the utterance when a voice omits them instead of freezing at its first space.
    const elapsed=(performance.now()-s.boundaryAt)/1000;
    const wordEnd=s.hasBoundary?s.boundaryIndex+(s.text.slice(s.boundaryIndex).match(/^\S+/)?.[0].length||1):s.text.length;
    const char=Math.min(wordEnd-.001,s.boundaryIndex+elapsed*13*s.utterance.rate),shape=s.timeline.find(p=>char>=p.startChar&&char<p.endChar)?.shape;
    const pose=shape&&shape!=='sil'?{[shape]:.68}:{};document.body.dataset.speechMouth=shape||'sil';return pose;
  }
  if(!s||s.id!==characterId||s.audio.paused||!Number.isFinite(s.audio.duration)||!s.audio.duration)return {};
  let amplitude=.65;
  if(s.analyser){s.analyser.getFloatTimeDomainData(s.samples);let power=0;for(const v of s.samples)power+=v*v;const rms=Math.sqrt(power/s.samples.length);s.rmsPeak=Math.max(.008,rms,(s.rmsPeak||.02)*.995);amplitude=Math.min(1,Math.max(0,(rms-.0006)/s.rmsPeak*1.35));}
  s.audio.dataset.mouthLevel=amplitude.toFixed(3);
  if(amplitude<.025)return {};
  const t=s.audio.currentTime/s.audio.duration,at=s.timeline.findIndex(p=>t<p.end),index=at<0?s.timeline.length-1:at,now=s.timeline[index];
  if(!now||now.shape==='sil')return {};
  const pose={[now.shape]:amplitude*.8},fraction=(t-now.start)/Math.max(.001,now.end-now.start),next=s.timeline[index+1];
  if(next&&next.shape!=='sil'&&fraction>.65){const mix=(fraction-.65)/.35*.4;pose[now.shape]*=1-mix;pose[next.shape]=(pose[next.shape]||0)+amplitude*mix;}
  return pose;
}
// Unlock the browser audio context during a real gesture, never while awaiting
// a generated voice request. HTMLAudio remains connected to the device directly.
export function unlockSpeech(){
 try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
 try{window.speechSynthesis?.resume();}catch{}
}
for(const event of ['pointerdown','keydown'])document.addEventListener(event,unlockSpeech,{capture:true,passive:true});
let speechPreferences={engine:'auto',male:'',female:''};
try{const saved=JSON.parse(localStorage.getItem('clue.speech')||'{}');speechPreferences={...speechPreferences,...saved};}catch{}
const timeout=(promise,ms,label)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(label)),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
export function deviceVoices(){try{return window.speechSynthesis?.getVoices()||[];}catch{return[];}}
function voiceFor(voice){
 const female=/female/.test(voice||''),list=deviceVoices(),uri=speechPreferences[female?'female':'male'];
 return list.find(v=>v.voiceURI===uri)||list.filter(v=>/^en(?:-|$)/i.test(v.lang)).find(v=>(female?/zira|samantha|victoria|female|aria/i:/david|daniel|alex|\bmale\b|guy/i).test(v.name))||list.find(v=>/^en(?:-|$)/i.test(v.lang))||list.find(v=>v.default)||list[0];
}
function notify(observer,key,value){try{observer?.[key]?.(value);}catch(error){console.warn('Speech caption callback',error);}}
function revealAt(timeline,ratio,length){
 if(ratio>=1)return length;
 const p=timeline.find(p=>ratio<p.end);if(!p)return 0;
 return Math.min(length,Math.floor(p.startChar+(p.endChar-p.startChar)*Math.max(0,(ratio-p.start)/Math.max(.0001,p.end-p.start)))+1);
}
async function playNativeSpeech(text,voice,id,g,observer){
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return false;
 if(!deviceVoices().length)await new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);window.speechSynthesis.removeEventListener('voiceschanged',finish);resolve();};window.speechSynthesis.addEventListener('voiceschanged',finish);timer=setTimeout(finish,800);});
 if(g!==speechGen)return false;
 if(!deviceVoices().length){document.body.dataset.speechError='no-device-voices';return false;}
 window.speechSynthesis.cancel();window.speechSynthesis.resume();
 return new Promise(resolve=>{
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=.96;utterance.volume=.9;utterance.voice=voiceFor(voice);if(utterance.voice)utterance.lang=utterance.voice.lang;
  document.body.dataset.speechEngine='device';document.body.dataset.speechVoice=utterance.voice?.name||'Device default';
  const state={native:true,id,text,utterance,timeline:phonemes(text),playing:false,boundaryIndex:0,boundaryAt:performance.now()};speechState=state;
  let finished=false,startTimer,endTimer,captionFrame=0;
  const done=ok=>{if(finished)return;finished=true;cancelAnimationFrame(captionFrame);if(ok)notify(observer,'onProgress',{charIndex:text.length,ratio:1,source:'device'});clearTimeout(startTimer);clearTimeout(endTimer);if(speechState===state)speechState=null;if(speechCancel===cancel)speechCancel=null;document.body.dataset.speechState=ok?'finished':'unavailable';resolve(ok);};
  const cancel=()=>{try{window.speechSynthesis.cancel();}catch{}done(false);};speechCancel=cancel;
  const captionTick=()=>{if(finished)return;if(state.playing&&!window.speechSynthesis.paused){const elapsed=(performance.now()-state.boundaryAt)/1000;notify(observer,'onProgress',{charIndex:Math.min(text.length,Math.floor(state.boundaryIndex+elapsed*13*utterance.rate)+1),source:'device'});}captionFrame=requestAnimationFrame(captionTick);};
  utterance.onstart=()=>{if(g!==speechGen){cancel();return;}clearTimeout(startTimer);state.playing=true;state.boundaryAt=performance.now();document.body.dataset.speechError='';document.body.dataset.speechState='playing-native';document.body.dataset.speechVoice=utterance.voice?.name||'Device default';notify(observer,'onStart',{id,text,source:'device'});captionTick();};
  utterance.onpause=()=>{state.pausedAt=performance.now();};utterance.onresume=()=>{if(state.pausedAt){state.boundaryAt+=performance.now()-state.pausedAt;state.pausedAt=0;}};
  utterance.onboundary=e=>{if(g!==speechGen||finished)return;state.hasBoundary=true;state.boundaryIndex=e.charIndex;state.boundaryAt=performance.now();notify(observer,'onProgress',{charIndex:Math.min(text.length,e.charIndex+1),source:'device-boundary'});};utterance.onend=()=>{if(!state.playing)document.body.dataset.speechError='device-ended-without-starting';done(state.playing);};utterance.onerror=e=>{document.body.dataset.speechError=e.error||'native-failed';done(false);};
  startTimer=setTimeout(()=>{document.body.dataset.speechError='device-start-timeout';cancel();},5000);
  endTimer=setTimeout(cancel,Math.max(15000,text.split(/\s+/).length*900+5000));
  try{window.speechSynthesis.speak(utterance);}catch{done(false);}
 });
}
async function playGeneratedSpeech(text,voice,id,g,observer){
 const api=speechApi();if(!api?.textToSpeech){document.body.dataset.generatedSpeechError='platform-speech-unavailable';return false;}
 document.body.dataset.speechEngine='generated';document.body.dataset.speechState='generating';
 const started=performance.now();let result;notify(observer,'onWaiting',true);try{result=await timeout(api.textToSpeech({text,voice:voice||'en-female',generateFile:true}),12000,'voice-generation-timeout');}catch(error){document.body.dataset.generatedSpeechError=String(error.message||error).slice(0,180);throw error;}finally{notify(observer,'onWaiting',false);emitDiagnostic('speech.preparation',{engine:'generated',durationMs:performance.now()-started,outcome:result?.url?'success':'unavailable'});}
 if(g!==speechGen||muted)return false;if(!result?.url){document.body.dataset.generatedSpeechError='platform-returned-no-audio';return false;}document.body.dataset.generatedSpeechError='';
 // Routing a cross-origin media element through WebAudio can produce silence.
 // Keep audible playback native; the existing time-based mouth poses still run.
 const audio=new Audio(result.url);audio.volume=.88;audio.hidden=true;audio.dataset.character=id||'narration';audio.dataset.speech='tts';document.body.append(audio);speechAudio=audio;
 const state={id,audio,timeline:phonemes(text),analyser:null};speechState=state;
 return new Promise(resolve=>{
  let finished=false,startTimer,endTimer,captionFrame=0,captionStarted=false;
  const captionTick=()=>{if(finished)return;if(!audio.paused&&Number.isFinite(audio.duration)&&audio.duration>0)notify(observer,'onProgress',{charIndex:revealAt(state.timeline,audio.currentTime/audio.duration,text.length),ratio:audio.currentTime/audio.duration,source:'media-clock'});captionFrame=requestAnimationFrame(captionTick);};
  const done=ok=>{if(finished)return;finished=true;cancelAnimationFrame(captionFrame);if(ok)notify(observer,'onProgress',{charIndex:text.length,ratio:1,source:'media-clock'});clearTimeout(startTimer);clearTimeout(endTimer);audio.onpause=null;audio.pause();audio.remove();if(speechState===state)speechState=null;if(speechAudio===audio)speechAudio=null;if(speechCancel===cancel)speechCancel=null;document.body.dataset.speechState=ok?'finished':'unavailable';resolve(ok);};
  const cancel=()=>done(false);speechCancel=cancel;
  audio.onplaying=()=>{if(!captionStarted){captionStarted=true;notify(observer,'onStart',{id,text,source:'media-clock'});captionTick();}clearTimeout(startTimer);document.body.dataset.speechError='';document.body.dataset.speechState='playing-audio';};
  audio.onended=()=>{const advanced=audio.currentTime>.05;if(!advanced)document.body.dataset.speechError='audio-ended-without-playing';done(advanced);};audio.onerror=()=>{document.body.dataset.speechError='audio-load-failed';done(false);};
  audio.onpause=()=>{if(g!==speechGen)done(false);};
  startTimer=setTimeout(()=>{document.body.dataset.speechError='audio-start-timeout';done(false);},6500);
  endTimer=setTimeout(()=>done(false),Math.max(20000,text.split(/\s+/).length*1000+10000));
  audio.play().catch(error=>{document.body.dataset.speechError=error.name||'audio-play-failed';done(false);});
 });
}
async function playSpeech(text,voice,id,g,engine,observer){
 if(g!==speechGen)return false;document.body.dataset.speechCharacter=id||'inner-voice';speechBusy=true;document.body.dataset.speechError='';document.body.dataset.generatedSpeechError='';
 try{
  let played=false;
  if(engine==='device'||engine==='auto'&&deviceVoices().length){played=await playNativeSpeech(text,voice,id,g,observer);if(!played&&engine==='auto'&&g===speechGen)played=await playGeneratedSpeech(text,voice,id,g,observer).catch(()=>false);}
  else{try{played=await playGeneratedSpeech(text,voice,id,g,observer);}catch(error){document.body.dataset.speechError=error.message||'generated-failed';}if(!played&&g===speechGen&&!muted)played=await playNativeSpeech(text,voice,id,g,observer);}
  if(!played&&g===speechGen)document.body.dataset.speechState='unavailable';emitDiagnostic('speech.playback',{engine,outcome:played?'success':g!==speechGen?'cancelled':'unavailable',reason:document.body.dataset.speechError||'none'});
  return played;
 }finally{if(g===speechGen)speechBusy=false;}
}
export function speak(text,voice,characterId,{engine=speechPreferences.engine,onStart,onProgress,onWaiting}={}){
 if(muted||!text){document.body.dataset.speechState=muted?'muted':'empty';return Promise.resolve(false);}
 auditEvent('speech.request',{actor:characterId||'narrator',line:text,source:engine});
 const g=speechGen;queuedSpeech++;emitDiagnostic('speech.queued',{engine,queueDepth:queuedSpeech});
 const job=speechQueue.then(()=>playSpeech(text,voice,characterId,g,engine,{onStart,onProgress,onWaiting})).finally(()=>{if(g===speechGen)queuedSpeech=Math.max(0,queuedSpeech-1);});speechQueue=job.catch(()=>{});return job;
}
export function narrate(text,voice,observer={}){if(speechBusy||queuedSpeech)return false;return speak(text,voice,null,observer);}
export function stopSpeak(){speechGen++;speechCancel?.();speechCancel=null;speechBusy=false;queuedSpeech=0;speechState=null;const a=speechAudio;speechAudio=null;a?.pause();speechQueue=Promise.resolve();try{window.speechSynthesis?.cancel();}catch{}}
export function installSpeechSettings(parent){
 if(!parent)return;
 const box=document.createElement('fieldset');box.className='speech-settings';box.innerHTML='<legend>Character voices</legend><label>Sound <input type="checkbox" aria-label="Sound enabled"></label><label>Speech <select aria-label="Speech engine"><option value="auto">Automatic</option><option value="generated">Generated voice</option><option value="device">Device voice</option></select></label><label>Male device voice <select aria-label="Male device voice"></select></label><label>Female device voice <select aria-label="Female device voice"></select></label><button type="button">Test voice</button><p role="status"></p>';parent.append(box);
 const sound=box.querySelector('input'),engine=box.querySelector('[aria-label="Speech engine"]'),male=box.querySelector('[aria-label="Male device voice"]'),female=box.querySelector('[aria-label="Female device voice"]'),status=box.querySelector('p');
 sound.checked=!muted;engine.value=speechPreferences.engine;
 const save=()=>{speechPreferences={engine:engine.value,male:male.value,female:female.value};try{localStorage.setItem('clue.speech',JSON.stringify(speechPreferences));}catch{}};
 const populate=()=>{const list=deviceVoices();document.body.dataset.deviceVoiceCount=String(list.length);for(const [key,select]of [['male',male],['female',female]]){select.replaceChildren(new Option(list.length?'Automatic device voice':'No device voices detected',''));for(const v of list)select.add(new Option(`${v.name} (${v.lang})`,v.voiceURI));select.value=speechPreferences[key];}status.textContent=list.length?`${list.length} device voices available.`:'No device voices detected. Automatic can use generated speech.';};
 populate();window.speechSynthesis?.addEventListener('voiceschanged',populate);
 for(const el of [engine,male,female])el.onchange=save;
 sound.onchange=()=>{muted=!sound.checked;localStorage.setItem('clue.muted',muted?'1':'0');if(muted){stopSpeak();stopAmbience();}else{unlockSpeech();startAmbience();startGameMusic();}};
 box.querySelector('button').onclick=async()=>{unlockSpeech();stopSpeak();status.textContent='Preparing voice sample…';const played=await speak('Can you hear me? Let us compare what we actually saw tonight.','en-male',null);status.textContent=played?'Voice sample finished.':muted?'Sound is muted. Enable Sound above.':`Speech unavailable: ${[document.body.dataset.speechError,document.body.dataset.generatedSpeechError].filter(Boolean).join('; ')||'check device voices or use Automatic'}.`;};
}
