import type { ProjectileSprite, UnitKind } from '@doodle/sim';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';
import { INK, team } from './palette';

/**
 * Every sprite in the game is drawn here at runtime with rough.js, so there are no image
 * assets. Each unit gets a few "boil" frames drawn with different seeds; cycling them gives
 * the wobbly hand-drawn animation look.
 */

export const UNIT_CANVAS = { w: 64, h: 60, footX: 32, footY: 56 };
export const BARREL_CANVAS = { w: 44, h: 14 };

/** Where the barrel pivots, relative to the feet, for a right-facing unit. */
export const BARREL_PIVOT: Record<UnitKind, { x: number; y: number }> = {
  pencil: { x: -1, y: -19 },
  squid: { x: 0, y: -17 },
  plane: { x: -4, y: -18 },
  stapler: { x: 12, y: -23 },
};

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function base(seed: number, extra: Options = {}): Options {
  return { seed, roughness: 1.3, bowing: 1.2, stroke: INK, strokeWidth: 1.6, ...extra };
}

function googlyEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, look = 1): void {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + look * r * 0.35, y + r * 0.1, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawUnitBody(
  canvas: HTMLCanvasElement,
  kind: UnitKind,
  teamIndex: number,
  seed: number,
): void {
  const ctx = canvas.getContext('2d')!;
  const rc = rough.canvas(canvas);
  const t = team(teamIndex);
  const o = (extra: Options = {}) => base(seed, extra);

  switch (kind) {
    case 'pencil': {
      rc.ellipse(31, 38, 24, 18, o({ fill: t.light, fillStyle: 'solid' }));
      rc.rectangle(13, 46, 38, 9, o({ fill: '#6b6b6b', fillStyle: 'cross-hatch', hachureGap: 3 }));
      for (const x of [18, 26, 34, 42, 47])
        rc.circle(x, 51, 6, o({ fill: '#ddd', fillStyle: 'solid', strokeWidth: 1.2 }));
      rc.polygon(
        [
          [11, 47],
          [53, 47],
          [48, 37],
          [16, 37],
        ],
        o({ fill: t.color, fillStyle: 'hachure', hachureGap: 3.2, fillWeight: 1.6 }),
      );
      googlyEye(ctx, 37, 33, 4.4);
      break;
    }
    case 'squid': {
      for (const [x, bend] of [
        [20, -4],
        [26, -2],
        [32, 0],
        [38, 2],
        [44, 4],
      ] as const) {
        rc.curve(
          [
            [x, 44],
            [x + bend, 50],
            [x + bend * 0.5, 55],
          ],
          o({ stroke: t.color, strokeWidth: 3.4 }),
        );
      }
      rc.ellipse(
        32,
        36,
        32,
        28,
        o({ fill: t.color, fillStyle: 'hachure', hachureGap: 3.2, fillWeight: 1.6 }),
      );
      rc.circle(24, 42, 5, o({ fill: t.light, fillStyle: 'solid', strokeWidth: 1 }));
      rc.circle(41, 27, 4, o({ fill: t.light, fillStyle: 'solid', strokeWidth: 1 }));
      googlyEye(ctx, 27, 34, 4.4);
      googlyEye(ctx, 37, 34, 4.4);
      break;
    }
    case 'plane': {
      rc.line(23, 49, 27, 43, o({ strokeWidth: 1.4 }));
      rc.line(41, 49, 37, 43, o({ strokeWidth: 1.4 }));
      rc.circle(22, 51, 8, o({ fill: '#ddd', fillStyle: 'solid', strokeWidth: 1.2 }));
      rc.circle(42, 51, 8, o({ fill: '#ddd', fillStyle: 'solid', strokeWidth: 1.2 }));
      rc.polygon(
        [
          [56, 41],
          [10, 28],
          [17, 42],
        ],
        o({ fill: '#fffdf6', fillStyle: 'solid' }),
      );
      rc.polygon(
        [
          [56, 41],
          [17, 42],
          [12, 48],
        ],
        o({ fill: t.color, fillStyle: 'hachure', hachureGap: 3, fillWeight: 1.5 }),
      );
      rc.line(56, 41, 14, 36, o({ strokeWidth: 1 }));
      googlyEye(ctx, 40, 37, 3.8);
      break;
    }
    case 'stapler': {
      rc.rectangle(21, 46, 7, 8, o({ fill: '#555', fillStyle: 'solid' }));
      rc.rectangle(37, 46, 7, 8, o({ fill: '#555', fillStyle: 'solid' }));
      rc.ellipse(24, 55, 12, 4, o({ fill: '#333', fillStyle: 'solid', strokeWidth: 1 }));
      rc.ellipse(41, 55, 12, 4, o({ fill: '#333', fillStyle: 'solid', strokeWidth: 1 }));
      rc.rectangle(12, 39, 40, 8, o({ fill: '#7a7a7a', fillStyle: 'solid' }));
      rc.path(
        'M13 39 L13 30 Q13 25 18 25 L48 27 Q53 28 53 32 L53 37 Z',
        o({ fill: t.color, fillStyle: 'hachure', hachureGap: 3, fillWeight: 1.6 }),
      );
      rc.circle(17, 38, 7, o({ fill: '#bbb', fillStyle: 'solid', strokeWidth: 1.2 }));
      googlyEye(ctx, 40, 31, 4.6);
      break;
    }
  }
}

export function drawBarrel(canvas: HTMLCanvasElement, kind: UnitKind, seed: number): void {
  const ctx = canvas.getContext('2d')!;
  const rc = rough.canvas(canvas);
  const o = (extra: Options = {}) => base(seed, { roughness: 0.9, ...extra });
  const mid = BARREL_CANVAS.h / 2;
  switch (kind) {
    case 'pencil': {
      rc.rectangle(2, mid - 3, 5, 6, o({ fill: '#f29bb0', fillStyle: 'solid', strokeWidth: 1.1 }));
      rc.rectangle(7, mid - 3, 4, 6, o({ fill: '#bfbfbf', fillStyle: 'solid', strokeWidth: 1.1 }));
      rc.rectangle(11, mid - 3, 20, 6, o({ fill: '#f2c84b', fillStyle: 'solid', strokeWidth: 1.1 }));
      rc.polygon(
        [
          [31, mid - 3],
          [39, mid],
          [31, mid + 3],
        ],
        o({ fill: '#e8c79a', fillStyle: 'solid', strokeWidth: 1.1 }),
      );
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(37, mid - 1);
      ctx.lineTo(41, mid);
      ctx.lineTo(37, mid + 1);
      ctx.fill();
      break;
    }
    case 'squid': {
      rc.rectangle(2, mid - 3, 24, 6, o({ fill: '#1f2f6b', fillStyle: 'solid', strokeWidth: 1.1 }));
      rc.polygon(
        [
          [26, mid - 3],
          [35, mid],
          [26, mid + 3],
        ],
        o({ fill: '#c9a94a', fillStyle: 'solid', strokeWidth: 1.1 }),
      );
      break;
    }
    case 'plane': {
      rc.rectangle(2, mid - 3.5, 26, 7, o({ fill: '#fffdf6', fillStyle: 'solid', strokeWidth: 1.1 }));
      for (const x of [8, 14, 20]) rc.line(x, mid - 3.5, x + 3, mid + 3.5, o({ strokeWidth: 0.8 }));
      break;
    }
    case 'stapler': {
      rc.rectangle(2, mid - 3.5, 20, 7, o({ fill: '#9a9a9a', fillStyle: 'solid', strokeWidth: 1.1 }));
      rc.rectangle(22, mid - 2, 5, 4, o({ fill: '#555', fillStyle: 'solid', strokeWidth: 1 }));
      break;
    }
  }
}

export const PROJECTILE_SIZE = 28;

/** Sprites that point along their velocity; the rest spin. */
export const ROTATES_WITH_VELOCITY: Record<ProjectileSprite, boolean> = {
  graphite: false,
  lead: false,
  drill: true,
  ink: false,
  inkDrop: false,
  dart: true,
  crumple: false,
  staple: true,
  band: false,
};

export function drawProjectile(canvas: HTMLCanvasElement, sprite: ProjectileSprite, seed: number): void {
  const rc = rough.canvas(canvas);
  const c = PROJECTILE_SIZE / 2;
  const o = (extra: Options = {}) => base(seed, { roughness: 0.8, strokeWidth: 1.3, ...extra });
  switch (sprite) {
    case 'graphite':
      rc.ellipse(c, c, 14, 11, o({ fill: '#4a4a4a', fillStyle: 'solid' }));
      rc.line(c - 3, c - 3, c + 1, c - 4, o({ stroke: '#bbb', strokeWidth: 1 }));
      break;
    case 'lead':
      rc.ellipse(c, c, 10, 8, o({ fill: '#5a5a5a', fillStyle: 'solid' }));
      break;
    case 'drill':
      rc.polygon(
        [
          [c - 9, c - 5],
          [c + 4, c - 5],
          [c + 11, c],
          [c + 4, c + 5],
          [c - 9, c + 5],
        ],
        o({ fill: '#f2c84b', fillStyle: 'solid' }),
      );
      rc.polygon(
        [
          [c + 4, c - 5],
          [c + 11, c],
          [c + 4, c + 5],
        ],
        o({ fill: '#e8c79a', fillStyle: 'solid' }),
      );
      rc.line(c + 9, c - 1, c + 12, c, o({ strokeWidth: 2.2 }));
      break;
    case 'ink':
      rc.circle(c, c, 14, o({ fill: '#1f3fbf', fillStyle: 'solid', stroke: '#13286f' }));
      rc.circle(c - 3, c - 3, 3, o({ fill: '#cfe0ff', fillStyle: 'solid', stroke: 'transparent' }));
      break;
    case 'inkDrop':
      rc.circle(c, c, 9, o({ fill: '#1f3fbf', fillStyle: 'solid', stroke: '#13286f' }));
      break;
    case 'dart':
      rc.polygon(
        [
          [c + 11, c],
          [c - 10, c - 6],
          [c - 6, c],
          [c - 10, c + 5],
        ],
        o({ fill: '#fffdf6', fillStyle: 'solid' }),
      );
      rc.line(c + 11, c, c - 6, c, o({ strokeWidth: 0.9 }));
      break;
    case 'crumple':
      rc.polygon(
        [
          [c - 8, c - 3],
          [c - 3, c - 8],
          [c + 5, c - 7],
          [c + 8, c - 1],
          [c + 6, c + 6],
          [c - 2, c + 8],
          [c - 7, c + 4],
        ],
        o({ fill: '#fffdf6', fillStyle: 'solid' }),
      );
      rc.linearPath(
        [
          [c - 5, c - 2],
          [c, c + 1],
          [c + 4, c - 3],
        ],
        o({ strokeWidth: 0.8 }),
      );
      rc.line(c - 1, c + 1, c + 1, c + 6, o({ strokeWidth: 0.8 }));
      break;
    case 'staple':
      rc.linearPath(
        [
          [c - 9, c - 4],
          [c + 7, c - 4],
          [c + 7, c + 4],
          [c - 9, c + 4],
        ],
        o({ stroke: '#6d6d6d', strokeWidth: 2.4 }),
      );
      break;
    case 'band':
      rc.ellipse(c, c, 17, 11, o({ stroke: '#c0392b', strokeWidth: 2.6 }));
      break;
  }
}

/** Comic-book explosion star, about 128px across. */
export function drawBurst(canvas: HTMLCanvasElement, seed: number): void {
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
    base(seed, { fill: '#ffd23f', fillStyle: 'hachure', hachureGap: 4, fillWeight: 2, strokeWidth: 2.2 }),
  );
  rc.polygon(star(34, 20, 9), base(seed + 1, { fill: '#ff7b39', fillStyle: 'solid', strokeWidth: 1.6 }));
}

