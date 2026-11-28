import type { ProjectileSprite, UnitStatus } from '@doodle/sim';
import { LINE, Pen, Shape, curve, ellipse, mix, poly, rrect } from './kit';
import { makeCanvas } from './render';

/** Projectiles and status icons, in the same marker-and-pencil style as the doodles. */

export const PROJECTILE_RES = 2;
/** Every projectile is drawn in a square this many world px across. */
export const PROJECTILE_SIZE = 34;

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
  beam: true,
  megabeam: true,
  cap: false,
  glob: false,
  wall: false,
  superglue: false,
};

export const PROJECTILE_SPRITES = Object.keys(ROTATES_WITH_VELOCITY) as ProjectileSprite[];

function canvas(size: number, res: number, draw: (pen: Pen) => void): HTMLCanvasElement {
  const c = makeCanvas(size * res, size * res);
  const ctx = c.getContext('2d')!;
  ctx.scale(res, res);
  ctx.translate(size / 2, size / 2);
  draw(new Pen(ctx, 5, 0));
  return c;
}

function glow(pen: Pen, color: string, blur: number, draw: () => void): void {
  pen.ctx.save();
  pen.ctx.shadowColor = color;
  pen.ctx.shadowBlur = blur;
  draw();
  pen.ctx.restore();
}

export function drawProjectile(sprite: ProjectileSprite): HTMLCanvasElement {
  return canvas(PROJECTILE_SIZE, PROJECTILE_RES, (pen) => {
    const j = pen.j;
    switch (sprite) {
      case 'graphite':
        pen.paint(ellipse(j, 0, 0, 7.5, 6.2), { fill: '#55545e', depth: 2 }, () => {
          pen.stroke(
            curve(j, [
              [-4, -2.5],
              [-1, -4.2],
              [2.4, -3.8],
            ]),
            '#b8b8c4',
            1.2,
          );
        });
        break;
      case 'lead':
        pen.paint(ellipse(j, 0, 0, 5.4, 4.6), { fill: '#5e5d68', depth: 1.5 });
        break;
      case 'drill':
        pen.paint(
          poly(
            j,
            [
              [-10, -4.6],
              [3, -4.6],
              [3, 4.6],
              [-10, 4.6],
            ],
            1,
          ),
          { fill: '#f8c63e', depth: 1.5, hatch: false },
        );
        pen.paint(
          poly(
            j,
            [
              [3, -4.6],
              [11, -1.2],
              [11, 1.2],
              [3, 4.6],
            ],
            0.6,
          ),
          { fill: '#efc78f', depth: 1, hatch: false, lw: 1.8 },
        );
        pen.flat(
          poly(j, [
            [8.4, -1.9],
            [13, 0],
            [8.4, 1.9],
          ]),
          '#3a3941',
          1.2,
        );
        pen.paint(rrect(j, -12.5, -4.9, 3, 9.8, 1), { fill: '#f39ab1', depth: 0.8, hatch: false, lw: 1.6 });
        break;
      case 'ink':
        pen.paint(ellipse(j, 0, 0, 7.6, 7.6), { fill: '#3d4fd0', depth: 2.4, line: '#151d5c' }, () => {
          pen.dot(-2.6, -2.8, 2, '#c8d4ff');
        });
        break;
      case 'inkDrop': {
        const s = new Shape(j);
        s.moveTo(0, -7).quadTo(5.4, 0.6, 0, 5.2).quadTo(-5.4, 0.6, 0, -7).close();
        pen.paint(s, { fill: '#3d4fd0', depth: 1.6, line: '#151d5c', lw: 1.9 }, () =>
          pen.dot(-1.4, -0.6, 1.3, '#c8d4ff'),
        );
        break;
      }
      case 'dart':
        pen.paint(
          poly(
            j,
            [
              [13, 0],
              [-11, -7],
              [-6, 0],
              [-11, 6],
            ],
            1,
          ),
          { fill: '#fbfaf3', depth: 1.6, shade: '#d6dae4' },
        );
        pen.line(12, 0, -6, 0, mix('#d6dae4', LINE, 0.4), 1);
        pen.line(-9, -4.4, 3, -2, '#9fc3e6', 0.8);
        break;
      case 'crumple':
        pen.paint(
          poly(
            j,
            [
              [-8.5, -3],
              [-3.5, -8.5],
              [5, -7.5],
              [8.6, -1],
              [6.4, 6.4],
              [-2, 8.6],
              [-7.6, 4.4],
            ],
            1.2,
          ),
          { fill: '#fbfaf3', depth: 2.2, shade: '#cfd3de' },
          () => {
            pen.stroke(
              curve(j, [
                [-5, -2],
                [0, 1.4],
                [4.4, -3],
              ]),
              mix('#cfd3de', LINE, 0.4),
              0.9,
            );
            pen.stroke(
              curve(j, [
                [-1, 1.4],
                [1.4, 6.4],
              ]),
              mix('#cfd3de', LINE, 0.4),
              0.9,
            );
          },
        );
        break;
      case 'staple': {
        // A staple's U, pointing the way it flies.
        const u = new Shape(j).moveTo(-10, -4.2).lineTo(8, -4.2).lineTo(8, 4.2).lineTo(-10, 4.2);
        pen.stroke(u, '#3c4048', 4.4, 'butt');
        pen.stroke(u, '#d7dde3', 2.2, 'butt');
        break;
      }
      case 'band':
        pen.stroke(ellipse(j, 0, 0, 9, 6), LINE, 4.6);
        pen.stroke(ellipse(j, 0, 0, 9, 6), '#d9483b', 2.8);
        break;
      case 'beam':
        glow(pen, '#e4ff4d', 10, () => {
          pen.flat(ellipse(j, 0, 0, 9, 3.4), '#e4ff4d', 0);
          pen.flat(ellipse(j, 1, 0, 5, 1.6), '#ffffff', 0);
        });
        break;
      case 'megabeam':
        glow(pen, '#e4ff4d', 14, () => {
          pen.flat(ellipse(j, 0, 0, 13, 6.4), '#e4ff4d', 0);
          pen.flat(ellipse(j, 1.5, 0, 8, 3), '#ffffff', 0);
        });
        break;
      case 'cap':
        pen.paint(rrect(j, -8, -4.6, 16, 9.2, 4), { fill: '#30343c', depth: 1.6, light: '#646a76' }, () => {
          pen.ctx.fillStyle = '#c6f03a';
          pen.ctx.fillRect(3.4, -6, 2, 12);
        });
        pen.paint(
          poly(
            j,
            [
              [-6, -4.4],
              [-8.6, -9.6],
              [-5.6, -9.8],
              [-3.6, -4.4],
            ],
            0.6,
          ),
          { fill: '#9aa1ac', depth: 0.6, hatch: false, lw: 1.4 },
        );
        break;
      case 'glob':
      case 'wall':
      case 'superglue': {
        const big = sprite === 'superglue' ? 1.45 : sprite === 'wall' ? 1.15 : 1;
        const g = new Shape(j);
        const r = 6.6 * big;
        g.moveTo(0, -r)
          .curveTo(r * 0.9, -r, r, -r * 0.2, r * 0.9, r * 0.4)
          .curveTo(r * 0.7, r * 1.05, -r * 0.6, r * 1.1, -r * 0.95, r * 0.35)
          .curveTo(-r * 1.1, -r * 0.4, -r * 0.6, -r, 0, -r)
          .close();
        const fill = sprite === 'wall' ? '#ffe2b8' : '#f8f4ea';
        if (sprite === 'superglue') glow(pen, '#f28a2b', 8, () => pen.flat(g, fill, 0));
        pen.paint(g, { fill, depth: 2, shade: '#cbc7df', light: '#ffffff' }, () => {
          pen.dot(-r * 0.35, -r * 0.4, r * 0.28, '#ffffff');
        });
        if (sprite !== 'glob')
          pen.paint(ellipse(j, r * 0.2, -r * 0.95, 2.4 * big, 1.6 * big), {
            fill: '#f28a2b',
            depth: 0.6,
            hatch: false,
            lw: 1.3,
          });
        break;
      }
    }
  });
}

