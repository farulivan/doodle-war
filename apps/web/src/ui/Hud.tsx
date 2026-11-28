import { UNITS, type WeaponSlot } from '@doodle/sim';
import { useEffect, useState } from 'react';
import { unitIconUrl } from '../game/art/portrait';
import { team } from '../game/art/palette';
import { audio } from '../game/audio';
import { controller, type Control } from '../game/controller';
import { isTouch } from '../game/device';
import { settings } from '../game/settings';
import { hud, useStore, type QueueEntry } from '../game/store';
import { BattleChat } from './Chat';
import { CoachMarks } from './CoachMarks';
import { shotIconUrl } from './LivePortrait';
import { SettingsPanel } from './SettingsPanel';

export function Hud({ onQuit }: { onQuit(): void }) {
  const paused = useStore(hud, (s) => s.paused);
  const phase = useStore(hud, (s) => s.phase);
  return (
    <>
      <TopBar />
      {phase !== 'over' && <Panel />}
      {isTouch && phase === 'aim' && <TouchControls />}
      <CoachMarks />
      <Banner />
      <Toast />
      {paused && <PauseMenu onQuit={onQuit} />}
    </>
  );
}

function hpColor(frac: number, teamIndex: number): string {
  return frac > 0.5 ? team(teamIndex).color : frac > 0.25 ? '#e0a31e' : '#c0392b';
}

function TopBar() {
  const queue = useStore(hud, (s) => s.queue);
  const activeId = useStore(hud, (s) => s.active?.id ?? -1);
  const turnNumber = useStore(hud, (s) => s.turnNumber);
  const suddenDeath = useStore(hud, (s) => s.suddenDeath);
  const muted = useStore(settings, (s) => s.muted);
  const isOnline = useStore(hud, (s) => s.online);

  return (
    <div className="hud-top">
      {/* The chat sits under the queue, however many rows the queue takes: the sky up there is usually empty. */}
      <div className="hud-left">
        <div className="queue" aria-label="Turn order">
          {queue.slice(0, 8).map((q) => (
            <QueueItem key={q.id} q={q} current={q.id === activeId} />
          ))}
        </div>
        {isOnline && <BattleChat />}
      </div>
      <div className="turn-info">
        <Wind />
        <span
          style={{
            fontSize: '0.9rem',
            background: 'rgba(255,253,246,0.85)',
            padding: '0 0.4rem',
            borderRadius: 6,
          }}
        >
          Turn {turnNumber}
        </span>
        {suddenDeath && <span className="deadline">DEADLINE ×1.5</span>}
      </div>
      <div className="top-right interactive">
        <Timer />
        <button
          className="btn icon"
          title="Whole map (Tab)"
          aria-label="Toggle map overview"
          onClick={() => controller.toggleOverview()}
        >
          ⤢
        </button>
        <button
          className="btn icon"
          title="Sound (M)"
          aria-label={muted ? 'Unmute' : 'Mute'}
          onClick={() => audio.setMuted(!muted)}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          className="btn icon"
          title="Pause (P)"
          aria-label="Pause"
          onClick={() => controller.setPaused(true)}
        >
          ❚❚
        </button>
      </div>
    </div>
  );
}

function QueueItem({ q, current }: { q: QueueEntry; current: boolean }) {
  const frac = q.hp / q.maxHp;
  return (
    <div className={`queue-item ${current ? 'current' : ''}`} title={`${q.name}: ${q.hp} HP`}>
      <img src={unitIconUrl(q.kind, q.team)} alt="" />
      <div>
        <div className="qname" style={{ color: team(q.team).color }}>
          {q.name}
        </div>
        <div className="mini-hp">
          <i style={{ width: `${frac * 100}%`, background: hpColor(frac, q.team) }} />
        </div>
      </div>
    </div>
  );
}

