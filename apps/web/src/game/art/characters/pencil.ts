import { LINE, curve, ellipse, mix, poly, rrect } from '../kit';
import {
  BOIL_FRAMES,
  breathe,
  facePose,
  faceParts,
  hop,
  recoil,
  scarfParts,
  scarfPose,
  shake,
  type Design,
  type FaceSpec,
  type Pose,
} from '../rig';
import { barrelPose, mountOf, shadowPart, shadowPose, walking } from './common';

/** Pencil Tank: a yellow No. 2 pencil on treads, with a sharpened pencil for a cannon. */

const C = {
  body: '#f8c63e',
  hi: '#ffe58d',
  lo: '#d99a1c',
  eraser: '#f39ab1',
  metal: '#c8ced6',
  wood: '#efc78f',
  lead: '#3a3941',
  tread: '#4b4a54',
  wheel: '#d3d6dd',
};

const m = mountOf('pencil');

const face: FaceSpec = {
  parent: 'turret',
  eyes: [
    [-1.4, -35.4],
    [6.2, -35.4],
  ],
  eyeSize: [
    [3.4, 4.2],
    [4, 4.8],
  ],
  lid: C.body,
  brows: true,
  mouth: [3.4, -28.6],
  mouthSize: 2.6,
  sweat: [-11, -41],
};

const TREAD_FRAMES = 3;
const BOIL = BOIL_FRAMES;

