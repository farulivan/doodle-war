import { unitIconUrl } from '../game/art/doodles';
import { team } from '../game/art/palette';
import type { MatchSummary } from '../game/store';

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
  const mvp = [...summary.rows].sort(
    (a, b) => b.damageDealt + b.kills * 300 - (a.damageDealt + a.kills * 300),
  )[0];

  return (
    <div className="screen dim interactive">
      <div className="sheet overlay-card results ruled">
        <h2 style={{ color: summary.winner >= 0 ? team(summary.winner).color : undefined }}>{title}</h2>
        <div style={{ color: 'var(--ink-soft)' }}>Finished in {summary.turns} turns</div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Doodle</th>
              <th>Damage</th>
              <th>Taken</th>
              <th>Kills</th>
              <th>Shots</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.id} className={r.alive ? '' : 'dead'}>
                <td className="name">
                  <img src={unitIconUrl(r.kind, r.team)} alt="" />
                  <span style={{ color: team(r.team).color }}>{r.name}</span>
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
