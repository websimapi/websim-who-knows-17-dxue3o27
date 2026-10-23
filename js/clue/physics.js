import {emitDiagnostic} from './diagnostics.js';
// Rigid-body props (spheres against walls, door leaves, furniture boxes,
// floor and ceiling; pushed by walkers) and a small billiards simulation.
// Pure logic, world metres.
import { WALL_H } from "./data.js";
import { WALLS, DOOR_LIST, leafSeg } from "./nav.js";
import { SOLIDS, POOL,FURN_BY_ID } from "./layout.js";

const G = 9.8;
// Loose props collide with contact parts, not the full walker obstacle volume.
// Local coordinates keep these parts attached to furniture that can move.
const PROP_GROUPS=SOLIDS.map(b=>{
 const f=FURN_BY_ID[b.id],parts=[];
 const part=(x,z,w,d,y1,y2)=>parts.push({x1:x-w/2,x2:x+w/2,z1:z-d/2,z2:z+d/2,y1,y2});
 if(!f)return {bounds:b,parts:[b]};
 const seat=f.seat?.[0]?.h;
 if(Number.isFinite(seat)&&f.h-seat>.12){
  part(0,0,f.w,f.d,Math.max(0,seat-.13),seat);
  // A stool has no back: its former whole-height box made objects hover.
  if(f.style!=='stool')part(0,-f.d*.45,f.w,.09,seat,f.h);
  for(const x of [-1,1])for(const z of [-1,1])part(x*f.w*.39,z*f.d*.39,.055,.055,0,seat-.1);
  if(['armchair','sofa','settee'].includes(f.type)||f.id==='barber_chair')for(const side of [-1,1])part(side*f.w*.45,0,.1,f.d,seat,Math.min(f.h,seat+.26));
 }else if(f.type==='stairs'){
  const n=16,run=(f.d-1.6)/n,rise=(f.h-.3)/n;
  for(let i=0;i<n;i++)part(0,f.d/2-(i+.5)*run,f.w,run+.02,0,rise*(i+1)+.006);
  part(0,-f.d/2+.8,f.w,1.6,0,f.h-.3);
 }else if(['table','diningTable','readingTable','coffeeTable','console'].includes(f.type)){
  part(0,0,f.w,f.d,f.h-.06,f.h);
  for(const x of [-1,1])for(const z of [-1,1])part(x*(f.w/2-.1),z*(f.d/2-.1),.09,.09,0,f.h-.06);
  if(f.type==='coffeeTable')part(0,0,f.w-.12,f.d-.12,.12,.14);
 }else if(f.type==='lamp'){
  part(0,0,.36,.36,0,.05);part(0,0,.035,.035,.05,f.h-.3);part(0,0,.5,.5,f.h-.3,f.h);
 }else if(f.type==='coatStand'){
  part(0,0,.44,.44,0,.04);part(0,0,.065,.065,.04,f.h);
 }else part(0,0,f.w,f.d,f.y||0,(f.y||0)+f.h);
 return{bounds:b,f,parts,cs:Math.cos(f.rot),sn:Math.sin(f.rot)};
});
function localPoint(p,group){if(!group.f)return {...p};const dx=p.x-group.f.x,dz=p.z-group.f.z;return{x:dx*group.cs-dz*group.sn,y:p.y,z:dx*group.sn+dz*group.cs};}
function worldPoint(p,group){if(!group.f)return p;return{x:group.f.x+p.x*group.cs+p.z*group.sn,y:p.y,z:group.f.z-p.x*group.sn+p.z*group.cs};}
export function propSupported(p,tolerance=.012){
 if(Math.abs(p.y-p.r)<=tolerance)return true;
 for(const group of PROP_GROUPS){
  const b=group.bounds;if(p.x<b.x1-p.r||p.x>b.x2+p.r||p.z<b.z1-p.r||p.z>b.z2+p.r)continue;
  const q=localPoint(p,group);
  for(const box of group.parts){
   const dx=q.x-Math.max(box.x1,Math.min(box.x2,q.x)),dz=q.z-Math.max(box.z1,Math.min(box.z2,q.z)),horizontal=dx*dx+dz*dz;
   if(horizontal>p.r*p.r)continue;
   const contact=box.y2+Math.sqrt(Math.max(0,p.r*p.r-horizontal));
   if(Math.abs(q.y-contact)<=tolerance)return true;
  }
 }
 return false;
}

function segPush(b, w, r) {
  const vx = w.x2 - w.x1, vz = w.z2 - w.z1, l = vx * vx + vz * vz;
  const t = l ? Math.max(0, Math.min(1, ((b.x - w.x1) * vx + (b.z - w.z1) * vz) / l)) : 0;
  const px = w.x1 + vx * t, pz = w.z1 + vz * t;
  const dx = b.x - px, dz = b.z - pz, d = Math.hypot(dx, dz);
  if (d >= r || d < 1e-6) return null;
  const nx = dx / d, nz = dz / d;
  b.x = px + nx * r; b.z = pz + nz * r;
  return { nx, nz };
}
function reflect(b, nx, ny, nz, bounce = 0.35, fric = 0.75) {
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + bounce) * vn * nx; b.vy -= (1 + bounce) * vn * ny; b.vz -= (1 + bounce) * vn * nz;
  // tangential friction
  b.vx *= fric; b.vz *= fric; if (Math.abs(ny) < 0.5) b.vy *= fric;
  return -vn;
}

