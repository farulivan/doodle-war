import type { ProjectileSprite, UnitKind } from '@doodle/sim';
import { useEffect, useRef } from 'react';
import { drawProjectile } from '../game/art/projectiles';
import { drawPortrait } from '../game/art/portrait';
import type { Mood } from '../game/art/rig';
import { settings } from '../game/settings';

interface Props {
  kind: UnitKind;
  teamColor: string;
  width: number;
  height: number;
  /** Mood when nothing else is going on. */
  mood?: Mood;
  /** Change this to make the doodle react: it cheers for a moment. */
  cheer?: number;
  /** Eyes follow the pointer. */
  followMouse?: boolean;
  zoom?: number;
  /** Where the feet sit, as a fraction of the height. */
  anchorY?: number;
  flip?: boolean;
  aim?: number;
  className?: string;
}

const pointer = { x: -1, y: -1 };
let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    },
    { passive: true },
  );
}

/** A doodle drawn live on a canvas: it breathes, blinks, looks at the pointer and cheers when picked. */
export function LivePortrait({
  kind,
  teamColor,
  width,
  height,
  mood = 'idle',
  cheer = 0,
  followMouse = true,
  zoom,
  anchorY,
  flip,
  aim = 26,
  className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cheerAt = useRef(-10);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    cheerAt.current = performance.now() / 1000;
  }, [cheer]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (followMouse) listen();
    const start = performance.now() / 1000;
    let raf = 0;
    const draw = () => {
      const now = performance.now() / 1000;
      const calm = settings.get().reducedMotion;
      const since = now - cheerAt.current;
      const cheering = since < 1.4;
      let look: [number, number] | null = null;
      if (followMouse && pointer.x >= 0) {
        const r = canvas.getBoundingClientRect();
        const dx = (pointer.x - (r.left + r.width / 2)) * (flip ? -1 : 1);
        const dy = pointer.y - (r.top + r.height * 0.45);
        if (Math.hypot(dx, dy) > 6) look = [dx, dy];
      }
      drawPortrait(
        canvas,
        kind,
        teamColor,
        {
          t: now - start,
          mood: cheering ? 'victory' : mood,
          moodT: cheering ? since : now - start,
          aim,
          look,
          wind: 0.5,
          calm,
          boil: calm ? 0 : Math.floor((now - start) * 8),
        },
        { zoom, anchorY, flip },
      );
      if (!calm || cheering) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [kind, teamColor, width, height, mood, followMouse, zoom, anchorY, flip, aim, cheer]);

  return <canvas ref={ref} className={className} style={{ width, height }} aria-hidden="true" />;
}

const shotIcons = new Map<ProjectileSprite, string>();

/** A projectile as a data URL, for weapon cards. */
export function shotIconUrl(sprite: ProjectileSprite): string {
  let url = shotIcons.get(sprite);
  if (!url) {
    url = drawProjectile(sprite).toDataURL();
    shotIcons.set(sprite, url);
  }
  return url;
}
