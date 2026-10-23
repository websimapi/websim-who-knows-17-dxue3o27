import * as THREE from 'three';
import { CELL, COLS, ROWS } from './data.js';
import { hallRunnerLayout } from './hall-runners.js';
import { runnerTexture } from './textures.js';

export function buildHallRunners() {
  const group = new THREE.Group(); group.name = 'hallway-runners';
  const { quads, outlines } = hallRunnerLayout();
  const makeBuffer = () => ({ positions: [], uvs: [], normals: [], indices: [] });
  const fabric = makeBuffer(), edging = makeBuffer();
  const world = ([u, v]) => [(u - COLS / 2) * CELL, (v - ROWS / 2) * CELL];
  const emit = (buffer, points, y) => {
    const base = buffer.positions.length / 3;
    for (const [x, z] of points) {
      buffer.positions.push(x, y, z); buffer.normals.push(0, 1, 0);
      buffer.uvs.push(x / 2.2, -z / 4.4);
    }
    buffer.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const [x0, z0, x1, z1] of quads) emit(fabric, [[x0, z0], [x0, z1], [x1, z1], [x1, z0]].map(world), 0.007);
  const trimWidth = 0.045;
  for (const outline of outlines) {
    const points = outline.map(world);
    const inset = points.map((p, i) => {
      const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
      const a = new THREE.Vector2(p[0] - prev[0], p[1] - prev[1]).normalize();
      const b = new THREE.Vector2(next[0] - p[0], next[1] - p[1]).normalize();
      const f = trimWidth / (1 + a.dot(b));
      return [p[0] - (a.y + b.y) * f, p[1] + (a.x + b.x) * f];
    });
    // Shared miter vertices close both convex and concave corners, so trim
    // never leaves little detached ends at T junctions or right-angle turns.
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      emit(edging, [points[i], inset[i], inset[j], points[j]], 0.008);
    }
  }
  const mesh = (buffer, material) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(buffer.uvs, 2));
    g.setIndex(buffer.indices); g.computeBoundingSphere();
    material.userData.fixedHallSurface = true;
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; group.add(m);
  };
  mesh(fabric, new THREE.MeshStandardMaterial({ map: runnerTexture(), roughness: 1 }));
  mesh(edging, new THREE.MeshStandardMaterial({ color: 0xb58c49, roughness: 0.9 }));
  return group;
}