export class Props {
  constructor(list) {
    this.list = list; // [{id, kind, x,y,z, r, ...}]
    this.byId = new Map(list.map((p) => [p.id, p]));
    for (const p of list) Object.assign(p, { vx: 0, vy: 0, vz: 0, yaw: p.yaw ?? Math.random() * 6.28, tilt: 0, roll: 0, sleep: propSupported(p), holder: null, ghost: null, moved: true });
  }
  // impacts: [{prop, speed, hitChar?}]
  step(dt, doors, walkers) {
    const out = [];
    const sub = 3, h = dt / sub;
    for (const p of this.list) {
      if(p.gone)continue;
      if (p.holder || p.hidden || p.stash) { p.sleep = false; continue; }
      if(p.sleep&&!propSupported(p)){p.sleep=false;p.moved=true;emitDiagnostic('physics.unsupported_wake',{reason:'support_lost',count:1});}
      if (p.sleep) {
        // Walkers nudge sleeping props they step into.
        for (const w of walkers) if (Math.abs(w.x - p.x) < 0.5 && Math.abs(w.z - p.z) < 0.5 && p.y < 0.5 && (w.mv || 0) > 0.4) {
          const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
          if (d < 0.3 + p.r) { p.sleep = false; p.vx += dx / (d || 1) * 1.4; p.vz += dz / (d || 1) * 1.4; p.vy += 0.6; }
        }
        if (p.sleep) continue;
      }
      for (let s = 0; s < sub; s++) {
        p.vy -= G * h;
        p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
        let impact = 0, grounded = false;
        // floor / ceiling
        if (p.y < p.r) { p.y = p.r; impact = Math.max(impact, reflect(p, 0, 1, 0)); grounded = true; }
        if (p.y > WALL_H - p.r) { p.y = WALL_H - p.r; reflect(p, 0, -1, 0); }
        // walls
        for (const w of WALLS) {
          if (p.x < w.x1 - 0.4 || p.x > w.x2 + 0.4 || p.z < w.z1 - 0.4 || p.z > w.z2 + 0.4) continue;
          const n = segPush(p, w, p.r + 0.07);
          if (n) impact = Math.max(impact, reflect(p, n.nx, 0, n.nz, 0.4));
        }
        if (p.y < 2.5) for (const d of DOOR_LIST) {
          if (Math.abs(p.x - d.mid.x) > 1.8 || Math.abs(p.z - d.mid.z) > 1.8) continue;
          const n = segPush(p, leafSeg(d, doors[d.id] ?? 0), p.r + 0.03);
          if (n) impact = Math.max(impact, reflect(p, n.nx, 0, n.nz, 0.3));
        }
        // Furniture contact parts follow their live position and rotation.
        for (const group of PROP_GROUPS) {
          const bounds=group.bounds;
          if(p.x<bounds.x1-p.r||p.x>bounds.x2+p.r||p.z<bounds.z1-p.r||p.z>bounds.z2+p.r)continue;
          const q=localPoint(p,group);
          for(const b of group.parts){
            if(q.x<b.x1-p.r||q.x>b.x2+p.r||q.z<b.z1-p.r||q.z>b.z2+p.r||q.y>b.y2+p.r||q.y<b.y1-p.r)continue;
            const cx=Math.max(b.x1,Math.min(b.x2,q.x)),cy=Math.max(b.y1,Math.min(b.y2,q.y)),cz=Math.max(b.z1,Math.min(b.z2,q.z));
            let dx=q.x-cx,dy=q.y-cy,dz=q.z-cz,d=Math.hypot(dx,dy,dz);
            if(d>=p.r)continue;
            if(d<1e-6){
              const faces=[{depth:q.x-b.x1,nx:-1,ny:0,nz:0},{depth:b.x2-q.x,nx:1,ny:0,nz:0},{depth:q.y-b.y1,nx:0,ny:-1,nz:0},{depth:b.y2-q.y,nx:0,ny:1,nz:0},{depth:q.z-b.z1,nx:0,ny:0,nz:-1},{depth:b.z2-q.z,nx:0,ny:0,nz:1}];
              const face=faces.reduce((a,b)=>a.depth<b.depth?a:b);dx=face.nx;dy=face.ny;dz=face.nz;d=1;q.x+=dx*(face.depth+p.r);q.y+=dy*(face.depth+p.r);q.z+=dz*(face.depth+p.r);
            }else{q.x=cx+dx/d*p.r;q.y=cy+dy/d*p.r;q.z=cz+dz/d*p.r;}
            const nx=dx/d,ny=dy/d,nz=dz/d,cs=group.cs??1,sn=group.sn??0;
            impact=Math.max(impact,reflect(p,nx*cs+nz*sn,ny,-nx*sn+nz*cs,.3));if(ny>.7)grounded=true;
          }
          Object.assign(p,worldPoint(q,group));
        }
        // walkers (thrown props hit people)
        const sp = Math.hypot(p.vx, p.vy, p.vz);
        for (const w of walkers) {
          if (w.ghost || w.id === p.thrower) continue;
          if (p.y > 1.85 || p.y < 0) continue;
          const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
          if (d < 0.3 + p.r && d > 1e-4) {
            p.x = w.x + dx / d * (0.3 + p.r); p.z = w.z + dz / d * (0.3 + p.r);
            reflect(p, dx / d, 0, dz / d, 0.25);
            if (sp > 2.2 && p.thrownAt && !p.hitDone) { p.hitDone = true; out.push({ prop: p, hitChar: w.id, speed: sp }); }
          }
        }
        if (grounded) { p.vx *= Math.pow(0.05, h); p.vz *= Math.pow(0.05, h); }
        if (impact > 1.4) out.push({ prop: p, speed: impact });
        if (sp > 0.3) { p.yaw += (p.vx - p.vz) * h * 3; p.roll += sp * h * 4; }
        if (grounded && sp < 0.08 && propSupported(p)) { p.vx = p.vy = p.vz = 0; p.sleep = true; p.roll = 0; p.thrownAt = 0; p.thrower = null; break; }
      }
      p.moved = true;
    }
    return out;
  }
  wake(p) { p.sleep = false; p.moved = true; }
}

