import { UNIT_KINDS } from '@doodle/sim';
import { unitIconUrl } from '../game/art/doodles';
import { profile } from '../game/profile';
import { useStore } from '../game/store';

interface Props {
  onQuickPlay(): void;
  onCustom(): void;
  onOnline(): void;
  onHowTo(): void;
  onSettings(): void;
}

export function Title({ onQuickPlay, onCustom, onOnline, onHowTo, onSettings }: Props) {
  const record = useStore(profile, (p) => p);
  return (
    <div className="screen">
      <div className="sheet title-card ruled interactive">
        <div className="unit-parade" aria-hidden="true">
          {UNIT_KINDS.map((kind, i) => (
            <img key={kind} src={unitIconUrl(kind, i % 2)} alt="" />
          ))}
        </div>
        <h1 className="logo">
          <span className="a">Doodle</span> <span className="b">War</span>
        </h1>
        <p className="tagline">Turn-based artillery, fought in the margins of your notebook.</p>
        <div className="menu">
          <button className="btn primary" onClick={onQuickPlay} autoFocus>
            Quick Play vs Bot
          </button>
          <button className="btn" onClick={onOnline}>
            Play Online with Friends
          </button>
          <button className="btn" onClick={onCustom}>
            Custom Match / Pass &amp; Play
          </button>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" style={{ flex: 1 }} onClick={onHowTo}>
              How to Play
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={onSettings}>
              Settings
            </button>
          </div>
        </div>
        {record.played > 0 ? (
          <p className="record">
            Your record: <b>{record.wins}</b> wins · <b>{record.losses}</b> losses
            {record.streak > 1 && <span className="streak"> · {record.streak} in a row!</span>}
          </p>
        ) : null}
        <p className="credit">Every pixel is drawn in code. No image or sound files.</p>
      </div>
    </div>
  );
}
