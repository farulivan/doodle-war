import { useEffect, useState } from 'react';
import { audio } from '../game/audio';
import { controller } from '../game/controller';
import { hud, useStore } from '../game/store';
import { online, session } from '../net/online';
import { HowTo } from './HowTo';
import { Hud } from './Hud';
import { Lobby, OnlineMenu } from './Online';
import { Results } from './Results';
import { Setup } from './Setup';
import { SettingsPanel } from './SettingsPanel';
import { Title } from './Title';
import { loadSetup, quickPlayConfig, toMatchConfig, type SetupState } from './setupModel';

type Screen = 'loading' | 'nowebgl' | 'title' | 'setup' | 'howto' | 'settings' | 'online' | 'battle';

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const inviteCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? undefined;

export function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [setup, setSetup] = useState<SetupState>(loadSetup);
  const summary = useStore(hud, (s) => s.summary);
  const status = useStore(online, (s) => s.status);
  const lobbyPhase = useStore(online, (s) => s.lobby?.phase);
  const inOnlineMatch = useStore(hud, (s) => s.online && s.mode === 'match');
  const connected = status === 'connected' || status === 'reconnecting';

  useEffect(() => {
    let alive = true;
    if (!hasWebGL()) {
      setScreen('nowebgl');
      return;
    }
    void controller.mount(document.getElementById('game')!).then(async () => {
      if (!alive) return;
      const resumed = await session.resume();
      if (!alive) return;
      setScreen(inviteCode && !resumed ? 'online' : 'title');
      if (!resumed) void controller.startDemo();
    });
    return () => {
      alive = false;
    };
  }, []);

  // Back in the lobby after an online match: drop the battle view, show bots in the background.
  useEffect(() => {
    if (inOnlineMatch && lobbyPhase === 'lobby') {
      controller.leaveOnlineView();
      void controller.startDemo();
    }
  }, [inOnlineMatch, lobbyPhase]);

  // Lost the connection for good mid-match.
  useEffect(() => {
    if (!connected && inOnlineMatch) {
      controller.stop();
      setScreen('online');
      void controller.startDemo();
    }
  }, [connected, inOnlineMatch]);

  const toMenu = () => {
    controller.stop();
    setScreen('title');
    void controller.startDemo();
  };

  const leaveOnline = () => {
    void session.leave();
    toMenu();
  };

  const start = (s: SetupState) => {
    audio.unlock();
    setSetup(s);
    setScreen('battle');
    void controller.startMatch(toMatchConfig(s), { turnSeconds: s.turnSeconds });
  };

  if (screen === 'nowebgl') {
    return (
      <div className="screen">
        <div className="sheet overlay-card ruled interactive">
          <h2>No WebGL here</h2>
          <p>
            Doodle War needs WebGL to draw the battlefield. Try a recent Chrome, Firefox, Safari or Edge, or
            turn on hardware acceleration.
          </p>
        </div>
      </div>
    );
  }

  if (screen === 'loading') {
    return (
      <div className="screen">
        <div className="sheet overlay-card">
          <h2>Sharpening pencils...</h2>
        </div>
      </div>
    );
  }

  if (connected) {
    if (inOnlineMatch) {
      return (
        <>
          <Hud onQuit={leaveOnline} />
          {summary && (
            <Results
              summary={summary}
              onRematch={() => session.send('backToLobby', {})}
              onSetup={() => session.send('backToLobby', {})}
              onMenu={leaveOnline}
            />
          )}
          {status === 'reconnecting' && <div className="toast sheet">Connection lost. Reconnecting...</div>}
        </>
      );
    }
    return <Lobby onLeave={leaveOnline} />;
  }

  return (
    <>
      {screen === 'title' && (
        <Title
          onQuickPlay={() => {
            audio.unlock();
            setScreen('battle');
            void controller.startMatch(quickPlayConfig(setup), { turnSeconds: setup.turnSeconds });
          }}
          onCustom={() => setScreen('setup')}
          onOnline={() => {
            audio.unlock();
            setScreen('online');
          }}
          onHowTo={() => setScreen('howto')}
          onSettings={() => {
            audio.unlock();
            setScreen('settings');
          }}
        />
      )}
      {screen === 'settings' && <SettingsPanel onClose={() => setScreen('title')} />}
      {screen === 'setup' && <Setup initial={setup} onBack={() => setScreen('title')} onStart={start} />}
      {screen === 'howto' && <HowTo onBack={() => setScreen('title')} />}
      {screen === 'online' && <OnlineMenu onBack={() => setScreen('title')} initialCode={inviteCode} />}
      {screen === 'battle' && (
        <>
          <Hud onQuit={toMenu} />
          {summary && (
            <Results
              summary={summary}
              onRematch={() => void controller.rematch()}
              onSetup={() => {
                controller.stop();
                setSetup(loadSetup());
                setScreen('setup');
                void controller.startDemo();
              }}
              onMenu={toMenu}
            />
          )}
        </>
      )}
    </>
  );
}
