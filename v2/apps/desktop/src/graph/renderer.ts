import type { SimNode } from './simulation';

/**
 * Draws the graph on two stacked canvases: notes and links as instanced WebGL quads,
 * labels as 2D canvas text above them. Where WebGL 2 is unavailable (hardware
 * acceleration off, a blocked driver, a lost context) the 2D canvas draws everything.
 * Positions are read from the simulation's nodes each frame; nothing here owns layout.
 */

export type Camera = { x: number; y: number; k: number };
export const LABEL_ZOOM = 0.55;
const CAMERA_MS = 350;
/** Time constant of the dim, halo, and label fades, in milliseconds. */
const FADE_MS = 50;
const HALO_PAD = 6;
/** Links thin out when there are more than this many and the view is zoomed out. */
const DENSE_EDGES = 160;
/** How far a quiet link's color is from the background, from 0 (invisible) to 1. */
const EDGE_QUIET = 0.34;
const LABEL_CELL = 96;
const DASH = 4;

export interface RenderNode {
  sim: SimNode;
  label: string;
  color: number;
  /** On screen a note never shrinks below this radius, in CSS pixels. */
  minRadius: number;
  /** Delay before the note appears while a new layout is built, in milliseconds. */
  enter: number;
}
export interface RenderEdge {
  key: string;
  source: SimNode;
  target: SimNode;
  dashed: boolean;
  enter: number;
}
export interface NodeLook {
  alpha: number;
  halo: number;
  /** Bold label in the foreground color. */
  active: boolean;
  /** The one note under the pointer or holding focus: its label is never dropped. */
  top: boolean;
  /** The focus of a local graph: a foreground outline. */
  focused: boolean;
  /** Keeps its label, at a readable size, when zoomed out. */
  pinned: boolean;
}
export interface EdgeLook {
  alpha: number;
  highlighted: boolean;
}

