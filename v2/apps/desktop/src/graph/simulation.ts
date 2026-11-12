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
  /**
   * Where a note belongs in the whole-wiki layout: 0 in the main body, 1 in a smaller
   * group of linked notes, 2 without links. `slot` is the group, or the row of the ring.
   */
  zone: 0 | 1 | 2;
  slot: number;
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
 * The whole wiki, laid out as Obsidian lays out a vault: links are springs, every note
 * repels every other, and gravity gathers the linked body into a round disc. Notes are
 * small beside the room between them, so a busy note's leaves ring it like a dandelion.
 */
const ORGANIC = {
  /** Rest length of a link beyond the two notes' own sizes, and more around busy notes. */
  gap: 95,
  crowd: 7,
  repulsion: 330,
  gravity: 0.12,
  /** Stiffness of links relative to d3's, and how firmly a smaller group holds together. */
  spring: 0.35,
  cohesion: 0.12,
  /** Room between two notes that are not linked. */
  pad: 6,
  /** Distance from the body to the ring of unlinked notes, and between notes on it. */
  ringGap: 160,
  ringSpacing: 60,
};
/** The golden angle: notes seeded by it fill a disc evenly, as seeds in a sunflower do. */
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

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
export function linkDistance(a: SimNode, b: SimNode, scale = 1, organic = false) {
  const crowd = Math.max(a.degree, b.degree);
  if (organic)
    return (a.radius + b.radius + ORGANIC.gap + Math.sqrt(crowd) * ORGANIC.crowd) * scale;
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
  /** The whole-wiki layout (see `ORGANIC`); otherwise the rings around central notes. */
  organic = false;
  /** Smaller groups of linked notes, and the notes without links, around the body. */
  private satellites: SimNode[][] = [];
  private unlinked: SimNode[] = [];
  /** How far the body reaches, measured every few ticks. */
  private reach = 0;
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
        zone: 0,
        slot: 0,
      };
    });
    const sim = new ForceSimulation(nodes, edges, structure, forces);
    const byId = sim.byId;
    for (const n of nodes) {
      const hub = structure.hubOf.get(n.id);
      n.hub = hub && hub !== n.id ? byId.get(hub)! : null;
    }
    if (!focusId) {
      sim.seedOrganic(previous);
      return sim;
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
      link.distance = linkDistance(source, target, forces.distance, this.organic);
      // d3's default: a link to a hub pulls less, so hubs do not collapse their ring.
      // Above 1 a spring overshoots further each tick, so stronger settings saturate there.
      link.strength =
        Math.min(1, forces.link / Math.max(1, Math.min(source.degree, target.degree))) *
        (this.organic ? ORGANIC.spring : 1);
      // The less connected end moves more, so a hub carries its notes along.
      link.bias = source.degree / Math.max(1, source.degree + target.degree);
    }
  }

  /**
   * Seed the whole-wiki layout. The largest group of linked notes is the body, grown
   * outward from the most central note so linked notes start side by side. Smaller
   * groups and notes without links start on the ring around it, where `holdRing` keeps
   * them. Notes seen before keep their place.
   */
  private seedOrganic(previous?: Map<string, { x: number; y: number }>) {
    this.organic = true;
    this.setForces(this.forces);
    const seen = new Set<SimNode>();
    const groups: SimNode[][] = [];
    for (const start of this.nodes) {
      if (seen.has(start)) continue;
      const group = [start];
      seen.add(start);
      for (let i = 0; i < group.length; i++)
        for (const other of this.adjacent.get(group[i]) ?? [])
          if (!seen.has(other)) {
            seen.add(other);
            group.push(other);
          }
      groups.push(group);
    }
    groups.sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1));
    // A wiki without any links is all body: the notes spread into an even disc.
    const linked = groups.length > 0 && groups[0].length > 1;
    const body = linked ? groups[0] : this.nodes;
    this.satellites = linked ? groups.slice(1).filter((g) => g.length > 1) : [];
    this.unlinked = linked ? groups.filter((g) => g.length === 1).map((g) => g[0]) : [];
    this.satellites.forEach((group, i) => {
      for (const n of group) Object.assign(n, { zone: 1, slot: i });
    });

    const known = (n: SimNode) => {
      const p = previous?.get(n.id);
      if (p) Object.assign(n, { x: p.x, y: p.y });
      return !!p;
    };
    /** Grow a group from its busiest note: each note's links fan out away from the root. */
    const grow = (group: SimNode[], cx: number, cy: number) => {
      const core = this.byId.get(this.structure.hubs[0] ?? '');
      const root =
        core && group.includes(core)
          ? core
          : group.reduce((best, n) => (n.degree > best.degree ? n : best), group[0]);
      if (!known(root)) Object.assign(root, { x: cx, y: cy });
      const heading = new Map<SimNode, number>();
      const placed = new Set([root]);
      const queue = [root];
      for (let i = 0; i < queue.length; i++) {
        const parent = queue[i];
        const children = (this.adjacent.get(parent) ?? [])
          .filter((n) => !placed.has(n))
          .sort((a, b) => b.degree - a.degree || (a.id < b.id ? -1 : 1));
        const from = heading.get(parent);
        // The root's links go all around it; any other note's fan out ahead of it.
        const spread =
          from === undefined ? Math.PI * 2 : Math.min(Math.PI * 1.2, 0.5 * children.length);
        children.forEach((child, j) => {
          placed.add(child);
          queue.push(child);
          const turn =
            from === undefined
              ? (j / children.length) * spread + seededRandom(root.id)() * Math.PI * 2
              : from + ((j + 0.5) / children.length - 0.5) * spread;
          heading.set(child, turn);
          if (known(child)) return;
          const reach = linkDistance(parent, child, this.forces.distance, true) * 0.6;
          child.x = parent.x + Math.cos(turn) * reach;
          child.y = parent.y + Math.sin(turn) * reach;
        });
      }
    };
    if (linked) grow(body, 0, 0);
    else
      body.forEach((n, i) => {
        if (known(n)) return;
        const r = 26 * this.forces.distance * Math.sqrt(i + 0.5);
        Object.assign(n, { x: Math.cos(i * GOLDEN) * r, y: Math.sin(i * GOLDEN) * r });
      });

    this.reach = this.bodyRadius();
    this.shell = this.reach + ORGANIC.ringGap * this.forces.distance;
    const perRow = Math.max(1, Math.floor((Math.PI * 2 * this.shell) / ORGANIC.ringSpacing));
    const rows = Math.ceil(this.unlinked.length / perRow);
    this.unlinked.forEach((n, i) => {
      Object.assign(n, { zone: 2, slot: i % Math.max(1, rows) });
      if (known(n)) return;
      // Rows are staggered, so the ring reads as one band of evenly spaced notes.
      const angle = (i / this.unlinked.length) * Math.PI * 2 - Math.PI / 2;
      const r = this.shell + n.slot * ORGANIC.ringSpacing;
      Object.assign(n, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
    this.satellites.forEach((group, i) => {
      const angle = ((i + 0.5) / this.satellites.length) * Math.PI * 2 + Math.PI / 5;
      grow(group, Math.cos(angle) * this.shell, Math.sin(angle) * this.shell);
    });
  }

  /** How far the body reaches from the middle, ignoring a few notes strung far out. */
  private bodyRadius() {
    const radii: number[] = [];
    for (const n of this.nodes)
      if (n.zone === 0 && n.fx === null) radii.push(Math.hypot(n.x, n.y) + n.radius);
    if (!radii.length) return 0;
    radii.sort((a, b) => a - b);
    return radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.98))];
  }

  /**
   * Keep what is not part of the body around it: notes without links on a ring just
   * outside, evenly spaced by their own repulsion, and each smaller group as a whole at
   * the ring or as far out as its size needs. They slide along the ring, not across it.
   */
  private holdRing() {
    if (this.ticks % 3 === 0) this.reach = this.bodyRadius();
    const reach = this.reach;
    const target = reach + ORGANIC.ringGap * this.forces.distance;
    this.shell += (target - this.shell) * 0.2;
    for (const n of this.unlinked) {
      if (n.fx !== null) continue;
      const r = Math.hypot(n.x, n.y) || 1;
      const along = (n.vx * n.x + n.vy * n.y) / (r * r);
      n.vx -= along * n.x;
      n.vy -= along * n.y;
      const scale = 1 + ((this.shell + n.slot * ORGANIC.ringSpacing) / r - 1) * 0.3;
      n.x *= scale;
      n.y *= scale;
    }
    for (const group of this.satellites) {
      let cx = 0;
      let cy = 0;
      let vx = 0;
      let vy = 0;
      for (const n of group) {
        cx += n.x;
        cy += n.y;
        vx += n.vx;
        vy += n.vy;
      }
      cx /= group.length;
      cy /= group.length;
      const r = Math.hypot(cx, cy) || 1;
      let size = 0;
      for (const n of group) size = Math.max(size, Math.hypot(n.x - cx, n.y - cy) + n.radius);
      // Small groups sit on the ring; a large one moves out until it clears the body.
      const want = Math.max(
        this.shell,
        reach + size * 0.8 + ORGANIC.ringGap * 0.25 * this.forces.distance,
      );
      // The group keeps its shape: all of it moves, and none of it drifts in or out.
      const along = (vx * cx + vy * cy) / (group.length * r * r);
      const shift = ((want - r) / r) * 0.3;
      for (const n of group) {
        if (n.fx !== null) continue;
        n.vx -= along * cx;
        n.vy -= along * cy;
        n.x += cx * shift;
        n.y += cy * shift;
      }
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
    if (this.ticks++ % 15 === 0 && !this.organic) this.measureShell();
    this.applyLinks(alpha);
    this.applyRepulsion(alpha);
    if (this.organic) this.applyGravity(alpha);
    else this.applyShape(alpha);
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
    if (this.organic) this.holdRing();
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
    const base = -(this.organic ? ORGANIC.repulsion : REPULSION) * this.forces.repel;
    const strength = (n: SimNode) => base * (1 + Math.sqrt(n.degree) * 0.25);
    accumulate(root, strength);
    // One stack and no per-leaf arrays: this loop runs for every note on every tick.
    const stack: Quad[] = [];
    for (const node of this.nodes) {
      stack.push(root);
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
        const extra = q.extra;
        for (let i = -1, count = extra ? extra.length : 0; i < count; i++) {
          const other = i < 0 ? q.point! : extra![i];
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

  /** Gather the body into a disc around the middle; the ring is held by `holdRing`. */
  private applyGravity(alpha: number) {
    const g = ORGANIC.gravity * this.forces.center * alpha;
    if (!g) return;
    for (const n of this.nodes) {
      if (n.zone !== 0) continue;
      n.vx -= n.x * g;
      n.vy -= n.y * g;
    }
    // A smaller group gathers around its own middle instead, so a chain curls up.
    const hold = ORGANIC.cohesion * this.forces.center * alpha;
    for (const group of this.satellites) {
      let cx = 0;
      let cy = 0;
      for (const n of group) {
        cx += n.x;
        cy += n.y;
      }
      cx /= group.length;
      cy /= group.length;
      for (const n of group) {
        n.vx -= (n.x - cx) * hold;
        n.vy -= (n.y - cy) * hold;
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
    // A small wiki shows every label, so its notes keep clear of each other's labels; a
    // large one is read by shape, and only the dots themselves keep apart.
    const labels = this.organic ? Math.max(0, Math.min(1, (120 - this.nodes.length) / 80)) : 1;
    if (!labels) return this.applyCircleCollision();
    const pad = 6;
    const halfWidth = (n: SimNode) => Math.max(n.radius, n.labelHalf * labels);
    const halfHeight = (n: SimNode) => n.radius + 9 * labels;
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

  /** Keep dots from overlapping, pushed apart along the line between them. */
  private applyCircleCollision() {
    let largest = 0;
    for (const n of this.nodes) largest = Math.max(largest, n.radius);
    const cell = largest * 2 + ORGANIC.pad;
    const grid = new Map<number, SimNode[]>();
    const key = (gx: number, gy: number) => gx * 73856093 + gy * 19349663;
    for (const n of this.nodes) {
      const k = key(Math.floor(n.x / cell), Math.floor(n.y / cell));
      const bucket = grid.get(k);
      if (bucket) bucket.push(n);
      else grid.set(k, [n]);
    }
    for (const a of this.nodes) {
      const gx = Math.floor(a.x / cell);
      const gy = Math.floor(a.y / cell);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (const b of grid.get(key(gx + i, gy + j)) ?? []) {
            if (b.id <= a.id) continue;
            const dx = a.x + a.vx - b.x - b.vx || jiggle();
            const dy = a.y + a.vy - b.y - b.vy || jiggle();
            const reach = a.radius + b.radius + ORGANIC.pad;
            const d2 = dx * dx + dy * dy;
            if (d2 >= reach * reach) continue;
            const d = Math.sqrt(d2);
            const push = ((reach - d) / d) * 0.5;
            const share = (b.radius * b.radius) / (a.radius * a.radius + b.radius * b.radius);
            a.vx += dx * push * share;
            a.vy += dy * push * share;
            b.vx -= dx * push * (1 - share);
            b.vy -= dy * push * (1 - share);
          }
    }
  }
}
