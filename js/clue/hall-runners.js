// Hall runner routes in board coordinates. Center lines follow actual hallway
// lanes; the cross-passage below the cellar is on row 17, not inside the cellar.
import { GRID } from './data.js';

export const HALL_RUNNER_WIDTH = 0.56;
export const HALL_RUNNER_PATHS = [
  [[0.9, 7.5], [23.1, 7.5]],
  [[7, 0.9], [7, 7.5]],
  [[17, 0.9], [17, 7.5]],
  [[9, 7.5], [9, 17]],
  [[16.5, 7.5], [16.5, 24.1]],
  [[0.9, 17], [16.5, 17]],
  [[7.5, 17], [7.5, 24.1]],
  [[16.5, 13.5], [23.1, 13.5]],
  [[16.5, 20.5], [23.1, 20.5]],
];

const clean = (n) => Math.round(n * 1e6) / 1e6;
const key = ([u, v]) => `${u},${v}`;

export function hallRunnerLayout(grid = GRID) {
  const half = HALL_RUNNER_WIDTH / 2;
  const rects = HALL_RUNNER_PATHS.map(([[u1, v1], [u2, v2]]) => [
    clean(Math.min(u1, u2) - half), clean(Math.min(v1, v2) - half),
    clean(Math.max(u1, u2) + half), clean(Math.max(v1, v2) + half),
  ]);
  // Coordinate compression makes the union exact, without rounding route
  // ends to a raster. Grid boundaries also clip any future route to hall cells.
  const xs = [...new Set([...rects.flatMap(([a, , b]) => [a, b]), ...Array.from({ length: grid[0].length + 1 }, (_, i) => i)])].sort((a, b) => a - b);
  const zs = [...new Set([...rects.flatMap(([, a, , b]) => [a, b]), ...Array.from({ length: grid.length + 1 }, (_, i) => i)])].sort((a, b) => a - b);
  const mask = zs.slice(0, -1).map((z, j) => xs.slice(0, -1).map((x, i) => {
    const u = (x + xs[i + 1]) / 2, v = (z + zs[j + 1]) / 2;
    return grid[Math.floor(v)]?.[Math.floor(u)] === '.' && rects.some(([x0, z0, x1, z1]) => u > x0 && u < x1 && v > z0 && v < z1);
  }));
  const quads = [], edges = new Map();
  const occupied = (i, j) => !!mask[j]?.[i];
  const edge = (a, b) => edges.set(key(a), { a, b });
  for (let j = 0; j < mask.length; j++) for (let i = 0; i < mask[j].length; i++) {
    if (!occupied(i, j)) continue;
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    quads.push([x0, z0, x1, z1]);
    if (!occupied(i, j - 1)) edge([x0, z0], [x1, z0]);
    if (!occupied(i + 1, j)) edge([x1, z0], [x1, z1]);
    if (!occupied(i, j + 1)) edge([x1, z1], [x0, z1]);
    if (!occupied(i - 1, j)) edge([x0, z1], [x0, z0]);
  }
  // Follow exposed edges into closed contours, including the opening around
  // the cellar. The occupied carpet is always to the left of each edge.
  const outlines = [];
  while (edges.size) {
    const first = edges.values().next().value, loop = [];
    let e = first;
    do {
      loop.push(e.a); edges.delete(key(e.a));
      if (key(e.b) === key(first.a)) break;
      e = edges.get(key(e.b));
      if (!e) throw new Error('Hall runner perimeter is not closed');
    } while (true);
    outlines.push(loop.filter((p, i) => {
      const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
      return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-9;
    }));
  }
  return { quads, outlines };
}