type RGB = [number, number, number];
interface Theme {
  palette: string[];
  edge: string;
  panel: string;
  foreground: string;
  primary: string;
  text: string;
  font: string;
  rgb: { palette: RGB[]; edge: RGB; panel: RGB; foreground: RGB; primary: RGB };
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** Opacity of something that appears `delay` ms into a build, `elapsed` ms after it began. */
const enterOpacity = (elapsed: number, delay: number, duration: number) =>
  easeOut(clamp01((elapsed - delay) / duration));
/** A note's dot grows slightly past its size and settles back. */
function enterGrow(elapsed: number, delay: number) {
  const t = clamp01((elapsed - delay) / 500) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
}

const SHARED_GLSL = `
uniform vec2 uSize;
uniform vec2 uCam;
uniform vec2 uScale;
uniform float uEnter;
float easeOut(float t) { return 1.0 - (1.0 - t) * (1.0 - t); }
float enterOpacity(float delay, float duration) {
  return easeOut(clamp((uEnter - delay) / duration, 0.0, 1.0));
}
vec4 clip(vec2 screen) {
  vec2 p = screen / uSize * 2.0 - 1.0;
  return vec4(p.x, -p.y, 0.0, 1.0);
}`;

const NODE_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPos;
layout(location = 2) in vec2 iRadius;
layout(location = 3) in vec3 iColor;
layout(location = 4) in vec4 iLook;
uniform float uHalo;
${SHARED_GLSL}
out vec2 vLocal;
out vec3 vColor;
out float vAlpha;
out float vRadius;
out float vStroke;
out float vFocused;
void main() {
  vec2 center = iPos * uScale.x + uCam;
  float opacity = iLook.x * enterOpacity(iLook.w, 420.0);
  float outer;
  if (uHalo > 0.5) {
    vRadius = (iRadius.x + ${HALO_PAD.toFixed(1)}) * uScale.y;
    vStroke = 0.0;
    vAlpha = opacity * iLook.y;
    outer = vRadius;
  } else {
    float t = clamp((uEnter - iLook.w) / 500.0, 0.0, 1.0) - 1.0;
    float grow = 1.0 + 2.70158 * t * t * t + 1.70158 * t * t;
    vRadius = max(iRadius.x * uScale.y, iRadius.y) * grow;
    vStroke = (iLook.z > 0.5 ? 2.2 : 1.5) * uScale.y;
    vAlpha = opacity;
    outer = vRadius + vStroke * 0.5;
  }
  vFocused = iLook.z;
  vColor = iColor;
  vLocal = (aCorner * 2.0 - 1.0) * (outer + 1.0);
  gl_Position = vAlpha > 0.001 ? clip(center + vLocal) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const NODE_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec3 vColor;
in float vAlpha;
in float vRadius;
in float vStroke;
in float vFocused;
uniform float uHalo;
uniform float uPixel;
uniform vec3 uPanel;
uniform vec3 uForeground;
out vec4 color;
void main() {
  float d = length(vLocal);
  float h = uPixel * 0.5;
  float outer = vRadius + vStroke * 0.5;
  float inner = vRadius - vStroke * 0.5;
  float cover = 1.0 - smoothstep(outer - h, outer + h, d);
  float fill = uHalo > 0.5 ? 1.0 : 1.0 - smoothstep(inner - h, inner + h, d);
  vec3 stroke = vFocused > 0.5 ? uForeground : uPanel;
  float a = cover * vAlpha;
  color = vec4(mix(stroke, vColor, fill) * a, a);
}`;

const EDGE_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iA;
layout(location = 2) in vec2 iB;
layout(location = 3) in vec4 iLook;
${SHARED_GLSL}
out float vAcross;
out float vAlong;
out float vHalf;
out float vAlpha;
out float vHighlighted;
out float vDashed;
void main() {
  vec2 a = iA * uScale.x + uCam;
  vec2 b = iB * uScale.x + uCam;
  vec2 along = b - a;
  float len = max(length(along), 0.0001);
  vec2 dir = along / len;
  vec2 normal = vec2(-dir.y, dir.x);
  vHalf = (iLook.y > 0.5 ? 1.8 : 1.1) * 0.5;
  float reach = vHalf + 1.0;
  vAcross = (aCorner.y * 2.0 - 1.0) * reach;
  vAlong = aCorner.x * len;
  vAlpha = iLook.x * enterOpacity(iLook.w, 500.0);
  vHighlighted = iLook.y;
  vDashed = iLook.z;
  gl_Position = vAlpha > 0.001 ? clip(a + dir * vAlong + normal * vAcross) : vec4(2.0, 2.0, 2.0, 1.0);
}`;

const EDGE_FS = `#version 300 es
precision highp float;
in float vAcross;
in float vAlong;
in float vHalf;
in float vAlpha;
in float vHighlighted;
in float vDashed;
uniform float uPixel;
uniform vec3 uEdge;
uniform vec3 uPrimary;
out vec4 color;
void main() {
  float h = uPixel * 0.5;
  float cover = 1.0 - smoothstep(vHalf - h, vHalf + h, abs(vAcross));
  if (vDashed > 0.5) {
    float phase = mod(vAlong, ${(DASH * 2).toFixed(1)});
    cover *= smoothstep(0.0, uPixel, phase) * (1.0 - smoothstep(${DASH.toFixed(1)} - uPixel, ${DASH.toFixed(1)}, phase));
  }
  float a = cover * vAlpha;
  color = vec4(mix(uEdge, uPrimary, vHighlighted) * a, a);
}`;

const NODE_STRIDE = 11;
const EDGE_STRIDE = 8;

interface Program {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  uniforms: Record<string, WebGLUniformLocation | null>;
  capacity: number;
}

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed to compile');
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program failed to link');
  return program;
}

/** One quad per instance; `layout` lists the float count of each per-instance attribute. */
function createProgram(
  gl: WebGL2RenderingContext,
  corners: WebGLBuffer,
  vertex: string,
  fragment: string,
  layout: number[],
  uniformNames: string[],
): Program {
  const program = compile(gl, vertex, fragment);
  const vao = gl.createVertexArray()!;
  const buffer = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = layout.reduce((sum, size) => sum + size, 0) * 4;
  let offset = 0;
  layout.forEach((size, i) => {
    gl.enableVertexAttribArray(i + 1);
    gl.vertexAttribPointer(i + 1, size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(i + 1, 1);
    offset += size * 4;
  });
  gl.bindVertexArray(null);
  const uniforms: Program['uniforms'] = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, vao, buffer, uniforms, capacity: 0 };
}

export class GraphRenderer {
  /** `webgl` when notes and links are drawn on the GPU, `canvas` on the 2D fallback. */
  mode: 'webgl' | 'canvas' = 'canvas';
  onModeChange?: (mode: 'webgl' | 'canvas') => void;

