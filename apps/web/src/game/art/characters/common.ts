import { UNITS, type UnitKind } from '@doodle/sim';
import { NO_JITTER, ellipse } from '../kit';
import type { PartDef, Pose, RigInput } from '../rig';
import { deg, recoil } from '../rig';

/** A soft shadow on the ground under the feet. */
export function shadowPart(rx: number): PartDef {
  return {
    name: 'shadow',
    box: [-rx - 3, -5, rx + 3, 5],
    pivot: [0, 0],
    frames: {
      shadow: ({ pen }) => {
        pen.ctx.fillStyle = 'rgba(48, 34, 24, 0.2)';
        pen.ctx.fill(ellipse(NO_JITTER, 0, 0.5, rx, 3.4).path());
      },
    },
    boil: 1,
  };
}

export function shadowPose(pose: Pose, lift: number): void {
  // Shrinks as the doodle leaves the ground.
  const k = Math.max(0.55, 1 + lift * 0.025);
  pose.shadow = { frame: 'shadow', sx: k, sy: k, alpha: k };
}

/** The barrel's mount and length, from the rules, so the art and the shots agree. */
export function mountOf(kind: UnitKind): { x: number; y: number; length: number } {
  return UNITS[kind].mount;
}

/** Barrel pose: aimed, and kicked back along its own line on firing. */
export function barrelPose(i: RigInput, kick = 3.5): { rot: number; x: number; y: number } {
  const a = deg(i.aim);
  const rc = Math.max(0, recoil(i));
  return { rot: -a, x: -Math.cos(a) * rc * kick, y: Math.sin(a) * rc * kick };
}

/** Is the doodle walking about? */
export function walking(i: RigInput): boolean {
  return i.mood === 'walk';
}
