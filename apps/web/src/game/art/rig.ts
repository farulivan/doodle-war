import type { UnitKind } from '@doodle/sim';
import { LINE, Pen, Shape, curve, ellipse, mix, poly, type Pt } from './kit';

/**
 * A doodle is a rig: a tree of parts, each a small drawing with a few frames and a few "boil" variants.
 * A pose function says where every part is at a moment in time, from the doodle's mood, its aim and the
 * wind. The battlefield builds Phaser containers from the parts; the menus draw the same parts and poses
 * onto a canvas. Everything is in world units: 1 is one pixel of the battlefield at zoom 1. The rig's
 * origin is the doodle's feet, and it faces right.
 */

export type Box = [number, number, number, number];

export interface Paint {
  pen: Pen;
  /** The team color. Team parts are drawn white for the battlefield, which tints them. */
  team: string;
}

export interface PartDef {
  name: string;
  parent?: string;
  /** Drawn before its parent's own drawing, so it sits behind it. */
  behind?: boolean;
  /** The area the drawing fits in, in rig units at rest. */
  box: Box;
  /** Where the part attaches and turns, in rig units at rest. */
  pivot: Pt;
  frames: Record<string, (p: Paint) => void>;
  /** Takes the team color. */
  team?: boolean;
  /** Boil variants; 1 keeps the line still. */
  boil?: number;
}

export interface PartPose {
  x?: number;
  y?: number;
  rot?: number;
  sx?: number;
  sy?: number;
  frame?: string;
  show?: boolean;
  alpha?: number;
}

export type Pose = Record<string, PartPose>;

export type Mood = 'idle' | 'walk' | 'aim' | 'charge' | 'fire' | 'hurt' | 'victory' | 'dead' | 'fly';

export interface RigInput {
  /** Seconds, on any running clock. */
  t: number;
  mood: Mood;
  /** Seconds since the mood started. */
  moodT: number;
  /** Aim in degrees above forward, as the sim counts it. */
  aim: number;
  /** Where the eyes look, as a direction in rig space; null looks ahead along the aim. */
  look: Pt | null;
  /** Charge, 0 to 1. */
  power: number;
  /** Wind across the doodle, -1 (from its front) to 1 (from behind). */
  wind: number;
  lowHp: boolean;
  /** Offsets idle motion so a team doesn't breathe in step. */
  seed: number;
  /** No boil and smaller motions. */
  calm?: boolean;
}

export interface Design {
  kind: UnitKind;
  parts: PartDef[];
  pose(input: RigInput): Pose;
  /** A box around the whole doodle at rest, for framing portraits. */
  frame: Box;
}

export const BOIL_FRAMES = 3;
/** How far a boil frame moves the line, in world px. */
export const BOIL_AMOUNT = 0.32;

// ---------------------------------------------------------------------------
// Faces. Every doodle has eyes; most have brows and a mouth. Expressions come from frames plus a little
// movement, set by the mood.

export interface FaceSpec {
  parent: string;
  /** Back eye then front eye, in rig units. */
  eyes: [Pt, Pt];
  /** Eye radii: [rx, ry]. The front eye can be a touch bigger, for a three-quarter look. */
  eyeSize: [Pt, Pt];
  /** The skin the eyelids are drawn in. */
  lid: string;
  brows?: boolean;
  mouth?: Pt;
  mouthSize?: number;
  /** Glowing robot eyes instead of googly ones. */
  visor?: { glow: string };
  sweat?: Pt;
}

