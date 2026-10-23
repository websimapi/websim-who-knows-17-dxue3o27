// Shared fixture identities and illumination estimates used by rendering and perception.
import {cellToWorld,roomAtWorld} from './data.js';
import {ROOM_BOUNDS,FURNITURE,local,roomSize} from './layout.js';
import {DOOR_LIST,DOOR_W,losClear} from './nav.js';
export const LIGHT_SWITCHES=Object.keys(ROOM_BOUNDS).concat('hallway').map(room=>{
  const door=DOOR_LIST.find(d=>d.cells.some(([c,r])=>{const p=cellToWorld(c,r);return roomAtWorld(p.x,p.z)===room;}));
  let x,z,nx=1,nz=0;
  if(door){
    const cell=door.cells.map(([c,r])=>cellToWorld(c,r)).find(p=>roomAtWorld(p.x,p.z)===room),dx=cell.x-door.mid.x,dz=cell.z-door.mid.z,l=Math.hypot(dx,dz);nx=dx/l;nz=dz/l;
    x=door.mid.x+door.e.x*(DOOR_W/2+.22)+nx*.115;z=door.mid.z+door.e.z*(DOOR_W/2+.22)+nz*.115;
  }else{const p=local(room,.12,roomSize(room).d*.5);x=p.x;z=p.z;}
  return{id:'room:'+room,room,x,y:1.22,z,nx,nz};
});
export const FLOOR_LAMPS=FURNITURE.filter(f=>f.type==='lamp');
export const fixtureOn=(off,id)=>!off?.[id];
export function flashlightAt(x,z,carriers=[],doors=[]){
 let value=0;
 for(const c of carriers){const dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz);if(d>12||!losClear(c.x,c.z,x,z,doors))continue;const dot=d<.01?1:(dx*Math.sin(c.yaw)+dz*Math.cos(c.yaw))/d;const cone=d<1.2?.35:Math.max(0,Math.min(1,(dot-.78)/.16));value=Math.max(value,cone*Math.max(0,1-d/14));}
 return value;
}
export function illuminationAt(x,z,{off={},props=[],fires=[],doors=[],flashlights=[]}={}){
 const room=roomAtWorld(x,z);
 let value=room==='tunnels' ? .012 : fixtureOn(off,'room:'+room) ? .88 : .025;
 // A fully lit room is already at the perception ceiling; avoid scanning every prop per FOW cell.
 if(value>=.88)return value;
 const contribution=(sx,sz,power)=>{const d=Math.hypot(x-sx,z-sz);if(d<7&&roomAtWorld(sx,sz)===room&&losClear(x,z,sx,sz,doors))value+=power/(1+(d/1.8)**2);};
 for(const f of FLOOR_LAMPS)if(fixtureOn(off,'lamp:'+f.id))contribution(f.x,f.z,.65);
 for(const p of props)if(!p.hidden&&!p.gone&&!p.pocket){if(p.kind==='lamp'&&fixtureOn(off,'prop:'+p.id))contribution(p.x,p.z,.7);else if(p.lit)contribution(p.x,p.z,.65);}
 for(const f of FURNITURE)if(f.fire&&fires.includes(f.fire))contribution(f.x,f.z,.65);
 return Math.min(1,value+flashlightAt(x,z,flashlights,doors));
}
export function snapshotLighting(snap,objects){
 const props=objects?[...objects.values()].filter(g=>g.userData.p&&(g.userData.p.kind==='lamp'||g.userData.lit)).map(g=>({id:g.userData.p.id,kind:g.userData.p.kind,x:g.position.x,z:g.position.z,hidden:!g.visible,lit:g.userData.lit})):[];
 return{flashlights:(snap?.chars||[]).filter(r=>r[5]&&!r[16]&&[r[10],r[13]].includes('flashlight')).map(r=>({x:r[1],z:r[2],yaw:r[3],pitch:r[12]})),off:snap?.lightsOff||{},props,fires:snap?.fires||[],doors:snap?.doors||[]};
}
