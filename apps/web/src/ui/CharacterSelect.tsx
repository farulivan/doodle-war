import { UNITS, UNIT_KINDS, type UnitKind, type WeaponDef } from '@doodle/sim';
import { useEffect, useRef, useState } from 'react';
import { unitIconUrl } from '../game/art/portrait';
import { team } from '../game/art/palette';
import { audio } from '../game/audio';
import { LivePortrait, shotIconUrl } from './LivePortrait';
import { ROSTER, statsFor } from './roster';

interface Props {
  title: string;
  /** Shown over the title, such as "Red Pencils · slot 2". */
  kicker?: string;
  teamIndex: number;
  value: UnitKind;
  onConfirm(kind: UnitKind): void;
  onBack(): void;
  confirmLabel: string;
  step?: string;
}

/**
 * The character select: a big live doodle, everything that sets it apart, and the roster to flip through.
 * Arrow keys browse, Enter picks, Escape goes back.
 */
export function CharacterSelect({
  title,
  kicker,
  teamIndex,
  value,
  onConfirm,
  onBack,
  confirmLabel,
  step,
}: Props) {
  const [picked, setPicked] = useState<UnitKind>(value);
  const [hover, setHover] = useState<UnitKind | null>(null);
  const [cheer, setCheer] = useState(0);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const shown = hover ?? picked;
  const def = UNITS[shown];
  const info = ROSTER[shown];
  const teamColor = team(teamIndex).color;

  const pick = (k: UnitKind) => {
    if (k !== picked) audio.play('select');
    setPicked(k);
    setCheer((c) => c + 1);
  };

  // Focus the confirm button without scrolling the card down to it.
  useEffect(() => confirmRef.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const i = UNIT_KINDS.indexOf(picked);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setHover(null);
        pick(UNIT_KINDS[(i + 1) % UNIT_KINDS.length]);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setHover(null);
        pick(UNIT_KINDS[(i - 1 + UNIT_KINDS.length) % UNIT_KINDS.length]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(picked);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="screen dim select-screen">
      <div className="sheet select-card interactive" role="dialog" aria-label={title}>
        <header className="select-head">
          <button className="btn small" onClick={onBack}>
            ← Back
          </button>
          <div className="select-title">
            {kicker && <div className="kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          {step ? <span className="step-chip">{step}</span> : <span />}
        </header>

        <div className="select-main">
          <div className="showcase" style={{ ['--accent' as string]: info.accent }}>
            <div className="spotlight" />
            <div className="showcase-stage">
              <div className="pedestal" />
              <LivePortrait
                key={shown}
                kind={shown}
                teamColor={teamColor}
                width={280}
                height={230}
                cheer={cheer}
                anchorY={0.84}
                zoom={0.92}
                className="showcase-doodle"
              />
            </div>
            <div className="role-tag">{def.role}</div>
          </div>

          <div className="dossier">
            <h3 className="doodle-name" style={{ color: info.accent }}>
              {def.name}
            </h3>
            <p className="pitch">{info.pitch}</p>
            <div className="stats">
              {statsFor(shown).map((s) => (
                <div className="stat" key={s.label}>
                  <span className="stat-label">{s.label}</span>
                  <span className="pips" aria-label={`${s.value} of 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <i
                        key={n}
                        className={n <= s.value ? 'on' : ''}
                        style={{ ['--accent' as string]: info.accent }}
                      />
                    ))}
                  </span>
                  <span className="stat-note">{s.note}</span>
                </div>
              ))}
              <div className="stat">
                <span className="stat-label">Difficulty</span>
                <span className="stars">{'★'.repeat(info.difficulty) + '☆'.repeat(3 - info.difficulty)}</span>
              </div>
            </div>
            <div className="passive">
              <span className="passive-badge">Passive</span>
              <b>{def.passive.name}:</b> {def.passive.text}
            </div>
            <div className="kit">
              {def.weapons.map((w, i) => (
                <WeaponCard key={w.id} w={w} slot={i} />
              ))}
            </div>
            <div className="pros-cons">
              <ul className="pros">
                {info.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <ul className="cons">
                {info.weaknesses.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="roster" role="radiogroup" aria-label="Doodles" onMouseLeave={() => setHover(null)}>
          {UNIT_KINDS.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={picked === k}
              className={`roster-card ${picked === k ? 'picked' : ''}`}
              style={{ ['--accent' as string]: ROSTER[k].accent }}
              onMouseEnter={() => setHover(k)}
              onFocus={() => setHover(k)}
              onClick={() => pick(k)}
            >
              <img src={unitIconUrl(k, teamIndex)} alt="" />
              <span className="roster-name">{UNITS[k].name}</span>
              <span className="roster-role">{UNITS[k].role}</span>
            </button>
          ))}
        </div>

        <footer className="select-foot">
          <span className="hint">← → to browse · Enter to pick</span>
          <button className="btn primary big" ref={confirmRef} onClick={() => onConfirm(picked)}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function WeaponCard({ w, slot }: { w: WeaponDef; slot: number }) {
  const special = slot === 2;
  return (
    <div className={`weapon-card ${special ? 'special' : ''}`}>
      <img src={shotIconUrl(w.spawns[0].def.sprite)} alt="" />
      <div>
        <div className="weapon-card-head">
          <span className="weapon-slot">{special ? '★ Special' : `Shot ${slot + 1}`}</span>
          <span className="delay" title="Turn delay: bigger waits longer">
            ⧗ {w.delay}
          </span>
        </div>
        <div className="weapon-card-name">{w.name}</div>
        <div className="weapon-card-blurb">{w.blurb}</div>
      </div>
    </div>
  );
}