function eyeWhite(p: Paint, c: Pt, r: Pt, frame: string, lid: string, back: boolean): void {
  const { pen } = p;
  const [cx, cy] = c;
  const [rx, ry] = r;
  if (frame === 'open' || frame === 'squint' || frame === 'wide') {
    const s = ellipse(pen.j, cx, cy, rx, ry);
    pen.ctx.save();
    pen.ctx.fillStyle = '#fffdf8';
    pen.ctx.fill(s.path());
    // A soft shade under the upper lid gives the eye some roundness.
    pen.ctx.clip(s.path());
    pen.ctx.fillStyle = 'rgba(70, 60, 90, 0.18)';
    pen.ctx.fill(ellipse(pen.j, cx - rx * 0.1, cy - ry * 1.25, rx * 1.3, ry * 0.75).path());
    if (frame === 'squint') {
      pen.ctx.fillStyle = lid;
      pen.ctx.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 0.95 + 2);
    }
    pen.ctx.restore();
    pen.outline(s, LINE, 1.8);
    if (frame === 'squint')
      pen.stroke(
        curve(pen.j, [
          [cx - rx - 0.5, cy - ry * 0.05],
          [cx, cy - ry * 0.2],
          [cx + rx + 0.5, cy - ry * 0.12],
        ]),
        LINE,
        2,
      );
    return;
  }
  const w = 2.1;
  if (frame === 'closed') {
    pen.stroke(
      curve(pen.j, [
        [cx - rx, cy],
        [cx, cy + ry * 0.35],
        [cx + rx, cy],
      ]),
      LINE,
      w,
    );
  } else if (frame === 'happy') {
    pen.stroke(
      curve(pen.j, [
        [cx - rx, cy + ry * 0.35],
        [cx, cy - ry * 0.55],
        [cx + rx, cy + ry * 0.35],
      ]),
      LINE,
      w + 0.3,
    );
  } else if (frame === 'hurt') {
    // Squeezed shut: a chevron pointing toward the other eye.
    const d = back ? 1 : -1;
    pen.stroke(
      curve(
        pen.j,
        [
          [cx - rx * d, cy - ry * 0.7],
          [cx + rx * 0.6 * d, cy],
          [cx - rx * d, cy + ry * 0.7],
        ],
        0.2,
      ),
      LINE,
      w + 0.2,
    );
  } else if (frame === 'dead') {
    pen.line(cx - rx * 0.8, cy - ry * 0.8, cx + rx * 0.8, cy + ry * 0.8, LINE, w + 0.2);
    pen.line(cx + rx * 0.8, cy - ry * 0.8, cx - rx * 0.8, cy + ry * 0.8, LINE, w + 0.2);
  }
}

function visorEye(p: Paint, c: Pt, r: Pt, frame: string, glow: string, back: boolean): void {
  const { pen } = p;
  const ctx = pen.ctx;
  const [cx, cy] = c;
  const [rx, ry] = r;
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 6;
  const w = 2.4;
  if (frame === 'open' || frame === 'wide') {
    pen.flat(ellipse(pen.j, cx, cy, rx * 0.9, ry * 0.9), glow, 0);
    pen.dot(cx - rx * 0.25, cy - ry * 0.3, rx * 0.3, '#ffffff');
  } else if (frame === 'squint') {
    pen.flat(ellipse(pen.j, cx, cy + ry * 0.25, rx * 0.95, ry * 0.42), glow, 0);
  } else if (frame === 'closed') {
    pen.stroke(
      curve(pen.j, [
        [cx - rx, cy],
        [cx + rx, cy],
      ]),
      glow,
      w,
    );
  } else if (frame === 'happy') {
    pen.stroke(
      curve(pen.j, [
        [cx - rx, cy + ry * 0.4],
        [cx, cy - ry * 0.5],
        [cx + rx, cy + ry * 0.4],
      ]),
      glow,
      w,
    );
  } else if (frame === 'hurt') {
    const d = back ? 1 : -1;
    pen.stroke(
      curve(
        pen.j,
        [
          [cx - rx * d, cy - ry * 0.7],
          [cx + rx * 0.6 * d, cy],
          [cx - rx * d, cy + ry * 0.7],
        ],
        0.2,
      ),
      glow,
      w,
    );
  } else if (frame === 'dead') {
    pen.line(cx - rx * 0.8, cy - ry * 0.8, cx + rx * 0.8, cy + ry * 0.8, glow, w);
    pen.line(cx + rx * 0.8, cy - ry * 0.8, cx - rx * 0.8, cy + ry * 0.8, glow, w);
  }
  ctx.restore();
}

