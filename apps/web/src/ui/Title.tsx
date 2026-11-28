import type { UnitKind } from '@doodle/sim';
import { profile } from '../game/profile';
import { useStore } from '../game/store';
import { Lineup } from './Lineup';

interface Props {
  onQuickPlay(kind?: UnitKind): void;
  onCustom(): void;
  onOnline(): void;
  onHowTo(): void;
  onSettings(): void;
}

export function Title({ onQuickPlay, onCustom, onOnline, onHowTo, onSettings }: Props) {
  const record = useStore(profile, (p) => p);
  const narrow = window.innerWidth < 600;
  return (
    <div className="screen">
      <div className="sheet title-card ruled interactive">
        <h1 className="logo">
          <span className="a">Doodle</span> <span className="b">War</span>
        </h1>
        <p className="tagline">Turn-based artillery, fought in the margins of your notebook.</p>
        <Lineup width={narrow ? 300 : 440} height={narrow ? 78 : 104} onPick={(k) => onQuickPlay(k)} />
        <div className="menu">
          <button className="btn primary big" onClick={() => onQuickPlay()} autoFocus>
            Play vs Bot
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
            Your record: <b>{record.wins}</b> {record.wins === 1 ? 'win' : 'wins'} · <b>{record.losses}</b>{' '}
            {record.losses === 1 ? 'loss' : 'losses'}
            {record.streak > 1 && <span className="streak"> · {record.streak} in a row!</span>}
          </p>
        ) : null}
        <p className="credit">Every pixel is drawn in code. No image or sound files.</p>
      </div>
    </div>
  );
}
