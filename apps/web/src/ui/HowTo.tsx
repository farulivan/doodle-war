import { UNITS, UNIT_KINDS } from '@doodle/sim';
import { unitIconUrl } from '../game/art/doodles';

export function HowTo({ onBack }: { onBack(): void }) {
  return (
    <div className="screen dim">
      <div className="sheet howto ruled interactive">
        <h2>How to Play</h2>
        <p>
          Two teams of doodles take turns lobbing things at each other across a notebook page. Explosions{' '}
          <b>erase</b> the pencil ground. Wipe out the other team, or knock them <b>off the page</b>.
        </p>

        <h3>Controls</h3>
        <ul>
          <li>
            <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> <kbd>D</kbd>: walk (limited each turn)
          </li>
          <li>
            <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>W</kbd> <kbd>S</kbd>: aim. Tap for 1°, hold to sweep
          </li>
          <li>
            Hold <kbd>Space</kbd> to charge power, release to fire. The blue tick marks your last shot's power
          </li>
          <li>
            <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>: pick a weapon. Slot 3 is your special and needs a full
            meter
          </li>
          <li>
            <kbd>J</kbd> or <kbd>Shift</kbd>: <b>hop</b> out of craters (costs some movement)
          </li>
          <li>
            <kbd>E</kbd>: <b>Draw</b>, once per match. Drag near your unit to ink a wall or bridge
          </li>
          <li>
            Drag to pan, scroll or pinch to zoom, <kbd>Tab</kbd> for the whole map, <kbd>C</kbd> to recenter
          </li>
          <li>
            <kbd>P</kbd> pause, <kbd>M</kbd> mute
          </li>
        </ul>

        <h3>Turn order</h3>
        <p>
          There are no fixed rounds. Every action adds <b>delay</b>: big weapons, walking and drawing all push
          your next turn back. Whoever has the least delay goes next, so a quick shot can earn you two turns
          in a row.
        </p>

        <h3>Pickups</h3>
        <p>
          Every few turns a goodie parachutes onto the page. Walk over it to grab it: a <b>Band-Aid</b> heals
          250 HP, a <b>Gold Star</b> adds 50% to your special meter, and an <b>Ink Refill</b> gives your Draw
          back. Explosions pop them, so you can deny the other team too.
        </p>

        <h3>Wind &amp; the special meter</h3>
        <p>
          The fan at the top shows wind direction and strength. It changes every turn and pushes light shots
          like Paper Darts the most. Your special meter fills as you deal and take damage. After turn 40 the{' '}
          <b>Deadline</b> hits and all damage is multiplied by 1.5.
        </p>

        <h3>The doodles</h3>
        <div className="unit-table">
          {UNIT_KINDS.map((k, i) => {
            const u = UNITS[k];
            return (
              <div key={k} className="sheet">
                <img src={unitIconUrl(k, i % 2)} alt="" />
                <b>{u.name}</b>
                <div>{u.blurb}</div>
                <div style={{ clear: 'both', fontSize: '0.88rem', color: 'var(--ink-soft)' }}>
                  {u.weapons.map((w, j) => (
                    <div key={w.id}>
                      {j === 2 ? '★ ' : `${j + 1}. `}
                      <b>{w.name}</b>: {w.blurb}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: '1.2rem', justifyContent: 'center' }}>
          <button className="btn primary" onClick={onBack} autoFocus>
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
