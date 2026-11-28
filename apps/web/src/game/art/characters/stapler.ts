import { LINE, ellipse, mix, poly, rrect, type Pen } from '../kit';
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

/** Stapler Mech: a mint office stapler on two stubby legs, with a staple cannon on its back. */

const C = {
  body: '#2fb497',
  metal: '#cfd5db',
  dark: '#4a5059',
  rubber: '#3a3f46',
};

const m = mountOf('stapler');

const face: FaceSpec = {
  parent: 'head',
  eyes: [
    [4.2, -30.2],
    [11.8, -29.8],
  ],
  eyeSize: [
    [3.5, 4.2],
    [4, 4.7],
  ],
  lid: C.body,
  brows: true,
  sweat: [20, -40],
};

function leg(pen: Pen, x: number, back: boolean): void {
  const j = pen.j;
  const tone = back ? mix(C.dark, '#000000', 0.25) : C.dark;
  pen.paint(rrect(j, x - 3.4, -17, 6.8, 13.5, 3.2), { fill: tone, depth: 1.6, hatch: false, lw: 2 });
  pen.paint(ellipse(j, x, -10, 2.3, 2.3), { fill: '#7d858f', depth: 0.8, hatch: false, lw: 1.4 });
  pen.paint(rrect(j, x - 7, -5, 15, 5, 2.2), {
    fill: back ? mix(C.rubber, '#000', 0.2) : C.rubber,
    depth: 1.3,
    lw: 2,
  });
}

