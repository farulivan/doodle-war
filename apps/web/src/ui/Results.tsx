import { UNITS } from '@doodle/sim';
import { team } from '../game/art/palette';
import { unitIconUrl } from '../game/art/portrait';
import type { MatchSummary } from '../game/store';
import { LivePortrait } from './LivePortrait';

interface Props {
  summary: MatchSummary;
  onRematch(): void;
  onSetup(): void;
  onMenu(): void;
}

export function Results({ summary, onRematch, onSetup, onMenu }: Props) {
  const title =
    summary.winner === -1
      ? "It's a draw!"
      : summary.humanWon === true
        ? 'You win!'
        : summary.humanWon === false
          ? 'You got erased!'
          : `${team(summary.winner).name} win!`;
  const score = (r: (typeof summary.rows)[number]) => r.damageDealt + r.kills * 300;
  const mvp = [...summary.rows].sort((a, b) => score(b) - score(a))[0];
  // The winners take a bow; on a draw, everyone left standing does.
  const podium = summary.rows.filter((r) => (summary.winner === -1 ? r.alive : r.team === summary.winner));

  return (
    <div className="screen dim interactive">
      <div className="sheet overlay-card results ruled">
        <div className="podium">
          {podium.map((r) => (
            <div key={r.id} className={`podium-spot ${r.id === mvp?.id ? 'mvp-spot' : ''}`}>
              <LivePortrait
                kind={r.kind}
                teamColor={team(r.team).color}
                width={118}
                height={104}
                mood={r.alive ? 'victory' : 'dead'}
                anchorY={0.88}
                followMouse={false}
              />
              {r.id === mvp?.id && <span className="mvp">MVP</span>}
            </div>
          ))}
        </div>
        <h2 style={{ color: summary.winner >= 0 ? team(summary.winner).color : undefined }}>{title}</h2>
        <div style={{ color: 'var(--ink-soft)' }}>Finished in {summary.turns} turns</div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Doodle</th>
              <th>Damage</th>
              <th>Taken</th>
              <th>Erased</th>
              <th>Shots</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.id} className={`${r.alive ? '' : 'dead'} ${r.id === mvp?.id ? 'mvp-row' : ''}`}>
                <td className="name">
                  <img src={unitIconUrl(r.kind, r.team)} alt="" />
                  <span>
                    <span style={{ color: team(r.team).color }}>{r.name}</span>
                    <span className="row-kind">{UNITS[r.kind].name}</span>
                  </span>
                  {r.id === mvp?.id && <span className="mvp">MVP</span>}
                </td>
                <td>{r.damageDealt}</td>
                <td>{r.damageTaken}</td>
                <td>{r.kills}</td>
                <td>{r.shots}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: 'center', marginTop: '1.2rem' }}>
          {summary.online ? (
            <>
              <button className="btn primary" onClick={onRematch} autoFocus>
                Back to lobby
              </button>
              <button className="btn" onClick={onMenu}>
                Leave room
              </button>
            </>
          ) : (
            <>
              <button className="btn primary" onClick={onRematch} autoFocus>
                Rematch
              </button>
              <button className="btn" onClick={onSetup}>
                Change setup
              </button>
              <button className="btn" onClick={onMenu}>
                Main menu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
