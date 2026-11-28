import { LINE, Shape, curve, ellipse, mix, poly, rrect } from '../kit';
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

/** Glue Blob: a dollop of school glue wearing the bottle's orange nozzle as a hat. */

const C = {
  glue: '#f8f4ea',
  shade: '#cbc7df',
  cap: '#f28a2b',
  cheek: '#f5a3b4',
};

const m = mountOf('glue');

const face: FaceSpec = {
  parent: 'body',
  eyes: [
    [-3.6, -22.4],
    [6.4, -22.4],
  ],
  eyeSize: [
    [4.4, 5.3],
    [4.8, 5.8],
  ],
  lid: C.glue,
  brows: true,
  mouth: [2.6, -12.2],
  mouthSize: 3,
  sweat: [14, -30],
};

export const glueDesign: Design = {
  kind: 'glue',
  frame: [-27, -56, 33, 4],
  parts: [
    shadowPart(22),
    {
      name: 'nozzle',
      parent: 'body',
      behind: true,
      box: [m.x - 7, m.y - 6, m.x + m.length + 4, m.y + 8],
      pivot: [m.x, m.y],
      boil: 2,
      frames: {
        nozzle: ({ pen }) => {
          const j = pen.j;
          const x0 = m.x - 5;
          const tipX = m.x + m.length;
          const y = m.y;
          pen.paint(rrect(j, x0, y - 3, tipX - x0 - 7, 6, 2.4), {
            fill: C.glue,
            depth: 1.4,
            shade: C.shade,
            hatch: false,
            lw: 1.9,
          });
          const cone = poly(
            j,
            [
              [tipX - 8, y - 3.4],
              [tipX + 0.5, y - 1],
              [tipX + 0.5, y + 1],
              [tipX - 8, y + 3.4],
            ],
            0.8,
          );
          pen.paint(cone, { fill: C.cap, depth: 1, hatch: false, lw: 1.7 });
          // A drip hanging off the tip.
          const drip = new Shape(j);
          drip
            .moveTo(tipX - 1.6, y + 0.8)
            .quadTo(tipX - 0.2, y + 4.8, tipX - 1.4, y + 5.6)
            .quadTo(tipX - 3, y + 4.6, tipX - 1.6, y + 0.8)
            .close();
          pen.flat(drip, C.glue, 1.2);
        },
      },
    },
    {
      name: 'body',
      box: [-26, -42, 27, 4],
      pivot: [0, -16],
      boil: BOIL_FRAMES,
      frames: {
        body: ({ pen }) => {
          const j = pen.j;
          const body = poly(
            j,
            [
              [-22, 0.6],
              [-18.6, -4.2],
              [-16.2, -13],
              [-14.6, -24],
              [-9.2, -33.4],
              [0.4, -37],
              [9.6, -34.2],
              [14.4, -26],
              [16.2, -14.6],
              [19.2, -4.4],
              [23, 0.2],
              [10, 1.2],
              [-10, 1.2],
            ],
            6.5,
          );
          pen.paint(body, { fill: C.glue, depth: 3.4, shade: C.shade, light: '#ffffff' });
          // A drip running down one side.
          pen.paint(ellipse(j, -17.2, -7.6, 2.4, 3.2), {
            fill: C.glue,
            depth: 1,
            shade: C.shade,
            hatch: false,
            lw: 1.7,
          });
          // A glossy shine, and rosy cheeks.
          pen.ctx.save();
          pen.ctx.globalAlpha = 0.95;
          pen.flat(ellipse(j, -7.4, -28.6, 2.6, 4.6, 0.6), '#ffffff', 0);
          pen.dot(-3.4, -32.4, 1.2, '#ffffff');
          pen.ctx.globalAlpha = 0.55;
          pen.flat(ellipse(j, -9.8, -15.2, 2.8, 1.7), C.cheek, 0);
          pen.flat(ellipse(j, 14, -15.2, 2.4, 1.6), C.cheek, 0);
          pen.ctx.restore();
          pen.stroke(
            curve(j, [
              [-12, -2.6],
              [-6, -1.4],
              [-2, -2.2],
            ]),
            mix(C.shade, LINE, 0.25),
            1,
          );
        },
      },
    },
    {
      name: 'cap',
      parent: 'body',
      box: [-12, -58, 13, -31],
      pivot: [0.6, -35.4],
      boil: BOIL_FRAMES,
      frames: {
        cap: ({ pen }) => {
          const j = pen.j;
          const cone = poly(
            j,
            [
              [-8.2, -35.2],
              [-6.4, -41],
              [1.6, -54.6],
              [3.8, -54.2],
              [7, -41],
              [9.2, -35.6],
            ],
            1.6,
          );
          pen.paint(cone, { fill: C.cap, depth: 2.2 }, () => {
            pen.ctx.strokeStyle = mix(C.cap, '#000000', 0.25);
            pen.ctx.lineWidth = 0.8;
            for (const y of [-44, -47.4, -50.6]) {
              pen.ctx.beginPath();
              pen.ctx.moveTo(-10, y);
              pen.ctx.lineTo(12, y + 0.3);
              pen.ctx.stroke();
            }
          });
          pen.paint(rrect(j, -10, -37.6, 20.6, 4.2, 2), { fill: C.cap, depth: 1.2, hatch: false, lw: 1.9 });
        },
      },
    },
    ...scarfParts({
      parent: 'cap',
      knot: [-8.4, -39.6],
      band: [
        [-8, -41.8],
        [7.6, -41.4],
        [8.2, -38],
        [-8.6, -38.2],
      ],
      length: 12,
    }),
    ...faceParts(face),
  ],
  pose(i) {
    const p: Pose = {};
    const rc = recoil(i);
    const walk = walking(i);
    const b = breathe(i, 0.045);
    const sh = shake(i, 1.8);
    const lift = hop(i, 10);
    // Jelly: it squashes as it hops along, and wobbles after a shot.
    const phase = walk && !i.calm ? i.t * 8 : 0;
    const bounce = walk ? Math.abs(Math.sin(phase)) : 0;
    const wob = i.mood === 'fire' ? rc : 0;
    shadowPose(p, lift - bounce * 3);
    p.body = {
      frame: 'body',
      x: sh,
      y: lift - bounce * 3,
      sx: b.sx * (1 + wob * 0.1) * (1 - bounce * 0.05 + (1 - bounce) * 0.03 * (walk ? 1 : 0)),
      sy: b.sy * (1 - wob * 0.12) * (1 + bounce * 0.06 - (1 - bounce) * 0.04 * (walk ? 1 : 0)),
    };
    p.cap = {
      frame: 'cap',
      rot: 0.12 + (i.calm ? 0 : Math.sin(i.t * 3.1 + i.seed) * 0.05) - wob * 0.12 + bounce * 0.06,
    };
    p.nozzle = { frame: 'nozzle', ...barrelPose(i, 3) };
    scarfPose(i, p, walk ? 1 : 0);
    facePose(face, i, p);
    return p;
  },
};
