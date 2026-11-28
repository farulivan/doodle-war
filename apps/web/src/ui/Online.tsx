import { MAX_PER_TEAM, UNITS, type BotLevel, type LobbyPlayer } from '@doodle/sim';
import { useState } from 'react';
import { unitIconUrl } from '../game/art/portrait';
import { team as teamStyle } from '../game/art/palette';
import { useStore } from '../game/store';
import { online, onlineAvailable, savedName, session } from '../net/online';
import { CharacterSelect } from './CharacterSelect';
import { TimerPicker } from './MatchOptions';
import { ROSTER, mapById } from './roster';
import { MapCanvas, StageSelect } from './StageSelect';

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

export function Lobby({ onLeave }: { onLeave(): void }) {
  const lobby = useStore(online, (s) => s.lobby);
  const me = useStore(online, (s) => s.me);
  const status = useStore(online, (s) => s.status);
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState<LobbyPlayer | null>(null);
  const [stage, setStage] = useState(false);
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
  const map = mapById(lobby.settings.mapId);
  const perTeam = Math.max(1, teamCount(0), teamCount(1));

  if (picking) {
    // The lobby may have moved on while the select was open; edit the player as they are now.
    const p = lobby.players.find((x) => x.id === picking.id) ?? picking;
    return (
      <CharacterSelect
        title={p.bot ? `Choose a doodle for ${p.name}` : 'Choose your doodle'}
        kicker={`${teamStyle(p.team).name} · Room ${lobby.code}`}
        teamIndex={p.team}
        value={p.kind}
        confirmLabel="Done"
        onBack={() => setPicking(null)}
        onConfirm={(kind) => {
          if (p.bot) session.send('updateBot', { id: p.id, kind });
          else session.send('profile', { kind });
          setPicking(null);
        }}
      />
    );
  }

  if (stage) {
    return (
      <StageSelect
        mapId={lobby.settings.mapId}
        mapSeed={lobby.settings.mapSeed}
        perTeam={perTeam}
        readOnly={!isHost}
        allowRandom={false}
        confirmLabel="Done"
        onChange={(mapId, mapSeed) => session.send('settings', { mapId, mapSeed })}
        onBack={() => setStage(false)}
        onConfirm={() => setStage(false)}
      >
        <TimerPicker
          value={lobby.settings.turnSeconds}
          disabled={!isHost}
          onChange={(turnSeconds) => session.send('settings', { turnSeconds })}
        />
      </StageSelect>
    );
  }

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
                  <LobbyRow key={p.id} p={p} me={me} isHost={isHost} onPick={() => setPicking(p)} />
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

        <div className="section-title">Battlefield {isHost ? '' : '(the host picks)'}</div>
        <button className="lobby-stage" onClick={() => setStage(true)}>
          <MapCanvas
            mapId={map.id}
            seed={lobby.settings.mapSeed}
            width={240}
            height={110}
            perTeam={perTeam}
          />
          <span className="lobby-stage-text">
            <b>{map.name}</b>
            <span>{map.blurb}</span>
            <span className="lobby-stage-meta">
              {lobby.settings.mapSeed !== null ? 'Remixed layout · ' : ''}
              {lobby.settings.turnSeconds === 0 ? 'No turn timer' : `${lobby.settings.turnSeconds}s turns`}
            </span>
            <span className="btn small">{isHost ? 'Change stage' : 'View stage'}</span>
          </span>
        </button>

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

function LobbyRow({
  p,
  me,
  isHost,
  onPick,
}: {
  p: LobbyPlayer;
  me: string;
  isHost: boolean;
  onPick(): void;
}) {
  const mine = p.id === me;
  const editable = mine || (isHost && p.bot);
  const def = UNITS[p.kind];
  return (
    <div
      className={`slot-card lobby-row ${mine ? 'mine' : ''}`}
      style={{ ['--accent' as string]: ROSTER[p.kind].accent }}
    >
      <button
        className="slot-portrait"
        onClick={onPick}
        disabled={!editable}
        title={editable ? 'Change doodle' : def.name}
      >
        <img src={unitIconUrl(p.kind, p.team)} alt={def.name} />
        {editable && <span className="change">Change</span>}
      </button>
      <div className="slot-body">
        <div className="row">
          <strong className="lobby-name">{p.name}</strong>
          {p.host && <span className="tag">host</span>}
          {mine && <span className="tag">you</span>}
          {p.bot && <span className="tag">bot</span>}
          {!p.bot && !p.connected && <span className="tag warn">reconnecting</span>}
          {!p.bot && !p.host && (
            <span className={`tag ${p.ready ? 'ok' : ''}`}>{p.ready ? 'ready' : 'not ready'}</span>
          )}
        </div>
        <div className="slot-doodle">
          <b>{def.name}</b> · {def.role}
        </div>
        {isHost && p.bot && (
          <div className="row">
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
          </div>
        )}
      </div>
    </div>
  );
}