  private gl: WebGL2RenderingContext | null = null;
  private nodeProgram: Program | null = null;
  private edgeProgram: Program | null = null;
  private corners: WebGLBuffer | null = null;
  private ctx: CanvasRenderingContext2D;
  private theme: Theme | null = null;
  private colors: string[] = ['#888'];
  /** Called after a frame in which the camera moved on its own, as when it animates. */
  onCameraFrame?: () => void;
  private width = 1;
  private height = 1;
  private dpr = 1;

  private nodes: RenderNode[] = [];
  private edges: RenderEdge[] = [];
  private nodeLooks: NodeLook[] = [];
  private edgeLooks: EdgeLook[] = [];
  /** Drawn values, which follow the looks: per note alpha, halo, label; per link alpha. */
  private nodeAlpha = new Float32Array(0);
  private nodeHalo = new Float32Array(0);
  private nodeLabel = new Float32Array(0);
  private edgeAlpha = new Float32Array(0);
  /** Label widths at the base size, the notes by importance, and the labels that fit. */
  private labelWidth = new Float32Array(0);
  private order: number[] = [];
  private labelShown = new Uint8Array(0);
  private labelCells = new Map<number, number[]>();
  private labelRects: number[] = [];
  private ring = -1;
  /** Zoomed far out, notes shrink below their usual smallest size so they stay apart. */
  private minScale = 1;
  private edgeFade = 1;
  private nodeData = new Float32Array(0);
  private edgeData = new Float32Array(0);

  private camera: Camera = { x: 0, y: 0, k: 1 };
  private tween: { from: Camera; to: Camera; start: number } | null = null;
  private spread = 1;
  private enterStart: number | null = null;
  private frame: number | null = null;
  private lastFrame = 0;
  private destroyed = false;

  constructor(
    private glCanvas: HTMLCanvasElement,
    private textCanvas: HTMLCanvasElement,
  ) {
    this.ctx = textCanvas.getContext('2d')!;
    glCanvas.addEventListener('webglcontextlost', this.onContextLost);
    glCanvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.initGL();
  }

  private onContextLost = (event: Event) => {
    // Allow the context to come back; the 2D canvas draws the graph until it does.
    event.preventDefault();
    this.releaseGL();
    this.setMode('canvas');
    this.invalidate();
  };
  private onContextRestored = () => {
    this.initGL();
    this.invalidate();
  };

  private setMode(mode: 'webgl' | 'canvas') {
    if (this.mode === mode) return;
    this.mode = mode;
    this.glCanvas.style.visibility = mode === 'webgl' ? '' : 'hidden';
    this.onModeChange?.(mode);
  }

