// Bounded numeric diagnostics. Never record speech, messages, player positions or identity.
import {BUILD,diagnosticSession,setDiagnosticContext,emitDiagnostic} from './diagnostics.js';
const VERSION=BUILD;
export class PerformanceJournal{
  constructor(){
    this.session=diagnosticSession;this.started=performance.now();this.sent=0;this.pending=false;this.reset();
    try{this.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){this.longTasks++;this.longestTask=Math.max(this.longestTask,entry.duration);}});this.observer.observe({type:'longtask',buffered:false});}catch{}
    document.addEventListener('visibilitychange',()=>{this.reset();});
  }
  reset(){this.since=performance.now();this.frames=0;this.work=0;this.max=0;this.slow=0;this.longTasks=0;this.longestTask=0;this.worst=[];this.intervals=[];this.gapFrames=0;this.maxInterval=0;}
  async send(report){
    if(this.pending||this.sent>=2000||document.hidden)return;
    this.pending=true;
    try{const response=await fetch('/api/performance-log',{signal:AbortSignal.timeout(10000),method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:this.session,report:{version:VERSION,...report}}),keepalive:true});if(response.ok)this.sent++;document.body.dataset.performanceLog=response.ok?'stored':`unavailable-${response.status}`;}
    catch{document.body.dataset.performanceLog='offline';}finally{this.pending=false;}
  }
  ready(view){this.reset();emitDiagnostic('startup.ready',{durationMs:performance.now()-this.started});this.send({kind:'startup',mapReady:document.body.dataset.mapReadiness,preparationMs:Number(document.body.dataset.preparationMs),totalMs:Math.round(performance.now()-this.started),programs:view.renderer.info.programs.length,geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures});}
  frame(elapsed,work,update,render,view,context){
    if(document.hidden){this.reset();return;}
    setDiagnosticContext(context);this.intervals.push(elapsed);this.maxInterval=Math.max(this.maxInterval,elapsed);if(elapsed>50)this.gapFrames++;this.frames++;this.work+=work;this.max=Math.max(this.max,work);if(work>50)this.slow++;
    const round=x=>Math.round((x||0)*10)/10;
    if(work>40||elapsed>50){this.worst.push({work:round(work),update:round(update),apply:round(view.profileApplyMs),actors:round(view.profileActorsMs),props:round(view.profilePropsMs),world:round(view.profileWorldMs),visibility:round(view.profilePrepareMs),draw:round(view.profileDrawMs),render:round(render),interval:round(elapsed),programs:view.renderer.info.programs.length,geometries:view.renderer.info.memory.geometries});this.worst.sort((a,b)=>Math.max(b.work,b.interval)-Math.max(a.work,a.interval));this.worst.length=Math.min(4,this.worst.length);}
    if(performance.now()-this.since<30000)return;
    const sorted=this.intervals.slice().sort((a,b)=>a-b),percentile=q=>round(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]||0);
    const report={kind:'frames',frameP50:percentile(.5),frameP95:percentile(.95),frameP99:percentile(.99),maxInterval:round(this.maxInterval),gapFrames:this.gapFrames,...context,ageSec:Math.round((performance.now()-this.started)/1000),frames:this.frames,fps:round(this.frames*1000/(performance.now()-this.since)),meanWork:round(this.work/this.frames),peakWork:round(this.max),slowFrames:this.slow,longTasks:this.longTasks,longestTask:round(this.longestTask),worst:this.worst,programs:view.renderer.info.programs.length,geometries:view.renderer.info.memory.geometries,textures:view.renderer.info.memory.textures,triangles:view.renderer.info.render.triangles,calls:view.renderer.info.render.calls,mirrors:view.profileMirrorCaptures||0,pixelRatio:round(view.pixelRatio),quality:view.graphics.preset};
    document.body.dataset.performanceSummary=JSON.stringify(report);this.send(report);this.reset();
  }
}