const EYE_FRAMES = ['open', 'wide', 'squint', 'closed', 'happy', 'hurt', 'dead'];
const MOUTH_FRAMES = ['smile', 'flat', 'grin', 'shout', 'o', 'wince', 'frown', 'happy'];

function mouth(p: Paint, c: Pt, size: number, frame: string): void {
  const { pen } = p;
  const [x, y] = c;
  const s = size;
  const w = 1.8;
  switch (frame) {
    case 'smile':
      pen.stroke(
        curve(pen.j, [
          [x - s, y - s * 0.15],
          [x, y + s * 0.4],
          [x + s, y - s * 0.2],
        ]),
        LINE,
        w,
      );
      break;
    case 'flat':
      pen.stroke(
        curve(pen.j, [
          [x - s * 0.8, y + s * 0.05],
          [x + s * 0.8, y - s * 0.05],
        ]),
        LINE,
        w,
      );
      break;
    case 'frown':
      pen.stroke(
        curve(pen.j, [
          [x - s * 0.9, y + s * 0.3],
          [x, y - s * 0.15],
          [x + s * 0.9, y + s * 0.25],
        ]),
        LINE,
        w,
      );
      break;
    case 'wince':
      pen.stroke(
        poly(pen.j, [
          [x - s, y],
          [x - s * 0.5, y - s * 0.3],
          [x, y + s * 0.05],
          [x + s * 0.5, y - s * 0.3],
          [x + s, y],
        ]),
        LINE,
        w,
      );
      break;
    case 'grin': {
      const m = poly(
        pen.j,
        [
          [x - s, y - s * 0.35],
          [x + s, y - s * 0.35],
          [x + s * 0.8, y + s * 0.45],
          [x - s * 0.8, y + s * 0.45],
        ],
        s * 0.35,
      );
      pen.flat(m, '#fffdf8', w);
      pen.line(x - s * 0.85, y + s * 0.05, x + s * 0.85, y + s * 0.05, LINE, 1.1);
      for (const k of [-0.4, 0, 0.4]) pen.line(x + s * k, y - s * 0.3, x + s * k, y + s * 0.4, LINE, 0.9);
      break;
    }
    case 'shout': {
      const m = ellipse(pen.j, x, y + s * 0.1, s * 0.85, s * 0.75);
      pen.flat(m, '#5a1f2a', w);
      pen.ctx.save();
      pen.ctx.clip(m.path());
      pen.flat(ellipse(pen.j, x, y + s * 0.75, s * 0.6, s * 0.4), '#e86a7a', 0);
      pen.ctx.restore();
      break;
    }
    case 'o':
      pen.flat(ellipse(pen.j, x, y + s * 0.05, s * 0.38, s * 0.45), '#5a1f2a', w);
      break;
    case 'happy': {
      const m = new Shape(pen.j);
      m.moveTo(x - s * 1.05, y - s * 0.3)
        .quadTo(x, y + s * 1.25, x + s * 1.05, y - s * 0.3)
        .close();
      pen.flat(m, '#5a1f2a', w);
      pen.ctx.save();
      pen.ctx.clip(m.path());
      pen.flat(ellipse(pen.j, x, y + s * 0.75, s * 0.55, s * 0.35), '#e86a7a', 0);
      pen.ctx.restore();
      break;
    }
  }
}

