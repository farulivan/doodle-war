import { useEffect, useRef, useState } from 'react';
import { isTouch } from '../game/device';
import { hud, useStore } from '../game/store';

const KEY = 'doodle-war:tutorial:v1';

interface Step {
  text: string;
  hint: string;
}

const STEPS: Step[] = [
  {
    text: isTouch ? 'Walk with ◀ ▶' : 'Walk with ← → (or A / D)',
    hint: 'Walking uses up your movement for the turn.',
  },
  { text: isTouch ? 'Aim with ▲ ▼' : 'Aim with ↑ ↓ (or W / S)', hint: 'Tap for 1°, hold to sweep.' },
  {
    text: isTouch ? 'Hold FIRE, let go to shoot!' : 'Hold SPACE, let go to shoot!',
    hint: 'The longer you hold, the harder you throw.',
  },
  { text: 'Mind the wind!', hint: 'The fan up top shows which way your shots get pushed.' },
];

/** First-match tips that tick off as the player actually does each thing. */
export function CoachMarks() {
  const [step, setStep] = useState(() => Number(localStorage.getItem(KEY) ?? 0));
  const phase = useStore(hud, (s) => s.phase);
  const moveLeft = useStore(hud, (s) => s.moveLeft);
  const angle = useStore(hud, (s) => s.angle);
  const turnNumber = useStore(hud, (s) => s.turnNumber);
  const startAngle = useRef<number | null>(null);
  const startMove = useRef<number | null>(null);
  // Wait for the turn banner to clear before showing a tip.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    if (phase !== 'aim') return;
    const id = window.setTimeout(() => setSettled(true), 1500);
    return () => window.clearTimeout(id);
  }, [phase, turnNumber]);
  const shownOnTurn = useRef<number | null>(null);

  const advance = (to: number) => {
    localStorage.setItem(KEY, String(to));
    setStep(to);
  };

  useEffect(() => {
    if (phase === 'aim') {
      startAngle.current ??= angle;
      startMove.current ??= moveLeft;
    } else {
      startAngle.current = null;
      startMove.current = null;
    }
  }, [phase, angle, moveLeft]);

  useEffect(() => {
    if (phase !== 'aim' && step < 3) {
      if (step === 2 && phase === 'shot') advance(3);
      return;
    }
    if (step === 0 && startMove.current !== null && moveLeft < startMove.current - 4) advance(1);
    else if (step === 1 && startAngle.current !== null && angle !== startAngle.current) advance(2);
  }, [phase, moveLeft, angle, step]);

  // The wind tip shows on the next turn of ours, then fades on its own.
  useEffect(() => {
    if (step !== 3 || phase !== 'aim') return;
    shownOnTurn.current ??= turnNumber;
    const id = window.setTimeout(() => advance(4), 6000);
    return () => window.clearTimeout(id);
  }, [step, phase, turnNumber]);

  if (step >= STEPS.length || phase !== 'aim' || !settled) return null;
  const s = STEPS[step];
  return (
    <div className="coach sheet interactive" role="status">
      <div className="coach-step">
        Tip {step + 1}/{STEPS.length}
      </div>
      <div className="coach-text">{s.text}</div>
      <div className="coach-hint">{s.hint}</div>
      <button className="btn small" onClick={() => advance(STEPS.length)}>
        Skip tips
      </button>
    </div>
  );
}
