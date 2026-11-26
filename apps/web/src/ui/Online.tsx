import { MAPS, MAX_PER_TEAM, UNITS, UNIT_KINDS, type BotLevel, type LobbyPlayer } from '@doodle/sim';
import { useState } from 'react';
import { unitIconUrl } from '../game/art/doodles';
import { team as teamStyle } from '../game/art/palette';
import { useStore } from '../game/store';
import { online, onlineAvailable, savedName, session } from '../net/online';

export function OnlineMenu({ onBack, initialCode }: { onBack(): void; initialCode?: string }) {
  const [name, setName] = useState(savedName() || '');
  const [code, setCode] = useState(initialCode ?? '');
  const status = useStore(online, (s) => s.status);
  const error = useStore(online, (s) => s.error);
  const busy = status === 'connecting';
  const nick = name.trim() || 'Player';

  return (
    <div className="screen dim">
      <div className="sheet overlay-card ruled interactive online-card">
        <h2>Play Online</h2>
        {!onlineAvailable ? (
          <p>Online play needs a game server, and this build doesn't have one configured.</p>
        ) : (
          <>
            <label className="field">
              <span>Your name</span>
              <input
                type="text"
                value={name}
                maxLength={14}
                placeholder="Doodler"
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
            <div className="online-actions">
              <div className="sheet online-box">
                <h3>Host a room</h3>
                <p>Get a 4-letter code to share with friends.</p>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void session.create(nick).catch(() => undefined)}
                >
                  Create room
                </button>
              </div>
              <div className="sheet online-box">
                <h3>Join a room</h3>
                <input
                  className="code-input"
                  type="text"
                  value={code}
                  maxLength={4}
                  placeholder="CODE"
                  aria-label="Room code"
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && void session.join(code, nick).catch(() => undefined)}
                />
                <button
                  className="btn primary"
                  disabled={busy || code.trim().length !== 4}
                  onClick={() => void session.join(code, nick).catch(() => undefined)}
                >
                  Join
                </button>
              </div>
            </div>
            {busy && <p className="status-line">Connecting...</p>}
            {error && <p className="status-line error">{error}</p>}
          </>
        )}
        <div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <button className="btn" onClick={onBack}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const TIMERS = [0, 20, 30, 45];