/** The face's parts: eyes, pupils, brows, mouth and a sweat drop. */
export function faceParts(f: FaceSpec): PartDef[] {
  const parts: PartDef[] = [];
  f.eyes.forEach((c, i) => {
    const r = f.eyeSize[i];
    const back = i === 0;
    const name = back ? 'eyeB' : 'eyeF';
    const pad = 4;
    const frames: PartDef['frames'] = {};
    for (const fr of EYE_FRAMES) {
      frames[fr] = (p) =>
        f.visor ? visorEye(p, c, r, fr, f.visor.glow, back) : eyeWhite(p, c, r, fr, f.lid, back);
    }
    parts.push({
      name,
      parent: f.parent,
      box: [c[0] - r[0] - pad, c[1] - r[1] - pad, c[0] + r[0] + pad, c[1] + r[1] + pad],
      pivot: c,
      frames,
      boil: 2,
    });
    if (!f.visor) {
      const pr = Math.min(r[0], r[1]) * 0.56;
      parts.push({
        name: back ? 'pupilB' : 'pupilF',
        parent: f.parent,
        box: [c[0] - pr - 2, c[1] - pr - 2, c[0] + pr + 2, c[1] + pr + 2],
        pivot: c,
        frames: {
          pupil: ({ pen }) => {
            pen.flat(ellipse(pen.j, c[0], c[1], pr, pr * 1.08), '#1f1a22', 0);
            pen.dot(c[0] - pr * 0.38, c[1] - pr * 0.42, pr * 0.38, '#ffffff');
            pen.dot(c[0] + pr * 0.35, c[1] + pr * 0.38, pr * 0.15, '#ffffff');
          },
        },
        boil: 1,
      });
    }
    if (f.brows) {
      const bw = r[0] * 1.15;
      const by = c[1] - r[1] - 2.6;
      parts.push({
        name: back ? 'browB' : 'browF',
        parent: f.parent,
        box: [c[0] - bw - 3, by - 4, c[0] + bw + 3, by + 4],
        pivot: [c[0], by],
        frames: {
          brow: ({ pen }) => {
            const s = poly(
              pen.j,
              [
                [c[0] - bw, by + 0.6],
                [c[0] - bw * 0.2, by - 1.1],
                [c[0] + bw, by - 0.2],
                [c[0] + bw * 0.9, by + 1.2],
                [c[0] - bw * 0.2, by + 0.9],
              ],
              0.9,
            );
            pen.flat(s, LINE, 0.8);
          },
        },
        boil: 2,
      });
    }
  });
  if (f.mouth) {
    const m = f.mouth;
    const s = f.mouthSize ?? 3.4;
    const frames: PartDef['frames'] = {};
    for (const fr of MOUTH_FRAMES) frames[fr] = (p) => mouth(p, m, s, fr);
    parts.push({
      name: 'mouth',
      parent: f.parent,
      box: [m[0] - s * 1.6, m[1] - s * 1.2, m[0] + s * 1.6, m[1] + s * 1.6],
      pivot: m,
      frames,
      boil: 2,
    });
  }
  if (f.sweat) {
    const [x, y] = f.sweat;
    parts.push({
      name: 'sweat',
      parent: f.parent,
      box: [x - 5, y - 7, x + 5, y + 6],
      pivot: [x, y],
      frames: {
        drop: ({ pen }) => {
          const s = new Shape(pen.j);
          s.moveTo(x, y - 5.5)
            .quadTo(x + 3.6, y + 0.5, x, y + 4)
            .quadTo(x - 3.6, y + 0.5, x, y - 5.5)
            .close();
          pen.flat(s, '#8fd3f4', 1.4);
          pen.dot(x - 0.9, y + 0.6, 0.9, '#ffffff');
        },
      },
      boil: 1,
    });
  }
  return parts;
}

