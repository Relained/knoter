import type { GraphForces } from '@knoter/contracts/native';
import {
  analyzeGraph,
  roleOf,
  roleScale,
  seededRandom,
  type GraphStructure,
  type Role,
} from './hubs';

/**
 * The graph's layout, a disc around the wiki's central notes. Forces work as in d3-force,
 * which Obsidian's graph also follows (Barnes–Hut repulsion, springs, collision that
 * keeps labels clear), and shape the result: the most central note sits at the center,
 * the other central notes on an inner ring, every other note radiates outward from its
 * nearest central note one ring per link, within that note's wedge of the disc, and
 * notes without links settle on an outer ring that follows the wedges as they grow.
 * Nothing clamps nodes to the viewport; the camera fits the result instead.
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
  role: Role;
  /** The central note this note radiates from, if any. */
  hub: SimNode | null;
  hops: number;
  /** Share of its motion a note takes: 1, or less around a drag (see `grab`). */
  mobility: number;
}
export interface SimLink {
  source: SimNode;
  target: SimNode;
  distance: number;
  strength: number;
  bias: number;
}

export const defaultForces: GraphForces = { center: 1, repel: 1, link: 1, distance: 1 };

const REPULSION = 260;
const GRAVITY = 0.006;
const THETA2 = 0.81;
const LABEL_GAP = 46;
/** Heat held while a note is dragged, as in d3's and Obsidian's drag. */
const DRAG_HEAT = 0.3;
/** How freely notes 1, 2, 3, and 4 links from a dragged note follow it; farther ones stay. */
const FOLLOW = [1, 1, 0.7, 0.4, 0.2];
/** Notes nearer the dragged one than this move freely, fading out at `PUSH_FAR`. */
const PUSH_NEAR = 120;
const PUSH_FAR = 320;

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
 * Rest length of a link: room for both nodes and their labels, a little more around
 * busy notes. The rings of the disc, not long spokes, give crowded notes their space.
 */