function Wind() {
  const strength = useStore(hud, (s) => s.windStrength);
  const angle = useStore(hud, (s) => s.windAngle);
  const len = 6 + strength * 1.6;
  return (
    <div className="wind sheet" aria-label={`Wind ${strength}`}>
      <svg viewBox="-26 -26 52 52" aria-hidden="true">
        <circle r="23" fill="#fffdf6" stroke="#2b2b2b" strokeWidth="2" strokeDasharray="5 3" />
        {/* Fan blades */}
        <g opacity="0.25" stroke="#2b2b2b" fill="none" strokeWidth="1.5">
          <path d="M0 0 Q 8 -12 0 -18 Q -6 -10 0 0" />
          <path d="M0 0 Q 14 6 18 0 Q 10 -6 0 0" transform="rotate(120)" />
          <path d="M0 0 Q 14 6 18 0 Q 10 -6 0 0" transform="rotate(240)" />
        </g>
        {strength > 0 && (
          <g transform={`rotate(${angle})`} style={{ transition: 'transform 500ms ease' }}>
            <line x1={-len} y1="0" x2={len} y2="0" stroke="#1f3fbf" strokeWidth="3.5" strokeLinecap="round" />
            <path
              d={`M${len - 7} -6 L${len + 1} 0 L${len - 7} 6`}
              fill="none"
              stroke="#1f3fbf"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}
      </svg>
      <div>
        <div className="num">{strength}</div>
        <div className="lbl">wind</div>
      </div>
    </div>
  );
}

function Timer() {
  const timer = useStore(hud, (s) => s.timer);
  const max = useStore(hud, (s) => s.timerMax);
  if (timer === null || max === 0) return null;
  const frac = timer / max;
  const c = 2 * Math.PI * 21;
  return (
    <div className={`timer ${timer <= 5 ? 'low' : ''}`} aria-label={`${timer} seconds left`}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="21" fill="#fffdf6" stroke="#2b2b2b" strokeWidth="2.5" />
        <circle
          cx="26"
          cy="26"
          r="21"
          fill="none"
          stroke={timer <= 5 ? '#c0392b' : '#2f6fd6'}
          strokeWidth="5"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 26 26)"
          opacity="0.6"
        />
      </svg>
      <span>{timer}</span>
    </div>
  );
}