export const pencilDesign: Design = {
  kind: 'pencil',
  frame: [-30, -50, 34, 4],
  parts: [
    shadowPart(25),
    {
      name: 'treads',
      box: [-28, -16, 28, 3],
      pivot: [0, -6],
      boil: 2,
      frames: Object.fromEntries(
        Array.from({ length: TREAD_FRAMES }, (_, f) => [
          `roll${f}`,
          ({ pen }) => {
            const j = pen.j;
            const belt = rrect(j, -25, -12.8, 50, 12.8, 6.3);
            pen.paint(belt, { fill: C.tread, depth: 2.2, light: mix(C.tread, '#ffffff', 0.32) });
            // Tread lugs along the top and bottom runs, moving as it rolls.
            const ph = (f / TREAD_FRAMES) * 6;
            const lug = mix(C.tread, '#000000', 0.45);
            for (let x = -20 + ph; x < 21; x += 6) {
              pen.line(x, -12.4, x + 1.4, -10.6, lug, 1.2);
              pen.line(x + 1.4, -0.4, x, -2.2, lug, 1.2);
            }
            for (const x of [-17.5, -8.8, 0, 8.8, 17.5]) {
              pen.paint(ellipse(j, x, -6.3, 3.6, 3.6), { fill: C.wheel, depth: 1.3, lw: 1.5, hatch: false });
              const a = ((f / TREAD_FRAMES) * (Math.PI * 2)) / 3 + x;
              pen.line(
                x - Math.cos(a) * 2.2,
                -6.3 - Math.sin(a) * 2.2,
                x + Math.cos(a) * 2.2,
                -6.3 + Math.sin(a) * 2.2,
                LINE,
                1,
              );
              pen.dot(x, -6.3, 0.95, LINE);
            }
          },
        ]),
      ),
    },
    {
      name: 'hull',
      box: [-30, -27, 26, -8],
      pivot: [0, -16],
      boil: BOIL,
      frames: {
        hull: ({ pen }) => {
          const j = pen.j;
          // The back of the pencil: eraser, then the metal ferrule.
          pen.paint(rrect(j, -27.5, -22.6, 10, 11.8, 3.8), { fill: C.eraser, depth: 2 });
          pen.paint(rrect(j, -19.5, -23.2, 8, 13, 1.2), { fill: C.metal, depth: 2, hatch: false }, () => {
            const crimp = mix(C.metal, '#3a3f48', 0.45);
            pen.line(-17, -23, -17, -10.4, crimp, 1);
            pen.line(-14.4, -23, -14.4, -10.4, crimp, 1);
          });
          // The yellow body, with its hexagonal facets as light and dark bands.
          const body = poly(
            j,
            [
              [-12.2, -22.8],
              [17.5, -22.8],
              [22.8, -19.2],
              [22.8, -14.2],
              [17.5, -10.8],
              [-12.2, -10.8],
            ],
            2.2,
          );
          pen.paint(body, { fill: C.body, depth: 2.6 }, () => {
            pen.ctx.globalAlpha = 0.85;
            pen.ctx.fillStyle = C.hi;
            pen.ctx.fillRect(-13, -20.6, 37, 2.6);
            pen.ctx.globalAlpha = 0.45;
            pen.ctx.fillStyle = C.lo;
            pen.ctx.fillRect(-13, -14.6, 37, 4);
            pen.ctx.globalAlpha = 1;
          });
          // "HB", stamped on the side.
          const ink = mix(C.lo, LINE, 0.35);
          pen.line(5, -18.6, 5, -15, ink, 0.85);
          pen.line(7.3, -18.6, 7.3, -15, ink, 0.85);
          pen.line(5, -16.8, 7.3, -16.8, ink, 0.85);
          pen.stroke(
            curve(j, [
              [9.2, -18.6],
              [11.4, -18],
              [9.4, -16.9],
              [11.7, -15.8],
              [9.2, -15],
            ]),
            ink,
            0.85,
          );
          pen.line(9.2, -18.6, 9.2, -15, ink, 0.85);
        },
      },
    },
    {
      name: 'turret',
      parent: 'hull',
      box: [-19, -52, 17, -19],
      pivot: [-1, -22],
      boil: BOIL,
      frames: {
        turret: ({ pen }) => {
          const j = pen.j;
          // An eraser knob for a hatch handle.
          pen.paint(rrect(j, -6.2, -48.6, 7.6, 6, 2.6), { fill: C.eraser, depth: 1.5, lw: 1.9 });
          const dome = poly(
            j,
            [
              [-15.6, -21],
              [-15.6, -34],
              [-9.8, -44.2],
              [5.6, -44.6],
              [13.4, -37],
              [14, -21],
            ],
            7.5,
          );
          pen.paint(dome, { fill: C.body, depth: 3.2 }, () => {
            pen.ctx.globalAlpha = 0.35;
            pen.ctx.fillStyle = C.lo;
            pen.ctx.fillRect(-17, -24, 34, 4);
            pen.ctx.globalAlpha = 1;
          });
        },
      },
    },
    {
      name: 'barrel',
      parent: 'turret',
      behind: true,
      box: [m.x - 6, m.y - 6, m.x + m.length + 3, m.y + 6],
      pivot: [m.x, m.y],
      boil: BOIL,
      frames: {
        barrel: ({ pen }) => {
          const j = pen.j;
          const x0 = m.x - 4;
          const y = m.y;
          const L = m.length;
          const cone = x0 + L - 6;
          const shaft = poly(
            j,
            [
              [x0, y - 3.2],
              [cone, y - 3.2],
              [cone, y + 3.2],
              [x0, y + 3.2],
            ],
            1,
          );
          pen.paint(shaft, { fill: C.body, depth: 1.5, hatch: false, lw: 2 }, () => {
            pen.ctx.fillStyle = C.hi;
            pen.ctx.fillRect(x0, y - 2.2, L, 1.5);
            pen.ctx.globalAlpha = 0.5;
            pen.ctx.fillStyle = C.lo;
            pen.ctx.fillRect(x0, y + 1, L, 2.4);
            pen.ctx.globalAlpha = 1;
          });
          // Sharpened wood, scalloped where the blade cut it, and the lead tip.
          const wood = poly(
            j,
            [
              [cone, y - 3.2],
              [cone + 2, y - 1.6],
              [cone, y],
              [cone + 2, y + 1.6],
              [cone, y + 3.2],
              [m.x + L - 1.6, y + 1],
              [m.x + L - 1.6, y - 1],
            ],
            0.5,
          );
          pen.paint(wood, { fill: C.wood, depth: 1, hatch: false, lw: 1.6 });
          pen.flat(
            poly(
              j,
              [
                [m.x + L - 4.6, y - 1.7],
                [m.x + L + 1.2, y],
                [m.x + L - 4.6, y + 1.7],
              ],
              0.4,
            ),
            C.lead,
            1.2,
          );
        },
      },
    },
    ...scarfParts({
      parent: 'turret',
      knot: [-14.6, -22.6],
      band: [
        [-16.2, -24.6],
        [14.2, -24.6],
        [14.4, -20.6],
        [-16.4, -20.6],
      ],
      length: 15,
    }),
    ...faceParts(face),
  ],
  pose(i) {
    const p: Pose = {};
    const rc = recoil(i);
    const walk = walking(i);
    const b = breathe(i, 0.016);
    const sh = shake(i);
    const lift = hop(i, 8);
    const rumble = walk && !i.calm ? Math.sin(i.t * 38) * 0.45 : 0;
    shadowPose(p, lift);
    p.treads = { frame: `roll${walk ? Math.floor(i.t * 14) % TREAD_FRAMES : 0}`, y: lift };
    p.hull = {
      frame: 'hull',
      x: sh,
      y: lift + rumble,
      sx: b.sx * (1 + rc * 0.05),
      sy: b.sy * (1 - rc * 0.06),
    };
    const tremble = i.mood === 'charge' && !i.calm ? Math.sin(i.t * 55) * 0.012 * i.power : 0;
    p.turret = { frame: 'turret', rot: -rc * 0.07 + tremble, y: -Math.max(0, rc) * 0.6 };
    p.barrel = { frame: 'barrel', ...barrelPose(i) };
    scarfPose(i, p, walk ? 1 : 0);
    facePose(face, i, p);
    return p;
  },
};