export const staplerDesign: Design = {
  kind: 'stapler',
  frame: [-32, -50, 32, 4],
  parts: [
    shadowPart(23),
    {
      name: 'legB',
      box: [-16, -20, 2, 2],
      pivot: [-7, -15],
      boil: 2,
      frames: { leg: ({ pen }) => leg(pen, -7, true) },
    },
    {
      name: 'base',
      box: [-28, -26, 26, -12],
      pivot: [0, -17],
      boil: BOIL_FRAMES,
      frames: {
        base: ({ pen }) => {
          const j = pen.j;
          pen.paint(rrect(j, -24.5, -21.6, 47.5, 8, 3), { fill: C.body, depth: 2.2 }, () => {
            pen.ctx.fillStyle = C.rubber;
            pen.ctx.fillRect(-25, -16.2, 49, 3);
          });
          // The anvil plate at the front, and the hinge at the back.
          pen.paint(rrect(j, 9, -22.6, 14, 2.6, 1), { fill: C.metal, depth: 0.8, hatch: false, lw: 1.5 });
          pen.paint(ellipse(j, -20.5, -21.5, 3.4, 3.4), { fill: C.metal, depth: 1, hatch: false, lw: 1.7 });
          pen.dot(-20.5, -21.5, 1, LINE);
        },
      },
    },
    {
      name: 'head',
      parent: 'base',
      box: [-28, -44, 30, -18],
      pivot: [-20.5, -22],
      boil: BOIL_FRAMES,
      frames: {
        head: ({ pen }) => {
          const j = pen.j;
          const top = poly(
            j,
            [
              [-25, -22.6],
              [-23, -33.6],
              [-15, -38.6],
              [16, -37.2],
              [24.2, -31.2],
              [26, -24.6],
              [21, -22.4],
            ],
            4.5,
          );
          pen.paint(top, { fill: C.body, depth: 3 }, () => {
            // The steel cap along the top.
            pen.ctx.fillStyle = C.metal;
            pen.ctx.beginPath();
            pen.ctx.moveTo(-14, -39.4);
            pen.ctx.lineTo(16.6, -38);
            pen.ctx.lineTo(23.4, -32.4);
            pen.ctx.lineTo(16, -34.6);
            pen.ctx.lineTo(-12, -35.6);
            pen.ctx.closePath();
            pen.ctx.fill();
            pen.ctx.fillStyle = mix(C.body, '#000000', 0.25);
            pen.ctx.fillRect(-26, -24.4, 52, 2.2);
          });
          pen.line(-13.6, -35.7, 16, -34.7, mix(C.metal, LINE, 0.5), 1);
          // Staples peeking out of the jaw like teeth.
          for (const x of [13, 16.6, 20.2]) {
            pen.paint(rrect(j, x, -23.2, 2.6, 2.8, 0.5), {
              fill: C.metal,
              depth: 0.5,
              hatch: false,
              lw: 1.1,
            });
          }
        },
      },
    },
    {
      name: 'cannon',
      parent: 'head',
      behind: true,
      box: [m.x - 9, m.y - 8, m.x + m.length + 3, m.y + 8],
      pivot: [m.x, m.y],
      boil: 2,
      frames: {
        cannon: ({ pen }) => {
          const j = pen.j;
          const x0 = m.x - 6;
          const x1 = m.x + m.length;
          const y = m.y;
          pen.paint(
            rrect(j, x0, y - 4.4, x1 - x0 - 3, 8.8, 2),
            { fill: C.dark, depth: 1.8, light: '#7d8591', lw: 2 },
            () => {
              pen.ctx.fillStyle = C.body;
              pen.ctx.fillRect(x0, y - 1.2, x1 - x0, 2.4);
            },
          );
          pen.paint(rrect(j, x1 - 5, y - 5.4, 5.4, 10.8, 1.6), {
            fill: C.metal,
            depth: 1,
            hatch: false,
            lw: 1.8,
          });
          pen.dot(x1 - 2.3, y, 1.6, LINE);
        },
      },
    },
    ...scarfParts({
      parent: 'head',
      knot: [-22.4, -27],
      band: [
        [-26, -30.6],
        [-18.4, -31.4],
        [-17.6, -24],
        [-25.6, -23.4],
      ],
      length: 14,
    }),
    ...faceParts(face),
    {
      name: 'legF',
      box: [-2, -20, 16, 2],
      pivot: [7, -15],
      boil: 2,
      frames: { leg: ({ pen }) => leg(pen, 7, false) },
    },
  ],
  pose(i) {
    const p: Pose = {};
    const rc = recoil(i);
    const walk = walking(i);
    const b = breathe(i, 0.014);
    const sh = shake(i, 1.4);
    const lift = hop(i, 6);
    const step = walk && !i.calm ? i.t * 8 : 0;
    const bob = walk && !i.calm ? -Math.abs(Math.sin(step)) * 1.6 : 0;
    shadowPose(p, lift);
    p.legB = {
      frame: 'leg',
      y: lift + (walk ? -Math.max(0, -Math.sin(step)) * 2.4 : 0),
      rot: walk ? -Math.sin(step) * 0.18 : 0,
    };
    p.legF = {
      frame: 'leg',
      y: lift + (walk ? -Math.max(0, Math.sin(step)) * 2.4 : 0),
      rot: walk ? Math.sin(step) * 0.18 : 0,
    };
    p.base = { frame: 'base', x: sh, y: lift + bob, sx: b.sx * (1 + rc * 0.04), sy: b.sy * (1 - rc * 0.05) };
    // The jaw: it snaps open to fire and grins in victory.
    const jaw =
      i.mood === 'fire'
        ? -0.3 * Math.max(0, rc)
        : i.mood === 'victory'
          ? -0.1 - Math.abs(Math.sin(i.t * 6)) * 0.08
          : i.mood === 'hurt'
            ? -0.07
            : i.mood === 'charge'
              ? i.calm
                ? 0
                : Math.sin(i.t * 40) * 0.01 * i.power
              : 0;
    p.head = { frame: 'head', rot: jaw };
    p.cannon = { frame: 'cannon', ...barrelPose(i, 3) };
    scarfPose(i, p, walk ? 1 : 0);
    facePose(face, i, p);
    return p;
  },
};
