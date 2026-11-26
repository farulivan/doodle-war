export const EMPTY = 0;
/** Pencil-drawn ground from the map. */
export const DIRT = 1;
/** Ink lines players draw with the Draw ability. */
export const INK = 2;

/** Inclusive pixel rectangle. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The battlefield as a byte-per-pixel mask. This is the single source of truth for
 * collisions; renderers keep their own copy and replay the same integer operations.
 */
export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, data?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8Array(width * height);
  }

  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return EMPTY;
    return this.data[y * this.width + x];
  }

  solid(x: number, y: number): boolean {
    return this.get(x, y) !== EMPTY;
  }

  set(x: number, y: number, value: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[y * this.width + x] = value;
  }

  /** Erases a filled circle. Returns the touched area, clipped to the map, or null if off-map. */
  carveCircle(cx: number, cy: number, r: number): Rect | null {
    return this.fillCircle(cx, cy, r, EMPTY);
  }

  fillCircle(
    cx: number,
    cy: number,
    r: number,
    value: number,
    skip?: (x: number, y: number) => boolean,
  ): Rect | null {
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.round(r);
    const rect = this.clip({ x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r });
    if (!rect) return null;
    const r2 = r * r;
    for (let y = rect.y0; y <= rect.y1; y++) {
      const dy = y - cy;
      const rem = r2 - dy * dy;
      if (rem < 0) continue;
      const half = Math.floor(Math.sqrt(rem));
      const xa = Math.max(rect.x0, cx - half);
      const xb = Math.min(rect.x1, cx + half);
      const row = y * this.width;
      for (let x = xa; x <= xb; x++) {
        if (skip && skip(x, y)) continue;
        this.data[row + x] = value;
      }
    }
    return rect;
  }

  /** Stamps circles along a segment to make a thick line. */
  fillThickLine(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    value: number,
    skip?: (x: number, y: number) => boolean,
  ): Rect | null {
    const r = Math.max(1, Math.round(thickness / 2));
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, r / 2)));
    let total: Rect | null = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rect = this.fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, value, skip);
      if (rect) total = total ? unionRect(total, rect) : rect;
    }
    return total;
  }

  /** First solid y in a column, scanning from the top, or null if the column is empty. */
  topSurface(x: number): number | null {
    x = Math.floor(x);
    if (x < 0 || x >= this.width) return null;
    for (let y = 0; y < this.height; y++) {
      if (this.data[y * this.width + x] !== EMPTY) return y;
    }
    return null;
  }

  clone(): Terrain {
    return new Terrain(this.width, this.height, this.data.slice());
  }

  clip(rect: Rect): Rect | null {
    const x0 = Math.max(0, rect.x0);
    const y0 = Math.max(0, rect.y0);
    const x1 = Math.min(this.width - 1, rect.x1);
    const y1 = Math.min(this.height - 1, rect.y1);
    if (x0 > x1 || y0 > y1) return null;
    return { x0, y0, x1, y1 };
  }
}

export function unionRect(a: Rect, b: Rect): Rect {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}