export function linkDistance(a: SimNode, b: SimNode, scale = 1) {
  const crowd = Math.max(a.degree, b.degree);
  return (a.radius + b.radius + LABEL_GAP + Math.sqrt(crowd) * 6) * scale;
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

export class ForceSimulation {
  alpha = 1;
  alphaMin = 0.002;
  alphaTarget = 0;
  alphaDecay = 1 - Math.pow(0.002, 1 / 300);
  velocityDecay = 0.6;
  readonly byId: Map<string, SimNode>;
  links: SimLink[] = [];
  /** Radius of the ring that holds the central notes around the core. */
  hubRing: number;
  /** Radius of the outer ring where notes without links settle. */
  shell: number;
  private forces: GraphForces;
  private ticks = 0;
  private readonly adjacent = new Map<SimNode, SimNode[]>();
  /**
   * The note last dragged, whether the pointer still holds it, and how freely each note
   * follows it by link distance, kept until the layout settles after the drop.
   */
  private dragged: SimNode | null = null;
  private holding = false;
  private follow: Map<SimNode, number> | null = null;
  /** Radial spacing between link rings. */
  private get layer() {
    return 74 * this.forces.distance;
  }

  constructor(
    readonly nodes: SimNode[],
    edges: { source: string; target: string }[],
    readonly structure: GraphStructure,
    forces: GraphForces = defaultForces,
  ) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    this.forces = forces;
    this.hubRing = 90 + 24 * Math.sqrt(nodes.length);
    this.shell = this.hubRing * 2.2;
    for (const edge of edges) {
      const source = this.byId.get(edge.source);
      const target = this.byId.get(edge.target);
      if (!source || !target || source === target) continue;
      this.links.push({ source, target, distance: 0, strength: 0, bias: 0.5 });
      this.adjacent.set(source, [...(this.adjacent.get(source) ?? []), target]);
      this.adjacent.set(target, [...(this.adjacent.get(target) ?? []), source]);
    }
    this.setForces(forces);
  }

  /**
   * Build nodes around the wiki's central notes. Known IDs keep their last position;
   * new notes start beside their central note.
   */
  static create(
    ids: string[],
    edges: { source: string; target: string }[],
    forces: GraphForces,
    previous?: Map<string, { x: number; y: number }>,
    labels?: Map<string, string>,
    focusId?: string,
  ) {
    const structure = analyzeGraph(ids, edges, focusId);
    const nodes: SimNode[] = ids.map((id) => {
      const degree = structure.degree.get(id)!;
      const role = roleOf(structure, id);
      return {
        id,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        fx: null,
        fy: null,
        degree,
        radius: nodeRadius(degree) * roleScale(role),
        labelHalf: labelHalfWidth(labels?.get(id) ?? ''),
        role,
        hub: null,
        hops: structure.hops.get(id)!,
        mobility: 1,
      };
    });
    const sim = new ForceSimulation(nodes, edges, structure, forces);
    const byId = sim.byId;
    for (const n of nodes) {
      const hub = structure.hubOf.get(n.id);
      n.hub = hub && hub !== n.id ? byId.get(hub)! : null;
    }
    // Seed the disc: central notes evenly on their ring, each note out along its central
    // note's direction (around the core, in every direction), unlinked notes outermost.
    // Notes seen before keep their place, and new notes start on their own ring.
    const known = (n: SimNode) => {
      const p = previous?.get(n.id);
      if (p) Object.assign(n, { x: p.x, y: p.y });
      return !!p;
    };
    const hubs = structure.hubs.slice(1);
    hubs.forEach((id, i) => {
      const hub = byId.get(id)!;
      if (known(hub)) return;
      const angle = (i / hubs.length) * Math.PI * 2 - Math.PI / 2;
      Object.assign(hub, { x: Math.cos(angle) * sim.hubRing, y: Math.sin(angle) * sim.hubRing });
    });
    const wedge = hubs.length ? (Math.PI * 2) / hubs.length : Math.PI * 2;
    for (const n of nodes) {
      if (n.role !== 'member' || known(n)) continue;
      const next = seededRandom(n.id);
      const hub = n.hub!;
      const hr = Math.hypot(hub.x, hub.y);
      const angle = hr
        ? Math.atan2(hub.y, hub.x) + (next() - 0.5) * wedge * 0.7
        : next() * Math.PI * 2;
      const r = hr + n.hops * 74;
      Object.assign(n, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    const outer = nodes.filter((n) => n.role === 'orphan' || n.role === 'loose');
    outer.forEach((n, i) => {
      if (known(n)) return;
      const angle = (i / outer.length) * Math.PI * 2;
      const r = sim.shell * (n.role === 'loose' ? 0.9 : 1);
      Object.assign(n, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
    if (structure.hubs[0]) known(byId.get(structure.hubs[0])!);
    if (focusId) {
      const focus = byId.get(focusId);
      if (focus) Object.assign(focus, { x: 0, y: 0, fx: 0, fy: 0 });
    }
    return sim;
  }

  setForces(forces: GraphForces) {
    this.forces = forces;
    for (const link of this.links) {
      const { source, target } = link;
      link.distance = linkDistance(source, target, forces.distance);
      // d3's default: a link to a hub pulls less, so hubs do not collapse their ring.
      // Above 1 a spring overshoots further each tick, so stronger settings saturate there.
      link.strength = Math.min(
        1,
        forces.link / Math.max(1, Math.min(source.degree, target.degree)),
      );
      // The less connected end moves more, so a hub carries its notes along.
      link.bias = source.degree / Math.max(1, source.degree + target.degree);
    }
  }

  /** Wake every note, as a change to the forces or the notes does. */
  reheat(alpha = 0.6) {
    this.alpha = Math.max(this.alpha, alpha);
    this.release();
  }

  get settled() {
    return this.alpha < this.alphaMin && this.alphaTarget === 0;
  }

  /**
   * Hold a note at a point while the user drags it. As in Obsidian, the layout stays warm
   * and the rest answers through the forces: linked notes are pulled along, less with each
   * link between them and the dragged note, and notes it passes are pushed aside. Notes
   * that are neither linked nor near keep still, so one drag does not shift the whole wiki.
   */
  grab(node: SimNode, x: number, y: number) {
    if (!this.holding || this.dragged !== node) {
      this.localize([node]);
      this.dragged = node;
      this.holding = true;
      this.alphaTarget = DRAG_HEAT;
      this.alpha = Math.max(this.alpha, DRAG_HEAT);
    }
    node.fx = x;
    node.fy = y;
  }

  /**
   * Fit notes that just joined a known layout: they and the notes around them settle by
   * the same rule as a drag, while the rest of the wiki stays where it was.
   */
  settleAround(added: SimNode[], alpha = 0.3) {
    this.localize(added);
    this.alpha = Math.max(this.alpha, alpha);
  }

  /** Mobility by link distance from `origins`, until the layout next settles. */
  private localize(origins: SimNode[]) {
    this.release();
    this.follow = new Map(origins.map((n) => [n, 1]));
    let frontier = origins;
    for (let hops = 1; hops < FOLLOW.length && frontier.length; hops++) {
      const next: SimNode[] = [];
      for (const n of frontier)
        for (const other of this.adjacent.get(n) ?? [])
          if (!this.follow.has(other)) {
            this.follow.set(other, FOLLOW[hops]);
            next.push(other);
          }
      frontier = next;
    }
    for (const n of this.nodes) n.mobility = this.follow.get(n) ?? 0;
  }

  /**
   * Let go of a dragged note. It stays where it was dropped when `pin` is set (the focus of
   * a local graph); otherwise the forces take it back. The neighborhood settles as it moved.
   */
  drop(node: SimNode, pin = false) {
    if (this.dragged === node) this.holding = false;
    if (!pin) node.fx = node.fy = null;
    this.alphaTarget = 0;
  }

  tick() {
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    const alpha = this.alpha;
    if (this.ticks++ % 15 === 0) this.measureShell();
    this.applyLinks(alpha);
    this.applyRepulsion(alpha);
    this.applyShape(alpha);
    this.applyCollision();
    if (this.follow) this.measureMobility();
    for (const n of this.nodes) {
      const decay = this.velocityDecay * n.mobility;
      if (n.fx !== null) {
        n.x = n.fx;
        n.vx = 0;
      } else n.x += n.vx *= decay;
      if (n.fy !== null) {
        n.y = n.fy;
        n.vy = 0;
      } else n.y += n.vy *= decay;
    }
    // Once a drag has settled, every note is free again for the next change.
    if (this.follow && !this.holding && this.settled) this.release();
  }

  /** How freely each note moves this tick: by link distance or nearness to the drag. */
  private measureMobility() {
    const follow = this.follow!;
    const center = this.dragged;
    for (const n of this.nodes) {
      let mobility = follow.get(n) ?? 0;
      if (center && mobility < 1) {
        const d = Math.hypot(n.x - center.x, n.y - center.y);
        mobility = Math.max(mobility, Math.min(1, (PUSH_FAR - d) / (PUSH_FAR - PUSH_NEAR)));
      }
      n.mobility = mobility;
    }
  }

  private release() {
    if (!this.follow) return;
    this.follow = null;
    this.dragged = null;
    this.holding = false;
    for (const n of this.nodes) n.mobility = 1;
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
      target.vx -= dx * link.bias;
      target.vy -= dy * link.bias;
      source.vx += dx * (1 - link.bias);
      source.vy += dy * (1 - link.bias);
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

  /** Keep the outer ring just outside the wedges as they grow or shrink. */
  private measureShell() {
    const radii = this.nodes
      .filter((n) => n.role === 'member' || n.role === 'hub' || n.role === 'core')
      .map((n) => Math.hypot(n.x, n.y))
      .sort((a, b) => a - b);
    if (!radii.length) return;
    const r95 = radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.95))];
    const shell = Math.max(this.hubRing * 1.5, r95 * 1.1 + 90);
    this.shell += (shell - this.shell) * 0.5;
  }

  /** The disc: core to the center, rings for central and unlinked notes, wedges outward. */
  private applyShape(alpha: number) {
    const center = this.forces.center;
    if (!center) return;
    const radial = (n: SimNode, target: number, strength: number) => {
      const r = Math.hypot(n.x, n.y) || 1;
      const k = ((target - r) / r) * strength * center * alpha;
      n.vx += n.x * k;
      n.vy += n.y * k;
    };
    for (const n of this.nodes) {
      if (n.role === 'core') radial(n, 0, 0.3);
      else if (n.role === 'hub') radial(n, this.hubRing, 0.08);
      else if (n.role === 'orphan') radial(n, this.shell, 0.12);
      else if (n.role === 'loose') radial(n, this.shell * 0.88, 0.05);
      else if (n.hub?.role === 'core') radial(n, n.hops * this.layer, 0.06);
      else if (n.hub) {
        // A ring per link outward from the central note, drawn gently toward its side
        // of the disc so each central note grows a wedge rather than a thin spoke.
        const h = n.hub;
        const hr = Math.hypot(h.x, h.y) || 1;
        radial(n, hr + n.hops * this.layer, 0.07);
        const r = Math.hypot(n.x, n.y) || 1;
        const k = 0.012 * center * alpha;
        n.vx += ((h.x / hr) * r - n.x) * k;
        n.vy += ((h.y / hr) * r - n.y) * k;
      }
      const g = GRAVITY * center * alpha;
      n.vx -= n.x * g;
      n.vy -= n.y * g;
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