function Panel() {
  const active = useStore(hud, (s) => s.active);
  const phase = useStore(hud, (s) => s.phase);
  const angle = useStore(hud, (s) => s.angle);
  const elevation = useStore(hud, (s) => s.elevation);
  const power = useStore(hud, (s) => s.power);
  const slot = useStore(hud, (s) => s.slot);
  const moveLeft = useStore(hud, (s) => s.moveLeft);
  const moveMax = useStore(hud, (s) => s.moveMax);
  const drawMode = useStore(hud, (s) => s.drawMode);
  const soloHuman = useStore(hud, (s) => s.soloHuman);
  if (!active) return null;

  const def = UNITS[active.kind];
  const myTurn = phase === 'aim';
  const specialReady = active.special >= 100;
  const frac = active.hp / active.maxHp;

  const statuses = [
    active.inked && { key: 'inked', label: 'Inked: half movement', cls: 'ink' },
    active.rooted && { key: 'rooted', label: 'Stuck: no walking', cls: 'glue' },
    active.marked && { key: 'marked', label: 'Highlighted: next hit +35%', cls: 'mark' },
  ].filter(Boolean) as { key: string; label: string; cls: string }[];

  return (
    <div className={`panel sheet interactive ${myTurn ? '' : 'waiting'}`}>
      <div className="who">
        <div className="who-portrait" style={{ borderColor: team(active.team).color }}>
          <img src={unitIconUrl(active.kind, active.team)} alt="" />
        </div>
        <div className="who-text">
          <div className="name" style={{ color: team(active.team).color }}>
            {active.name}
          </div>
          <div className="kind-label">
            {active.controller === 'bot' ? (soloHuman ? 'Bot (enemy)' : 'Bot') : def.name} · {def.role}
          </div>
          <div className="hp-row">
            <div className="hp-bar" aria-label={`${active.hp} HP`}>
              <i style={{ width: `${frac * 100}%`, background: hpColor(frac, active.team) }} />
            </div>
            <span className="hp-num">{active.hp}</span>
          </div>
          {statuses.length > 0 && (
            <div className="status-chips">
              {statuses.map((st) => (
                <span key={st.key} className={`status-chip ${st.cls}`}>
                  {st.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="angle" title="Elevation above the horizon (barrel angle below)">
        <AngleDial elevation={elevation} min={def.angleMin} max={def.angleMax} aim={angle} />
        <div>
          <div className="big">{elevation}°</div>
          <div className="small">aim {angle}°</div>
        </div>
      </div>

      <div className="power">
        <div className="power-bar" aria-label={`Power ${Math.round(power)}`}>
          <div className="fill" style={{ width: `${power}%` }} />
          {[25, 50, 75].map((t) => (
            <div key={t} className="tick" style={{ left: `${t}%` }} />
          ))}
          {active.lastPower !== null && (
            <div className="last" style={{ left: `calc(${active.lastPower}% - 1.5px)` }} title="Last shot" />
          )}
          <span className="val">{Math.round(power)}</span>
        </div>
        <div className="meters">
          <div className={`meter special ${specialReady ? 'ready' : ''}`} title="Special meter">
            ★
            <span className="track">
              <i style={{ width: `${Math.min(100, active.special)}%`, background: '#ffd23f' }} />
            </span>
            {specialReady ? 'READY' : `${Math.floor(active.special)}%`}
          </div>
          <div className="meter" title="Movement left this turn">
            👣
            <span className="track">
              <i
                style={{
                  width: `${(moveLeft / moveMax) * 100}%`,
                  background: active.rooted ? '#e0761e' : active.inked ? '#3d4fd0' : '#7a7a7a',
                }}
              />
            </span>
          </div>
        </div>
      </div>

      <div className="weapons" role="radiogroup" aria-label="Weapon">
        {def.weapons.map((w, i) => {
          const s = i as WeaponSlot;
          const locked = s === 2 && !specialReady;
          return (
            <button
              key={w.id}
              className={`btn weapon ${s === 2 ? 'ss' : ''} ${slot === s ? 'selected' : ''} ${locked ? 'locked' : ''}`}
              disabled={!myTurn || locked}
              onClick={() => controller.selectWeapon(s)}
              title={w.blurb}
              role="radio"
              aria-checked={slot === s}
            >
              <img className="wicon" src={shotIconUrl(w.spawns[0].def.sprite)} alt="" />
              <span className="key">{s === 2 ? '★ 3' : s + 1}</span>
              <span className="wname">{w.name}</span>
              <span className="delay">⧗ {w.delay}</span>
              {locked && (
                <span className="lock" style={{ ['--p' as string]: `${Math.min(100, active.special)}%` }} />
              )}
            </button>
          );
        })}
      </div>

      <div className="side-btns">
        <button
          className={`btn small ${drawMode ? 'selected' : ''}`}
          disabled={!myTurn || active.drawUsed}
          onClick={() => controller.toggleDraw()}
          title="Draw an ink line, once per match (E)"
        >
          ✎<span className="label"> Draw {active.drawUsed ? '(used)' : '(E)'}</span>
        </button>
        <button
          className="btn small"
          disabled={!myTurn}
          onClick={() => controller.hop()}
          title="Hop out of holes (J or Shift), costs movement"
        >
          ⤴<span className="label"> Hop (J)</span>
        </button>
        <button className="btn small" onClick={() => controller.recenter()} title="Recenter camera (C)">
          ◎<span className="label"> Find me</span>
        </button>
      </div>
    </div>
  );
}

/** A little protractor: the allowed aim range, and the barrel's elevation in it. */
function AngleDial({
  elevation,
  min,
  max,
  aim,
}: {
  elevation: number;
  min: number;
  max: number;
  aim: number;
}) {
  const r = 20;
  const pt = (deg: number, k = 1) => {
    const a = (deg * Math.PI) / 180;
    return `${Math.cos(a) * r * k} ${-Math.sin(a) * r * k}`;
  };
  // The allowed range moves with the ground's tilt; show it around the current elevation.
  const lo = elevation - (aim - min);
  const hi = elevation + (max - aim);
  return (
    <svg className="dial" viewBox="-24 -24 48 30" aria-hidden="true">
      <path
        d={`M${pt(lo)} A${r} ${r} 0 0 0 ${pt(hi)}`}
        fill="none"
        stroke="#c9c2b0"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <line x1="-22" y1="0" x2="22" y2="0" stroke="#2b2b2b" strokeWidth="1.2" strokeDasharray="2 2" />
      <line
        x1="0"
        y1="0"
        x2={Math.cos((elevation * Math.PI) / 180) * 21}
        y2={-Math.sin((elevation * Math.PI) / 180) * 21}
        stroke="#d64545"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle r="2.6" fill="#2b2b2b" />
    </svg>
  );
}

function HoldButton({
  control,
  className,
  children,
  label,
}: {
  control: Control;
  className: string;
  children: React.ReactNode;
  label: string;
}) {
  const charging = useStore(hud, (s) => s.charging);
  return (
    <button
      className={`${className} ${control === 'fire' && charging ? 'charging' : ''}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        controller.press(control);
      }}
      onPointerUp={() => controller.releaseControl(control)}
      onPointerCancel={() => controller.releaseControl(control)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function TouchControls() {
  return (
    <div className="touch">
      <div className="dpad interactive">
        <span />
        <HoldButton control="up" className="btn" label="Aim up">
          ▲
        </HoldButton>
        <button className="btn hop-btn" aria-label="Hop" onClick={() => controller.hop()}>
          ⤴
        </button>
        <HoldButton control="left" className="btn" label="Walk left">
          ◀
        </HoldButton>
        <HoldButton control="down" className="btn" label="Aim down">
          ▼
        </HoldButton>
        <HoldButton control="right" className="btn" label="Walk right">
          ▶
        </HoldButton>
      </div>
      <div className="interactive">
        <HoldButton control="fire" className="fire-btn" label="Hold to charge, release to fire">
          FIRE
        </HoldButton>
      </div>
    </div>
  );
}

function Banner() {
  const banner = useStore(hud, (s) => s.banner);
  const [shown, setShown] = useState(banner);
  useEffect(() => {
    setShown(banner);
    if (!banner) return;
    const id = window.setTimeout(() => setShown(null), 1900);
    return () => window.clearTimeout(id);
  }, [banner]);
  if (!shown) return null;
  return (
    <div className="banner" key={shown.id} role="status">
      <div className="text">{shown.text}</div>
      {shown.sub && <div className="sub">{shown.sub}</div>}
    </div>
  );
}

function Toast() {
  const toast = useStore(hud, (s) => s.toast);
  const [shown, setShown] = useState(toast);
  useEffect(() => {
    setShown(toast);
    if (!toast) return;
    const id = window.setTimeout(() => setShown(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);
  if (!shown) return null;
  return (
    <div className="toast sheet" key={shown.id} role="status">
      {shown.text}
    </div>
  );
}

function PauseMenu({ onQuit }: { onQuit(): void }) {
  const isOnline = useStore(hud, (s) => s.online);
  const [showSettings, setShowSettings] = useState(false);
  if (showSettings) return <SettingsPanel onClose={() => setShowSettings(false)} />;
  return (
    <div className="screen dim interactive">
      <div className="sheet overlay-card ruled">
        <h2>{isOnline ? 'Menu' : 'Paused'}</h2>
        {isOnline && (
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>The match keeps going while this is open.</p>
        )}
        <div className="menu">
          <button className="btn primary" onClick={() => controller.setPaused(false)} autoFocus>
            Resume
          </button>
          {!isOnline && (
            <button
              className="btn"
              onClick={() => {
                controller.setPaused(false);
                void controller.rematch();
              }}
            >
              Restart match
            </button>
          )}
          <button className="btn" onClick={() => setShowSettings(true)}>
            Settings
          </button>
          <button
            className="btn"
            onClick={() => {
              controller.setPaused(false);
              onQuit();
            }}
          >
            {isOnline ? 'Leave match' : 'Quit to menu'}
          </button>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', marginTop: '1rem' }}>
          ←→ walk · ↑↓ aim · hold Space to fire · 1/2/3 weapons · E draw{isOnline ? ' · Enter chat' : ''}
        </p>
      </div>
    </div>
  );
}
