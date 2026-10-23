// Authority-owned night travel. A pocketed or dropped light is not protection.
import {losClear,DOOR_LIST,HATCH_POS} from './nav.js';
import {underground} from './data.js';
import {auditEvent} from './game-audit.js';
export const ESCORT_DISTANCE=5;
export const FlickerTravelMethods={
 holdsFlashlight(c){return !!c?.alive&&!c.ko&&this.handIds(c).some(id=>{const p=this.props.byId.get(id);return p?.kind==='flashlight'&&!p.gone&&!p.pocket&&p.holder===c.id;});},
 flashlightEscort(c){
  if(!c?.alive||c.ko)return null;
  if(this.holdsFlashlight(c))return c;
  const t=this.teamFor(c),p=c.team&&this.chars.get(c.team);
  if(!t||t.broken||t.day!==this.day||p?.team!==c.id||!this.holdsFlashlight(p))return null;
  if(underground(c.z)===underground(p.z)&&Math.hypot(c.x-p.x,c.z-p.z)<=ESCORT_DISTANCE&&losClear(c.x,c.z,p.x,p.z,this.doors))return p;
  // A short, local ladder hand-off lets a real partner follow between floors.
  // It grants no remote protection elsewhere in either floor.
  const transit=p.flashHatch,h=transit&&HATCH_POS[transit.id];
  if(h&&transit.until>=this.time&&Math.hypot(c.x-transit.from.x,c.z-transit.from.z)<2.2&&Math.hypot(p.x-transit.to.x,p.z-transit.to.z)<2.2)return p;
  return null;
 },
 canNightTravel(c){return !!this.flashlightEscort(c);},
 closeRefugeDoors(room){for(const d of DOOR_LIST)if(d.room===room)this.setDoor(d.id,false);},
 updateNightTravel(c){
  const allowed=this.canNightTravel(c),was=!!c.flashTravel;c.flashTravel=allowed;
  if(allowed){
   c.lockRoom=null;
   if(c.plan?.refuge||!was){c.auto=null;c.path=null;c.plan=null;c.mv=c.pace=0;}
  }else if(was){
   if(c.seat)this.stand(c);c.auto=null;c.path=null;c.plan=null;c.mv=c.pace=0;
   c.lockRoom=null;
   if(c.room&& !['hallway','cellar','tunnels'].includes(c.room)){c.lockRoom=c.room;this.closeRefugeDoors(c.room);}
   else this.routeToRefuge(c);
   this.toast(c,'Without a flashlight or your nearby light-bearing teammate, you hurry to safety.');
  }
  if(allowed&&!was)this.toast(c,this.holdsFlashlight(c)?'Flashlight in hand: you can travel during the flicker.':'Stay close to your flashlight-bearing teammate.');
  if(allowed!==was&&!this.demo)auditEvent('flicker.travel',{round:this.auditRound,actor:c.id,day:this.day,success:allowed,source:allowed?(this.holdsFlashlight(c)?'held_flashlight':'team_escort'):'protection_lost',room:c.room});
  return allowed;
 }
};
