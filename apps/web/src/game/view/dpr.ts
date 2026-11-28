/**
 * The canvas renders at the screen's own pixel density, up to 2x, so the doodles stay sharp on high-DPI
 * screens. The camera's zoom includes this factor; the rest of the game works in CSS-pixel zoom.
 */
export const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
