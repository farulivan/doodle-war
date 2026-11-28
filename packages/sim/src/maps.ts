import { Rng } from './rng';
import { DIRT, Terrain } from './terrain';

export type PaperStyle = 'ruled' | 'graph' | 'sticky' | 'dotted';

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  paper: PaperStyle;
  /** Strongest wind this map can roll, 0..10. */
  windMax: number;
  seed: number;
  generate(terrain: Terrain, rng: Rng): void;
}

/** 1D value noise with cosine smoothing, roughly in [-1, 1]. */
function noise1d(rng: Rng, length: number, cell: number): (x: number) => number {
  const n = Math.ceil(length / cell) + 2;
  const values = Array.from({ length: n }, () => rng.range(-1, 1));
  return (x: number) => {
    const f = x / cell;
    const i = Math.floor(f);
    const t = (1 - Math.cos((f - i) * Math.PI)) / 2;
    const a = values[Math.max(0, Math.min(n - 1, i))];
    const b = values[Math.max(0, Math.min(n - 1, i + 1))];
    return a + (b - a) * t;
  };
}

function fbm1d(rng: Rng, length: number, cell: number, octaves = 3): (x: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => noise1d(rng, length, cell / 2 ** o));
  return (x: number) => {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    for (const layer of layers) {
      sum += layer(x) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

/** 2D value noise in [0, 1], used for caves. */
function noise2d(rng: Rng, w: number, h: number, cell: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => rng.next());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / cell;
    const fy = y / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const g = (gx: number, gy: number) => grid[Math.min(gh - 1, gy) * gw + Math.min(gw - 1, gx)];
    const top = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * tx;
    const bottom = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * tx;
    return top + (bottom - top) * ty;
  };
}

/** Fills each column between top(x) and bottom(x). */
function fillColumns(t: Terrain, top: (x: number) => number, bottom: (x: number) => number): void {
  for (let x = 0; x < t.width; x++) {
    const y0 = Math.max(0, Math.round(top(x)));
    const y1 = Math.min(t.height - 1, Math.round(bottom(x)));
    for (let y = y0; y <= y1; y++) t.data[y * t.width + x] = DIRT;
  }
}

/** Erases the far left and right edges so units can be knocked off the page. */
function trimEdges(t: Terrain, margin: number): void {
  for (let y = 0; y < t.height; y++) {
    const row = y * t.width;
    for (let x = 0; x < margin; x++) {
      t.data[row + x] = 0;
      t.data[row + t.width - 1 - x] = 0;
    }
  }
}

/** Pokes cave holes, keeping a crust under the surface so spawns stay solid. */
function carveCaves(t: Terrain, rng: Rng, cell: number, threshold: number, crust: number): void {
  const n = noise2d(rng, t.width, t.height, cell);
  for (let x = 0; x < t.width; x++) {
    const top = t.topSurface(x);
    if (top === null) continue;
    for (let y = top + crust; y < t.height; y++) {
      if (n(x, y) > threshold) t.data[y * t.width + x] = 0;
    }
  }
}

function blob(
  t: Terrain,
  cx: number,
  cy: number,
  halfWidth: number,
  depth: number,
  bumps: (x: number) => number,
): void {
  for (let x = Math.max(0, Math.floor(cx - halfWidth)); x <= Math.min(t.width - 1, cx + halfWidth); x++) {
    const u = (x - cx) / halfWidth;
    const shape = Math.max(0, 1 - u * u);
    const top = cy - 18 * Math.sqrt(shape) + bumps(x) * 26;
    const bottom = cy + depth * Math.pow(shape, 0.55);
    for (let y = Math.max(0, Math.round(top)); y <= Math.min(t.height - 1, Math.round(bottom)); y++) {
      t.data[y * t.width + x] = DIRT;
    }
  }
}