/** Face pose: which eye, brow and mouth frames to show, and where the pupils look. */
export function facePose(f: FaceSpec, i: RigInput, pose: Pose): void {
  const blinkPhase = (i.t + i.seed * 1.7) % 3.6;
  const blinking = blinkPhase < 0.12 && i.mood !== 'dead';
  let eye = 'open';
  let mouthFrame = 'smile';
  let brow = 0;
  let browY = 0;
  let pupil = 1;
  switch (i.mood) {
    case 'idle':
    case 'walk':
      mouthFrame = i.lowHp ? 'frown' : 'smile';
      brow = i.lowHp ? -0.35 : 0;
      break;
    case 'aim':
      mouthFrame = 'flat';
      brow = 0.28;
      browY = 0.6;
      break;
    case 'charge':
      eye = i.power > 0.45 ? 'squint' : 'open';
      mouthFrame = 'grin';
      brow = 0.45;
      browY = 1.2;
      break;
    case 'fire':
      eye = 'wide';
      pupil = 0.7;
      mouthFrame = 'shout';
      brow = -0.1;
      browY = -1.6;
      break;
    case 'hurt':
      eye = 'hurt';
      mouthFrame = 'wince';
      brow = -0.45;
      browY = -0.5;
      break;
    case 'victory':
      eye = 'happy';
      mouthFrame = 'happy';
      brow = -0.15;
      browY = -1.6;
      break;
    case 'dead':
      eye = 'dead';
      mouthFrame = 'frown';
      brow = -0.4;
      break;
    case 'fly':
      eye = 'wide';
      pupil = 0.75;
      mouthFrame = 'o';
      brow = -0.3;
      browY = -1.2;
      break;
  }
  if (blinking && (eye === 'open' || eye === 'wide' || eye === 'squint')) eye = 'closed';
  const open = eye === 'open' || eye === 'wide' || eye === 'squint';

  // Pupils follow the look direction, or the aim.
  let lx: number;
  let ly: number;
  if (i.look) {
    lx = i.look[0];
    ly = i.look[1];
  } else {
    const a = (i.aim * Math.PI) / 180;
    lx = Math.cos(a);
    ly = -Math.sin(a) * 0.8;
    if (i.mood === 'idle' || i.mood === 'walk') {
      // Idle eyes wander a little.
      lx = 0.7 + Math.sin(i.t * 0.7 + i.seed) * 0.3;
      ly = Math.sin(i.t * 0.43 + i.seed * 2) * 0.35;
    }
  }
  const len = Math.hypot(lx, ly) || 1;
  lx /= len;
  ly /= len;

  f.eyes.forEach((_, k) => {
    const back = k === 0;
    const r = f.eyeSize[k];
    const name = back ? 'eyeB' : 'eyeF';
    pose[name] = { frame: eye, sy: eye === 'wide' ? 1.12 : 1, sx: eye === 'wide' ? 1.08 : 1 };
    if (!f.visor) {
      const reach = Math.min(r[0], r[1]) * 0.42;
      pose[back ? 'pupilB' : 'pupilF'] = {
        show: open,
        x: lx * reach,
        y: ly * reach + (eye === 'squint' ? r[1] * 0.25 : 0),
        sx: pupil,
        sy: pupil * (eye === 'squint' ? 0.8 : 1),
        frame: 'pupil',
      };
    } else {
      pose[name].x = lx * r[0] * 0.35;
      pose[name].y = ly * r[1] * 0.3;
    }
    if (f.brows) {
      // Brows tilt toward the middle of the face when cross, away from it when worried.
      const d = back ? 1 : -1;
      pose[back ? 'browB' : 'browF'] = { rot: brow * d, y: browY, frame: 'brow' };
    }
  });
  if (f.mouth) pose.mouth = { frame: mouthFrame };
  if (f.sweat) {
    const s = i.lowHp && i.mood !== 'dead' && i.mood !== 'victory';
    pose.sweat = { show: s, y: s ? Math.sin(i.t * 3) * 0.8 : 0, frame: 'drop' };
  }
}

// ---------------------------------------------------------------------------
// The scarf: every doodle wears one in its team's color. A knot on the body and a tail that streams out
// behind, flapping harder in a strong wind.

export interface ScarfSpec {
  parent: string;
  /** Where the tail is tied on. */
  knot: Pt;
  /** The band around the body, as a closed polygon, or null for a knot only. */
  band: readonly Pt[] | null;
  length: number;
}

const SCARF_FLAPS = 4;

