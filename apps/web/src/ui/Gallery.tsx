import { UNITS, UNIT_KINDS, type UnitKind } from '@doodle/sim';
import { useEffect, useRef, useState } from 'react';
import { DESIGNS } from '../game/art/characters';
import { team } from '../game/art/palette';
import { composeRig, renderRig, type RenderedRig } from '../game/art/render';
import type { Mood, RigInput } from '../game/art/rig';

/**
 * A development page for the doodles: every design in every mood, at battlefield size and large, with the
 * hitbox and the barrel's mount drawn over it. Open it with ?gallery in a dev build.
 */

const MOODS: Mood[] = ['idle', 'walk', 'aim', 'charge', 'fire', 'hurt', 'victory', 'fly', 'dead'];
/** How long each mood's own loop runs before it starts again. */
const LOOP: Partial<Record<Mood, number>> = { fire: 1.2, hurt: 1.2, charge: 2 };

interface Tile {
  canvas: HTMLCanvasElement;
  kind: UnitKind;
  mood: Mood;
  scale: number;
  teamIndex: number;
  overlay: boolean;
}

export function Gallery() {
  const [aim, setAim] = useState(35);
  const [overlay, setOverlay] = useState(true);
  const aimRef = useRef(aim);
  aimRef.current = aim;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const tiles = useRef<Tile[]>([]);
  const kinds = UNIT_KINDS.filter((k) => DESIGNS[k]);

  useEffect(() => {
    const rigs = new Map<string, RenderedRig>();
    const rigFor = (kind: UnitKind, teamIndex: number, res: number) => {
      const key = `${kind}:${teamIndex}:${res}`;
      let r = rigs.get(key);
      if (!r) {
        r = renderRig(DESIGNS[kind]!, res, team(teamIndex).color);
        rigs.set(key, r);
      }
      return r;
    };
    let raf = 0;
    const start = performance.now();
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      for (const tile of tiles.current) {
        if (!tile.canvas) continue;
        const design = DESIGNS[tile.kind]!;
        const dpr = window.devicePixelRatio || 1;
        const res = Math.min(8, Math.ceil(tile.scale * dpr));
        const rig = rigFor(tile.kind, tile.teamIndex, res);
        const ctx = tile.canvas.getContext('2d')!;
        const w = tile.canvas.width;
        const h = tile.canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const loop = LOOP[tile.mood] ?? 4;
        const input: RigInput = {
          t,
          mood: tile.mood,
          moodT: t % loop,
          aim: aimRef.current,
          look: null,
          power: tile.mood === 'charge' ? (t % loop) / loop : 0,
          wind: Math.sin(t * 0.4),
          lowHp: tile.mood === 'idle' && tile.scale > 2,
          seed: tile.kind.length,
        };
        const pose = design.pose(input);
        const s = tile.scale * dpr;
        ctx.setTransform(s, 0, 0, s, w / 2, h * 0.84);
        composeRig(ctx, rig, pose, Math.floor(t * 8));
        if (tile.overlay && overlayRef.current) {
          const def = UNITS[tile.kind];
          const r = def.bodyRadius;
          ctx.strokeStyle = 'rgba(214, 69, 69, 0.8)';
          ctx.lineWidth = 1 / tile.scale;
          ctx.beginPath();
          ctx.arc(0, -r, r + 2, 0, Math.PI * 2);
          ctx.stroke();
          const a = (aimRef.current * Math.PI) / 180;
          const mx = def.mount.x;
          const my = def.mount.y;
          ctx.fillStyle = 'rgba(47, 111, 214, 0.9)';
          ctx.beginPath();
          ctx.arc(mx, my, 1.2, 0, Math.PI * 2);
          ctx.arc(
            mx + Math.cos(a) * def.mount.length,
            my - Math.sin(a) * def.mount.length,
            1.6,
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.moveTo(-60, 0);
          ctx.lineTo(60, 0);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  tiles.current = [];
  const tile = (kind: UnitKind, mood: Mood, scale: number, teamIndex: number, w: number, h: number) => (
    <canvas
      key={`${kind}-${mood}-${scale}-${teamIndex}`}
      width={w * (window.devicePixelRatio || 1)}
      height={h * (window.devicePixelRatio || 1)}
      style={{ width: w, height: h, background: '#f6f1e3', borderRadius: 6 }}
      ref={(c) => {
        if (c) tiles.current.push({ canvas: c, kind, mood, scale, teamIndex, overlay: scale <= 2 });
      }}
    />
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#e9e2cf', pointerEvents: 'auto' }}
    >
      <div style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Doodle gallery</h2>
        <label>
          aim {aim}°{' '}
          <input
            type="range"
            min={-30}
            max={90}
            value={aim}
            onChange={(e) => setAim(Number(e.target.value))}
          />
        </label>
        <label>
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> hitbox
        </label>
      </div>
      {kinds.map((kind) => (
        <div key={kind} style={{ padding: '0 16px 20px' }}>
          <h3 style={{ margin: '4px 0' }}>{UNITS[kind].name}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {tile(kind, 'idle', 5, 0, 340, 300)}
            {tile(kind, 'idle', 5, 1, 340, 300)}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 150px)', gap: 6 }}>
              {MOODS.map((mood) => tile(kind, mood, 2, 0, 150, 120))}
              {tile(kind, 'aim', 1, 1, 150, 120)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
