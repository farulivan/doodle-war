import '@fontsource/patrick-hand/400.css';
import '@fontsource/permanent-marker/400.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { audio } from './game/audio';
import { controller } from './game/controller';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './ui/styles.css';

// Browsers keep audio locked until the first gesture; unlock on whatever comes first.
for (const type of ['pointerdown', 'keydown', 'touchstart'] as const) {
  window.addEventListener(type, () => audio.unlock(), { once: true, passive: true });
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined),
  );
}

if (import.meta.env.DEV) {
  // Handy for poking at the game from the browser console.
  (window as unknown as { doodle: typeof controller }).doodle = controller;
}

createRoot(document.getElementById('ui')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