export function Lobby({ onLeave }: { onLeave(): void }) {
  const lobby = useStore(online, (s) => s.lobby);
  const me = useStore(online, (s) => s.me);
  const status = useStore(online, (s) => s.status);
  const [copied, setCopied] = useState(false);
  if (!lobby) {
    return (
      <div className="screen dim">
        <div className="sheet overlay-card">
          <h2>Joining room...</h2>
        </div>
      </div>
    );
  }
  const self = lobby.players.find((p) => p.id === me);
  const isHost = !!self?.host;
  const humans = lobby.players.filter((p) => !p.bot);
  const teamCount = (t: 0 | 1) => lobby.players.filter((p) => p.team === t).length;
  const blocker =
    teamCount(0) === 0 || teamCount(1) === 0
      ? 'Each team needs at least one doodle. Add a bot if you are alone.'
      : humans.some((p) => !p.ready && !p.host)
        ? 'Waiting for everyone to be ready...'
        : null;
  const link = `${location.origin}${location.pathname}?room=${lobby.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="screen dim">
      <div className="sheet setup ruled interactive">
        <div className="setup-head">
          <div>
            <h2>Room</h2>
            <div className="room-code" aria-label={`Room code ${lobby.code}`}>
              {lobby.code}
            </div>
          </div>
          <div className="row">
            <button className="btn small" onClick={() => void copy()}>
              {copied ? 'Link copied!' : 'Copy invite link'}
            </button>
            {status === 'reconnecting' && <span className="status-line error">Reconnecting...</span>}
          </div>
        </div>

        <div className="teams">
          {([0, 1] as const).map((t) => (
            <div className="team-col" key={t}>
              <h3 style={{ color: teamStyle(t).color }}>
                {teamStyle(t).name}{' '}
                <small>
                  ({teamCount(t)}/{MAX_PER_TEAM})
                </small>
              </h3>
              {lobby.players
                .filter((p) => p.team === t)
                .map((p) => (
                  <LobbyRow key={p.id} p={p} me={me} isHost={isHost} />
                ))}
              <div className="row">
                {self && self.team !== t && teamCount(t) < MAX_PER_TEAM && (
                  <button className="btn small" onClick={() => session.send('profile', { team: t })}>
                    Switch here
                  </button>
                )}
                {isHost && teamCount(t) < MAX_PER_TEAM && (
                  <button className="btn small" onClick={() => session.send('addBot', { team: t })}>
                    + Add bot
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="section-title">Battlefield {isHost ? '' : '(host picks)'}</div>
        <div className="row">
          {MAPS.map((m) => (
            <button
              key={m.id}
              className={`btn small ${lobby.settings.mapId === m.id ? 'selected' : ''}`}
              disabled={!isHost}
              onClick={() => session.send('settings', { mapId: m.id, mapSeed: null })}
              title={m.blurb}
            >
              {m.name}
            </button>
          ))}
          {isHost && (
            <button
              className="btn small"
              onClick={() => session.send('settings', { mapSeed: Math.floor(Math.random() * 1e9) })}
            >
              Remix
            </button>
          )}
        </div>
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <span>Turn timer</span>
          <div className="seg" role="group" aria-label="Turn timer">
            {TIMERS.map((s) => (
              <button
                key={s}
                disabled={!isHost}
                className={lobby.settings.turnSeconds === s ? 'on' : ''}
                onClick={() => session.send('settings', { turnSeconds: s })}
              >
                {s === 0 ? 'Off' : `${s}s`}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-foot">
          <button className="btn" onClick={onLeave}>
            Leave room
          </button>
          <span style={{ color: 'var(--ink-soft)' }}>
            {blocker ?? (isHost ? 'Everyone is ready!' : 'Waiting for the host to start...')}
          </span>
          {isHost ? (
            <button className="btn primary" disabled={!!blocker} onClick={() => session.send('start', {})}>
              Start Battle!
            </button>
          ) : (
            <button
              className={`btn primary ${self?.ready ? 'selected' : ''}`}
              onClick={() => session.send('ready', { ready: !self?.ready })}
            >
              {self?.ready ? 'Ready ✓' : "I'm ready"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LobbyRow({ p, me, isHost }: { p: LobbyPlayer; me: string; isHost: boolean }) {
  const mine = p.id === me;
  const editable = mine || (isHost && p.bot);
  const setKind = (kind: (typeof UNIT_KINDS)[number]) =>
    p.bot ? session.send('updateBot', { id: p.id, kind }) : session.send('profile', { kind });
  return (
    <div className={`slot lobby-row ${mine ? 'mine' : ''}`}>
      <div className="row">
        <strong>{p.name}</strong>
        {p.host && <span className="tag">host</span>}
        {mine && <span className="tag">you</span>}
        {p.bot && <span className="tag">bot</span>}
        {!p.bot && !p.connected && <span className="tag warn">reconnecting</span>}
        {!p.bot && !p.host && (
          <span className={`tag ${p.ready ? 'ok' : ''}`}>{p.ready ? 'ready' : 'not ready'}</span>
        )}
        {isHost && p.bot && (
          <>
            <div className="seg" role="group" aria-label="Bot difficulty">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  className={p.botLevel === l ? 'on' : ''}
                  onClick={() => session.send('updateBot', { id: p.id, botLevel: l })}
                >
                  {l[0].toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
            <button
              className="btn small"
              onClick={() => session.send('removeBot', { id: p.id })}
              aria-label={`Remove ${p.name}`}
            >
              ✕
            </button>
          </>
        )}
      </div>
      {editable ? (
        <div className="kind-picker" role="radiogroup" aria-label="Unit">
          {UNIT_KINDS.map((k) => (
            <button
              key={k}
              className={`kind-btn ${p.kind === k ? 'selected' : ''}`}
              onClick={() => setKind(k)}
              title={UNITS[k].name}
              role="radio"
              aria-checked={p.kind === k}
            >
              <img src={unitIconUrl(k, p.team)} alt={UNITS[k].name} />
            </button>
          ))}
        </div>
      ) : (
        <div className="row">
          <img src={unitIconUrl(p.kind, p.team)} alt="" width={48} height={45} />
          <span className="kind-info">{UNITS[p.kind].name}</span>
        </div>
      )}
    </div>
  );
}
