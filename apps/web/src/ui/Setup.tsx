import { MAPS, UNITS, UNIT_KINDS, buildTerrain, getMap, type BotLevel } from '@doodle/sim';
import { useEffect, useRef, useState } from 'react';
import { unitIconUrl } from '../game/art/doodles';
import { team as teamStyle } from '../game/art/palette';
import { paperColor } from '../game/art/paper';
import { saveSetup, type SetupState, type SlotSetup } from './setupModel';

interface Props {
  initial: SetupState;
  onBack(): void;
  onStart(setup: SetupState): void;
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const TIMERS = [0, 20, 30, 45];

export function Setup({ initial, onBack, onStart }: Props) {
  const [setup, setSetup] = useState<SetupState>(initial);

  useEffect(() => saveSetup(setup), [setup]);

  const updateSlot = (team: 0 | 1, index: number, patch: Partial<SlotSetup>) => {
    setSetup((s) => {
      const teams = [s.teams[0].slice(), s.teams[1].slice()] as SetupState['teams'];
      teams[team][index] = { ...teams[team][index], ...patch };
      return { ...s, teams };
    });
  };

  const preset = (kind: 'bots' | 'hotseat') => {
    setSetup((s) => {
      const teams = [s.teams[0].slice(), s.teams[1].slice()] as SetupState['teams'];
      for (const t of [0, 1] as const) {
        teams[t] = teams[t].map((slot, i) => {
          const human = kind === 'bots' ? t === 0 && i === 0 : i === 0 || s.teamSize > 1;
          const name = human
            ? kind === 'bots'
              ? 'You'
              : `Player ${t + 1}${i > 0 ? String.fromCharCode(65 + i) : ''}`
            : slot.name;
          return {
            ...slot,
            controller: human ? 'human' : 'bot',
            name: slot.controller === (human ? 'human' : 'bot') ? slot.name : name,
          };
        });
      }
      return { ...s, teams };
    });
  };

  const humans = setup.teams
    .flatMap((t) => t.slice(0, setup.teamSize))
    .filter((s) => s.controller === 'human').length;

  return (
    <div className="screen dim">
      <div className="sheet setup ruled interactive">
        <div className="setup-head">
          <h2>Custom Match</h2>
          <div className="row">
            <button className="btn small" onClick={() => preset('bots')}>
              Me vs Bots
            </button>
            <button className="btn small" onClick={() => preset('hotseat')}>
              Pass &amp; Play
            </button>
            <div className="seg" role="group" aria-label="Team size">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  className={setup.teamSize === n ? 'on' : ''}
                  onClick={() => setSetup({ ...setup, teamSize: n })}
                >
                  {n}v{n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="teams">
          {([0, 1] as const).map((t) => (
            <div className="team-col" key={t}>
              <h3 style={{ color: teamStyle(t).color }}>{teamStyle(t).name}</h3>
              {setup.teams[t].slice(0, setup.teamSize).map((slot, i) => (
                <SlotEditor key={i} team={t} slot={slot} onChange={(patch) => updateSlot(t, i, patch)} />
              ))}
            </div>
          ))}
        </div>

        <div className="section-title">Battlefield</div>
        <div className="maps">
          {MAPS.map((m) => (
            <button
              key={m.id}
              className={`map-card ${setup.mapId === m.id ? 'selected' : ''}`}
              onClick={() =>
                setSetup({ ...setup, mapId: m.id, mapSeed: setup.mapId === m.id ? setup.mapSeed : null })
              }
            >
              <MapThumb mapId={m.id} seed={setup.mapId === m.id ? setup.mapSeed : null} />
              <strong>{m.name}</strong>
              <span>{m.blurb}</span>
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <button
            className="btn small"
            onClick={() => setSetup({ ...setup, mapSeed: Math.floor(Math.random() * 1e9) })}
          >
            Remix layout
          </button>
          {setup.mapSeed !== null && (
            <button className="btn small" onClick={() => setSetup({ ...setup, mapSeed: null })}>
              Original layout
            </button>
          )}
          <span style={{ marginLeft: '1rem' }}>Turn timer</span>
          <div className="seg" role="group" aria-label="Turn timer">
            {TIMERS.map((s) => (
              <button
                key={s}
                className={setup.turnSeconds === s ? 'on' : ''}
                onClick={() => setSetup({ ...setup, turnSeconds: s })}
              >
                {s === 0 ? 'Off' : `${s}s`}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-foot">
          <button className="btn" onClick={onBack}>
            ← Back
          </button>
          <span style={{ color: 'var(--ink-soft)' }}>
            {humans === 0
              ? 'All bots: sit back and watch.'
              : humans === 1
                ? 'One human player.'
                : `${humans} humans share this device.`}
          </span>
          <button className="btn primary" onClick={() => onStart(setup)}>
            Start Battle!
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotEditor({
  team,
  slot,
  onChange,
}: {
  team: number;
  slot: SlotSetup;
  onChange(p: Partial<SlotSetup>): void;
}) {
  const def = UNITS[slot.kind];
  return (
    <div className="slot">
      <div className="row">
        <input
          type="text"
          value={slot.name}
          maxLength={14}
          aria-label="Player name"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="seg" role="group" aria-label="Controller">
          <button
            className={slot.controller === 'human' ? 'on' : ''}
            onClick={() => onChange({ controller: 'human' })}
          >
            Human
          </button>
          <button
            className={slot.controller === 'bot' ? 'on' : ''}
            onClick={() => onChange({ controller: 'bot' })}
          >
            Bot
          </button>
        </div>
        {slot.controller === 'bot' && (
          <div className="seg" role="group" aria-label="Bot difficulty">
            {LEVELS.map((l) => (
              <button
                key={l}
                className={slot.botLevel === l ? 'on' : ''}
                onClick={() => onChange({ botLevel: l })}
              >
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="kind-picker" role="radiogroup" aria-label="Unit">
        {UNIT_KINDS.map((k) => (
          <button
            key={k}
            className={`kind-btn ${slot.kind === k ? 'selected' : ''}`}
            onClick={() => onChange({ kind: k })}
            title={UNITS[k].name}
            role="radio"
            aria-checked={slot.kind === k}
          >
            <img src={unitIconUrl(k, team)} alt={UNITS[k].name} />
          </button>
        ))}
      </div>
      <div className="kind-info">
        <strong>{def.name}</strong>: {def.blurb} <br />
        HP {def.hp} · Move {def.moveBudget} · {def.weapons.map((w) => w.name).join(' / ')}
      </div>
    </div>
  );
}

const thumbCache = new Map<string, ImageData>();

function MapThumb({ mapId, seed }: { mapId: string; seed: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const map = getMap(mapId);
    const key = `${mapId}:${seed ?? 'default'}`;
    const w = 240;
    const h = 120;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const render = () => {
      let img = thumbCache.get(key);
      if (!img) {
        const terrain = buildTerrain(map, seed ?? map.seed);
        img = ctx.createImageData(w, h);
        const paper = paperColor(map.paper);
        const pr = parseInt(paper.slice(1, 3), 16);
        const pg = parseInt(paper.slice(3, 5), 16);
        const pb = parseInt(paper.slice(5, 7), 16);
        // Show the map plus a bit of sky above it.
        const sky = map.height * 0.25;
        const sx = map.width / w;
        const sy = (map.height + sky) / h;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const wx = x * sx;
            const wy = y * sy - sky;
            const o = (y * w + x) * 4;
            const solid = wy >= 0 && terrain.solid(wx, wy);
            img.data[o] = solid ? 120 : pr;
            img.data[o + 1] = solid ? 116 : pg;
            img.data[o + 2] = solid ? 108 : pb;
            img.data[o + 3] = 255;
          }
        }
        thumbCache.set(key, img);
      }
      ctx.putImageData(img, 0, 0);
    };
    const id = window.setTimeout(render, 0);
    return () => window.clearTimeout(id);
  }, [mapId, seed]);
  return <canvas ref={ref} aria-hidden="true" />;
}
