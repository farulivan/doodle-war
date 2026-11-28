/** A touch screen, or anywhere with ?touch in the URL: on-screen controls, and an on-screen keyboard to type. */
export const isTouch =
  window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');

/** Someone is typing in a text field on a touch screen, so the on-screen keyboard is likely up. */
export function typingOnTouch(): boolean {
  const el = document.activeElement;
  return isTouch && el instanceof HTMLInputElement && el.type === 'text';
}
