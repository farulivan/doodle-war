import { UNITS, UNIT_KINDS, type BotLevel, type UnitKind } from '@doodle/sim';
import { unitIconUrl } from '../game/art/portrait';

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
export const TIMERS = [0, 20, 30, 45];

export function TimerPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange(s: number): void;
  disabled?: boolean;
}) {
  return (
    <label className="option">
      <span>Turn timer</span>
      <div className="seg" role="group" aria-label="Turn timer">
        {TIMERS.map((s) => (
          <button key={s} disabled={disabled} className={value === s ? 'on' : ''} onClick={() => onChange(s)}>
            {s === 0 ? 'Off' : `${s}s`}
          </button>
        ))}
      </div>
    </label>
  );
}

/** The quick match's bot: its doodle (or a random one) and how well it aims. */
export function OpponentPicker({
  opponent,
  level,
  onOpponent,
  onLevel,
}: {
  opponent: UnitKind | 'random';
  level: BotLevel;
  onOpponent(k: UnitKind | 'random'): void;
  onLevel(l: BotLevel): void;
}) {
  return (
    <div className="option opponent">
      <span>Opponent</span>
      <div className="opponent-picks" role="radiogroup" aria-label="Opponent's doodle">
        <button
          role="radio"
          aria-checked={opponent === 'random'}
          className={`mini-pick ${opponent === 'random' ? 'on' : ''}`}
          onClick={() => onOpponent('random')}
          title="A different doodle each match"
        >
          ?
        </button>
        {UNIT_KINDS.map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={opponent === k}
            className={`mini-pick ${opponent === k ? 'on' : ''}`}
            onClick={() => onOpponent(k)}
            title={UNITS[k].name}
          >
            <img src={unitIconUrl(k, 1)} alt={UNITS[k].name} />
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Bot difficulty">
        {LEVELS.map((l) => (
          <button key={l} className={level === l ? 'on' : ''} onClick={() => onLevel(l)}>
            {l[0].toUpperCase() + l.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
