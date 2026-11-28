import { LINE, curve, ellipse, mix, poly, type Pen, type Pt } from '../kit';
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

/** Ink Squid: a violet ink-drop of a squid, holding a fountain pen. */

const C = {
  body: '#8360dc',
  spot: '#a98ff3',
  sucker: '#e3d8ff',
  pen: '#2b2d3c',
  gold: '#e7bd4f',
};

const m = mountOf('squid');

const face: FaceSpec = {
  parent: 'mantle',
  eyes: [
    [-3.4, -24.4],
    [5.8, -24.4],
  ],
  eyeSize: [
    [4.3, 5.2],
    [4.8, 5.8],
  ],
  lid: C.body,
  brows: true,
  mouth: [2.8, -14.8],
  mouthSize: 2.6,
  sweat: [-12, -36],
};

const WAVES = 4;

/** A tentacle along a curve, wide at the root and tapering to a curl. */
function tentacle(pen: Pen, pts: Pt[], w0: number, fill: string, suckers: boolean): void {
  const n = 16;
  const sample = (u: number): Pt => {
    const f = u * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const t = f - i;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    const cr = (a: number, b: number, c: number, d: number) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const [x, y] = sample(u);
    const [x2, y2] = sample(Math.min(1, u + 0.01));
    const [x1, y1] = sample(Math.max(0, u - 0.01));
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - u * 0.78);
    left.push([x - (dy / len) * w, y + (dx / len) * w]);
    right.unshift([x + (dy / len) * w, y - (dx / len) * w]);
  }
  pen.paint(poly(pen.j, [...left, ...right], 1), { fill, depth: 1.8, lw: 1.9 });
  if (suckers) {
    for (const u of [0.35, 0.55, 0.72]) {
      const [x, y] = sample(u);
      pen.dot(x + 0.8, y, 0.9 * (1.2 - u), C.sucker);
    }
  }
}

function tentacleSet(front: boolean, f: number): (p: { pen: Pen }) => void {
  return ({ pen }) => {
    const ph = (f / WAVES) * Math.PI * 2;
    const sway = (k: number, amp: number) => Math.sin(ph + k) * amp;
    const dark = mix(C.body, '#2a1650', 0.25);
    if (!front) {
      tentacle(
        pen,
        [
          [-9, -12],
          [-12 + sway(0, 1), -6],
          [-16 + sway(0.5, 1.6), -1.5],
          [-19 + sway(1, 2), -4],
        ],
        2.8,
        dark,
        false,
      );
      tentacle(
        pen,
        [
          [2, -11],
          [1 + sway(2, 1), -5],
          [-1 + sway(2.5, 1.5), -0.5],
          [-4 + sway(3, 2), -2.5],
        ],
        2.6,
        dark,
        false,
      );
      return;
    }
    tentacle(
      pen,
      [
        [-5, -11],
        [-7 + sway(1.2, 1), -5],
        [-10 + sway(1.7, 1.5), -0.8],
        [-13 + sway(2.2, 2), -3],
      ],
      2.9,
      C.body,
      true,
    );
    tentacle(
      pen,
      [
        [5, -11],
        [6 + sway(2.4, 1), -5],
        [8 + sway(2.9, 1.5), -0.8],
        [12 + sway(3.4, 2), -2.2],
      ],
      2.9,
      C.body,
      true,
    );
    tentacle(
      pen,
      [
        [11, -13],
        [14 + sway(3.6, 1), -8],
        [18 + sway(4.1, 1.4), -4.5],
        [21 + sway(4.6, 1.8), -7.5],
      ],
      2.5,
      C.body,
      true,
    );
  };
}

