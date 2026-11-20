import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  Focus,
  Link2,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
  WholeWord,
} from 'lucide-react';
import type { WikiDocument } from '@knoter/contracts';
import type { GraphForces, GraphLinks } from '@knoter/contracts/native';
import { Button } from '../components/ui/button';
import { DocumentContextItems } from '../components/DocumentMenu';
import { documentHref, type WikiEdge } from '../wiki/links';
import {
  GraphRenderer,
  LABEL_ZOOM,
  type Camera,
  type EdgeLook,
  type NodeLook,
  type RenderEdge,
  type RenderNode,
} from './renderer';
import { defaultForces, ForceSimulation, type SimNode } from './simulation';
import {
  CentralNotes,
  ForcesPanel,
  GraphLegend,
  LinkKindToggles,
  graphColor,
  linkKindLabels,
  pairKey,
  useGraphData,
  useGraphForces,
  useGraphLinkKinds,
} from './shared';

const MIN_ZOOM = 0.01;
/** How long the pointer rests on a note before its tooltip appears, in milliseconds. */
const TOOLTIP_MS = 450;
/** The usage hint is shown until the graph is first moved, once per session. */
let hintDismissed = false;
const MAX_ZOOM = 4;
/** A new layout unfolds from this share of its size to full size over `UNFOLD_MS`. */
const UNFOLD_FROM = 0.2;
const UNFOLD_MS = 1100;
/** A new layout counts as built, and the camera frames it, once it has cooled this far. */
const BUILT_ALPHA = 0.04;
const clampZoom = (k: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const leaf = (title: string) => title.split('/').at(-1)!;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** When a note appears in a new layout: the central notes first, then ring by ring. */
function enterDelay(node: SimNode) {
  if (node.role === 'core') return 0;
  if (node.role === 'hub') return 90;
  if (node.role === 'member') return Math.min(560, 90 + node.hops * 120);
  return 660;
}

/**
 * Layouts and cameras outlive the view, so a graph the user returns to is shown as it was
 * left instead of being built again: one entry for the whole wiki and one per focus note.
 */
interface SavedLayout {
  positions: Map<string, { x: number; y: number }>;
  camera: Camera;
  userMoved: boolean;
  /** The structure the positions settled for, if they did. */
  settled: string | null;
  /** Notes that joined and were still settling in, which a remount keeps settling. */
  settling: string[];
}
const savedLayouts = new Map<string, SavedLayout>();
const MAX_SAVED_LAYOUTS = 12;

/**
 * The notes as links for the keyboard and assistive technology: the canvas draws them,
 * and these carry focus, activation, and the context menu. Tab stops at one note; the
 * arrow keys move between notes by where they are drawn.
 */
const GraphLinks = memo(function GraphLinks({
  documents,
  degrees,
  tabStop,
  onFocusNote,
  onBlurNote,
  onActivate,
  onKeyDown,
}: {
  documents: WikiDocument[];
  degrees: Map<string, number>;
  tabStop: string | undefined;
  onFocusNote: (id: string, keyboard: boolean) => void;
  onBlurNote: () => void;
  onActivate: (id: string, event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLUListElement>) => void;
}) {
  return (
    <ul className="sr-only" onKeyDown={onKeyDown}>
      {documents.map((doc) => {
        const degree = degrees.get(doc.id) ?? 0;
        return (
          <li key={doc.id}>
            <a
              href={documentHref(doc.id)}
              data-note={doc.id}
              tabIndex={doc.id === tabStop ? 0 : -1}
              onClick={(e) => onActivate(doc.id, e)}
              onFocus={(e) => onFocusNote(doc.id, e.currentTarget.matches(':focus-visible'))}
              onBlur={onBlurNote}
            >
              {doc.title} · {degree} connection{degree === 1 ? '' : 's'}
            </a>
          </li>
        );
      })}
    </ul>
  );
});

export function GraphCanvas({
  documents,
  edges: allEdges,
  focusId,
  depth = 1,
  query = '',
  forces = defaultForces,
  onForces,
  linkKinds: savedLinkKinds,
  onLinkKinds,
  onOpen,
  className = '',
  insetTop = 0,
}: {
  documents: WikiDocument[];
  edges: WikiEdge[];
  focusId?: string;
  depth?: number;
  query?: string;
  forces?: GraphForces;
  onForces?: (forces: GraphForces) => void;
  /** Which kinds of link are drawn and laid out; both when absent. */
  linkKinds?: GraphLinks;
  onLinkKinds?: (kinds: GraphLinks) => void;
  onOpen: (id: string) => void;
  className?: string;
  /** Height covered by an overlay at the top, such as the home search field. */
  insetTop?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const textCanvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GraphRenderer | null>(null);
  const layoutKey = focusId ?? '';
  const [saved] = useState(() => savedLayouts.get(layoutKey));
  const positions = useRef(saved?.positions ?? new Map<string, { x: number; y: number }>());
  const camera = useRef<Camera>(saved?.camera ?? { x: 0, y: 0, k: 1 });
  const userMoved = useRef(saved?.userMoved ?? false);
  const settledFor = useRef(saved?.settled ?? null);
  const settling = useRef(saved?.settling ?? []);
  const frame = useRef<number | null>(null);
  /** Drawn size of the layout while a new one unfolds (1 otherwise), and when it began. */
  const spread = useRef(1);
  const unfoldStart = useRef<number | null>(null);
  /** A new layout is still forming; the camera frames it once it has. */
  const building = useRef(false);
  const drag = useRef<{
    id?: string;
    pointerX: number;
    pointerY: number;
    camera: Camera;
    moved: boolean;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  /** The note under the pointer, which shows a tooltip and a pointer cursor. */
  const [pointed, setPointed] = useState<string | null>(null);
  const pointedNow = useRef<string | null>(null);
  /** The note a press began on, which the click that follows opens unless it was dragged. */
  const pressed = useRef<string | null>(null);
  /** Where the pointer rests over the canvas, so hover can follow notes that move under it. */
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const repoint = useRef(() => {});
  const [tipShown, setTipShown] = useState(false);
  const tip = useRef<HTMLDivElement>(null);
  /** The note holding keyboard focus, which gets a ring, and the one Tab stops at. */
  const [ringed, setRinged] = useState<string | null>(null);
  const [tabStopId, setTabStopId] = useState<string | null>(null);
  /** Fingers on the canvas, and the pinch two of them make. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; x: number; y: number; camera: Camera } | null>(null);
  /** The notes the camera frames: search matches while searching, otherwise all. */
  const framed = useRef<Set<string> | null>(null);
  const beforeSearch = useRef<Camera | null>(null);
  const [hint, setHint] = useState(!hintDismissed);
  const [menuDoc, setMenuDoc] = useState<WikiDocument | null>(null);
  const [mode, setMode] = useState<'webgl' | 'canvas'>('webgl');
  const [panel, setPanel] = useState(false);
  const [localForces, updateForces] = useGraphForces(forces, onForces);
  const [linkKinds, updateLinkKinds] = useGraphLinkKinds(savedLinkKinds, onLinkKinds);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const appliedForces = useRef(JSON.stringify(forces));
  const { visible, edges, structure, categories, matches, searching } = useGraphData(
    documents,
    allEdges,
    focusId,
    depth,
    query,
    linkKinds,
  );

  /**
   * `build` lays out a new graph, `update` adjusts a known one to added or removed notes,
   * and `restore` shows a graph as it was when the view was left.
   */
  const layout = useMemo(() => {
    const known = positions.current;
    const sim = ForceSimulation.create(
      visible.map((d) => d.id),
      edges,
      localForces,
      known,
      new Map(visible.map((d) => [d.id, leaf(d.title)])),
      focusId,
    );
    const reused = sim.nodes.filter((n) => known.has(n.id)).length;
    if (sim.nodes.length && reused === sim.nodes.length && settledFor.current === structure) {
      sim.alpha = 0;
      return { simulation: sim, mode: 'restore' as const };
    }
    if (reused > sim.nodes.length * 0.8) {
      sim.alpha = 0.3;
      // New notes settle in around their links; other changes let the whole layout adjust.
      const added = sim.nodes.filter((n) => !known.has(n.id) || settling.current.includes(n.id));
      if (added.length) sim.settleAround(added);
      return { simulation: sim, mode: 'update' as const, settling: added.map((n) => n.id) };
    }
    // Without motion the layout is computed before it is shown, as one still picture.
    // Otherwise a few unseen ticks grow the seed to about its final size, so the frame
    // chosen before the layout unfolds already fits it closely.
    if (reducedMotion()) sim.warm(400, Math.min(160, 30 + sim.nodes.length / 4));
    else sim.warm(30, 40);
    return { simulation: sim, mode: 'build' as const };
    // localForces apply through setForces below; a rebuild is only for structure.
  }, [structure, focusId, layoutVersion]);
  const simulation = layout.simulation;

  const applyCamera = useCallback((animate = false) => {
    const { k } = camera.current;
    renderer.current?.setCamera(camera.current, animate);
    setZoom((current) => (Math.abs(current - k) > 0.004 ? k : current));
  }, []);

  /** Record where the notes are and draw them; the renderer reads the simulation's nodes. */
  const paint = useCallback(() => {
    for (const n of simulation.nodes) positions.current.set(n.id, { x: n.x, y: n.y });
    renderer.current?.setSpread(spread.current);
  }, [simulation]);

  /** The user has moved the view: automatic framing stops and the usage hint goes. */
  const moved = useCallback(() => {
    userMoved.current = true;
    if (!hintDismissed) {
      hintDismissed = true;
      setHint(false);
    }
  }, []);

  /** Space the panels over the canvas take, which framing keeps the graph clear of. */
  const insets = useCallback(() => {
    const box = container.current!;
    const bounds = box.getBoundingClientRect();
    const rect = (selector: string) => box.querySelector(selector)?.getBoundingClientRect();
    const hubsPanel = rect('.graph-hubs');
    // A narrow canvas has no room to give the list of central notes its own column.
    const left = hubsPanel && bounds.width > 640 ? hubsPanel.right - bounds.left : 0;
    let bottom = 0;
    for (const panel of [rect('.graph-legend'), rect('.graph-controls')])
      if (panel) bottom = Math.max(bottom, bounds.bottom - panel.top);
    return { top: insetTop, left, bottom, width: bounds.width, height: bounds.height };
  }, [insetTop]);

  /**
   * Frame the layout as drawn, or the search matches while searching. With
   * `onlyIfChanged`, a camera already close to the frame stays, so a layout that only
   * settled a little further does not nudge the view.
   */
  const fit = useCallback(
    (animate = false, onlyIfChanged = false) => {
      if (!container.current || !simulation.nodes.length) return;
      const s = spread.current;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of simulation.nodes) {
        if (framed.current && !framed.current.has(n.id)) continue;
        x0 = Math.min(x0, n.x * s - n.radius);
        x1 = Math.max(x1, n.x * s + n.radius);
        y0 = Math.min(y0, n.y * s - n.radius);
        y1 = Math.max(y1, n.y * s + n.radius + 22);
      }
      if (x0 === Infinity) return;
      const inset = insets();
      const width = Math.max(120, inset.width - inset.left);
      const height = Math.max(120, inset.height - inset.top - inset.bottom);
      const margin = Math.min(48, width / 8, height / 8);
      const k = clampZoom(
        Math.min(
          1.2,
          (width - margin * 2) / Math.max(1, x1 - x0),
          (height - margin * 2) / Math.max(1, y1 - y0),
        ),
      );
      const next = {
        k,
        x: inset.left + width / 2 - ((x0 + x1) / 2) * k,
        y: inset.top + height / 2 - ((y0 + y1) / 2) * k,
      };
      const current = camera.current;
      if (
        onlyIfChanged &&
        Math.abs(next.k / current.k - 1) < 0.06 &&
        Math.hypot(next.x - current.x, next.y - current.y) < Math.min(width, height) * 0.04
      )
        return;
      camera.current = next;
      applyCamera(animate);
    },
    [simulation, applyCamera, insets],
  );

  const finishBuild = useCallback(() => {
    if (!building.current) return;
    building.current = false;
    renderer.current?.setEntering(null);
  }, []);

  const run = useCallback(() => {
    if (frame.current !== null) return;
    const step = (now: number) => {
      // Two ticks per frame keep large graphs moving without long frames.
      simulation.tick();
      if (!simulation.settled) simulation.tick();
      if (unfoldStart.current !== null) {
        const t = Math.min(1, (now - unfoldStart.current) / UNFOLD_MS);
        spread.current = UNFOLD_FROM + (1 - UNFOLD_FROM) * easeOut(t);
        if (t === 1) unfoldStart.current = null;
      }
      paint();
      repoint.current();
      // Build the graph first, then set the view: the camera frames a new layout only
      // once it has unfolded and cooled, not while its notes are still finding places.
      const unfolding = unfoldStart.current !== null;
      if (building.current && !unfolding && simulation.alpha < BUILT_ALPHA) {
        finishBuild();
        if (!userMoved.current) fit(true);
      }
      if (simulation.settled && !unfolding) {
        frame.current = null;
        finishBuild();
        settledFor.current = structure;
        settling.current = [];
        if (!userMoved.current) fit(true, true);
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [simulation, paint, fit, finishBuild, structure]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      map.set(e.source, (map.get(e.source) ?? new Set()).add(e.target));
      map.set(e.target, (map.get(e.target) ?? new Set()).add(e.source));
    }
    return map;
  }, [edges]);
  // Central notes keep their labels when zoomed out, like map capitals.
  const hubs = useMemo(() => new Set(simulation.structure.hubs), [simulation]);
  const degrees = useMemo(
    () => new Map(simulation.nodes.map((n) => [n.id, n.degree])),
    [simulation],
  );

  /** What the renderer draws, in the order its looks and `pick` refer to. */
  const renderNodes = useMemo<RenderNode[]>(
    () =>
      visible.flatMap((doc) => {
        const sim = simulation.byId.get(doc.id);
        if (!sim) return [];
        const label = leaf(doc.title);
        return {
          sim,
          label: label.length > 34 ? `${label.slice(0, 32)}…` : label,
          color: Math.max(0, categories.indexOf(doc.category)),
          // On screen a note never shrinks below this, central notes most of all.
          minRadius: Math.min(9, 1.5 + Math.sqrt(sim.degree) * 0.75),
          enter: enterDelay(sim),
        };
      }),
    [visible, simulation, categories],
  );
  const renderEdges = useMemo<RenderEdge[]>(
    () =>
      edges.flatMap((edge) => {
        const source = simulation.byId.get(edge.source);
        const target = simulation.byId.get(edge.target);
        if (!source || !target) return [];
        return {
          key: pairKey(edge.source, edge.target),
          source,
          target,
          dashed: edge.kind === 'word',
          // A link appears once both of its notes have.
          enter: Math.max(enterDelay(source), enterDelay(target)) + 80,
        };
      }),
    [edges, simulation],
  );
  const hasNotes = visible.length > 0;

  // The renderer is created before the effects below hand it the graph and the camera.
  useLayoutEffect(() => {
    const box = container.current;
    if (!box || !glCanvas.current || !textCanvas.current) return;
    const instance = new GraphRenderer(glCanvas.current, textCanvas.current);
    renderer.current = instance;
    instance.onModeChange = setMode;
    instance.onCameraFrame = () => repoint.current();
    setMode(instance.mode);
    instance.setColors(categories.map((_, i) => graphColor(i)));
    instance.readTheme();
    instance.resize(box.clientWidth, box.clientHeight, devicePixelRatio);
    instance.setCamera(camera.current);
    // Colors follow the theme, and labels the interface font once it has loaded.
    const restyle = () => instance.readTheme();
    const themeObserver = new MutationObserver(restyle);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style'],
    });
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    scheme.addEventListener('change', restyle);
    void document.fonts?.ready.then(restyle);
    return () => {
      themeObserver.disconnect();
      scheme.removeEventListener('change', restyle);
      instance.destroy();
      renderer.current = null;
    };
  }, [hasNotes]);

  useLayoutEffect(() => {
    renderer.current?.setColors(categories.map((_, i) => graphColor(i)));
    renderer.current?.setGraph(renderNodes, renderEdges);
  }, [renderNodes, renderEdges, categories, hasNotes]);

  useLayoutEffect(() => {
    const near = hovered ? (neighbors.get(hovered) ?? new Set<string>()) : null;
    const nodeLooks = renderNodes.map<NodeLook>(({ sim: { id } }) => {
      const state = hovered
        ? id === hovered
          ? 'active'
          : near?.has(id)
            ? 'near'
            : 'dimmed'
        : searching
          ? matches.has(id)
            ? 'active'
            : 'dimmed'
          : '';
      const focused = id === focusId;
      return {
        alpha: state === 'dimmed' ? 0.16 : 1,
        halo: focused ? 0.18 : state === 'active' ? 0.22 : 0,
        active: state === 'active',
        top: id === hovered,
        focused,
        pinned: hubs.has(id) || focused || state === 'active' || state === 'near',
      };
    });
    const edgeLooks = renderEdges.map<EdgeLook>(({ source, target }) => {
      const highlighted = !!hovered && (source.id === hovered || target.id === hovered);
      // Hovering keeps the note's own links; searching keeps the links between matches.
      const kept = hovered
        ? highlighted
        : !searching || (matches.has(source.id) && matches.has(target.id));
      return { alpha: kept ? 1 : 0.25, highlighted };
    });
    renderer.current?.setLooks(nodeLooks, edgeLooks);
    renderer.current?.setRing(ringed ? renderNodes.findIndex((n) => n.sim.id === ringed) : -1);
  }, [
    renderNodes,
    renderEdges,
    hovered,
    ringed,
    neighbors,
    matches,
    searching,
    focusId,
    hubs,
    hasNotes,
  ]);

  useLayoutEffect(() => {
    const unfold = layout.mode === 'build' && simulation.nodes.length > 1 && !reducedMotion();
    building.current = layout.mode === 'build';
    settledFor.current = layout.mode === 'restore' ? structure : null;
    settling.current = layout.mode === 'update' ? layout.settling : [];
    // A new layout is framed as seeded, at full size, and then unfolds into that frame;
    // a known one keeps the camera it had.
    spread.current = 1;
    if (layout.mode === 'build' && !userMoved.current) fit();
    else applyCamera();
    spread.current = unfold ? UNFOLD_FROM : 1;
    unfoldStart.current = unfold ? performance.now() : null;
    renderer.current?.setEntering(unfold ? unfoldStart.current : null);
    paint();
    if (!simulation.settled || unfold) run();
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [layout, hasNotes]);

  useEffect(
    () => () => {
      savedLayouts.delete(layoutKey);
      savedLayouts.set(layoutKey, {
        positions: positions.current,
        camera: camera.current,
        userMoved: userMoved.current,
        settled: settledFor.current,
        settling: settling.current,
      });
      if (savedLayouts.size > MAX_SAVED_LAYOUTS)
        savedLayouts.delete(savedLayouts.keys().next().value!);
    },
    [layoutKey],
  );

  useEffect(() => {
    const key = JSON.stringify(localForces);
    if (key === appliedForces.current) return;
    appliedForces.current = key;
    simulation.setForces(localForces);
    simulation.reheat(0.5);
    run();
  }, [localForces, simulation, run]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    // Refit when the canvas changes size, not on the observer's first call, and not while a
    // new layout forms: it is framed once built.
    let size = `${element.clientWidth}x${element.clientHeight}`;
    const observer = new ResizeObserver(() => {
      const next = `${element.clientWidth}x${element.clientHeight}`;
      if (next === size) return;
      size = next;
      renderer.current?.resize(element.clientWidth, element.clientHeight, devicePixelRatio);
      if (!userMoved.current && !building.current) fit();
    });
    observer.observe(element);
    // Moving to a display of another density changes no size the observer sees.
    const onDensity = () =>
      renderer.current?.resize(element.clientWidth, element.clientHeight, devicePixelRatio);
    window.addEventListener('resize', onDensity);
    // Own wheel events across the canvas and its overlays: React's delegated wheel
    // listener is passive and cannot stop the page from scrolling.
    // A wheel zooms; two fingers on a trackpad pan, and a pinch zooms. A mouse wheel
    // reports whole notches, which is how one gesture is told from the other.
    const gesture = { last: 0, trackpad: false };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const notches = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
      const wheel =
        event.deltaMode !== 0 ||
        (event.deltaX === 0 && !!notches && Math.abs(notches) >= 120 && notches % 120 === 0);
      if (event.timeStamp - gesture.last > 250) gesture.trackpad = !wheel;
      else if (!wheel) gesture.trackpad = true;
      gesture.last = event.timeStamp;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const { x, y, k } = camera.current;
      setTipShown(false);
      if (gesture.trackpad && !event.ctrlKey && !event.metaKey) {
        if (!event.deltaX && !event.deltaY) return;
        camera.current = { k, x: x - event.deltaX * unit, y: y - event.deltaY * unit };
      } else {
        const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
        if (!delta) return;
        const bounds = element.getBoundingClientRect();
        const px = event.clientX - bounds.left;
        const py = event.clientY - bounds.top;
        // A pinch arrives as small steps, a wheel as large ones.
        const next = clampZoom(k * Math.exp(-delta * (gesture.trackpad ? 0.01 : 0.002)));
        camera.current = { k: next, x: px - ((px - x) * next) / k, y: py - ((py - y) * next) / k };
      }
      moved();
      applyCamera();
      repoint.current();
    };
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onDensity);
      element.removeEventListener('wheel', onWheel, true);
    };
  }, [fit, applyCamera, moved]);

  const zoomBy = (factor: number) => {
    const box = container.current!;
    const px = box.clientWidth / 2;
    const py = box.clientHeight / 2;
    const { x, y, k } = camera.current;
    const next = clampZoom(k * factor);
    camera.current = { k: next, x: px - ((px - x) * next) / k, y: py - ((py - y) * next) / k };
    moved();
    applyCamera(true);
  };
  const relayout = () => {
    positions.current.clear();
    userMoved.current = false;
    settledFor.current = null;
    setLayoutVersion((v) => v + 1);
  };
  const fitView = () => {
    userMoved.current = false;
    fit(true);
  };
  /**
   * Showing or hiding a kind of link changes what the layout is built from, so the graph
   * forms again from those links instead of easing the old shape toward the new one.
   */
  const switchLinkKinds = (next: GraphLinks) => {
    updateLinkKinds(next);
    relayout();
  };
  /** The layout point under the pointer, allowing for a layout that is still unfolding. */
  const worldPoint = (clientX: number, clientY: number) => {
    const bounds = container.current!.getBoundingClientRect();
    const { x, y, k } = camera.current;
    const s = spread.current;
    return { x: (clientX - bounds.left - x) / k / s, y: (clientY - bounds.top - y) / k / s };
  };

  /** The note drawn under the pointer, if any. */
  const noteAt = (clientX: number, clientY: number) => {
    const bounds = container.current!.getBoundingClientRect();
    const index = renderer.current?.pick(clientX - bounds.left, clientY - bounds.top) ?? -1;
    return index < 0 ? null : (renderNodes[index]?.sim.id ?? null);
  };
  const onHover = useCallback((id: string | null) => {
    if (!drag.current?.id) setHovered(id);
  }, []);
  const point = (id: string | null) => {
    if (id === pointedNow.current) return;
    pointedNow.current = id;
    setPointed(id);
    onHover(id);
  };
  // Notes move under a still pointer while a layout settles or the camera animates.
  repoint.current = () => {
    const at = lastPointer.current;
    if (at && !drag.current && !pinch.current) point(noteAt(at.x, at.y));
  };
  /** Keep the tooltip beside the pointer and inside the canvas. */
  const placeTip = () => {
    const element = tip.current;
    const at = lastPointer.current;
    const box = container.current;
    if (!element || !at || !box) return;
    const bounds = box.getBoundingClientRect();
    const x = Math.min(at.x - bounds.left + 14, bounds.width - element.offsetWidth - 8);
    const below = at.y - bounds.top + 18;
    const y =
      below + element.offsetHeight > bounds.height - 8
        ? at.y - bounds.top - element.offsetHeight - 10
        : below;
    element.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  };
  const onActivate = useCallback(
    (id: string, e: MouseEvent) => {
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onOpen(id);
      }
    },
    [onOpen],
  );
  /** Let go of a dragged note; the focus of a local graph stays where it was dropped. */
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    const node = d?.id && d.moved ? simulation.byId.get(d.id) : undefined;
    if (node) simulation.drop(node, node.id === focusId);
  };

  /** Where a note is on the canvas under the camera as set, not as still animating. */
  const screenOf = (id: string) => {
    const node = simulation.byId.get(id);
    if (!node) return null;
    const { x, y, k } = camera.current;
    return { x: node.x * spread.current * k + x, y: node.y * spread.current * k + y };
  };
  /** Bring a note the keyboard moved to into the part of the canvas no panel covers. */
  const reveal = (id: string) => {
    const at = screenOf(id);
    if (!at) return;
    const inset = insets();
    const edge = 56;
    const left = inset.left + edge;
    const right = inset.width - edge;
    const top = inset.top + edge;
    const bottom = inset.height - inset.bottom - edge;
    if (at.x >= left && at.x <= right && at.y >= top && at.y <= bottom) return;
    camera.current = {
      ...camera.current,
      x: camera.current.x + (left + right) / 2 - at.x,
      y: camera.current.y + (top + bottom) / 2 - at.y,
    };
    moved();
    applyCamera(true);
  };
  const onFocusNote = useCallback(
    (id: string, keyboard: boolean) => {
      setTabStopId(id);
      onHover(id);
      if (!keyboard) return;
      setRinged(id);
      reveal(id);
    },
    // `reveal` reads refs and the current simulation.
    [onHover, simulation, insets],
  );
  const onBlurNote = useCallback(() => {
    onHover(null);
    setRinged(null);
  }, [onHover]);
  /** Arrow keys move to the nearest note in that direction; Home goes to the central one. */
  const onLinksKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      const from = (e.target as HTMLElement).dataset?.note;
      const current = from ? simulation.byId.get(from) : undefined;
      if (!current || e.metaKey || e.ctrlKey || e.altKey) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      let target: string | undefined;
      if (e.key === 'Home') target = simulation.structure.hubs[0];
      else if (directions[e.key]) {
        const [dx, dy] = directions[e.key];
        let best = Infinity;
        for (const n of simulation.nodes) {
          if (n === current) continue;
          const along = (n.x - current.x) * dx + (n.y - current.y) * dy;
          const across = Math.abs((n.x - current.x) * dy - (n.y - current.y) * dx);
          // Within a wedge of the direction, nearer and straighter ahead wins.
          if (along <= 0 || across > along * 1.5) continue;
          const score = along + across * 2;
          if (score < best) {
            best = score;
            target = n.id;
          }
        }
      } else return;
      e.preventDefault();
      if (target)
        e.currentTarget
          .querySelector<HTMLElement>(`a[data-note="${CSS.escape(target)}"]`)
          ?.focus({ preventScroll: true });
    },
    [simulation],
  );

  // Searching frames the matches; clearing the search returns to the view before it.
  const matchKey = searching ? [...matches].sort().join(',') : null;
  const searched = useRef(false);
  useEffect(() => {
    const had = framed.current;
    framed.current = searching && matches.size ? matches : null;
    // Nothing to do on mount, or while a new layout is still being framed.
    if (!searched.current) {
      searched.current = true;
      if (!framed.current) return;
    }
    if (building.current) return;
    if (framed.current) {
      if (!had) beforeSearch.current = { ...camera.current };
      fit(true);
    } else if (had && beforeSearch.current && userMoved.current) {
      camera.current = beforeSearch.current;
      applyCamera(true);
    } else if (had) fit(true);
    if (!framed.current) beforeSearch.current = null;
  }, [matchKey]);

  useEffect(() => {
    setTipShown(false);
    if (!pointed) return;
    const timer = setTimeout(() => setTipShown(true), TOOLTIP_MS);
    return () => clearTimeout(timer);
  }, [pointed]);
  useLayoutEffect(() => {
    if (tipShown) placeTip();
  }, [tipShown]);

  const hubDocs = simulation.structure.hubs
    .map((id) => visible.find((d) => d.id === id))
    .filter((d): d is WikiDocument => !!d);
  const pointedDoc = pointed ? visible.find((d) => d.id === pointed) : undefined;
  const pointedDegree = pointed ? (degrees.get(pointed) ?? 0) : 0;
  const tabStop =
    tabStopId && simulation.byId.has(tabStopId)
      ? tabStopId
      : (focusId ?? simulation.structure.hubs[0] ?? visible[0]?.id);
  const colorOf = (doc: WikiDocument) => graphColor(Math.max(0, categories.indexOf(doc.category)));

  /** Two fingers: the point between them stays under them as they spread or close. */
  const pinchState = () => {
    const [a, b] = [...touches.current.values()];
    const bounds = container.current!.getBoundingClientRect();
    return {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      x: (a.x + b.x) / 2 - bounds.left,
      y: (a.y + b.y) / 2 - bounds.top,
    };
  };

  const surface = (
    <div
      className={`graph-surface ${pointedDoc ? 'over-note' : ''}`}
      role="group"
      aria-label={focusId ? 'Local graph of this note' : 'Wiki graph'}
      aria-description="Tab to a note, then use the arrow keys to move between notes and Enter to open one."
      onContextMenuCapture={(e) => {
        if (e.target instanceof HTMLCanvasElement) {
          // The menu is for the note under the pointer, or for the graph itself.
          const id = noteAt(e.clientX, e.clientY);
          lastPointer.current = { x: e.clientX, y: e.clientY };
          point(id);
          setMenuDoc((id && visible.find((d) => d.id === id)) || null);
          setTipShown(false);
          return;
        }
        // From the keyboard the event comes from a note's link, which has no place on
        // screen: open the menu at the note instead.
        const id = (e.target as HTMLElement).dataset?.note;
        const at = id ? screenOf(id) : null;
        if (!at) return;
        e.preventDefault();
        e.stopPropagation();
        const bounds = container.current!.getBoundingClientRect();
        textCanvas.current?.dispatchEvent(
          new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: bounds.left + at.x,
            clientY: bounds.top + at.y,
          }),
        );
      }}
      onPointerDown={(e) => {
        // Events from the note links and from menus portaled out of here are not the canvas's.
        if (e.button !== 0 || !(e.target instanceof HTMLCanvasElement)) return;
        setTipShown(false);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (e.pointerType === 'touch') {
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (touches.current.size === 2) {
            // A second finger turns the pan or note drag into a pinch.
            endDrag();
            pressed.current = null;
            pinch.current = { ...pinchState(), camera: camera.current };
            return;
          }
        }
        drag.current = {
          id: noteAt(e.clientX, e.clientY) ?? undefined,
          pointerX: e.clientX,
          pointerY: e.clientY,
          camera: camera.current,
          moved: false,
        };
        pressed.current = null;
      }}
      onPointerMove={(e) => {
        if (touches.current.has(e.pointerId))
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const p = pinch.current;
        if (p) {
          if (touches.current.size < 2) return;
          const now = pinchState();
          const k = clampZoom((p.camera.k * now.distance) / p.distance);
          camera.current = {
            k,
            x: now.x - ((p.x - p.camera.x) * k) / p.camera.k,
            y: now.y - ((p.y - p.camera.y) * k) / p.camera.k,
          };
          moved();
          applyCamera();
          return;
        }
        const d = drag.current;
        if (!d) {
          if (e.target instanceof HTMLCanvasElement && e.pointerType !== 'touch') {
            lastPointer.current = { x: e.clientX, y: e.clientY };
            point(noteAt(e.clientX, e.clientY));
            placeTip();
          }
          return;
        }
        const dx = e.clientX - d.pointerX;
        const dy = e.clientY - d.pointerY;
        if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) {
          d.moved = true;
          // Arranging notes makes the view the user's: no automatic framing after it.
          if (d.id) {
            moved();
            finishBuild();
          }
        }
        if (!d.moved) return;
        if (d.id) {
          const node = simulation.byId.get(d.id);
          if (node) {
            const at = worldPoint(e.clientX, e.clientY);
            simulation.grab(node, at.x, at.y);
            run();
          }
        } else {
          moved();
          camera.current = { ...d.camera, x: d.camera.x + dx, y: d.camera.y + dy };
          applyCamera();
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        endDrag();
        touches.current.delete(e.pointerId);
        pinch.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
        // A press and release on a note opens it; a dragged note or a pan opens nothing.
        pressed.current = d?.id && !d.moved ? d.id : null;
        if (e.pointerType !== 'touch' && e.target instanceof Element) {
          lastPointer.current = { x: e.clientX, y: e.clientY };
          repoint.current();
        }
      }}
      onPointerCancel={(e) => {
        endDrag();
        touches.current.delete(e.pointerId);
        pinch.current = null;
        pressed.current = null;
      }}
      onPointerLeave={() => {
        lastPointer.current = null;
        if (!drag.current) point(null);
      }}
      onClick={() => {
        const id = pressed.current;
        pressed.current = null;
        if (id) onOpen(id);
      }}
    >
      <canvas ref={glCanvas} aria-hidden="true" />
      <canvas ref={textCanvas} aria-hidden="true" />
      <GraphLinks
        documents={visible}
        degrees={degrees}
        tabStop={tabStop}
        onFocusNote={onFocusNote}
        onBlurNote={onBlurNote}
        onActivate={onActivate}
        onKeyDown={onLinksKeyDown}
      />
    </div>
  );
  const graphMenu = [
    { label: 'Fit to view', icon: Focus, run: fitView },
    { label: 'Zoom in', icon: Plus, run: () => zoomBy(1.25) },
    { label: 'Zoom out', icon: Minus, run: () => zoomBy(1 / 1.25) },
    { label: 'Re-layout', icon: RotateCcw, run: relayout },
    ...linkKindLabels.map((item) => ({
      label: `${linkKinds[item.key] ? 'Hide' : 'Show'} ${item.label.toLowerCase()}`,
      icon: item.key === 'word' ? WholeWord : Link2,
      run: () => switchLinkKinds({ ...linkKinds, [item.key]: !linkKinds[item.key] }),
    })),
    {
      label: panel ? 'Hide forces' : 'Adjust forces…',
      icon: SlidersHorizontal,
      run: () => setPanel(!panel),
    },
  ];

  return (
    <div className={`graph-canvas ${className}`} ref={container} data-renderer={mode}>
      <ContextMenu.Root modal={false}>
        <ContextMenu.Trigger asChild onContextMenu={(e) => e.stopPropagation()}>
          {surface}
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="document-menu"
            collisionPadding={10}
            aria-label={menuDoc ? `Actions for ${menuDoc.title}` : 'Graph actions'}
            // Portals still bubble React events through the graph's canvas ancestors.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {menuDoc ? (
              <DocumentContextItems doc={menuDoc} />
            ) : (
              graphMenu.map((item) => (
                <ContextMenu.Item
                  key={item.label}
                  className="document-menu-item"
                  onSelect={item.run}
                >
                  <item.icon size={15} />
                  <span>{item.label}</span>
                </ContextMenu.Item>
              ))
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {/* Keeps what sits above the graph, such as the home search, readable over it. */}
      {insetTop > 0 && <div className="graph-scrim" style={{ height: insetTop + 36 }} />}
      {!visible.length && <div className="graph-empty">Create a note to start your graph.</div>}
      {tipShown && pointedDoc && (
        <div className="graph-tooltip" ref={tip} aria-hidden="true">
          <strong>{leaf(pointedDoc.title)}</strong>
          <span>
            <b style={{ color: colorOf(pointedDoc) }} />
            {pointedDoc.category} · {pointedDegree} connection{pointedDegree === 1 ? '' : 's'}
          </span>
          <small>Click to open · right-click for more</small>
        </div>
      )}
      {searching && (
        <div className="graph-matches" style={{ top: insetTop + 12 }} role="status">
          {matches.size ? `${matches.size} of ${visible.length} notes match` : 'No notes match'}
        </div>
      )}
      <CentralNotes
        notes={hubDocs}
        colorOf={colorOf}
        top={insetTop + 12}
        onHover={setHovered}
        onOpen={onOpen}
      />
      <GraphLegend categories={categories}>
        {documents.length > 0 && <LinkKindToggles kinds={linkKinds} onChange={switchLinkKinds} />}
      </GraphLegend>
      <div className="graph-controls">
        {mode === 'canvas' && (
          <span
            className="graph-fallback"
            role="img"
            aria-label="Drawn without WebGL"
            title="WebGL is unavailable, so the graph is drawn on the CPU and may be slower. Check Settings → Window → Hardware acceleration."
          >
            <TriangleAlert size={14} />
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / 1.25)}
        >
          <Minus />
        </Button>
        <span aria-live="polite">
          {zoom < 0.095 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          <Plus />
        </Button>
        <span className="graph-controls-divider" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Fit graph to view"
          title="Fit to view"
          onClick={fitView}
        >
          <Focus />
        </Button>
        <Button
          variant={panel ? 'soft' : 'ghost'}
          size="icon-sm"
          aria-label="Graph forces"
          aria-expanded={panel}
          title="Forces"
          onClick={() => setPanel(!panel)}
        >
          <SlidersHorizontal />
        </Button>
      </div>
      {panel && (
        <ForcesPanel
          forces={localForces}
          onChange={updateForces}
          onClose={() => setPanel(false)}
          onRelayout={relayout}
        >
          <p className="graph-renderer">
            {mode === 'webgl'
              ? 'Drawn with WebGL on the GPU.'
              : 'Drawn on a 2D canvas: WebGL is unavailable.'}
          </p>
        </ForcesPanel>
      )}
      {hint && (
        <div className="graph-hint">
          Drag to pan · scroll or pinch to zoom · drag a note to arrange
        </div>
      )}
    </div>
  );
}
