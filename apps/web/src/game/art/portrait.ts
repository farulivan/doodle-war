import type { UnitKind } from '@doodle/sim';
import { DESIGNS } from './characters';
import { team } from './palette';
import { composeRig, makeCanvas, renderRig, type RenderedRig } from './render';
import type { Mood, RigInput } from './rig';

/**
 * The doodles for menus and the HUD, drawn from the same rigs as the battlefield, with the scarf in the
 * team's own color.
 */

const rigs = new Map<string, RenderedRig>();

/** A rendered rig for a kind and team color, at a resolution, kept for reuse. */
export function domRig(kind: UnitKind, teamColor: string, res: number): RenderedRig {
  const key = `${kind}:${teamColor}:${res}`;
  let rig = rigs.get(key);
  if (!rig) {
    rig = renderRig(DESIGNS[kind], res, teamColor);
    rigs.set(key, rig);
  }
  return rig;
}

export interface PortraitPose {
  mood?: Mood;
  moodT?: number;
  t?: number;
  aim?: number;
  look?: [number, number] | null;
  power?: number;
  wind?: number;
  lowHp?: boolean;
  calm?: boolean;
  boil?: number;
}

/**
 * Draws a doodle onto a canvas, fitted to it. `zoom` frames tighter than the whole body (above 1) or
 * looser (below 1); `anchorY` sets how far down the feet sit, as a fraction of the height.
 */
export function drawPortrait(
  canvas: HTMLCanvasElement,
  kind: UnitKind,
  teamColor: string,
  pose: PortraitPose = {},
  opts: { zoom?: number; anchorY?: number; flip?: boolean; shadow?: boolean } = {},
): void {
  const design = DESIGNS[kind];
  const [x0, y0, x1, y1] = design.frame;
  const fw = x1 - x0;
  const fh = y1 - y0;
  // With the feet anchored, everything above them (and room for a victory hop) has to fit above that line.
  const fitH = opts.anchorY !== undefined ? (canvas.height * opts.anchorY) / (-y0 + 12) : canvas.height / fh;
  const scale = Math.min(canvas.width / fw, fitH) * (opts.zoom ?? 0.92);
  const res = Math.min(8, Math.max(1, Math.ceil(scale)));
  const rig = domRig(kind, teamColor, res);
  const input: RigInput = {
    t: pose.t ?? 0.4,
    mood: pose.mood ?? 'idle',
    moodT: pose.moodT ?? 0,
    aim: pose.aim ?? 30,
    look: pose.look ?? null,
    power: pose.power ?? 0,
    wind: pose.wind ?? 0.3,
    lowHp: pose.lowHp ?? false,
    seed: 1,
    calm: pose.calm,
  };
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const flip = opts.flip ? -1 : 1;
  // Center the body's frame across, and either center it down or put the feet where asked.
  const cx = canvas.width / 2 - ((x0 + x1) / 2) * scale * flip;
  const feetY =
    opts.anchorY !== undefined ? canvas.height * opts.anchorY : canvas.height / 2 - ((y0 + y1) / 2) * scale;
  ctx.setTransform(scale * flip, 0, 0, scale, cx, feetY);
  const p = design.pose(input);
  if (opts.shadow === false) p.shadow = { show: false };
  composeRig(ctx, rig, p, pose.boil ?? 0);
}

const icons = new Map<string, string>();

/** A small still portrait as a data URL, for <img> tags. */
export function unitIconUrl(kind: UnitKind, teamIndex: number): string {
  const key = `${kind}:${teamIndex}`;
  const hit = icons.get(key);
  if (hit) return hit;
  const c = makeCanvas(208, 182);
  drawPortrait(c, kind, team(teamIndex).color, { aim: 28 }, { zoom: 0.98 });
  const url = c.toDataURL();
  icons.set(key, url);
  return url;
}