// ---------- billiards ----------
export const BALL_R = 0.055;
const POCKET_R = 0.105;
export class Pool {
  constructor() { this.rack(); this.shots = 0; }
  rack() {
    const cx = POOL.x, cz = POOL.z;
    this.balls = [{ n: 0, x: cx, z: cz, vx: 0, vz: 0, in: false }];
    this.moving = false;
  }
  pockets() {
    const { x, z, w, d } = POOL;
    return [[x - w / 2, z - d / 2], [x, z - d / 2 - 0.01], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x, z + d / 2 + 0.01], [x + w / 2, z + d / 2]];
  }
  // Strike the cue ball along (dx,dz) with speed v.
  shoot(dx, dz, v = 3.2) {
    const c = this.balls[0];
    if (this.moving) return false;
    if (c.in) { c.in = false; c.x = POOL.x; c.z = POOL.z; }
    const l = Math.hypot(dx, dz) || 1;
    c.vx = dx / l * v; c.vz = dz / l * v;
    this.moving = true; this.shots++;
    return true;
  }
  // returns {clacks, sunk}
  step(dt) {
    if (!this.moving) return null;
    let clacks = 0, sunk = 0;
    const sub = 8, h = dt / sub, minX = POOL.x - POOL.w / 2 + BALL_R, maxX = POOL.x + POOL.w / 2 - BALL_R, minZ = POOL.z - POOL.d / 2 + BALL_R, maxZ = POOL.z + POOL.d / 2 - BALL_R;
    const pk = this.pockets();
    for (let s = 0; s < sub; s++) {
      for (const b of this.balls) {
        if (b.in) continue;
        b.x += b.vx * h; b.z += b.vz * h;
        const f = Math.pow(0.55, h); b.vx *= f; b.vz *= f;
        if (Math.hypot(b.vx, b.vz) < 0.02) b.vx = b.vz = 0;
        for (const [px, pz] of pk) if (Math.hypot(b.x - px, b.z - pz) < POCKET_R) { b.in = true; b.vx = b.vz = 0; sunk++; }
        if (b.in) continue;
        if (b.x < minX) { b.x = minX; b.vx = Math.abs(b.vx) * 0.8; } if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * 0.8; }
        if (b.z < minZ) { b.z = minZ; b.vz = Math.abs(b.vz) * 0.8; } if (b.z > maxZ) { b.z = maxZ; b.vz = -Math.abs(b.vz) * 0.8; }
      }
      for (let i = 0; i < this.balls.length; i++) for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        if (a.in || b.in) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d >= BALL_R * 2 || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, ov = BALL_R * 2 - d;
        a.x -= nx * ov / 2; a.z -= nz * ov / 2; b.x += nx * ov / 2; b.z += nz * ov / 2;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) { a.vx += rv * nx * 0.96; a.vz += rv * nz * 0.96; b.vx -= rv * nx * 0.96; b.vz -= rv * nz * 0.96; if (-rv > 0.2) clacks++; }
      }
    }
    this.moving = this.balls.some((b) => !b.in && (b.vx || b.vz));
    return { clacks, sunk };
  }
  state() { return this.balls.map((b) => [Math.round(b.x * 1000) / 1000, Math.round(b.z * 1000) / 1000, b.in ? 1 : 0]); }
}
