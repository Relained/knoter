import type { GraphForces } from '@knoter/contracts/native';

/**
 * An unbounded force-directed layout in the style of d3-force, which Obsidian's graph
 * view also follows: nodes repel each other (Barnes–Hut approximation), links act as
 * springs, overlapping nodes are pushed apart, and a weak gravity keeps disconnected
 * parts near the middle. Nothing clamps nodes to the viewport; the camera fits the
 * result instead.
 */
export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** A fixed position while dragged or pinned. */
  fx: number | null;
  fy: number | null;
  degree: number;
  radius: number;
  /** Half the width of the node's label, which collision keeps clear (capped). */
  labelHalf: number;
}
export interface SimLink {
  source: SimNode;
  target: SimNode;
  distance: number;
  strength: number;
  bias: number;
}

export const defaultForces: GraphForces = { center: 1, repel: 1, link: 1, distance: 1 };

const INITIAL_RADIUS = 12;
const INITIAL_ANGLE = Math.PI * (3 - Math.sqrt(5));
const REPULSION = 260;
const GRAVITY = 0.035;
const THETA2 = 0.81;
const LABEL_GAP = 46;

/**
 * Approximate half-width of a label in layout units (11px text; CJK glyphs are wider),
 * capped so long titles do not push whole neighborhoods apart.
 */
export function labelHalfWidth(label: string) {
  let width = 0;
  for (const ch of label.slice(0, 34))
    width += /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 11 : 6.2;
  return Math.min(70, width / 2);
}

/** Node size grows with its connections, as in Obsidian. */
export const nodeRadius = (degree: number) => Math.min(24, 5 + Math.sqrt(degree) * 2.8);

/**
 * Rest length of a link: enough room for both nodes and their labels, and for a hub's
 * neighbors to sit around it in a ring without overlapping.
 */
export function linkDistance(a: SimNode, b: SimNode, scale = 1) {
  const pair = a.radius + b.radius + LABEL_GAP;
  const crowd = Math.max(a.degree, b.degree);
  const ring = (crowd * (2 * 9 + LABEL_GAP * 0.55)) / (2 * Math.PI);
  return Math.max(pair, ring) * scale;
}

interface Quad {
  x0: number;
  y0: number;
  size: number;
  cx: number;
  cy: number;
  charge: number;
  point: SimNode | null;
  extra: SimNode[] | null;
  children: (Quad | null)[] | null;
}

const quad = (x0: number, y0: number, size: number): Quad => ({
  x0,
  y0,
  size,
  cx: 0,
  cy: 0,
  charge: 0,
  point: null,
  extra: null,
  children: null,
});

function insert(q: Quad, node: SimNode, depth = 0) {
  if (!q.children && !q.point) {
    q.point = node;
    return;
  }
  // Coincident points, or a tree too deep to split further, share one leaf.
  if (!q.children && (depth > 40 || (q.point!.x === node.x && q.point!.y === node.y))) {
    (q.extra ??= []).push(node);
    return;
  }
  if (!q.children) {
    q.children = [null, null, null, null];
    const existing = q.point!;
    const extra = q.extra;
    q.point = null;
    q.extra = null;
    place(q, existing, depth);
    extra?.forEach((n) => place(q, n, depth));
  }
  place(q, node, depth);
}
function place(q: Quad, node: SimNode, depth: number) {
  const half = q.size / 2;
  const right = node.x >= q.x0 + half ? 1 : 0;
  const bottom = node.y >= q.y0 + half ? 1 : 0;
  const index = bottom * 2 + right;
  q.children![index] ??= quad(q.x0 + right * half, q.y0 + bottom * half, half);
  insert(q.children![index]!, node, depth + 1);
}
function accumulate(q: Quad, strength: (n: SimNode) => number) {
  let charge = 0;
  let x = 0;
  let y = 0;
  let weight = 0;
  if (q.children) {
    for (const child of q.children) {
      if (!child) continue;
      accumulate(child, strength);
      const w = Math.abs(child.charge);
      charge += child.charge;
      x += child.cx * w;
      y += child.cy * w;
      weight += w;
    }
  } else {
    for (const n of [q.point!, ...(q.extra ?? [])]) {
      const s = strength(n);
      const w = Math.abs(s);
      charge += s;
      x += n.x * w;
      y += n.y * w;
      weight += w;
    }
  }
  q.charge = charge;
  q.cx = weight ? x / weight : q.x0 + q.size / 2;
  q.cy = weight ? y / weight : q.y0 + q.size / 2;
}

