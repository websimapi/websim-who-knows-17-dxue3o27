// Host-side bounded movement budget. Rendering stays predicted on the client.
import {emitDiagnostic} from './diagnostics.js';
import {movementLimit} from './posture.js';
export function validateRemotePosition(c,a){
 const now=performance.now();
 if(!Number.isSafeInteger(a.seq)||a.seq<1)return {ok:false,reason:'missing_sequence'};
 let state=c.remoteMovement;
 if(!state)state=c.remoteMovement={seq:0,at:now,credit:.9};
 if(a.seq<=state.seq)return {ok:false,stale:true,reason:'stale_sequence'};
 state.seq=a.seq;
 const elapsed=Math.max(0,Math.min(.5,(now-state.at)/1000));state.at=now;
 const speed=movementLimit(c);
 state.credit=Math.min(1.35,state.credit+elapsed*speed);
 const distance=Math.hypot(a.x-c.x,a.z-c.z),allowed=state.credit+.025;
 if(distance>allowed||Math.abs(a.x)>250||Math.abs(a.z)>250){
  emitDiagnostic('movement.rejected',{reason:distance>allowed?'speed_budget':'world_bounds',distance,allowed});
  return {ok:false,reason:'speed_budget'};
 }
 state.credit=Math.max(0,state.credit-distance);
 return {ok:true};
}