export const MAPS: MapDef[] = [
  {
    id: 'margin-hills',
    name: 'Margin Hills',
    blurb: 'Rolling pencil hills with a few hidden caves.',
    width: 2400,
    height: 1300,
    paper: 'ruled',
    windMax: 8,
    seed: 1207,
    generate(t, rng) {
      const hills = fbm1d(rng, t.width, 520, 4);
      const base = fbm1d(rng, t.width, 300, 2);
      fillColumns(
        t,
        (x) => 720 + hills(x) * 230,
        (x) => 1160 + base(x) * 70,
      );
      carveCaves(t, rng, 70, 0.74, 70);
      trimEdges(t, 40);
    },
  },
  {
    id: 'sticky-notes',
    name: 'Sticky Notes',
    blurb: 'Floating islands over a bottomless page. Mind the gaps.',
    width: 2600,
    height: 1300,
    paper: 'sticky',
    windMax: 9,
    seed: 4242,
    generate(t, rng) {
      const bumps = fbm1d(rng, t.width, 120, 3);
      const count = 7;
      const span = t.width - 220;
      for (let i = 0; i < count; i++) {
        const cx = 110 + (span * (i + 0.5)) / count + rng.range(-40, 40);
        const cy = rng.range(620, 900);
        blob(t, cx, cy, rng.range(130, 175), rng.range(110, 190), bumps);
      }
      // Small stepping stones between the big islands.
      for (let i = 0; i < 5; i++) {
        blob(
          t,
          rng.range(300, t.width - 300),
          rng.range(420, 600),
          rng.range(40, 70),
          rng.range(30, 50),
          bumps,
        );
      }
    },
  },
  {
    id: 'coffee-ring',
    name: 'Coffee Ring',
    blurb: 'A deep valley someone set a mug on. Hold the high ground.',
    width: 2400,
    height: 1300,
    paper: 'dotted',
    windMax: 7,
    seed: 777,
    generate(t, rng) {
      const wobble = fbm1d(rng, t.width, 260, 3);
      const mid = t.width / 2;
      fillColumns(
        t,
        (x) => {
          const u = (x - mid) / mid;
          return 420 + (1 - u * u) * 520 + wobble(x) * 90;
        },
        () => 1200,
      );
      // The mug stain: a round pocket in the valley floor.
      t.carveCircle(mid, 1010, 120);
      carveCaves(t, rng, 80, 0.78, 90);
      trimEdges(t, 30);
    },
  },
  {
    id: 'spiral-tower',
    name: 'Spiral Tower',
    blurb: 'A tall tower splits the page. Lob it over or dig through.',
    width: 2400,
    height: 1400,
    paper: 'graph',
    windMax: 8,
    seed: 9001,
    generate(t, rng) {
      const ground = fbm1d(rng, t.width, 340, 3);
      const mid = t.width / 2;
      fillColumns(
        t,
        (x) => {
          const d = Math.abs(x - mid);
          const tower = d < 190 ? (1 - (d / 190) ** 2) * 560 : 0;
          return 930 + ground(x) * 110 - tower;
        },
        (x) => 1300 + ground(x * 1.7) * 40,
      );
      // Ledges on each side of the tower.
      for (const side of [-1, 1]) {
        blob(t, mid + side * 470, 600, 110, 40, ground);
      }
      carveCaves(t, rng, 75, 0.77, 80);
      trimEdges(t, 40);
    },
  },
  {
    id: 'paper-bridges',
    name: 'Paper Bridges',
    blurb: 'Two cliffs and thin bridges over the void.',
    width: 2600,
    height: 1300,
    paper: 'ruled',
    windMax: 10,
    seed: 3141,
    generate(t, rng) {
      const rough = fbm1d(rng, t.width, 200, 3);
      const cliff = 720;
      fillColumns(
        t,
        (x) => {
          if (x < cliff || x > t.width - cliff) {
            const edge = Math.min(x, t.width - x);
            const slope = edge > cliff - 120 ? (edge - (cliff - 120)) * 1.6 : 0;
            return 640 + rough(x) * 120 + slope;
          }
          return t.height + 10;
        },
        () => 1250,
      );
      const bridges = [
        { y: 700, x0: cliff - 40, x1: t.width - cliff + 40 },
        { y: 480, x0: cliff + 260, x1: t.width - cliff - 260 },
        { y: 930, x0: cliff + 120, x1: t.width - cliff - 120 },
      ];
      for (const b of bridges) {
        for (let x = b.x0; x <= b.x1; x++) {
          const sag = Math.sin(((x - b.x0) / (b.x1 - b.x0)) * Math.PI) * 26;
          const y0 = Math.round(b.y + sag + rough(x) * 6);
          for (let y = y0; y < y0 + 22; y++) t.set(x, y, DIRT);
        }
      }
      trimEdges(t, 30);
    },
  },
];

export function getMap(id: string): MapDef {
  const map = MAPS.find((m) => m.id === id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}

/**
 * Builds a map's terrain. The right half is always the left half mirrored, and so are the spawns (see
 * placeUnits), so both teams start on the same ground whatever the seed.
 */
export function buildTerrain(map: MapDef, seed = map.seed): Terrain {
  const terrain = new Terrain(map.width, map.height);
  map.generate(terrain, new Rng(seed));
  mirror(terrain);
  return terrain;
}

function mirror(t: Terrain): void {
  const half = Math.floor(t.width / 2);
  for (let y = 0; y < t.height; y++) {
    const row = y * t.width;
    for (let x = 0; x < half; x++) t.data[row + t.width - 1 - x] = t.data[row + x];
  }
}
