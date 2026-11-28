/** What each map's ground is drawn in. The battlefield and the stage previews both use these. */

export type RGB = [number, number, number];

export interface Material {
  /** Name shown on the stage select. */
  name?: string;
  fill: RGB;
  /** The color shading darkens toward: edges, hatching, stripes. */
  dark: RGB;
  outline: RGB;
  /** Diagonal hatching every this many px; 0 for none. */
  hatch: number;
  /** Cross-hatching deep inside, every this many px. */
  cross?: number;
  /** Vertical stripes, like corrugated card. */
  stripes?: number;
  /** Soft stains. */
  spots?: boolean;
  /** A band along the top of the ground: grass, a crust, a scribbled edge. */
  top?: { color: RGB; dark: RGB; depth: number; tufts: boolean };
}

const MATERIALS: Record<string, Material> = {
  'margin-hills': {
    name: 'Graphite hills',
    fill: [222, 216, 204],
    dark: [120, 116, 110],
    outline: [46, 44, 42],
    hatch: 7,
    cross: 9,
    top: { color: [140, 196, 98], dark: [70, 130, 56], depth: 5, tufts: true },
  },
  'sticky-notes': {
    name: 'Sticky notes',
    fill: [176, 226, 196],
    dark: [92, 156, 128],
    outline: [44, 82, 66],
    hatch: 6,
    top: { color: [140, 206, 170], dark: [64, 128, 100], depth: 4, tufts: false },
  },
  'coffee-ring': {
    name: 'Coffee stain',
    fill: [222, 190, 150],
    dark: [136, 92, 58],
    outline: [72, 44, 26],
    hatch: 8,
    spots: true,
    top: { color: [168, 118, 74], dark: [104, 66, 38], depth: 4, tufts: false },
  },
  'spiral-tower': {
    name: 'Ballpoint ink',
    fill: [212, 226, 246],
    dark: [64, 96, 176],
    outline: [28, 44, 110],
    hatch: 6,
    cross: 6,
    top: { color: [112, 148, 222], dark: [44, 70, 156], depth: 3, tufts: false },
  },
  'paper-bridges': {
    name: 'Cardboard',
    fill: [214, 178, 128],
    dark: [140, 100, 58],
    outline: [78, 52, 28],
    hatch: 0,
    stripes: 5,
    top: { color: [190, 150, 98], dark: [118, 80, 44], depth: 3, tufts: false },
  },
};

export function materialFor(mapId: string): Material {
  return MATERIALS[mapId] ?? MATERIALS['margin-hills'];
}
