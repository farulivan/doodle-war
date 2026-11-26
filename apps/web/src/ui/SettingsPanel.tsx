import { audio } from '../game/audio';
import { settings, type Settings } from '../game/settings';
import { useStore } from '../game/store';

export function SettingsPanel({ onClose }: { onClose(): void }) {
  const s = useStore(settings, (x) => x);
  const set = (patch: Partial<Settings>) => settings.set(patch);
  return (
    <div className="screen dim interactive" role="dialog" aria-label="Settings">
      <div className="sheet overlay-card ruled settings-card">
        <h2>Settings</h2>
        <div className="settings-grid">
          <Slider label="Music" value={s.music} onChange={(music) => set({ music })} />
          <Slider
            label="Sound effects"
            value={s.sfx}
            onChange={(sfx) => {
              set({ sfx });
              audio.play('click');
            }}
          />
          <Toggle label="Mute everything" checked={s.muted} onChange={(muted) => set({ muted })} />
          <Toggle
            label="Screen shake"
            checked={s.screenShake}
            onChange={(screenShake) => set({ screenShake })}
          />
          <Toggle
            label="Show my last shot's path"
            checked={s.tracer}
            onChange={(tracer) => set({ tracer })}
          />
          <Toggle
            label="Reduced motion"
            checked={s.reducedMotion}
            onChange={(reducedMotion) => set({ reducedMotion })}
          />
        </div>
        <div className="menu">
          <button className="btn primary" onClick={onClose} autoFocus>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange(v: number): void }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="setting-val">{Math.round(value * 100)}</span>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label className="setting toggle">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </label>
  );
}