export function scarfParts(s: ScarfSpec): PartDef[] {
  const [kx, ky] = s.knot;
  const L = s.length;
  const parts: PartDef[] = [];
  const tailFrames: PartDef['frames'] = {};
  for (let f = 0; f < SCARF_FLAPS; f++) {
    tailFrames[`flap${f}`] = ({ pen, team }) => {
      // Two ribbons trailing back (toward -x), waving.
      for (const [k, lenK, spread] of [
        [0, 1, -0.12],
        [1, 0.78, 0.22],
      ] as const) {
        const ph = (f / SCARF_FLAPS) * Math.PI * 2 + k * 1.3;
        const pts: Pt[] = [];
        const n = 5;
        for (let i = 0; i <= n; i++) {
          const u = i / n;
          const x = kx - u * L * lenK;
          const y = ky + u * L * spread + Math.sin(ph - u * 3.2) * u * 3.2;
          pts.push([x, y]);
        }
        const top: Pt[] = [];
        const bottom: Pt[] = [];
        pts.forEach(([x, y], i) => {
          const w = 2.6 - (i / n) * 0.9;
          top.push([x, y - w]);
          bottom.unshift([x, y + w]);
        });
        const ribbon = poly(pen.j, [...top, ...bottom], 1.2);
        pen.paint(ribbon, { fill: team, depth: 1.6, lw: 1.7, hatch: false });
        // Fringe at the end.
        const [ex, ey] = pts[n];
        for (const o of [-1.6, 0, 1.6]) pen.line(ex, ey + o, ex - 2.4, ey + o + 0.6, LINE, 1);
      }
    };
  }
  parts.push({
    name: 'scarfTail',
    parent: s.parent,
    behind: true,
    box: [kx - L - 8, ky - L * 0.4 - 8, kx + 5, ky + L * 0.5 + 8],
    pivot: s.knot,
    frames: tailFrames,
    team: true,
    boil: 1,
  });
  if (s.band) {
    const band = s.band;
    const xs = band.map((p) => p[0]);
    const ys = band.map((p) => p[1]);
    parts.push({
      name: 'scarfBand',
      parent: s.parent,
      box: [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) + 4, Math.max(...ys) + 4],
      pivot: s.knot,
      frames: {
        band: ({ pen, team }) => {
          pen.paint(poly(pen.j, band, 1.6), { fill: team, depth: 1.8, lw: 2, hatch: false });
          pen.paint(ellipse(pen.j, kx, ky, 2.8, 2.4), { fill: team, depth: 1.2, lw: 1.6, hatch: false });
        },
      },
      team: true,
      boil: 2,
    });
  }
  return parts;
}

export function scarfPose(i: RigInput, pose: Pose, motion = 0): void {
  // A stronger tailwind lifts the scarf and flaps it faster; walking streams it out too.
  const speed = 4 + Math.abs(i.wind) * 9 + motion * 6;
  const f = Math.floor((i.t * speed + i.seed * 3) % SCARF_FLAPS);
  const lift = -0.25 * Math.max(0, i.wind) - motion * 0.2 + 0.2 * Math.max(0, -i.wind);
  pose.scarfTail = { frame: `flap${f}`, rot: lift + Math.sin(i.t * 2.1 + i.seed) * 0.05 };
  pose.scarfBand = { frame: 'band' };
}

// ---------------------------------------------------------------------------
// Shared motion

export function breathe(i: RigInput, amount = 0.025): { sx: number; sy: number } {
  if (i.calm) return { sx: 1, sy: 1 };
  const b = Math.sin(i.t * 2.3 + i.seed) * amount;
  return { sx: 1 - b * 0.6, sy: 1 + b };
}

/** Squash on firing, then spring back. */
export function recoil(i: RigInput): number {
  if (i.mood !== 'fire') return 0;
  const t = i.moodT;
  return Math.exp(-t * 9) * Math.cos(t * 26);
}

/** A shake while hurt. */
export function shake(i: RigInput, amp = 1.6): number {
  if (i.mood !== 'hurt' || i.calm) return 0;
  return Math.sin(i.moodT * 60) * amp * Math.max(0, 1 - i.moodT / 0.5);
}

/** Victory hops: height above the ground. */
export function hop(i: RigInput, height = 9): number {
  if (i.mood !== 'victory') return 0;
  const t = (i.moodT * 1.6 + i.seed * 0.3) % 1;
  return -Math.max(0, Math.sin(t * Math.PI)) * height;
}

export const deg = (d: number) => (d * Math.PI) / 180;

export { mix };
