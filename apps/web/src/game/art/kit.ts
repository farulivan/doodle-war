/**
 * A small vector kit for the doodles. Shapes are recorded as path commands in world units, so the same
 * drawing can be painted at any resolution: sharp in the HUD, and at 3x for the battlefield. Every shape
 * goes through a jitter function, which is what gives each "boil" frame its slightly different line.
 *
 * The look: a marker outline that is heavier on the shadow side, a flat base color, a shadow crescent
 * hatched like coloured pencil, and a light rim on the lit side. Light comes from the top left.
 */

export const LINE = '#2a2421';

type Op =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];

export type Pt = readonly [number, number];
export type Jitter = (x: number, y: number) => Pt;

export const NO_JITTER: Jitter = (x, y) => [x, y];

/** Small seeded generator, so a boil frame always wobbles the same way. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A jitter that moves each point by up to `amount`, the same way every time for the same point. */
export function wobble(seed: number, amount: number): Jitter {
  if (amount <= 0) return NO_JITTER;
  return (x, y) => {
    const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
    const k = Math.sin(x * 39.346 + y * 11.135 + seed * 91.17) * 24634.6345;
    return [x + (h - Math.floor(h) - 0.5) * 2 * amount, y + (k - Math.floor(k) - 0.5) * 2 * amount];
  };
}

export class Shape {
  readonly ops: Op[] = [];
  private j: Jitter;

  constructor(j: Jitter = NO_JITTER) {
    this.j = j;
  }

  moveTo(x: number, y: number): this {
    const [a, b] = this.j(x, y);
    this.ops.push(['M', a, b]);
    return this;
  }

  lineTo(x: number, y: number): this {
    const [a, b] = this.j(x, y);
    this.ops.push(['L', a, b]);
    return this;
  }

  quadTo(cx: number, cy: number, x: number, y: number): this {
    const [c1, c2] = this.j(cx, cy);
    const [a, b] = this.j(x, y);
    this.ops.push(['Q', c1, c2, a, b]);
    return this;
  }

  curveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    const [a1, b1] = this.j(c1x, c1y);
    const [a2, b2] = this.j(c2x, c2y);
    const [a, b] = this.j(x, y);
    this.ops.push(['C', a1, b1, a2, b2, a, b]);
    return this;
  }

  close(): this {
    this.ops.push(['Z']);
    return this;
  }

  /** Writes this shape into a path, moved by (dx, dy). */
  addTo(path: Path2D, dx = 0, dy = 0): Path2D {
    for (const op of this.ops) {
      switch (op[0]) {
        case 'M':
          path.moveTo(op[1] + dx, op[2] + dy);
          break;
        case 'L':
          path.lineTo(op[1] + dx, op[2] + dy);
          break;
        case 'Q':
          path.quadraticCurveTo(op[1] + dx, op[2] + dy, op[3] + dx, op[4] + dy);
          break;
        case 'C':
          path.bezierCurveTo(op[1] + dx, op[2] + dy, op[3] + dx, op[4] + dy, op[5] + dx, op[6] + dy);
          break;
        case 'Z':
          path.closePath();
          break;
      }
    }
    return path;
  }

  path(dx = 0, dy = 0): Path2D {
    return this.addTo(new Path2D(), dx, dy);
  }

  /** A box around every point and control point. Never smaller than the shape. */
  bounds(): [number, number, number, number] {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const op of this.ops) {
      for (let i = 1; i < op.length; i += 2) {
        const x = op[i] as number;
        const y = op[i + 1] as number;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return [x0, y0, x1, y1];
  }
}

// ---------------------------------------------------------------------------
// Shape builders. Each takes the jitter of the frame being drawn.