export const squidDesign: Design = {
  kind: 'squid',
  frame: [-26, -58, 34, 4],
  parts: [
    shadowPart(20),
    {
      name: 'tentaclesB',
      box: [-25, -17, 8, 3],
      pivot: [0, -10],
      boil: 1,
      frames: Object.fromEntries(
        Array.from({ length: WAVES }, (_, f) => [`wave${f}`, tentacleSet(false, f)]),
      ),
    },
    {
      name: 'mantle',
      box: [-23, -60, 23, -6],
      pivot: [0, -16],
      boil: BOIL_FRAMES,
      frames: {
        mantle: ({ pen }) => {
          const j = pen.j;
          // The fins make an arrowhead around the tip, tucked behind the mantle.
          const fin = mix(C.body, '#2a1650', 0.12);
          pen.paint(
            poly(
              j,
              [
                [0, -57],
                [-19, -42.5],
                [0, -35],
                [19, -42.5],
              ],
              3.2,
            ),
            { fill: fin, depth: 1.6, lw: 2 },
          );
          const body = poly(
            j,
            [
              [0, -52],
              [8, -46.5],
              [14, -36],
              [16, -24.5],
              [14.4, -14.6],
              [9, -10],
              [0, -9],
              [-9, -10],
              [-14.4, -14.6],
              [-16, -24.5],
              [-14, -36],
              [-8, -46.5],
            ],
            7,
          );
          pen.paint(body, { fill: C.body, depth: 3.4 }, () => {
            for (const [x, y, r] of [
              [-6.5, -42.5, 2.3],
              [3.5, -46, 1.6],
              [8.6, -39.5, 1.5],
              [-11, -33.5, 1.2],
            ] as const) {
              pen.flat(ellipse(j, x, y, r, r * 0.9), C.spot, 0);
            }
          });
          // A wet highlight on the dome.
          pen.stroke(
            curve(j, [
              [-10.5, -32],
              [-9.5, -39],
              [-5, -45],
            ]),
            'rgba(255,255,255,0.75)',
            1.6,
          );
        },
      },
    },
    {
      name: 'pen',
      parent: 'mantle',
      behind: true,
      box: [m.x - 7, m.y - 6, m.x + m.length + 3, m.y + 6],
      pivot: [m.x, m.y],
      boil: 2,
      frames: {
        pen: ({ pen }) => {
          const j = pen.j;
          const x0 = m.x - 5;
          const y = m.y;
          const L = m.length;
          const body = poly(
            j,
            [
              [x0, y - 3],
              [x0 + L - 9, y - 3],
              [x0 + L - 6, y - 2],
              [x0 + L - 6, y + 2],
              [x0 + L - 9, y + 3],
              [x0, y + 3],
            ],
            1.6,
          );
          pen.paint(body, { fill: C.pen, depth: 1.4, hatch: false, light: '#6b6f8c', lw: 1.9 }, () => {
            pen.ctx.fillStyle = C.gold;
            pen.ctx.fillRect(x0 + L * 0.45, y - 3.2, 2.2, 6.4);
          });
          // The nib, with its slit and breather hole.
          const nib = poly(
            j,
            [
              [x0 + L - 6.5, y - 2.4],
              [m.x + L + 0.8, y],
              [x0 + L - 6.5, y + 2.4],
            ],
            0.6,
          );
          pen.paint(nib, { fill: C.gold, depth: 0.8, hatch: false, lw: 1.5 });
          pen.line(x0 + L - 3, y, m.x + L, y, LINE, 0.7);
          pen.dot(x0 + L - 3.4, y, 0.7, LINE);
        },
      },
    },
    ...scarfParts({
      parent: 'mantle',
      knot: [-14.4, -32.6],
      band: [
        [-15.2, -35.4],
        [14.6, -34.8],
        [15.6, -30.4],
        [-15.8, -31],
      ],
      length: 15,
    }),
    ...faceParts(face),
    {
      name: 'tentaclesF',
      box: [-18, -17, 26, 3],
      pivot: [0, -10],
      boil: 1,
      frames: Object.fromEntries(Array.from({ length: WAVES }, (_, f) => [`wave${f}`, tentacleSet(true, f)])),
    },
  ],
  pose(i) {
    const p: Pose = {};
    const rc = recoil(i);
    const walk = walking(i);
    const b = breathe(i, 0.035);
    const sh = shake(i, 2);
    const lift = hop(i, 10);
    // Squids scoot: a squash and a little bounce each stroke.
    const stroke = walk && !i.calm ? Math.abs(Math.sin(i.t * 9)) : 0;
    shadowPose(p, lift - stroke * 2);
    const speed = walk ? 12 : i.mood === 'charge' ? 9 : 4;
    const wave = `wave${Math.floor(i.t * speed + i.seed) % WAVES}`;
    p.tentaclesB = { frame: wave, y: lift * 0.6 };
    p.tentaclesF = { frame: wave, y: lift * 0.6 };
    p.mantle = {
      frame: 'mantle',
      x: sh,
      y: lift - stroke * 2.2,
      sx: b.sx * (1 + rc * 0.07) * (1 + stroke * 0.04),
      sy: b.sy * (1 - rc * 0.08) * (1 - stroke * 0.05),
      rot: rc * 0.04 + (walk ? Math.sin(i.t * 9) * 0.03 : 0),
    };
    p.pen = { frame: 'pen', ...barrelPose(i, 3) };
    scarfPose(i, p, walk ? 1 : 0);
    facePose(face, i, p);
    return p;
  },
};