  private initGL() {
    if (this.destroyed) return;
    try {
      const gl = this.glCanvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
      });
      if (!gl || gl.isContextLost()) throw new Error('WebGL 2 is unavailable');
      const corners = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, corners);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const shared = ['uSize', 'uCam', 'uScale', 'uEnter', 'uPixel'];
      this.edgeProgram = createProgram(
        gl,
        corners,
        EDGE_VS,
        EDGE_FS,
        [2, 2, 4],
        [...shared, 'uEdge', 'uPrimary'],
      );
      this.nodeProgram = createProgram(
        gl,
        corners,
        NODE_VS,
        NODE_FS,
        [2, 2, 3, 4],
        [...shared, 'uHalo', 'uPanel', 'uForeground'],
      );
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.gl = gl;
      this.corners = corners;
      this.setMode('webgl');
    } catch (error) {
      console.warn('Graph: drawing without WebGL.', error);
      this.releaseGL();
      this.setMode('canvas');
    }
  }

  private releaseGL() {
    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      for (const p of [this.nodeProgram, this.edgeProgram]) {
        if (!p) continue;
        gl.deleteProgram(p.program);
        gl.deleteVertexArray(p.vao);
        gl.deleteBuffer(p.buffer);
      }
      gl.deleteBuffer(this.corners);
    }
    this.gl = null;
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.corners = null;
  }

  destroy() {
    this.destroyed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.glCanvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.glCanvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    // The context itself stays with the canvas: a remount on the same element reuses it.
    this.releaseGL();
  }

  /** Read the colors and font the graph is drawn in from the canvas's styles. */
  readTheme() {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    this.textCanvas.parentElement?.append(probe);
    const scratch = document.createElement('canvas').getContext('2d', {
      willReadFrequently: true,
    })!;
    const resolve = (variable: string): { css: string; rgb: RGB } => {
      if (variable) probe.style.color = `var(${variable})`;
      const css = getComputedStyle(probe).color || '#888';
      scratch.clearRect(0, 0, 1, 1);
      scratch.fillStyle = css;
      scratch.fillRect(0, 0, 1, 1);
      const [r, g, b] = scratch.getImageData(0, 0, 1, 1).data;
      return { css, rgb: [r / 255, g / 255, b / 255] };
    };
    const palette = this.colors.map((color) => {
      probe.style.color = color;
      return resolve('');
    });
    const edge = resolve('--graph-edge');
    const panel = resolve('--panel');
    const foreground = resolve('--foreground');
    const primary = resolve('--primary');
    const text = resolve('--body-text');
    const font = getComputedStyle(this.textCanvas).fontFamily || 'sans-serif';
    probe.remove();
    this.theme = {
      palette: palette.map((c) => c.css),
      edge: edge.css,
      panel: panel.css,
      foreground: foreground.css,
      primary: primary.css,
      text: text.css,
      font,
      rgb: {
        palette: palette.map((c) => c.rgb),
        edge: edge.rgb,
        panel: panel.rgb,
        foreground: foreground.rgb,
        primary: primary.rgb,
      },
    };
    this.measureLabels();
    this.invalidate();
  }

  /** The color of each collection, as CSS colors; notes refer to them by index. */
  setColors(colors: string[]) {
    if (colors.join('|') === this.colors.join('|')) return;
    this.colors = colors.length ? colors : ['#888'];
    if (this.theme) this.readTheme();
  }

  private measureLabels() {
    this.labelWidth = new Float32Array(this.nodes.length);
    if (!this.theme) return;
    this.ctx.font = `500 11px ${this.theme.font}`;
    for (let i = 0; i < this.nodes.length; i++)
      this.labelWidth[i] = this.ctx.measureText(this.nodes[i].label).width;
  }

  /** A ring around one note, by index, for keyboard focus; -1 for none. */
  setRing(index: number) {
    if (this.ring === index) return;
    this.ring = index;
    this.invalidate();
  }

  /** Where a note is drawn on the canvas, and how large. */
  screenOf(index: number) {
    const n = this.nodes[index];
    if (!n) return null;
    const { x, y, k } = this.camera;
    const scale = k * this.spread;
    return {
      x: n.sim.x * scale + x,
      y: n.sim.y * scale + y,
      radius: Math.max(n.sim.radius * k, n.minRadius * this.minScale),
    };
  }

  resize(width: number, height: number, dpr: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.max(1, dpr);
    for (const canvas of [this.glCanvas, this.textCanvas]) {
      const w = Math.round(this.width * this.dpr);
      const h = Math.round(this.height * this.dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    // Resizing clears a canvas, so draw before the browser presents the empty one.
    this.draw(performance.now());
  }

  /** Replace the notes and links drawn, keeping the fades of those already shown. */
  setGraph(nodes: RenderNode[], edges: RenderEdge[]) {
    const previousNodes = new Map(this.nodes.map((n, i) => [n.sim.id, i]));
    const previousEdges = new Map(this.edges.map((e, i) => [e.key, i]));
    const { nodeAlpha, nodeHalo, nodeLabel, edgeAlpha } = this;
    this.nodeAlpha = new Float32Array(nodes.length).fill(-1);
    this.nodeHalo = new Float32Array(nodes.length);
    this.nodeLabel = new Float32Array(nodes.length);
    this.edgeAlpha = new Float32Array(edges.length).fill(-1);
    nodes.forEach((n, i) => {
      const old = previousNodes.get(n.sim.id);
      // A note not drawn before (-1) takes its look at once instead of fading to it.
      if (old === undefined) return;
      this.nodeAlpha[i] = nodeAlpha[old];
      this.nodeHalo[i] = nodeHalo[old];
      this.nodeLabel[i] = nodeLabel[old];
    });
    edges.forEach((e, i) => {
      const old = previousEdges.get(e.key);
      if (old !== undefined) this.edgeAlpha[i] = edgeAlpha[old];
    });
    this.nodes = nodes;
    this.edges = edges;
    this.labelShown = new Uint8Array(nodes.length);
    // Labels are placed busiest note first, so the same ones win as the view moves.
    this.order = nodes.map((_, i) => i).sort((a, b) => nodes[b].sim.degree - nodes[a].sim.degree);
    this.ring = -1;
    this.measureLabels();
    this.nodeLooks = [];
    this.edgeLooks = [];
    if (this.nodeData.length < nodes.length * NODE_STRIDE)
      this.nodeData = new Float32Array(Math.ceil(nodes.length * 1.5) * NODE_STRIDE);
    if (this.edgeData.length < edges.length * EDGE_STRIDE)
      this.edgeData = new Float32Array(Math.ceil(edges.length * 1.5) * EDGE_STRIDE);
    this.invalidate();
  }

  /** How each note and link should look, in the order given to `setGraph`. */
  setLooks(nodes: NodeLook[], edges: EdgeLook[]) {
    this.nodeLooks = nodes;
    this.edgeLooks = edges;
    this.invalidate();
  }

  setCamera(camera: Camera, animate = false) {
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.tween = { from: { ...this.camera }, to: { ...camera }, start: performance.now() };
    } else {
      this.tween = null;
      this.camera = { ...camera };
    }
    this.invalidate();
  }

  /** Drawn size of the layout relative to its positions, while a new one unfolds. */
  setSpread(spread: number) {
    this.spread = spread;
    this.invalidate();
  }

  /** When the build of a new layout began, while its notes are still appearing. */
  setEntering(start: number | null) {
    this.enterStart = start;
    this.invalidate();
  }

  invalidate() {
    if (this.frame !== null || this.destroyed) return;
    this.frame = requestAnimationFrame((now) => {
      this.frame = null;
      if (this.draw(now)) this.invalidate();
    });
  }

  /** The note drawn under a point of the canvas, as an index into the graph, or -1. */
  pick(px: number, py: number) {
    const { x, y, k } = this.camera;
    const scale = k * this.spread;
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const distance = Math.hypot(n.sim.x * scale + x - px, n.sim.y * scale + y - py);
      const reach = Math.max(n.sim.radius * k, n.minRadius, (n.sim.radius + HALO_PAD) * k, 8);
      if (distance <= reach && distance < bestDistance) {
        best = i;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Advance the fades and the camera, then draw. Returns whether more frames follow. */
  private draw(now: number) {
    if (this.destroyed) return false;
    const dt = Math.min(100, Math.max(0, now - this.lastFrame));
    this.lastFrame = now;
    let animating = false;

    if (this.tween) {
      const { from, to, start } = this.tween;
      const t = clamp01((now - start) / CAMERA_MS);
      // CSS `ease`, near enough: quick to start, slow to finish.
      const e = 1 - Math.pow(1 - t, 3);
      // Zoom is interpolated in log space, so zooming in and out feel alike.
      const k = from.k * Math.pow(to.k / from.k, e);
      this.camera = { k, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      if (t === 1) this.tween = null;
      else animating = true;
    }

    const cameraMoved = animating;
    const labelsHidden = this.camera.k < LABEL_ZOOM;
    const zoom = this.camera.k;
    this.minScale = Math.max(0.4, Math.min(1, 0.4 + zoom * 2.4));
    // Many links zoomed out would read as one bright web. They are drawn in a color
    // close to the background instead, opaque so that crossings do not add up, and take
    // their full color as the view closes in on them.
    const floor = Math.max(EDGE_QUIET, Math.min(1, DENSE_EDGES / Math.max(1, this.edges.length)));
    this.edgeFade = floor + (1 - floor) * clamp01((zoom - 0.2) / 0.6);
    if (this.nodeLooks.length === this.nodes.length) this.placeLabels(labelsHidden);
    const step = 1 - Math.exp(-dt / FADE_MS);
    const approach = (values: Float32Array, i: number, target: number) => {
      const current = values[i];
      if (current === target) return;
      if (current < 0 || Math.abs(target - current) < 0.01) values[i] = target;
      else {
        values[i] = current + (target - current) * step;
        animating = true;
      }
    };
    for (let i = 0; i < this.nodes.length; i++) {
      const look = this.nodeLooks[i];
      if (!look) continue;
      // A note not drawn before takes its look at once.
      if (this.nodeAlpha[i] < 0) {
        this.nodeHalo[i] = look.halo;
        this.nodeLabel[i] = this.labelShown[i];
      }
      approach(this.nodeAlpha, i, look.alpha);
      approach(this.nodeHalo, i, look.halo);
      approach(this.nodeLabel, i, this.labelShown[i]);
    }
    for (let i = 0; i < this.edges.length; i++) {
      const look = this.edgeLooks[i];
      if (look) approach(this.edgeAlpha, i, look.alpha);
    }

    const elapsed = this.enterStart === null ? 1e9 : now - this.enterStart;
    if (this.enterStart !== null) animating = true;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.theme && this.nodeLooks.length === this.nodes.length) {
      if (this.gl && this.mode === 'webgl') this.drawGL(elapsed);
      else this.drawShapes2D(elapsed);
      this.drawLabels(elapsed, labelsHidden);
    }
    if (cameraMoved) this.onCameraFrame?.();
    return animating;
  }

  private drawGL(elapsed: number) {
    const gl = this.gl!;
    const theme = this.theme!;
    const { x, y, k } = this.camera;
    gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const upload = (p: Program, data: Float32Array, floats: number) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, p.buffer);
      if (p.capacity < data.length) {
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        p.capacity = data.length;
      } else gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, floats);
    };
    const begin = (p: Program) => {
      gl.useProgram(p.program);
      gl.bindVertexArray(p.vao);
      gl.uniform2f(p.uniforms.uSize, this.width, this.height);
      gl.uniform2f(p.uniforms.uCam, x, y);
      gl.uniform2f(p.uniforms.uScale, k * this.spread, k);
      gl.uniform1f(p.uniforms.uEnter, elapsed);
      gl.uniform1f(p.uniforms.uPixel, 1 / this.dpr);
    };

    const edges = this.edgeProgram!;
    const edgeData = this.edgeData;
    for (let i = 0, o = 0; i < this.edges.length; i++, o += EDGE_STRIDE) {
      const e = this.edges[i];
      edgeData[o] = e.source.x;
      edgeData[o + 1] = e.source.y;
      edgeData[o + 2] = e.target.x;
      edgeData[o + 3] = e.target.y;
      const highlighted = this.edgeLooks[i]?.highlighted;
      edgeData[o + 4] = Math.max(0, this.edgeAlpha[i]);
      edgeData[o + 5] = highlighted ? 1 : 0;
      edgeData[o + 6] = e.dashed ? 1 : 0;
      edgeData[o + 7] = e.enter;
    }
    if (this.edges.length) {
      begin(edges);
      upload(edges, edgeData, this.edges.length * EDGE_STRIDE);
      gl.uniform3fv(edges.uniforms.uEdge, this.quietEdge());
      gl.uniform3fv(edges.uniforms.uPrimary, theme.rgb.primary);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.edges.length);
    }

    const nodes = this.nodeProgram!;
    const nodeData = this.nodeData;
    let halos = false;
    for (let i = 0, o = 0; i < this.nodes.length; i++, o += NODE_STRIDE) {
      const n = this.nodes[i];
      const color = theme.rgb.palette[n.color % theme.rgb.palette.length];
      nodeData[o] = n.sim.x;
      nodeData[o + 1] = n.sim.y;
      nodeData[o + 2] = n.sim.radius;
      nodeData[o + 3] = n.minRadius * this.minScale;
      nodeData[o + 4] = color[0];
      nodeData[o + 5] = color[1];
      nodeData[o + 6] = color[2];
      nodeData[o + 7] = Math.max(0, this.nodeAlpha[i]);
      nodeData[o + 8] = this.nodeHalo[i];
      nodeData[o + 9] = this.nodeLooks[i].focused ? 1 : 0;
      nodeData[o + 10] = n.enter;
      if (this.nodeHalo[i] > 0.001) halos = true;
    }
    if (this.nodes.length) {
      begin(nodes);
      upload(nodes, nodeData, this.nodes.length * NODE_STRIDE);
      gl.uniform3fv(nodes.uniforms.uPanel, theme.rgb.panel);
      gl.uniform3fv(nodes.uniforms.uForeground, theme.rgb.foreground);
      if (halos) {
        gl.uniform1f(nodes.uniforms.uHalo, 1);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodes.length);
      }
      gl.uniform1f(nodes.uniforms.uHalo, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodes.length);
    }
    gl.bindVertexArray(null);
  }

  /** The link color for the current zoom: the theme's, mixed toward the background. */
  private quietEdge(): RGB {
    const { edge, panel } = this.theme!.rgb;
    const t = this.edgeFade;
    return [0, 1, 2].map((i) => panel[i] + (edge[i] - panel[i]) * t) as RGB;
  }

  /** The fallback: the same picture drawn with 2D paths. */
  private drawShapes2D(elapsed: number) {
    const ctx = this.ctx;
    const theme = this.theme!;
    const { x, y, k } = this.camera;
    const scale = k * this.spread;
    const margin = 40;
    const outside = (px: number, py: number, reach: number) =>
      px < -reach || py < -reach || px > this.width + reach || py > this.height + reach;
    const quiet = `rgb(${this.quietEdge()
      .map((c) => Math.round(c * 255))
      .join(' ')})`;

    for (let i = 0; i < this.edges.length; i++) {
      const e = this.edges[i];
      const alpha = Math.max(0, this.edgeAlpha[i]) * enterOpacity(elapsed, e.enter, 500);
      if (alpha < 0.004) continue;
      const ax = e.source.x * scale + x;
      const ay = e.source.y * scale + y;
      const bx = e.target.x * scale + x;
      const by = e.target.y * scale + y;
      if (
        Math.max(ax, bx) < 0 ||
        Math.max(ay, by) < 0 ||
        Math.min(ax, bx) > this.width ||
        Math.min(ay, by) > this.height
      )
        continue;
      const highlighted = this.edgeLooks[i]?.highlighted;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = highlighted ? theme.primary : quiet;
      ctx.lineWidth = highlighted ? 1.8 : 1.1;
      ctx.setLineDash(e.dashed ? [DASH, DASH] : []);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const alpha = Math.max(0, this.nodeAlpha[i]) * enterOpacity(elapsed, n.enter, 420);
      if (alpha < 0.004) continue;
      const px = n.sim.x * scale + x;
      const py = n.sim.y * scale + y;
      const haloRadius = (n.sim.radius + HALO_PAD) * k;
      if (outside(px, py, haloRadius + margin)) continue;
      const look = this.nodeLooks[i];
      const color = theme.palette[n.color % theme.palette.length];
      if (this.nodeHalo[i] > 0.001) {
        ctx.globalAlpha = alpha * this.nodeHalo[i];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, haloRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      const radius =
        Math.max(n.sim.radius * k, n.minRadius * this.minScale) * enterGrow(elapsed, n.enter);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.strokeStyle = look.focused ? theme.foreground : theme.panel;
      ctx.lineWidth = (look.focused ? 2.2 : 1.5) * k;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0, radius), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Font size and anchor of a note's label on the canvas, below its dot. */
  private labelAt(i: number, labelsHidden: boolean) {
    const n = this.nodes[i];
    const { x, y, k } = this.camera;
    // Pinned labels keep a readable size on screen while zoomed out.
    const enlarged = labelsHidden && this.nodeLooks[i].pinned;
    const size = (enlarged ? Math.max(11, 10 / k) : 11) * k;
    const scale = k * this.spread;
    const radius = Math.max(n.sim.radius * k, n.minRadius * this.minScale);
    return {
      size,
      enlarged,
      px: n.sim.x * scale + x,
      py: n.sim.y * scale + y + radius + Math.max(2, 4 * k),
    };
  }

  /**
   * Choose the labels that fit without covering one another: the note under the pointer,
   * then highlighted notes, pinned ones, and the rest from the busiest note down. A label that does not
   * fit fades out and returns when there is room, as place names do on a map.
   */
  private placeLabels(labelsHidden: boolean) {
    const shown = this.labelShown.fill(0);
    const cells = this.labelCells;
    const rects = this.labelRects;
    cells.clear();
    rects.length = 0;
    const columns = Math.ceil(this.width / LABEL_CELL) + 2;
    for (let pass = 0; pass < 4; pass++) {
      if (pass === 3 && labelsHidden) break;
      for (const i of this.order) {
        const look = this.nodeLooks[i];
        if ((look.top ? 0 : look.active ? 1 : look.pinned ? 2 : 3) !== pass) continue;
        const { size, px, py } = this.labelAt(i, labelsHidden);
        if (size < 2) continue;
        const half = (this.labelWidth[i] * size) / 22 + 3;
        const x0 = px - half;
        const x1 = px + half;
        const y0 = py - 1;
        const y1 = py + size * 1.2;
        if (x1 < 0 || x0 > this.width || y1 < 0 || y0 > this.height) continue;
        const c0 = Math.max(0, Math.floor(x0 / LABEL_CELL));
        const c1 = Math.min(columns - 1, Math.floor(x1 / LABEL_CELL));
        const r0 = Math.max(0, Math.floor(y0 / LABEL_CELL));
        const r1 = Math.floor(y1 / LABEL_CELL);
        let free = true;
        // The note under the pointer always keeps its label, whatever it covers.
        if (pass > 0)
          search: for (let r = r0; r <= r1; r++)
            for (let c = c0; c <= c1; c++)
              for (const o of cells.get(r * columns + c) ?? [])
                if (x0 < rects[o + 2] && x1 > rects[o] && y0 < rects[o + 3] && y1 > rects[o + 1]) {
                  free = false;
                  break search;
                }
        if (!free) continue;
        shown[i] = 1;
        const o = rects.length;
        rects.push(x0, y0, x1, y1);
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const key = r * columns + c;
            const cell = cells.get(key);
            if (cell) cell.push(o);
            else cells.set(key, [o]);
          }
      }
    }
  }

  private drawLabels(elapsed: number, labelsHidden: boolean) {
    const ctx = this.ctx;
    const theme = this.theme!;
    const { k } = this.camera;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'hanging';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.panel;
    let font = '';
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const alpha =
        this.nodeLabel[i] * Math.max(0, this.nodeAlpha[i]) * enterOpacity(elapsed, n.enter, 420);
      if (alpha < 0.01) continue;
      const look = this.nodeLooks[i];
      const { size, enlarged, px, py } = this.labelAt(i, labelsHidden);
      if (size < 2) continue;
      const reach = (this.labelWidth[i] * size) / 22 + 8;
      if (px < -reach || px > this.width + reach || py < -size * 2 || py > this.height + size)
        continue;
      const next = `${look.active ? 650 : 500} ${size.toFixed(2)}px ${theme.font}`;
      if (next !== font) ctx.font = font = next;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = enlarged ? size * 0.3 : Math.max(2, 3 * k);
      ctx.strokeText(n.label, px, py);
      ctx.fillStyle = look.active ? theme.foreground : theme.text;
      ctx.fillText(n.label, px, py);
    }
    ctx.globalAlpha = 1;

    // Keyboard focus: a ring in the accent color, clear of the note's own outline.
    const ringed = this.screenOf(this.ring);
    if (ringed) {
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ringed.x, ringed.y, ringed.radius + 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