/** A smooth closed curve through the points (Catmull-Rom turned into Béziers). */
export function blob(j: Jitter, pts: readonly Pt[], tension = 1): Shape {
  const s = new Shape(j);
  const n = pts.length;
  const p = (i: number) => pts[(i + n) % n];
  s.moveTo(p(0)[0], p(0)[1]);
  for (let i = 0; i < n; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const k = tension / 6;
    s.curveTo(
      p1[0] + (p2[0] - p0[0]) * k,
      p1[1] + (p2[1] - p0[1]) * k,
      p2[0] - (p3[0] - p1[0]) * k,
      p2[1] - (p3[1] - p1[1]) * k,
      p2[0],
      p2[1],
    );
  }
  return s.close();
}

/** A smooth open curve through the points. */
export function curve(j: Jitter, pts: readonly Pt[], tension = 1): Shape {
  const s = new Shape(j);
  const n = pts.length;
  const p = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  s.moveTo(p(0)[0], p(0)[1]);
  for (let i = 0; i < n - 1; i++) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const k = tension / 6;
    s.curveTo(
      p1[0] + (p2[0] - p0[0]) * k,
      p1[1] + (p2[1] - p0[1]) * k,
      p2[0] - (p3[0] - p1[0]) * k,
      p2[1] - (p3[1] - p1[1]) * k,
      p2[0],
      p2[1],
    );
  }
  return s;
}

export function ellipse(j: Jitter, cx: number, cy: number, rx: number, ry: number, rot = 0): Shape {
  const pts: Pt[] = [];
  const n = 10;
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push([cx + x * c - y * sn, cy + x * sn + y * c]);
  }
  return blob(j, pts);
}

/** A polygon with rounded corners. */
export function poly(j: Jitter, pts: readonly Pt[], radius = 0): Shape {
  const s = new Shape(j);
  const n = pts.length;
  if (radius <= 0) {
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) s.lineTo(pts[i][0], pts[i][1]);
    return s.close();
  }
  const corner = (i: number) => {
    const p = pts[(i + n) % n];
    const a = pts[(i - 1 + n) % n];
    const b = pts[(i + 1) % n];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(radius, da / 2, db / 2);
    return {
      p,
      inPt: [p[0] + ((a[0] - p[0]) / da) * r, p[1] + ((a[1] - p[1]) / da) * r] as Pt,
      outPt: [p[0] + ((b[0] - p[0]) / db) * r, p[1] + ((b[1] - p[1]) / db) * r] as Pt,
    };
  };
  const first = corner(0);
  s.moveTo(first.outPt[0], first.outPt[1]);
  for (let i = 1; i <= n; i++) {
    const c = corner(i);
    s.lineTo(c.inPt[0], c.inPt[1]);
    s.quadTo(c.p[0], c.p[1], c.outPt[0], c.outPt[1]);
  }
  return s.close();
}

export function rrect(j: Jitter, x: number, y: number, w: number, h: number, r: number): Shape {
  return poly(
    j,
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    r,
  );
}

// ---------------------------------------------------------------------------
// Painting

export interface PaintStyle {
  fill: string;
  /** Shadow side. Defaults to a darker fill. */
  shade?: string;
  /** Lit rim. Defaults to a lighter fill; 'none' for no rim. */
  light?: string;
  /** How far the shadow crescent reaches in, in world px. */
  depth?: number;
  /** Coloured-pencil hatching inside the shadow. */
  hatch?: boolean;
  line?: string;
  /** Outline width in world px; 0 for none. */
  lw?: number;
}

export class Pen {
  readonly ctx: CanvasRenderingContext2D;
  /** Jitter for this boil frame. */
  readonly j: Jitter;
  readonly seed: number;

  constructor(ctx: CanvasRenderingContext2D, seed: number, wobbleAmount: number) {
    this.ctx = ctx;
    this.seed = seed;
    this.j = wobble(seed, wobbleAmount);
  }