/** Small deterministic offsets break exact overlaps without randomness between visits. */
let jiggleSeed = 1;
const jiggle = () => {
  jiggleSeed = (jiggleSeed * 16807) % 2147483647;
  return (jiggleSeed / 2147483647 - 0.5) * 1e-6;
};
/** A deterministic offset of up to 20 units, for placing a new node beside a neighbor. */
const nearby = () => jiggle() * 4e7;

export class ForceSimulation {
  alpha = 1;
  alphaMin = 0.002;
  alphaTarget = 0;
  alphaDecay = 1 - Math.pow(0.002, 1 / 300);
  velocityDecay = 0.6;
  readonly byId: Map<string, SimNode>;
  links: SimLink[] = [];
  private forces: GraphForces;

  constructor(
    readonly nodes: SimNode[],
    edges: { source: string; target: string }[],
    forces: GraphForces = defaultForces,
  ) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    this.forces = forces;
    for (const edge of edges) {
      const source = this.byId.get(edge.source);
      const target = this.byId.get(edge.target);
      if (!source || !target || source === target) continue;
      this.links.push({ source, target, distance: 0, strength: 0, bias: 0.5 });
    }
    this.setForces(forces);
  }

  /** Build nodes, placing known IDs where they were and new ones beside a neighbor. */
  static create(
    ids: string[],
    edges: { source: string; target: string }[],
    forces: GraphForces,
    previous?: Map<string, { x: number; y: number }>,
    labels?: Map<string, string>,
  ) {
    const degree = new Map(ids.map((id) => [id, 0]));
    for (const e of edges) {
      if (!degree.has(e.source) || !degree.has(e.target) || e.source === e.target) continue;
      degree.set(e.source, degree.get(e.source)! + 1);
      degree.set(e.target, degree.get(e.target)! + 1);
    }
    // Hubs start near the middle on a phyllotaxis spiral so the layout is deterministic.
    const order = [...ids].sort(
      (a, b) => degree.get(b)! - degree.get(a)! || (a < b ? -1 : a > b ? 1 : 0),
    );
    const nodes: SimNode[] = order.map((id, i) => {
      const r = INITIAL_RADIUS * Math.sqrt(0.5 + i);
      const angle = i * INITIAL_ANGLE;
      const d = degree.get(id)!;
      return {
        id,
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        degree: d,
        radius: nodeRadius(d),
        labelHalf: labelHalfWidth(labels?.get(id) ?? ''),
      };
    });
    if (previous?.size) {
      const known = new Map(nodes.map((n) => [n.id, n]));
      for (const n of nodes) {
        const p = previous.get(n.id);
        if (p) Object.assign(n, { x: p.x, y: p.y });
      }
      for (const n of nodes) {
        if (previous.has(n.id)) continue;
        const neighbor = edges
          .map((e) => (e.source === n.id ? e.target : e.target === n.id ? e.source : null))
          .find((id) => id && previous.has(id));
        const anchor = neighbor ? known.get(neighbor) : undefined;
        if (anchor) Object.assign(n, { x: anchor.x + nearby(), y: anchor.y + nearby() });
      }
    }
    return new ForceSimulation(nodes, edges, forces);
  }

  setForces(forces: GraphForces) {
    this.forces = forces;
    for (const link of this.links) {
      const { source, target } = link;
      link.distance = linkDistance(source, target, forces.distance);
      // d3's default: a link to a hub pulls less, so hubs do not collapse their ring.
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

  tick() {
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    const alpha = this.alpha;
    this.applyLinks(alpha);
    this.applyRepulsion(alpha);
    this.applyGravity(alpha);
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
    }
  }

  /** Run synchronously until settled, the tick limit, or the time budget. */
  warm(maxTicks: number, budgetMs: number) {
    const start = performance.now();
    for (let i = 0; i < maxTicks && !this.settled; i++) {
      this.tick();
      if ((i & 7) === 7 && performance.now() - start > budgetMs) break;
    }
  }

  private applyLinks(alpha: number) {
    for (const link of this.links) {
      const { source, target } = link;
      let dx = target.x + target.vx - source.x - source.vx || jiggle();
      let dy = target.y + target.vy - source.y - source.vy || jiggle();
      let l = Math.sqrt(dx * dx + dy * dy);
      l = ((l - link.distance) / l) * alpha * link.strength;
      dx *= l;
      dy *= l;
      target.vx -= dx * (1 - link.bias);
      target.vy -= dy * (1 - link.bias);
      source.vx += dx * link.bias;
      source.vy += dy * link.bias;
    }
  }

  private applyRepulsion(alpha: number) {
    if (this.nodes.length < 2 || !this.forces.repel) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of this.nodes) {
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x);
      y1 = Math.max(y1, n.y);
    }
    const root = quad(x0, y0, Math.max(x1 - x0, y1 - y0, 1) + 1);
    for (const n of this.nodes) insert(root, n);
    // Better-connected nodes push harder so clusters around hubs stay readable.
    const base = -REPULSION * this.forces.repel;
    const strength = (n: SimNode) => base * (1 + Math.sqrt(n.degree) * 0.25);
    accumulate(root, strength);
    for (const node of this.nodes) {
      const stack: Quad[] = [root];
      while (stack.length) {
        const q = stack.pop()!;
        let dx = q.cx - node.x;
        let dy = q.cy - node.y;
        let l = dx * dx + dy * dy;
        if (q.children && (q.size * q.size) / THETA2 < l) {
          // Far enough away: treat the whole cell as one body.
          if (l < 1) l = Math.sqrt(l);
          node.vx += (dx * q.charge * alpha) / l;
          node.vy += (dy * q.charge * alpha) / l;
          continue;
        }
        if (q.children) {
          for (const child of q.children) if (child) stack.push(child);
          continue;
        }
        for (const other of [q.point!, ...(q.extra ?? [])]) {
          if (other === node) continue;
          dx = other.x - node.x || jiggle();
          dy = other.y - node.y || jiggle();
          l = dx * dx + dy * dy;
          if (l < 1) l = Math.sqrt(l);
          const s = strength(other);
          node.vx += (dx * s * alpha) / l;
          node.vy += (dy * s * alpha) / l;
        }
      }
    }
  }

  private applyGravity(alpha: number) {
    const k = GRAVITY * this.forces.center * alpha;
    if (!k) return;
    for (const n of this.nodes) {
      n.vx -= n.x * k;
      n.vy -= n.y * k;
    }
  }

  /**
   * Keep nodes and their labels from overlapping. Each node occupies a box as wide as its
   * label and as tall as its circle plus the label line; overlapping boxes are pushed
   * apart along the axis of least overlap. A uniform grid avoids a pairwise scan.
   */
  private applyCollision() {
    if (this.nodes.length < 2) return;
    const pad = 6;
    const halfWidth = (n: SimNode) => Math.max(n.radius, n.labelHalf);
    const halfHeight = (n: SimNode) => n.radius + 9;
    const cell =
      Math.max(...this.nodes.map((n) => Math.max(halfWidth(n), halfHeight(n)))) * 2 + pad;
    const grid = new Map<string, SimNode[]>();
    for (const n of this.nodes) {
      const key = `${Math.floor(n.x / cell)}:${Math.floor(n.y / cell)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(n);
      else grid.set(key, [n]);
    }
    for (const a of this.nodes) {
      const gx = Math.floor(a.x / cell);
      const gy = Math.floor(a.y / cell);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          for (const b of grid.get(`${gx + i}:${gy + j}`) ?? []) {
            if (b.id <= a.id) continue;
            const dx = a.x + a.vx - b.x - b.vx || jiggle();
            const dy = a.y + a.vy - b.y - b.vy || jiggle();
            const overlapX = halfWidth(a) + halfWidth(b) + pad - Math.abs(dx);
            const overlapY = halfHeight(a) + halfHeight(b) + pad - Math.abs(dy);
            if (overlapX <= 0 || overlapY <= 0) continue;
            const share = (b.radius * b.radius) / (a.radius * a.radius + b.radius * b.radius);
            // Separate along the cheaper axis; vertical moves are cheaper for wide labels.
            if (overlapY <= overlapX) {
              const push = Math.sign(dy) * overlapY * 0.5;
              a.vy += push * share;
              b.vy -= push * (1 - share);
            } else {
              const push = Math.sign(dx) * overlapX * 0.5;
              a.vx += push * share;
              b.vx -= push * (1 - share);
            }
          }
        }
    }
  }
}