export const STATUS_SIZE = 16;

export function drawStatus(status: UnitStatus): HTMLCanvasElement {
  return canvas(STATUS_SIZE, 3, (pen) => {
    const j = pen.j;
    if (status === 'inked') {
      const s = new Shape(j);
      s.moveTo(0, -6.4).quadTo(5.4, 1, 0, 5.8).quadTo(-5.4, 1, 0, -6.4).close();
      pen.paint(s, { fill: '#3d4fd0', depth: 1.4, line: '#151d5c', lw: 1.6 }, () =>
        pen.dot(-1.4, 0, 1.2, '#c8d4ff'),
      );
    } else if (status === 'rooted') {
      pen.paint(ellipse(j, 0, 1.6, 6.4, 4.4), { fill: '#f8f4ea', depth: 1.2, shade: '#cbc7df', lw: 1.6 });
      pen.line(-4.6, 6.4, -4.6, 7.4, LINE, 1.4);
      pen.line(0, 6.2, 0, 7.6, LINE, 1.4);
      pen.line(4.6, 6.4, 4.6, 7.4, LINE, 1.4);
      pen.paint(ellipse(j, 0, -3.8, 2.6, 2), { fill: '#f28a2b', depth: 0.6, hatch: false, lw: 1.3 });
    } else {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 6.8 : 3;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(a) * r, Math.sin(a) * r + 0.4]);
      }
      glow(pen, '#e4ff4d', 4, () =>
        pen.paint(poly(j, pts, 0.8), { fill: '#d8ff3c', depth: 1, hatch: false, lw: 1.5 }),
      );
    }
  });
}
