import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import { INK } from './palette';

/**
 * Effects and props drawn at runtime with rough.js: blasts, splats, clouds, pickups, the eraser and the
 * ghost. The doodles themselves are rigs (see rig.ts and characters/), and the projectiles are in
 * projectiles.ts.
 */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function base(seed: number, extra: Options = {}): Options {
  return { seed, roughness: 1.3, bowing: 1.2, stroke: INK, strokeWidth: 1.6, ...extra };
}

export interface BurstColors {
  outer: string;
  inner: string;
  line: string;
}

export const FIRE_BURST: BurstColors = { outer: '#ffd23f', inner: '#ff7b39', line: '#2b2b2b' };
export const NEON_BURST: BurstColors = { outer: '#efff8a', inner: '#c6f03a', line: '#3a4a10' };

/** Comic-book explosion star, about 128px across. */
export function drawBurst(canvas: HTMLCanvasElement, seed: number, colors: BurstColors = FIRE_BURST): void {
  const rc = rough.canvas(canvas);
  const c = canvas.width / 2;
  const star = (outer: number, inner: number, points: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer * (0.85 + ((i * 37 + seed) % 7) / 40) : inner;
      const a = (i / (points * 2)) * Math.PI * 2 + seed * 0.3;
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
    }
    return pts;
  };
  rc.polygon(
    star(58, 34, 11),
    base(seed, {
      fill: colors.outer,
      fillStyle: 'hachure',
      hachureGap: 4,
      fillWeight: 2,
      strokeWidth: 2.2,
      stroke: colors.line,
    }),
  );
  rc.polygon(
    star(34, 20, 9),
    base(seed + 1, { fill: colors.inner, fillStyle: 'solid', strokeWidth: 1.6, stroke: colors.line }),
  );
}

export function drawSplat(
  canvas: HTMLCanvasElement,
  seed: number,
  fill = '#1f3fbf',
  stroke = '#13286f',
): void {
  const rc = rough.canvas(canvas);
  const c = canvas.width / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 30 + (((i * 53 + seed * 17) % 11) / 11) * 22;
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
  }
  const o = base(seed, { fill, fillStyle: 'solid', stroke, roughness: 2 });
  rc.curve([...pts, pts[0], pts[1]], o);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + seed;
    const r = 56 + (i % 3) * 3;
    rc.circle(c + Math.cos(a) * r, c + Math.sin(a) * r, 6 + (i % 3) * 3, o);
  }
}

export function drawPuff(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const c = canvas.width / 2;
  rc.circle(
    c,
    c,
    canvas.width * 0.8,
    base(seed, { fill: '#9a9a9a', fillStyle: 'zigzag', hachureGap: 5, stroke: '#7a7a7a', strokeWidth: 1.2 }),
  );
}

export function drawScribbleOut(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const w = canvas.width;
  const o = base(seed, { stroke: '#c0392b', strokeWidth: 3.2, roughness: 2.2 });
  rc.line(6, 6, w - 6, w - 6, o);
  rc.line(w - 6, 6, 6, w - 6, o);
}

/** Small faint scribbles that decorate the sky, like a bored student's margins. */
export function drawMarginDoodle(canvas: HTMLCanvasElement, variant: number, seed: number): void {
  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const o = base(seed, { stroke: '#6b6b6b', strokeWidth: 1.4, roughness: 1.6 });
  switch (variant % 8) {
    case 0: {
      const pts: [number, number][] = [];
      for (let i = 0; i < 60; i++) {
        const a = i * 0.35;
        const r = 2 + i * 0.75;
        pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r]);
      }
      rc.curve(pts, o);
      break;
    }
    case 1: {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? w * 0.45 : w * 0.18;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r]);
      }
      rc.polygon(pts, o);
      break;
    }
    case 2:
      rc.circle(w / 2, h / 2, w * 0.8, o);
      rc.arc(w / 2, h / 2 + 4, w * 0.45, h * 0.35, 0.3, Math.PI - 0.3, false, o);
      rc.circle(w / 2 - 9, h / 2 - 8, 4, o);
      rc.circle(w / 2 + 9, h / 2 - 8, 4, o);
      break;
    case 3:
      ctx.font = '22px "Patrick Hand", cursive';
      ctx.fillStyle = '#6b6b6b';
      ctx.fillText('x² + y² = r²', 6, h / 2);
      break;
    case 4:
      rc.path(
        `M${w / 2} ${h * 0.8} C ${w * 0.1} ${h * 0.45}, ${w * 0.3} ${h * 0.1}, ${w / 2} ${h * 0.35} C ${w * 0.7} ${h * 0.1}, ${w * 0.9} ${h * 0.45}, ${w / 2} ${h * 0.8}`,
        o,
      );
      break;
    case 5:
      ctx.font = '20px "Patrick Hand", cursive';
      ctx.fillStyle = '#6b6b6b';
      ctx.fillText('v = v₀ + at', 6, h / 2);
      break;
    case 6:
      rc.linearPath(
        [
          [8, h - 10],
          [w * 0.3, h * 0.3],
          [w * 0.55, h * 0.6],
          [w - 10, 10],
        ],
        o,
      );
      rc.linearPath(
        [
          [w - 24, 12],
          [w - 10, 10],
          [w - 12, 24],
        ],
        o,
      );
      break;
    default:
      rc.rectangle(10, 10, w - 20, h - 20, o);
      rc.line(10, 10, w / 2, h / 2 - 6, o);
      rc.line(w - 10, 10, w / 2, h / 2 - 6, o);
      break;
  }
}