export function drawSplat(canvas: HTMLCanvasElement, seed: number): void {
  const rc = rough.canvas(canvas);
  const c = canvas.width / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 30 + (((i * 53 + seed * 17) % 11) / 11) * 22;
    pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
  }
  const o = base(seed, { fill: '#1f3fbf', fillStyle: 'solid', stroke: '#13286f', roughness: 2 });
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

/** Unit portrait for menus and the HUD, as a data URL. */
const iconCache = new Map<string, string>();
export function unitIconUrl(kind: UnitKind, teamIndex: number): string {
  const key = `${kind}:${teamIndex}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(UNIT_CANVAS.w, UNIT_CANVAS.h);
  const pivot = BARREL_PIVOT[kind];
  const barrel = makeCanvas(BARREL_CANVAS.w, BARREL_CANVAS.h);
  drawBarrel(barrel, kind, 7);
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.translate(UNIT_CANVAS.footX + pivot.x, UNIT_CANVAS.footY + pivot.y);
  ctx.rotate(-Math.PI / 5);
  ctx.drawImage(barrel, 0, -BARREL_CANVAS.h / 2);
  ctx.restore();
  drawUnitBody(canvas, kind, teamIndex, 7);
  const url = canvas.toDataURL();
  iconCache.set(key, url);
  return url;
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
