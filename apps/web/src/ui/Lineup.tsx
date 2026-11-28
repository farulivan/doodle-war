import { UNITS, UNIT_KINDS, type UnitKind } from '@doodle/sim';
import { useEffect, useRef, useState } from 'react';
import { DESIGNS } from '../game/art/characters';
import { team } from '../game/art/palette';
import { domRig } from '../game/art/portrait';
import { composeRig } from '../game/art/render';
import { settings } from '../game/settings';

interface Props {
  width: number;
  height: number;
  onPick?(kind: UnitKind): void;
}

/**
 * All six doodles standing on a pencil line, in one canvas. Their eyes follow the pointer; the one under
 * it cheers, and a click picks it.
 */
export function Lineup({ width, height, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hover = useRef<number>(-1);
  const [label, setLabel] = useState<string | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    const n = UNIT_KINDS.length;
    const slot = width / n;
    const scale = Math.min(slot / 64, height / 64) * 0.98;
    const res = Math.min(6, Math.ceil(scale * dpr));
    const rigs = UNIT_KINDS.map((k, i) => domRig(k, team(i % 2).color, res));
    const start = performance.now() / 1000;
    const hoverAt: number[] = UNIT_KINDS.map(() => -10);
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    const draw = () => {
      const now = performance.now() / 1000;
      const t = now - start;
      const calm = settings.get().reducedMotion;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // The pencil line they stand on.
      ctx.strokeStyle = 'rgba(43, 43, 43, 0.55)';
      ctx.lineWidth = 2 * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const ground = height * 0.9;
      ctx.moveTo(8 * dpr, ground * dpr + 1);
      for (let x = 8; x <= width - 8; x += 12) ctx.lineTo(x * dpr, (ground + Math.sin(x * 0.21) * 0.8) * dpr);
      ctx.stroke();
      UNIT_KINDS.forEach((kind, i) => {
        const cx = slot * (i + 0.5);
        const cheering = hover.current === i || now - hoverAt[i] < 0.9;
        if (hover.current === i) hoverAt[i] = now;
        let look: [number, number] | null = null;
        const p = pointer.current;
        if (p) {
          const dx = (p.x - cx) * (i % 2 === 0 ? 1 : -1);
          const dy = p.y - (ground - 22 * scale);
          look = [dx, dy];
        }
        const design = DESIGNS[kind];
        const pose = design.pose({
          t: t + i * 0.37,
          mood: cheering ? 'victory' : 'idle',
          moodT: now - hoverAt[i],
          aim: 28,
          look,
          power: 0,
          wind: 0.4,
          lowHp: false,
          seed: i * 1.9,
          calm,
        });
        // The two teams face each other across the middle.
        const flip = i % 2 === 0 ? 1 : -1;
        ctx.setTransform(scale * dpr * flip, 0, 0, scale * dpr, cx * dpr, ground * dpr);
        composeRig(ctx, rigs[i], pose, calm ? 0 : Math.floor(t * 8));
      });
      if (!calm || hover.current >= 0) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [width, height]);

  const at = (clientX: number): number => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(UNIT_KINDS.length - 1, Math.floor(((clientX - r.left) / r.width) * UNIT_KINDS.length)),
    );
  };

  return (
    <div className="lineup">
      <canvas
        ref={ref}
        style={{ width, height }}
        onPointerMove={(e) => {
          const i = at(e.clientX);
          hover.current = i;
          setLabel(`${UNITS[UNIT_KINDS[i]].name} · ${UNITS[UNIT_KINDS[i]].role}`);
        }}
        onPointerLeave={() => {
          hover.current = -1;
          setLabel(null);
        }}
        onClick={(e) => onPick?.(UNIT_KINDS[at(e.clientX)])}
        role="img"
        aria-label="The six doodles"
      />
      <div className="lineup-label">{label ?? 'Six doodles. Pick yours.'}</div>
    </div>
  );
}
