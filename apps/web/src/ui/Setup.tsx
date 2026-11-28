import { UNITS, type BotLevel } from '@doodle/sim';
import { useState } from 'react';
import { unitIconUrl } from '../game/art/portrait';
import { team as teamStyle } from '../game/art/palette';
import { audio } from '../game/audio';
import { CharacterSelect } from './CharacterSelect';
import { ROSTER } from './roster';
import type { SetupState, SlotSetup } from './setupModel';

interface Props {
  setup: SetupState;
  onChange(setup: SetupState): void;
  onBack(): void;
  /** On to the stage select. */
  onNext(): void;
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

/**
 * Custom Match: build both teams. Each slot is a card with its doodle; click the doodle to open the
 * character select for that slot.
 */
export function Setup({ setup, onChange, onBack, onNext }: Props) {
  const [editing, setEditing] = useState<{ team: 0 | 1; index: number } | null>(null);

  const updateSlot = (team: 0 | 1, index: number, patch: Partial<SlotSetup>) => {
    const teams = [setup.teams[0].slice(), setup.teams[1].slice()] as SetupState['teams'];
    teams[team][index] = { ...teams[team][index], ...patch };
    onChange({ ...setup, teams });
  };

  const preset = (kind: 'bots' | 'hotseat') => {
    const teams = [setup.teams[0].slice(), setup.teams[1].slice()] as SetupState['teams'];
    for (const t of [0, 1] as const) {
      teams[t] = teams[t].map((slot, i) => {
        const human = kind === 'bots' ? t === 0 && i === 0 : i === 0 || setup.teamSize > 1;
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
    onChange({ ...setup, teams });
  };

  if (editing) {
    const slot = setup.teams[editing.team][editing.index];
    return (
      <CharacterSelect
        title={`Choose a doodle for ${slot.name || 'this slot'}`}
        kicker={`${teamStyle(editing.team).name} · slot ${editing.index + 1}`}
        teamIndex={editing.team}
        value={slot.kind}
        confirmLabel="Done"
        onBack={() => setEditing(null)}
        onConfirm={(kind) => {
          updateSlot(editing.team, editing.index, { kind });
          setEditing(null);
        }}
      />
    );
  }

  const humans = setup.teams
    .flatMap((t) => t.slice(0, setup.teamSize))
    .filter((s) => s.controller === 'human').length;

  return (
    <div className="screen dim select-screen">
      <div className="sheet select-card interactive" role="dialog" aria-label="Custom match">
        <header className="select-head">
          <button className="btn small" onClick={onBack}>
            ← Back
          </button>
          <div className="select-title">
            <h2>Custom Match</h2>
          </div>
          <span className="step-chip">Step 1 of 2</span>
        </header>

        <div className="builder-bar row">
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
                onClick={() => onChange({ ...setup, teamSize: n })}
              >
                {n}v{n}
              </button>
            ))}
          </div>
        </div>

        <div className="versus">
          {([0, 1] as const).map((t) => (
            <div className={`team-side side-${t}`} key={t}>
              <h3 style={{ color: teamStyle(t).color }}>{teamStyle(t).name}</h3>
              {setup.teams[t].slice(0, setup.teamSize).map((slot, i) => (
                <SlotCard
                  key={i}
                  team={t}
                  slot={slot}
                  onEdit={() => {
                    audio.play('click');
                    setEditing({ team: t, index: i });
                  }}
                  onChange={(patch) => updateSlot(t, i, patch)}
                />
              ))}
            </div>
          ))}
          <div className="vs-badge" aria-hidden="true">
            VS
          </div>
        </div>

        <footer className="select-foot">
          <span className="hint">
            {humans === 0
              ? 'All bots: sit back and watch.'
              : humans === 1
                ? 'One human player.'
                : `${humans} humans share this device.`}
          </span>
          <button className="btn primary big" onClick={onNext}>
            Next: pick a stage →
          </button>
        </footer>
      </div>
    </div>
  );
}

function SlotCard({
  team,
  slot,
  onEdit,
  onChange,
}: {
  team: number;
  slot: SlotSetup;
  onEdit(): void;
  onChange(p: Partial<SlotSetup>): void;
}) {
  const def = UNITS[slot.kind];
  return (
    <div className="slot-card" style={{ ['--accent' as string]: ROSTER[slot.kind].accent }}>
      <button className="slot-portrait" onClick={onEdit} title="Change doodle">
        <img src={unitIconUrl(slot.kind, team)} alt={def.name} />
        <span className="change">Change</span>
      </button>
      <div className="slot-body">
        <input
          type="text"
          value={slot.name}
          maxLength={14}
          aria-label="Player name"
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="slot-doodle">
          <b>{def.name}</b> · {def.role}
        </div>
        <div className="row">
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
      </div>
    </div>
  );
}
