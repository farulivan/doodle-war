import { LINE, ellipse, mix, poly, rrect } from '../kit';
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

/** Paper Plane: folded from a page of the notebook itself, with a long aviator's scarf. */

const C = {
  paper: '#fbfaf3',
  fold: '#e6e4da',
  rule: '#9fc3e6',
  margin: '#e58b8b',
  wheel: '#d3d6dd',
};

const m = mountOf('plane');

// The fold runs from the nose to the back of the keel.
const NOSE: [number, number] = [28, -19.2];
const FOLD: [number, number] = [-17, -23.6];
const WING: [number, number] = [-23, -35.5];
const KEEL: [number, number] = [-5, -7.6];

const face: FaceSpec = {
  parent: 'body',
  eyes: [
    [4.2, -16.8],
    [11, -16.4],
  ],
  eyeSize: [
    [3, 3.6],
    [3.3, 3.9],
  ],
  lid: C.fold,
  brows: false,
  mouth: [17.6, -15.4],
  mouthSize: 1.8,
  sweat: [-6, -30],
};

export const planeDesign: Design = {
  kind: 'plane',
  frame: [-30, -46, 34, 4],
  parts: [
    shadowPart(21),
    {
      name: 'gear',
      box: [-8, -16, 19, 1],
      pivot: [5, -6],
      boil: 2,
      frames: {
        gear: ({ pen }) => {
          const j = pen.j;
          pen.line(-0.5, -11, -2, -4, LINE, 1.8);
          pen.line(13.5, -14, 13, -4, LINE, 1.8);
          for (const x of [-2, 13]) {
            pen.paint(ellipse(j, x, -3.7, 3.6, 3.6), { fill: C.wheel, depth: 1.2, lw: 1.6, hatch: false });
            pen.dot(x, -3.7, 1, LINE);
          }
        },
      },
    },
    {
      name: 'tube',
      parent: 'body',
      behind: true,
      box: [m.x - 7, m.y - 6, m.x + m.length + 3, m.y + 6],
      pivot: [m.x, m.y],
      boil: 2,
      frames: {
        tube: ({ pen }) => {
          const j = pen.j;
          const x0 = m.x - 5;
          const x1 = m.x + m.length;
          const y = m.y;
          // A sheet of notebook paper rolled into a launcher.
          pen.paint(
            rrect(j, x0, y - 3.6, x1 - x0, 7.2, 1.4),
            { fill: C.paper, depth: 1.6, hatch: false, lw: 1.9 },
            () => {
              pen.ctx.strokeStyle = C.rule;
              pen.ctx.lineWidth = 0.7;
              for (let x = x0 + 3; x < x1; x += 4.5) {
                pen.ctx.beginPath();
                pen.ctx.moveTo(x, y - 3.6);
                pen.ctx.lineTo(x + 2.2, y + 3.6);
                pen.ctx.stroke();
              }
            },
          );
          pen.flat(ellipse(j, x1 - 0.6, y, 1.4, 3.2), '#4a4552', 1.4);
        },
      },
    },
    {
      name: 'body',
      box: [-27, -44, 31, -3],
      pivot: [0, -18],
      boil: BOIL_FRAMES,
      frames: {
        body: ({ pen }) => {
          const j = pen.j;
          // The keel: the folded-under half, in its own shade.
          const keel = poly(j, [NOSE, FOLD, KEEL], 2.4);
          pen.paint(keel, { fill: C.fold, depth: 2.4, shade: '#c9ccd6' });
          // The wing, ruled like the page it came from.
          const wing = poly(j, [NOSE, WING, FOLD], 2.2);
          pen.paint(wing, { fill: C.paper, depth: 2.6, shade: '#d6dae4' }, () => {
            const ctx = pen.ctx;
            ctx.strokeStyle = C.rule;
            ctx.lineWidth = 0.9;
            for (const k of [0.3, 0.55, 0.8]) {
              ctx.beginPath();
              ctx.moveTo(NOSE[0], NOSE[1]);
              ctx.lineTo(FOLD[0] + (WING[0] - FOLD[0]) * k, FOLD[1] + (WING[1] - FOLD[1]) * k);
              ctx.stroke();
            }
            ctx.strokeStyle = C.margin;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-12, -33);
            ctx.lineTo(-10.8, -22.6);
            ctx.stroke();
          });
          pen.line(NOSE[0] - 2, NOSE[1] + 0.4, FOLD[0] + 2, FOLD[1] + 0.2, mix(C.fold, LINE, 0.5), 1);
        },
      },
    },
    ...scarfParts({ parent: 'body', knot: [-1.5, -20.2], band: null, length: 23 }),
    ...faceParts(face),
  ],
  pose(i) {
    const p: Pose = {};
    const rc = recoil(i);
    const walk = walking(i);
    const b = breathe(i, 0.012);
    const sh = shake(i, 2);
    const lift = hop(i, 11);
    // It sits on springy landing gear: a gentle hover, a nod while taxiing, a kick on firing.
    const hover = i.calm ? 0 : Math.sin(i.t * 2.6 + i.seed) * 0.8;
    const taxi = walk && !i.calm ? Math.sin(i.t * 16) * 0.7 : 0;
    shadowPose(p, lift);
    p.gear = { frame: 'gear', y: lift + (walk ? Math.abs(Math.sin(i.t * 16)) * -0.6 : 0) };
    p.body = {
      frame: 'body',
      x: sh,
      y: lift + hover + taxi,
      rot: -Math.max(0, rc) * 0.12 + (walk ? -0.04 : 0) + (i.mood === 'fly' ? 0.25 : 0),
      sx: b.sx,
      sy: b.sy,
    };
    p.tube = { frame: 'tube', ...barrelPose(i, 3) };
    scarfPose(i, p, walk ? 1.4 : 0.4);
    facePose(face, i, p);
    return p;
  },
};