  /**
   * A full sticker-style shape: fill, hatched shadow, lit rim and outline. `inner` draws details clipped to
   * the shape, under its outline.
   */
  paint(shape: Shape, style: PaintStyle, inner?: () => void): void {
    const ctx = this.ctx;
    const depth = style.depth ?? 3.2;
    const shade = style.shade ?? mix(style.fill, '#1d1530', 0.28);
    const light = style.light ?? mix(style.fill, '#ffffff', 0.45);
    const path = shape.path();
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = shade;
    ctx.fill(path);
    if (style.hatch !== false) this.hatchArea(path, shape.bounds(), mix(shade, LINE, 0.35), 0.35, 2.1);
    // Base color: the shape nudged toward the light, which leaves the shadow as a crescent.
    ctx.fillStyle = style.fill;
    ctx.fill(shape.path(-depth * 0.55, -depth));
    if (light !== 'none') {
      const rim = new Path2D();
      rim.rect(-4000, -4000, 8000, 8000);
      shape.addTo(rim, depth * 0.45, depth * 0.7);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = light;
      ctx.fill(rim, 'evenodd');
      ctx.globalAlpha = 1;
    }
    if (inner) inner();
    ctx.restore();
    this.outline(shape, style.line ?? LINE, style.lw ?? 2.2);
  }

  /** A flat fill with an outline, for small parts that don't need shading. */
  flat(shape: Shape, fill: string, lw = 2, line = LINE): void {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.fill(shape.path());
    if (lw > 0) this.outline(shape, line, lw);
  }

  /** A marker outline: one stroke, plus a second, offset one that weights the shadow side. */
  outline(shape: Shape, color = LINE, lw = 2.2): void {
    if (lw <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke(shape.path());
    ctx.lineWidth = lw * 0.75;
    ctx.stroke(shape.path(lw * 0.22, lw * 0.3));
    ctx.restore();
  }

  /** An open stroke, for creases, seams, mouths and the like. */
  stroke(shape: Shape, color = LINE, lw = 1.6, cap: CanvasLineCap = 'round'): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = cap;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke(shape.path());
    ctx.restore();
  }

  line(x0: number, y0: number, x1: number, y1: number, color = LINE, lw = 1.6): void {
    this.stroke(new Shape(this.j).moveTo(x0, y0).lineTo(x1, y1), color, lw);
  }

  dot(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Parallel "/" strokes clipped to a path, like coloured pencil shading. */
  hatchArea(
    path: Path2D,
    box: [number, number, number, number],
    color: string,
    alpha: number,
    gap: number,
    angleDeg = 58,
  ): void {
    const ctx = this.ctx;
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = -Math.sin(a);
    // Lines run along (dx, dy) and are spaced along its normal.
    const nx = -dy;
    const ny = dx;
    const [x0, y0, x1, y1] = box;
    const corners = [x0 * nx + y0 * ny, x1 * nx + y0 * ny, x0 * nx + y1 * ny, x1 * nx + y1 * ny];
    const lo = Math.min(...corners) - gap;
    const hi = Math.max(...corners) + gap;
    const reach = Math.hypot(x1 - x0, y1 - y0) + 4;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const along = cx * dx + cy * dy;
    const r = rng(this.seed * 7 + 3);
    ctx.save();
    ctx.clip(path);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = gap * 0.45;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let o = lo; o <= hi; o += gap) {
      const w = o + (r() - 0.5) * gap * 0.35;
      const px = nx * w + dx * along;
      const py = ny * w + dy * along;
      ctx.moveTo(px - dx * reach, py - dy * reach);
      ctx.lineTo(px + dx * reach, py + dy * reach);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Hatching inside a shape, for patches of texture. */
  hatch(shape: Shape, color: string, alpha = 0.3, gap = 2.2, angleDeg = 58): void {
    this.hatchArea(shape.path(), shape.bounds(), color, alpha, gap, angleDeg);
  }
}

// ---------------------------------------------------------------------------
// Color helpers

function hex(c: string): [number, number, number] {
  const v = c.replace('#', '');
  const n = parseInt(v.length === 3 ? v.replace(/./g, '$&$&') : v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mixes two hex colors: t = 0 is a, t = 1 is b. */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
