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

/** Highlighter: a neon marker on a sniper's tripod, with a visor and a chisel-tip emitter. */

const C = {
  body: '#c6f03a',
  cap: '#30343c',
  visor: '#1b2a34',
  glass: '#69d2ea',
  glow: '#e4ff4d',
  leg: '#3c4048',
};

const m = mountOf('highlighter');

const face: FaceSpec = {
  parent: 'body',
  eyes: [
    [2.6, -29.2],
    [8, -29.2],
  ],
  eyeSize: [
    [2.1, 2.7],
    [2.3, 2.9],
  ],
  lid: C.visor,
  visor: { glow: C.glow },
  sweat: [13.5, -41],
};

const STEPS = 3;

export const highlighterDesign: Design = {
  kind: 'highlighter',
  frame: [-26, -52, 36, 4],
  parts: [
    shadowPart(17),
    {
      name: 'legs',
      box: [-18, -18, 18, 2],
      pivot: [0, -12],
      boil: 2,
      frames: Object.fromEntries(
        Array.from({ length: STEPS }, (_, f) => [
          `step${f}`,
          ({ pen }) => {
            const ph = (f / STEPS) * Math.PI * 2;
            const fb = Math.sin(ph) * 2;
            const ff = Math.sin(ph + Math.PI) * 2;
            const back = mix(C.leg, '#000000', 0.25);
            // The middle leg sits behind the other two.
            pen.line(0, -13, 1.5, -1, back, 2.4);
            pen.line(-3, -13.5, -12 + fb, -1.4, C.leg, 2.6);
            pen.line(3, -13.5, 12 + ff, -1.4, C.leg, 2.6);
            for (const [x, y] of [
              [-3, -13.5],
              [3, -13.5],
            ] as const) {
              pen.paint(ellipse(pen.j, x, y, 2.3, 2.3), {
                fill: '#9aa1ac',
                depth: 0.8,
                hatch: false,
                lw: 1.4,
              });
            }
            for (const x of [-12 + fb, 12 + ff]) {
              pen.paint(ellipse(pen.j, x, -1.2, 3.2, 1.5), {
                fill: C.leg,
                depth: 0.6,
                hatch: false,
                lw: 1.4,
              });
            }
          },
        ]),
      ),
    },
    {
      name: 'body',
      box: [-15, -46, 15, -6],
      pivot: [0, -16],
      boil: BOIL_FRAMES,
      frames: {
        body: ({ pen }) => {
          const j = pen.j;
          const body = rrect(j, -10.8, -42, 21.6, 32, 9.5);
          pen.paint(body, { fill: C.body, depth: 3, shade: '#8fb71c', light: '#f4ffb8' }, () => {
            // A dark rubber grip, with ridges.
            pen.ctx.fillStyle = C.cap;
            pen.ctx.fillRect(-12, -15, 24, 6);
            pen.ctx.strokeStyle = mix(C.cap, '#ffffff', 0.2);
            pen.ctx.lineWidth = 0.8;
            for (let x = -8; x <= 8; x += 3.2) {
              pen.ctx.beginPath();
              pen.ctx.moveTo(x, -14.2);
              pen.ctx.lineTo(x, -10.6);
              pen.ctx.stroke();
            }
          });
          pen.line(-11, -15, 11, -15, LINE, 1.4);
          // The visor.
          const visor = rrect(j, -3.6, -33.6, 15.2, 8.8, 3);
          pen.paint(visor, { fill: C.visor, depth: 1.4, hatch: false, light: '#3d5866', lw: 1.9 }, () => {
            pen.stroke(
              curve(j, [
                [-1.5, -31.6],
                [3, -32.4],
                [6, -32.2],
              ]),
              C.glass,
              1,
            );
          });
          // A label with a lightning bolt on the side.
          pen.paint(
            rrect(j, -8.6, -24.6, 8.4, 6, 1.4),
            { fill: '#fbfbf5', depth: 0.8, hatch: false, lw: 1.3 },
            () => {
              pen.flat(
                poly(j, [
                  [-4, -24],
                  [-6.4, -21.2],
                  [-4.6, -21.2],
                  [-5.6, -18.8],
                  [-2.6, -22.2],
                  [-4.4, -22.2],
                ]),
                C.body,
                0.6,
              );
            },
          );
        },
      },
    },
    {
      name: 'cap',
      parent: 'body',
      box: [-17, -54, 15, -34],
      pivot: [0, -40],
      boil: BOIL_FRAMES,
      frames: {
        cap: ({ pen }) => {
          const j = pen.j;
          // The pocket clip makes a sniper's fin down the back.
          pen.paint(
            poly(
              j,
              [
                [-10, -48],
                [-14.4, -46.5],
                [-15.6, -36],
                [-12.4, -36.6],
                [-12, -44],
              ],
              1.2,
            ),
            { fill: '#9aa1ac', depth: 1, hatch: false, lw: 1.7 },
          );
          pen.paint(ellipse(j, -14, -35.4, 2.2, 2.2), { fill: '#9aa1ac', depth: 0.7, hatch: false, lw: 1.4 });
          const cap = poly(
            j,
            [
              [-11.6, -37],
              [-11.6, -46],
              [-6, -51],
              [6, -51],
              [11.6, -46],
              [11.6, -37],
            ],
            5,
          );
          pen.paint(cap, { fill: C.cap, depth: 2.4, light: '#646a76' }, () => {
            pen.ctx.fillStyle = C.body;
            pen.ctx.fillRect(-12, -39.6, 24, 1.8);
          });
        },
      },
    },
    ...scarfParts({
      parent: 'body',
      knot: [-10.8, -35.6],
      band: [
        [-11.6, -37.6],
        [11.6, -37.6],
        [11.8, -34],
        [-11.8, -34],
      ],
      length: 15,
    }),
    ...faceParts(face),
    {
      name: 'emitter',
      parent: 'body',
      box: [m.x - 8, m.y - 7, m.x + m.length + 4, m.y + 7],
      pivot: [m.x, m.y],
      boil: 2,
      frames: {
        emitter: ({ pen }) => {
          const j = pen.j;
          const x0 = m.x - 5;
          const y = m.y;
          const tipX = m.x + m.length;
          // A grip block, a neon barrel, and the chisel tip it fires from.
          pen.paint(rrect(j, x0, y - 4, 8, 8, 2), { fill: C.cap, depth: 1.2, hatch: false, lw: 1.8 });
          pen.paint(
            rrect(j, x0 + 6, y - 2.9, tipX - x0 - 12, 5.8, 2.2),
            { fill: C.body, depth: 1.3, hatch: false, shade: '#8fb71c', lw: 1.8 },
            () => {
              pen.ctx.fillStyle = C.cap;
              pen.ctx.fillRect(tipX - 12, y - 3, 1.6, 6);
            },
          );
          const tip = poly(
            j,
            [
              [tipX - 6.4, y - 2.6],
              [tipX - 0.2, y - 2.6],
              [tipX + 1.2, y + 2.4],
              [tipX - 6.4, y + 2.6],
            ],
            0.7,
          );
          pen.paint(tip, { fill: C.glow, depth: 0.8, hatch: false, lw: 1.6 });
          pen.ctx.save();
          pen.ctx.shadowColor = C.glow;
          pen.ctx.shadowBlur = 5;
          pen.dot(tipX + 0.4, y, 1.1, '#ffffff');
          pen.ctx.restore();
        },
      },
    },
  ],
  pose(i) {
    const p: Pose = {};
    const rc = recoil(i);
    const walk = walking(i);
    const b = breathe(i, 0.014);
    const sh = shake(i, 1.6);
    const lift = hop(i, 8);
    shadowPose(p, lift);
    p.legs = { frame: `step${walk ? Math.floor(i.t * 12) % STEPS : 0}`, y: lift };
    // Steady as a sniper; firing kicks it back on its tripod.
    p.body = {
      frame: 'body',
      x: sh - Math.max(0, rc) * 1.2,
      y: lift + (walk && !i.calm ? -Math.abs(Math.sin(i.t * 12)) * 0.9 : 0),
      rot: -rc * 0.07 + (i.calm ? 0 : Math.sin(i.t * 1.3 + i.seed) * 0.012),
      sx: b.sx,
      sy: b.sy,
    };
    p.cap = { frame: 'cap', y: -Math.max(0, rc) * 0.8 };
    p.emitter = { frame: 'emitter', ...barrelPose(i, 4) };
    scarfPose(i, p, walk ? 1 : 0);
    facePose(face, i, p);
    return p;
  },
};
