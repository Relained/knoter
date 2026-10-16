import type { GraphForces } from '@knoter/contracts/native';
import {
  analyzeGraph,
  roleOf,
  roleScale,
  seededRandom,
  type GraphStructure,
  type Role,
} from './hubs';
import { defaultForces, nodeRadius } from './simulation';

/**
 * The 3D layout behind the sphere view. It keeps the 2D view's forces (Barnes–Hut
 * repulsion over an octree, springs whose rest length grows with crowding, collision,
 * weak gravity) and adds the shape: the most central note sits at the core and the
 * other hubs on an inner shell. Each note radiates outward from its hub, one layer per
 * link, along the ray from the core through that hub, so every hub grows a petal of the
 * sphere; the core's own notes form layers around it. Notes no hub reaches settle on an
 * outer shell that follows the petals as they grow, so nothing is clamped to a size.
 */
export interface Node3D {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fx: number | null;
  fy: number | null;
  fz: number | null;
  degree: number;
  radius: number;
  role: Role;
  hub: Node3D | null;
  hops: number;
}
interface Link3D {
  source: Node3D;
  target: Node3D;
  distance: number;
  strength: number;
  bias: number;
}
export type Point3 = { x: number; y: number; z: number };

const REPULSION = 190;
const THETA2 = 0.81;
const GRAVITY = 0.004;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function direction(next: () => number): Point3 {
  const z = next() * 2 - 1;
  const t = next() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return { x: r * Math.cos(t), y: z, z: r * Math.sin(t) };
}
/** Evenly spread points on a unit sphere. */
function fibonacci(i: number, count: number): Point3 {
  const y = count === 1 ? 0 : 1 - (2 * (i + 0.5)) / count;
  const r = Math.sqrt(1 - y * y);
  return { x: r * Math.cos(i * GOLDEN), y, z: r * Math.sin(i * GOLDEN) };
}

interface Cell {
  x0: number;
  y0: number;
  z0: number;
  size: number;
  cx: number;
  cy: number;
  cz: number;
  charge: number;
  points: Node3D[] | null;
  children: (Cell | null)[] | null;
}
const cell = (x0: number, y0: number, z0: number, size: number): Cell => ({
  x0,
  y0,
  z0,
  size,
  cx: 0,
  cy: 0,
  cz: 0,
  charge: 0,
  points: null,
  children: null,
});
function insert(c: Cell, node: Node3D, depth: number) {
  if (!c.children) {
    if (!c.points || depth > 32) {
      (c.points ??= []).push(node);
      return;
    }
    const first = c.points[0];
    if (first.x === node.x && first.y === node.y && first.z === node.z) {
      c.points.push(node);
      return;
    }
    const points = c.points;
    c.points = null;
    c.children = [null, null, null, null, null, null, null, null];
    for (const p of points) place(c, p, depth);
  }
  place(c, node, depth);
}
function place(c: Cell, node: Node3D, depth: number) {
  const half = c.size / 2;
  const ix = node.x >= c.x0 + half ? 1 : 0;
  const iy = node.y >= c.y0 + half ? 1 : 0;
  const iz = node.z >= c.z0 + half ? 1 : 0;
  const index = ix + iy * 2 + iz * 4;
  c.children![index] ??= cell(c.x0 + ix * half, c.y0 + iy * half, c.z0 + iz * half, half);
  insert(c.children![index]!, node, depth + 1);
}
function accumulate(c: Cell, strength: (n: Node3D) => number) {
  let charge = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  let weight = 0;
  const add = (q: number, px: number, py: number, pz: number) => {
    const w = Math.abs(q);
    charge += q;
    x += px * w;
    y += py * w;
    z += pz * w;
    weight += w;
  };
  if (c.children) {
    for (const child of c.children)
      if (child) {
        accumulate(child, strength);
        add(child.charge, child.cx, child.cy, child.cz);
      }
  } else for (const n of c.points!) add(strength(n), n.x, n.y, n.z);
  c.charge = charge;
  const mid = c.size / 2;
  c.cx = weight ? x / weight : c.x0 + mid;
  c.cy = weight ? y / weight : c.y0 + mid;
  c.cz = weight ? z / weight : c.z0 + mid;
}