/** Puffy doodle cloud for the sky; clouds drift with the wind. */
export function drawCloud(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const o = base(seed, {
    stroke: '#8a8a8a',
    strokeWidth: 1.6,
    roughness: 1.4,
    fill: '#ffffff',
    fillStyle: 'solid',
  });
  const puffs = 4 + (seed % 3);
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1);
    const x = w * 0.18 + t * w * 0.64;
    const y = h * 0.58 - Math.sin(t * Math.PI) * h * 0.22;
    const d = h * (0.42 + Math.sin(t * Math.PI) * 0.28);
    rc.ellipse(x, y, d * 1.25, d, o);
  }
  rc.line(w * 0.12, h * 0.78, w * 0.88, h * 0.78, base(seed + 3, { stroke: '#8a8a8a', strokeWidth: 1.4 }));
}

/** Pink eraser used for the "erased" death animation. */
export function drawEraser(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const w = canvas.width;
  const h = canvas.height;
  rc.rectangle(3, 3, w * 0.62, h - 6, base(seed, { fill: '#f29bb0', fillStyle: 'solid', strokeWidth: 1.8 }));
  rc.rectangle(
    3 + w * 0.62,
    3,
    w * 0.38 - 6,
    h - 6,
    base(seed + 1, { fill: '#5a8fd6', fillStyle: 'solid', strokeWidth: 1.8 }),
  );
}

/** Little ghost that floats up when a doodle is erased. */
export function drawGhost(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  rc.path(
    `M${w * 0.2} ${h * 0.9} L${w * 0.2} ${h * 0.42} Q${w * 0.2} ${h * 0.08} ${w * 0.5} ${h * 0.08} Q${w * 0.8} ${h * 0.08} ${w * 0.8} ${h * 0.42} L${w * 0.8} ${h * 0.9} L${w * 0.68} ${h * 0.8} L${w * 0.56} ${h * 0.9} L${w * 0.44} ${h * 0.8} L${w * 0.32} ${h * 0.9} Z`,
    base(seed, { fill: '#ffffff', fillStyle: 'solid', strokeWidth: 1.6 }),
  );
  ctx.fillStyle = INK;
  ctx.font = `bold ${Math.round(h * 0.22)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('x x', w * 0.5, h * 0.45);
}

/** Torn bit of hatched terrain flung out by explosions. */
export function drawChunk(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const pts: [number, number][] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const r = (0.32 + (((seed * 13 + i * 7) % 5) / 5) * 0.16) * w;
    pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r]);
  }
  rc.polygon(
    pts,
    base(seed, { fill: '#b9b4aa', fillStyle: 'hachure', hachureGap: 2.5, strokeWidth: 1.2, roughness: 0.9 }),
  );
}

export const PICKUP_SIZE = 30;

export function drawPickup(
  canvas: HTMLCanvasElement,
  kind: 'bandaid' | 'star' | 'refill',
  seed: number,
): void {
  const rc = rough.canvas(canvas);
  const ctx = canvas.getContext('2d')!;
  const s = canvas.width;
  const o = (extra: Options = {}) => base(seed, { roughness: 1, strokeWidth: 1.5, ...extra });
  switch (kind) {
    case 'bandaid':
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.rotate(-0.45);
      ctx.translate(-s / 2, -s / 2);
      rc.rectangle(3, s * 0.34, s - 6, s * 0.32, o({ fill: '#f0c39a', fillStyle: 'solid' }));
      rc.rectangle(s * 0.36, s * 0.34, s * 0.28, s * 0.32, o({ fill: '#fbe6d2', fillStyle: 'solid' }));
      ctx.fillStyle = '#c99872';
      for (const [x, y] of [
        [0.2, 0.45],
        [0.2, 0.56],
        [0.78, 0.45],
        [0.78, 0.56],
      ]) {
        ctx.beginPath();
        ctx.arc(s * x, s * y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    case 'star': {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? s * 0.46 : s * 0.2;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        pts.push([s / 2 + Math.cos(a) * r, s / 2 + 1 + Math.sin(a) * r]);
      }
      rc.polygon(pts, o({ fill: '#ffd23f', fillStyle: 'solid' }));
      ctx.fillStyle = '#fff6c2';
      ctx.beginPath();
      ctx.arc(s * 0.42, s * 0.4, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'refill':
      rc.rectangle(s * 0.38, 2, s * 0.24, s * 0.18, o({ fill: '#2b2b2b', fillStyle: 'solid' }));
      rc.rectangle(s * 0.2, s * 0.2, s * 0.6, s * 0.72, o({ fill: '#cfe0ff', fillStyle: 'solid' }));
      rc.rectangle(
        s * 0.24,
        s * 0.46,
        s * 0.52,
        s * 0.42,
        o({ fill: '#1f3fbf', fillStyle: 'solid', stroke: 'transparent' }),
      );
      break;
  }
}

/** Paper parachute that pickups float down on. */
export function drawParachute(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const o = base(seed, { strokeWidth: 1.3, roughness: 1.1 });
  rc.path(
    `M2 ${h * 0.42} Q${w / 2} ${-h * 0.18} ${w - 2} ${h * 0.42} Q${w * 0.75} ${h * 0.32} ${w / 2} ${h * 0.42} Q${w * 0.25} ${h * 0.32} 2 ${h * 0.42} Z`,
    { ...o, fill: '#fffdf6', fillStyle: 'solid' },
  );
  rc.line(3, h * 0.42, w / 2, h - 1, o);
  rc.line(w - 3, h * 0.42, w / 2, h - 1, o);
  rc.line(w / 2, h * 0.42, w / 2, h - 1, o);
}
