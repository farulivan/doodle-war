import { MAPS, UNITS } from '@doodle/sim';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { renderMapPreview } from '../game/art/mapPreview';
import { materialFor } from '../game/art/materials';
import { unitIconUrl } from '../game/art/portrait';
import { audio } from '../game/audio';
import { STAGES, mapById, windLabel } from './roster';

/** 'random' picks a map when the match starts. */
export type StagePick = string;

interface Props {
  mapId: StagePick;
  mapSeed: number | null;
  /** Doodles per team, for the spawn flags. */
  perTeam: number;
  onChange(mapId: StagePick, seed: number | null): void;
  onBack(): void;
  onConfirm(): void;
  confirmLabel: string;
  step?: string;
  /** Only the host picks online; everyone else watches the choice. */
  readOnly?: boolean;
  /** Offer a random page. Online rooms need a real map. */
  allowRandom?: boolean;
  /** Extra settings for the footer, such as the opponent or the turn timer. */
  children?: ReactNode;
}

/** Draws a map preview into a canvas at the screen's pixel density. */
export function MapCanvas({
  mapId,
  seed,
  width,
  height,
  perTeam,
}: {
  mapId: string;
  seed: number | null;
  width: number;
  height: number;
  perTeam: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    c.width = w;
    c.height = h;
    // Building a map takes a moment the first time; let the screen paint first.
    const id = window.setTimeout(() => {
      c.getContext('2d')!.drawImage(renderMapPreview(mapId, seed, w, h, perTeam), 0, 0);
    }, 0);
    return () => window.clearTimeout(id);
  }, [mapId, seed, width, height, perTeam]);
  return <canvas ref={ref} style={{ width, height }} aria-hidden="true" />;
}

/**
 * The stage select: a big preview of the page, what makes it play differently, and every map to flip
 * through. Arrow keys browse, R remixes the layout, Enter fights.
 */
export function StageSelect({
  mapId,
  mapSeed,
  perTeam,
  onChange,
  onBack,
  onConfirm,
  confirmLabel,
  step,
  readOnly,
  allowRandom = true,
  children,
}: Props) {
  const random = mapId === 'random';
  const map = mapById(random ? MAPS[0].id : mapId);
  const info = STAGES[map.id];
  const [spin, setSpin] = useState(0);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => confirmRef.current?.focus({ preventScroll: true }), []);

  const choose = (id: StagePick) => {
    if (readOnly) return;
    audio.play('select');
    onChange(id, id === mapId ? mapSeed : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const ids = [...MAPS.map((m) => m.id), ...(allowRandom ? ['random'] : [])];
      const i = ids.indexOf(mapId);
      if (e.key === 'ArrowRight') choose(ids[(i + 1) % ids.length]);
      else if (e.key === 'ArrowLeft') choose(ids[(i - 1 + ids.length) % ids.length]);
      else if (e.key === 'Enter') onConfirm();
      else if (e.key === 'Escape') onBack();
      else if ((e.key === 'r' || e.key === 'R') && !random && !readOnly) remix();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const remix = () => {
    audio.play('whoosh');
    setSpin((s) => s + 1);
    onChange(mapId, Math.floor(Math.random() * 1e9));
  };

  return (
    <div className="screen dim select-screen">
      <div className="sheet select-card stage-card interactive" role="dialog" aria-label="Pick a battlefield">
        <header className="select-head">
          <button className="btn small" onClick={onBack}>
            ← Back
          </button>
          <div className="select-title">
            <h2>{readOnly ? 'The battlefield' : 'Pick a battlefield'}</h2>
          </div>
          {step ? <span className="step-chip">{step}</span> : <span />}
        </header>

        <div className="stage-main">
          <div className="stage-preview">
            {random ? (
              <div className="random-preview">
                <span>?</span>
                <p>A surprise page, picked when the match starts.</p>
              </div>
            ) : (
              <MapCanvas
                mapId={map.id}
                seed={mapSeed}
                width={620}
                height={330}
                perTeam={perTeam}
                key={spin}
              />
            )}
            {!random && mapSeed !== null && <span className="remix-chip">Remixed layout</span>}
          </div>
          <div className="stage-info">
            <h3 className="stage-name">{random ? 'Random page' : map.name}</h3>
            <p className="pitch">{random ? 'Any of the five battlefields.' : map.blurb}</p>
            {!random && (
              <>
                <div className="stage-facts">
                  <div>
                    <span className="fact-label">Ground</span>
                    <b>{materialFor(map.id).name}</b>
                  </div>
                  <div>
                    <span className="fact-label">Wind</span>
                    <b>
                      <span className="wind-pips" aria-label={`Up to ${map.windMax} of 10`}>
                        {[2, 4, 6, 8, 10].map((n) => (
                          <i key={n} className={map.windMax >= n ? 'on' : ''} />
                        ))}
                      </span>{' '}
                      {windLabel(map.windMax)}
                    </b>
                  </div>
                  <div>
                    <span className="fact-label">Size</span>
                    <b>{info.size}</b>
                  </div>
                </div>
                <div className="tags">
                  {info.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
                <div className="favors">
                  <span className="fact-label">Shines here</span>
                  {info.favors.map((k) => (
                    <span className="favor" key={k} title={UNITS[k].name}>
                      <img src={unitIconUrl(k, 0)} alt="" />
                      {UNITS[k].name}
                    </span>
                  ))}
                </div>
                <p className="fair-note">
                  Both halves of every page are mirror images, and so are the spawns.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="stage-strip" role="radiogroup" aria-label="Battlefields">
          {MAPS.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mapId === m.id}
              className={`stage-thumb ${mapId === m.id ? 'picked' : ''}`}
              onClick={() => choose(m.id)}
              disabled={readOnly && mapId !== m.id}
            >
              <MapCanvas
                mapId={m.id}
                seed={mapId === m.id ? mapSeed : null}
                width={150}
                height={80}
                perTeam={0}
              />
              <span>{m.name}</span>
            </button>
          ))}
          {allowRandom && (
            <button
              role="radio"
              aria-checked={random}
              className={`stage-thumb random ${random ? 'picked' : ''}`}
              onClick={() => choose('random')}
              disabled={readOnly && !random}
            >
              <div className="random-thumb">?</div>
              <span>Random</span>
            </button>
          )}
        </div>

        <footer className="select-foot">
          <div className="row">
            {!readOnly && !random && (
              <>
                <button className="btn small" onClick={remix} title="A new layout of this map (R)">
                  🎲 Remix layout
                </button>
                {mapSeed !== null && (
                  <button className="btn small" onClick={() => onChange(mapId, null)}>
                    Classic layout
                  </button>
                )}
              </>
            )}
            {children}
          </div>
          <button className="btn primary big" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