let jiggleSeed = 7;
const jiggle = () => {
  jiggleSeed = (jiggleSeed * 16807) % 2147483647;
  return (jiggleSeed / 2147483647 - 0.5) * 1e-6;
};

export class ForceSimulation3D {
  alpha = 1;
  alphaMin = 0.002;
  alphaTarget = 0;
  alphaDecay = 1 - Math.pow(0.002, 1 / 300);
  velocityDecay = 0.6;
  /** Radius of the outer shell where notes no hub reaches settle. */
  shell: number;
  /** Radius of the inner shell that holds the hubs around the core. */
  hubShell: number;
  readonly byId: Map<string, Node3D>;
  readonly links: Link3D[] = [];
  private forces: GraphForces;
  private ticks = 0;
  /** Radial spacing between link layers. */
  private get layer() {
    return 58 * this.forces.distance;
  }

  private constructor(
    readonly nodes: Node3D[],
    edges: { source: string; target: string }[],
    readonly structure: GraphStructure,
    forces: GraphForces,
  ) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    this.forces = forces;
    const seen = new Set<string>();
    for (const e of edges) {
      const source = this.byId.get(e.source);
      const target = this.byId.get(e.target);
      const key = e.source < e.target ? `${e.source}:${e.target}` : `${e.target}:${e.source}`;
      if (!source || !target || source === target || seen.has(key)) continue;
      seen.add(key);
      this.links.push({ source, target, distance: 0, strength: 0, bias: 0.5 });
    }
    this.hubShell = 70 + 15 * Math.sqrt(nodes.length);
    this.shell = this.hubShell * 2.2;
    this.setForces(forces);
  }

  static create(
    ids: string[],
    edges: { source: string; target: string }[],
    forces: GraphForces = defaultForces,
    previous?: Map<string, Point3>,
    focusId?: string,
  ) {
    const structure = analyzeGraph(ids, edges, focusId);
    const hubs = structure.hubs.slice(1);
    const nodes: Node3D[] = ids.map((id) => {
      const degree = structure.degree.get(id)!;
      const role = roleOf(structure, id);
      const scale = roleScale(role);
      return {
        id,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        fx: null,
        fy: null,
        fz: null,
        degree,
        radius: nodeRadius(degree) * scale,
        role,
        hub: null,
        hops: structure.hops.get(id)!,
      };
    });
    const sim = new ForceSimulation3D(nodes, edges, structure, forces);
    const byId = sim.byId;
    for (const n of nodes) {
      const hub = structure.hubOf.get(n.id);
      n.hub = hub && hub !== n.id ? byId.get(hub)! : null;
    }
    // Seed the shape: core, hubs on the inner shell, members out along their hub's ray,
    // and unreached notes on the outer shell. Notes seen before keep their place, and
    // new notes start in their own layer.
    const known = (n: Node3D) => {
      const p = previous?.get(n.id);
      if (p) Object.assign(n, { x: p.x, y: p.y, z: p.z });
      return !!p;
    };
    hubs.forEach((id, i) => {
      const hub = byId.get(id)!;
      if (known(hub)) return;
      const d = fibonacci(i, hubs.length);
      Object.assign(hub, { x: d.x * sim.hubShell, y: d.y * sim.hubShell, z: d.z * sim.hubShell });
    });
    const outer = nodes.filter((n) => n.role === 'orphan' || n.role === 'loose');
    outer.forEach((n, i) => {
      if (known(n)) return;
      const d = fibonacci(i, outer.length);
      const r = sim.shell * (n.role === 'loose' ? 0.9 : 1);
      Object.assign(n, { x: d.x * r, y: d.y * r, z: d.z * r });
    });
    if (structure.hubs[0]) known(byId.get(structure.hubs[0])!);
    for (const n of nodes) {
      if (n.role !== 'member' || known(n)) continue;
      const d = direction(seededRandom(n.id));
      const hub = n.hub!;
      const hr = Math.hypot(hub.x, hub.y, hub.z);
      // Around the core, a shell per layer; elsewhere, out along the hub's ray.
      const base = hr ? { x: hub.x / hr, y: hub.y / hr, z: hub.z / hr } : d;
      const r = hr + n.hops * 58;
      const spread = hr ? 18 + n.hops * 22 : 0;
      Object.assign(n, {
        x: base.x * r + d.x * spread,
        y: base.y * r + d.y * spread,
        z: base.z * r + d.z * spread,
      });
    }
    if (focusId) {
      const focus = byId.get(focusId);
      if (focus) Object.assign(focus, { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0 });
    }
    return sim;
  }

  setForces(forces: GraphForces) {
    this.forces = forces;
    for (const link of this.links) {
      const { source, target } = link;
      const crowd = Math.max(source.degree, target.degree);
      link.distance = (source.radius + target.radius + 28 + Math.sqrt(crowd) * 9) * forces.distance;
      link.strength = forces.link / Math.max(1, Math.min(source.degree, target.degree));
      link.bias = source.degree / Math.max(1, source.degree + target.degree);
    }
  }

  reheat(alpha = 0.6) {
    this.alpha = Math.max(this.alpha, alpha);
  }

  get settled() {
    return this.alpha < this.alphaMin && this.alphaTarget === 0;
  }

  warm(maxTicks: number, budgetMs: number) {
    const start = performance.now();
    for (let i = 0; i < maxTicks && !this.settled; i++) {
      this.tick();
      if ((i & 3) === 3 && performance.now() - start > budgetMs) break;
    }
  }

  tick() {
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    const alpha = this.alpha;
    if (this.ticks++ % 15 === 0) this.measureShells();
    this.applyLinks(alpha);
    this.applyRepulsion(alpha);
    this.applyShape(alpha);
    this.applyCollision();
    for (const n of this.nodes) {
      if (n.fx !== null) {
        n.x = n.fx;
        n.vx = 0;
      } else n.x += n.vx *= this.velocityDecay;
      if (n.fy !== null) {
        n.y = n.fy;
        n.vy = 0;
      } else n.y += n.vy *= this.velocityDecay;
      if (n.fz !== null) {
        n.z = n.fz;
        n.vz = 0;
      } else n.z += n.vz *= this.velocityDecay;
    }
  }

  /** Keep the outer shell just outside the petals as they grow or shrink. */
  private measureShells() {
    const radii = this.nodes
      .filter((n) => n.role === 'member' || n.role === 'hub' || n.role === 'core')
      .map((n) => Math.hypot(n.x, n.y, n.z))
      .sort((a, b) => a - b);
    if (!radii.length) return;
    const r95 = radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.95))];
    const shell = Math.max(this.hubShell * 1.5, r95 * 1.12 + 70);
    this.shell += (shell - this.shell) * 0.5;
  }

  private applyLinks(alpha: number) {
    for (const link of this.links) {
      const { source, target } = link;
      let dx = target.x + target.vx - source.x - source.vx || jiggle();
      let dy = target.y + target.vy - source.y - source.vy || jiggle();
      let dz = target.z + target.vz - source.z - source.vz || jiggle();
      let l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      l = ((l - link.distance) / l) * alpha * link.strength;
      dx *= l;
      dy *= l;
      dz *= l;
      target.vx -= dx * (1 - link.bias);
      target.vy -= dy * (1 - link.bias);
      target.vz -= dz * (1 - link.bias);
      source.vx += dx * link.bias;
      source.vy += dy * link.bias;
      source.vz += dz * link.bias;
    }
  }

  private applyRepulsion(alpha: number) {
    if (this.nodes.length < 2 || !this.forces.repel) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let max = -Infinity;
    for (const n of this.nodes) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      z0 = Math.min(z0, n.z);
    }
    for (const n of this.nodes) max = Math.max(max, n.x - x0, n.y - y0, n.z - z0);
    const root = cell(x0, y0, z0, Math.max(max, 1) + 1);
    for (const n of this.nodes) insert(root, n, 0);
    const base = -REPULSION * this.forces.repel;
    const strength = (n: Node3D) => base * (1 + Math.sqrt(n.degree) * 0.25);
    accumulate(root, strength);
    const stack: Cell[] = [];
    for (const node of this.nodes) {
      stack.push(root);
      while (stack.length) {
        const c = stack.pop()!;
        let dx = c.cx - node.x;
        let dy = c.cy - node.y;
        let dz = c.cz - node.z;
        let l = dx * dx + dy * dy + dz * dz;
        if (c.children && (c.size * c.size) / THETA2 < l) {
          if (l < 1) l = Math.sqrt(l);
          const f = (c.charge * alpha) / l;
          node.vx += dx * f;
          node.vy += dy * f;
          node.vz += dz * f;
          continue;
        }
        if (c.children) {
          for (const child of c.children) if (child) stack.push(child);
          continue;
        }
        for (const other of c.points!) {
          if (other === node) continue;
          dx = other.x - node.x || jiggle();
          dy = other.y - node.y || jiggle();
          dz = other.z - node.z || jiggle();
          l = dx * dx + dy * dy + dz * dz;
          if (l < 1) l = Math.sqrt(l);
          const f = (strength(other) * alpha) / l;
          node.vx += dx * f;
          node.vy += dy * f;
          node.vz += dz * f;
        }
      }
    }
  }

  /** The sphere: core to the center, hubs and stragglers to their shells, notes to hubs. */
  private applyShape(alpha: number) {
    const center = this.forces.center;
    if (!center) return;
    const radial = (n: Node3D, target: number, strength: number) => {
      const r = Math.hypot(n.x, n.y, n.z) || 1;
      const k = ((target - r) / r) * strength * center * alpha;
      n.vx += n.x * k;
      n.vy += n.y * k;
      n.vz += n.z * k;
    };
    for (const n of this.nodes) {
      if (n.role === 'core') radial(n, 0, 0.3);
      else if (n.role === 'hub') radial(n, this.hubShell, 0.08);
      else if (n.role === 'orphan') radial(n, this.shell, 0.12);
      else if (n.role === 'loose') radial(n, this.shell * 0.88, 0.05);
      else if (n.hub?.role === 'core') radial(n, n.hops * this.layer, 0.06);
      else if (n.hub) {
        // A layer per link outward from the hub, pulled gently toward the hub's side of
        // the sphere: each hub grows a broad cap rather than a thin spike.
        const h = n.hub;
        const hr = Math.hypot(h.x, h.y, h.z) || 1;
        radial(n, hr + n.hops * this.layer, 0.07);
        const r = Math.hypot(n.x, n.y, n.z) || 1;
        const k = 0.012 * center * alpha;
        n.vx += ((h.x / hr) * r - n.x) * k;
        n.vy += ((h.y / hr) * r - n.y) * k;
        n.vz += ((h.z / hr) * r - n.z) * k;
      }
      const g = GRAVITY * center * alpha;
      n.vx -= n.x * g;
      n.vy -= n.y * g;
      n.vz -= n.z * g;
    }
  }

  private applyCollision() {
    if (this.nodes.length < 2) return;
    const pad = 3;
    const size = Math.max(...this.nodes.map((n) => n.radius)) * 2 + pad;
    const grid = new Map<string, Node3D[]>();
    const key = (x: number, y: number, z: number) => `${x}:${y}:${z}`;
    for (const n of this.nodes) {
      const k = key(Math.floor(n.x / size), Math.floor(n.y / size), Math.floor(n.z / size));
      const bucket = grid.get(k);
      if (bucket) bucket.push(n);
      else grid.set(k, [n]);
    }
    for (const a of this.nodes) {
      const gx = Math.floor(a.x / size);
      const gy = Math.floor(a.y / size);
      const gz = Math.floor(a.z / size);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++)
            for (const b of grid.get(key(gx + i, gy + j, gz + k)) ?? []) {
              if (b.id <= a.id) continue;
              const min = a.radius + b.radius + pad;
              let dx = a.x + a.vx - b.x - b.vx || jiggle();
              let dy = a.y + a.vy - b.y - b.vy || jiggle();
              let dz = a.z + a.vz - b.z - b.vz || jiggle();
              const l2 = dx * dx + dy * dy + dz * dz;
              if (l2 >= min * min) continue;
              const l = Math.sqrt(l2);
              const push = ((min - l) / l) * 0.6;
              dx *= push;
              dy *= push;
              dz *= push;
              const share = (b.radius * b.radius) / (a.radius * a.radius + b.radius * b.radius);
              a.vx += dx * share;
              a.vy += dy * share;
              a.vz += dz * share;
              b.vx -= dx * (1 - share);
              b.vy -= dy * (1 - share);
              b.vz -= dz * (1 - share);
            }
    }
  }
}
