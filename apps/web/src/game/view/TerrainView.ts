import { EMPTY, GLUE, INK, Terrain, circleSkipper, type Rect } from '@doodle/sim';
import type Phaser from 'phaser';
import { materialFor, type Material, type RGB } from '../art/materials';

const CHUNK = 256;
/** Each chunk texture overlaps its neighbors by 1px so no seams show at fractional scroll. */
const BLEED = 1;
const TEX = CHUNK + BLEED * 2;
/** Shading depends on distance to the nearest edge, measured up to this many px. */
const EDGE_RANGE = 22;
const REGION = TEX + EDGE_RANGE * 2;

const INK_MAT: Material = {
  fill: [52, 84, 196],
  dark: [26, 40, 120],
  outline: [19, 30, 100],
  hatch: 0,
};
const GLUE_MAT: Material = {
  fill: [247, 243, 233],
  dark: [190, 184, 214],
  outline: [128, 120, 156],
  hatch: 0,
};

let nextViewId = 1;

/**
 * Renders the terrain mask in the map's own material (graphite, sticky notes, coffee, ballpoint,
 * cardboard), split into 256px chunks so a crater only re-uploads the few chunks it touches. Keeps its own
 * copy of the mask and replays the sim's integer carve and build operations in step with the shot.
 */
export class TerrainView {
  readonly view: Terrain;
  private readonly scene: Phaser.Scene;
  private readonly id = nextViewId++;
  private readonly cols: number;
  private readonly rows: number;
  private readonly material: Material;
  private readonly textures: Phaser.Textures.CanvasTexture[] = [];
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly dirty = new Set<number>();
  /** 1 = graphite smudge, 2 = ink stain, 3 = scorch from a beam, around craters. */
  private readonly scorch: Uint8Array;
  private readonly image: ImageData;
  /** Chamfer distance-to-edge scratch buffer (units of 1/3 px). */
  private readonly dist = new Uint8Array(REGION * REGION);
  /** Solid pixels since the last empty one above, per pixel of the region, capped. */
  private readonly below = new Uint8Array(REGION * REGION);
  /** Empty pixels until the next solid one below, per pixel of the region, capped. */
  private readonly above = new Uint8Array(REGION * REGION);

  constructor(scene: Phaser.Scene, source: Terrain, depth: number, mapId: string) {
    this.scene = scene;
    this.view = source.clone();
    this.material = materialFor(mapId);
    this.cols = Math.ceil(source.width / CHUNK);
    this.rows = Math.ceil(source.height / CHUNK);
    this.scorch = new Uint8Array(source.width * source.height);
    this.image = new ImageData(TEX, TEX);

    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const key = this.key(cx, cy);
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const tex = scene.textures.createCanvas(key, TEX, TEX)!;
        this.textures.push(tex);
        this.images.push(
          scene.add
            .image(cx * CHUNK - BLEED, cy * CHUNK - BLEED, key)
            .setOrigin(0, 0)
            .setDepth(depth),
        );
        this.dirty.add(cy * this.cols + cx);
      }
    }
    this.flush();
  }

  private key(cx: number, cy: number): string {
    return `terrain-${this.id}-${cx}-${cy}`;
  }

  /** Same integer carve the sim did, plus a smudge ring for looks. */
  carve(x: number, y: number, r: number, ink: boolean): void {
    this.view.carveCircle(x, y, r);
    const ring = r + 7;
    const mark = ink ? 2 : 1;
    const w = this.view.width;
    for (let yy = Math.max(0, y - ring); yy <= Math.min(this.view.height - 1, y + ring); yy++) {
      for (let xx = Math.max(0, x - ring); xx <= Math.min(w - 1, x + ring); xx++) {
        const d2 = (xx - x) ** 2 + (yy - y) ** 2;
        if (d2 <= ring * ring && this.view.data[yy * w + xx] !== EMPTY) this.scorch[yy * w + xx] = mark;
      }
    }
    this.markDirty({ x0: x - ring, y0: y - ring, x1: x + ring, y1: y + ring });
  }

  /** Same glue fill the sim did, around the same bodies. */
  build(x: number, y: number, r: number, skip: number[]): void {
    this.view.fillCircle(x, y, r, GLUE, circleSkipper(skip));
    const w = this.view.width;
    for (let yy = Math.max(0, y - r); yy <= Math.min(this.view.height - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
        if (this.view.data[yy * w + xx] === GLUE) this.scorch[yy * w + xx] = 0;
      }
    }
    this.markDirty({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
  }

  /** Copies a region from the sim (used after Draw, which the sim already validated). */
  copyFrom(source: Terrain, rect: Rect): void {
    const w = this.view.width;
    for (let y = rect.y0; y <= rect.y1; y++) {
      const row = y * w;
      for (let x = rect.x0; x <= rect.x1; x++) this.view.data[row + x] = source.data[row + x];
    }
    this.markDirty(rect);
  }

  private markDirty(rect: Rect): void {
    // Outlines and edge shading depend on neighbors, so redraw past the change.
    const pad = EDGE_RANGE + BLEED;
    const x0 = Math.max(0, Math.floor((rect.x0 - pad) / CHUNK));
    const y0 = Math.max(0, Math.floor((rect.y0 - pad) / CHUNK));
    const x1 = Math.min(this.cols - 1, Math.floor((rect.x1 + pad) / CHUNK));
    const y1 = Math.min(this.rows - 1, Math.floor((rect.y1 + pad) / CHUNK));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.dirty.add(cy * this.cols + cx);
  }

  /** Redraws dirty chunks. Call once per frame. */
  flush(): void {
    if (this.dirty.size === 0) return;
    for (const index of this.dirty) this.renderChunk(index % this.cols, Math.floor(index / this.cols));
    this.dirty.clear();
  }

  private renderChunk(cx: number, cy: number): void {
    const t = this.view;
    const w = t.width;
    const h = t.height;
    const data = t.data;
    const px = this.image.data;
    const ox = cx * CHUNK - BLEED;
    const oy = cy * CHUNK - BLEED;
    const mat = this.material;
    const top = mat.top;

    const empty = (x: number, y: number) => x < 0 || x >= w || y < 0 || y >= h || data[y * w + x] === EMPTY;

    this.computeEdgeDistance(ox, oy);
    this.computeColumns(ox, oy);
    const dist = this.dist;

    for (let lx = 0; lx < TEX; lx++) {
      const x = ox + lx;
      // Each column gets its own grass depth and tuft, so the top edge reads as scribbled.
      const ch = ((x * 2654435761) >>> 0) / 4294967296;
      const grass = top ? top.depth + Math.floor(ch * 4) : 0;
      const tuft = top?.tufts && x % 3 === 0 ? 1 + Math.floor(ch * 5) : 0;
      for (let ly = 0; ly < TEX; ly++) {
        const y = oy + ly;
        const o = (ly * TEX + lx) * 4;
        if (x < 0 || y < 0 || x >= w || y >= h) {
          px[o + 3] = 0;
          continue;
        }
        const ri = (ly + EDGE_RANGE) * REGION + lx + EDGE_RANGE;
        const v = data[y * w + x];
        if (v === EMPTY) {
          // Grass blades poke up from the map's own ground.
          const gap = this.above[ri];
          if (tuft && gap <= tuft && gap > 0 && y + gap < h && data[(y + gap) * w + x] !== EMPTY) {
            const c = top!.dark;
            px[o] = c[0];
            px[o + 1] = c[1];
            px[o + 2] = c[2];
            px[o + 3] = 235;
          } else px[o + 3] = 0;
          continue;
        }
        const m = v === INK ? INK_MAT : v === GLUE ? GLUE_MAT : mat;
        const edge = dist[ri] / 3;
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const grain = ((hash >>> 8) & 15) - 8;

        let r: number;
        let g: number;
        let b: number;
        let a = 255;
        if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) {
          const c = m.outline;
          r = c[0];
          g = c[1];
          b = c[2];
        } else if (
          empty(x - 2, y) ||
          empty(x + 2, y) ||
          empty(x, y - 2) ||
          empty(x, y + 2) ||
          empty(x - 1, y - 1) ||
          empty(x + 1, y - 1)
        ) {
          const c = m.outline;
          r = (c[0] * 3 + m.fill[0]) >> 2;
          g = (c[1] * 3 + m.fill[1]) >> 2;
          b = (c[2] * 3 + m.fill[2]) >> 2;
        } else if (v === GLUE) {
          // Glossy glue: lighter toward the top, a shine under the surface.
          const depth = this.below[ri];
          const shine = depth > 3 && depth < 7 && (x + (y >> 1)) % 11 < 5 ? 14 : 0;
          const k = Math.min(1, edge / 10);
          r = lerp(m.dark[0], m.fill[0], k) + shine + (grain >> 1);
          g = lerp(m.dark[1], m.fill[1], k) + shine + (grain >> 1);
          b = lerp(m.dark[2], m.fill[2], k) + shine + (grain >> 1);
        } else if (v === INK) {
          r = m.fill[0] + grain;
          g = m.fill[1] + grain;
          b = m.fill[2] + grain;
        } else if (top && this.below[ri] <= grass) {
          // The ground's top band: grass, crust or ink, depending on the map.
          const c = this.below[ri] <= 2 ? top.dark : top.color;
          r = c[0] + grain;
          g = c[1] + grain;
          b = c[2] + grain;
        } else {
          [r, g, b] = shade(m, x, y, edge, grain);
          a = 242;
        }

        const s = this.scorch[y * w + x];
        if (s === 1) {
          r *= 0.72;
          g *= 0.72;
          b *= 0.72;
        } else if (s === 2) {
          r = r * 0.55;
          g = g * 0.6;
          b = Math.min(255, b * 0.8 + 70);
        }
        px[o] = r;
        px[o + 1] = g;
        px[o + 2] = b;
        px[o + 3] = a;
      }
    }
    const tex = this.textures[cy * this.cols + cx];
    tex.context.putImageData(this.image, 0, 0);
    tex.refresh();
  }

  /** Per column: how deep each solid pixel is below open air, and how far each open pixel is above ground. */
  private computeColumns(ox: number, oy: number): void {
    const t = this.view;
    const w = t.width;
    const h = t.height;
    const data = t.data;
    const rx = ox - EDGE_RANGE;
    const ry = oy - EDGE_RANGE;
    for (let x = 0; x < REGION; x++) {
      const wx = rx + x;
      let run = 255;
      for (let y = 0; y < REGION; y++) {
        const wy = ry + y;
        const solid = wx >= 0 && wy >= 0 && wx < w && wy < h && data[wy * w + wx] !== EMPTY;
        run = solid ? Math.min(255, run + 1) : 0;
        this.below[y * REGION + x] = run;
      }
      let gap = 255;
      for (let y = REGION - 1; y >= 0; y--) {
        const wy = ry + y;
        const solid = wx >= 0 && wy >= 0 && wx < w && wy < h && data[wy * w + wx] !== EMPTY;
        gap = solid ? 0 : Math.min(255, gap + 1);
        this.above[y * REGION + x] = gap;
      }
    }
  }

  /**
   * Two-pass chamfer (3-4) distance transform over the chunk plus a margin, so shading can
   * darken toward edges in every direction without vertical banding under caves.
   */
  private computeEdgeDistance(ox: number, oy: number): void {
    const t = this.view;
    const w = t.width;
    const h = t.height;
    const data = t.data;
    const d = this.dist;
    const cap = EDGE_RANGE * 3;
    const rx = ox - EDGE_RANGE;
    const ry = oy - EDGE_RANGE;
    for (let y = 0; y < REGION; y++) {
      const wy = ry + y;
      for (let x = 0; x < REGION; x++) {
        const wx = rx + x;
        const solid = wx >= 0 && wy >= 0 && wx < w && wy < h && data[wy * w + wx] !== EMPTY;
        d[y * REGION + x] = solid ? cap : 0;
      }
    }
    for (let y = 0; y < REGION; y++) {
      for (let x = 0; x < REGION; x++) {
        const i = y * REGION + x;
        let v = d[i];
        if (v === 0) continue;
        if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3;
        if (y > 0) {
          if (d[i - REGION] + 3 < v) v = d[i - REGION] + 3;
          if (x > 0 && d[i - REGION - 1] + 4 < v) v = d[i - REGION - 1] + 4;
          if (x < REGION - 1 && d[i - REGION + 1] + 4 < v) v = d[i - REGION + 1] + 4;
        }
        d[i] = v;
      }
    }
    for (let y = REGION - 1; y >= 0; y--) {
      for (let x = REGION - 1; x >= 0; x--) {
        const i = y * REGION + x;
        let v = d[i];
        if (v === 0) continue;
        if (x < REGION - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3;
        if (y < REGION - 1) {
          if (d[i + REGION] + 3 < v) v = d[i + REGION] + 3;
          if (x < REGION - 1 && d[i + REGION + 1] + 4 < v) v = d[i + REGION + 1] + 4;
          if (x > 0 && d[i + REGION - 1] + 4 < v) v = d[i + REGION - 1] + 4;
        }
        d[i] = v;
      }
    }
  }

  destroy(): void {
    // Images first: rendering an image whose texture is gone throws inside Phaser.
    for (const img of this.images) img.destroy();
    this.images.length = 0;
    for (const tex of this.textures) {
      if (this.scene.textures.exists(tex.key)) this.scene.textures.remove(tex.key);
    }
    this.textures.length = 0;
  }
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/**
 * The material's interior: darker toward its edges, hatched throughout, cross-hatched or striped deep
 * inside, depending on the material.
 */
export function shade(m: Material, x: number, y: number, edge: number, grain: number): RGB {
  const rim = Math.max(0, 1 - edge / EDGE_RANGE);
  let k = rim * rim * 0.45;
  if (m.hatch > 0) {
    const d = (x + y) % m.hatch;
    if (d === 0) k += 0.32;
    else if (d === 1) k += 0.1;
  }
  if (m.cross && edge >= 6 && (x - y + 7000) % m.cross === 0) k += 0.22;
  if (m.stripes && x % m.stripes === 0) k += 0.18;
  if (m.spots) {
    // Soft stains, like coffee dried on the page.
    const s = Math.sin(x * 0.021) * Math.cos(y * 0.027) + Math.sin((x + y) * 0.013);
    if (s > 1.15) k += 0.16;
  }
  k = Math.min(1, k);
  return [
    lerp(m.fill[0], m.dark[0], k) + grain,
    lerp(m.fill[1], m.dark[1], k) + grain,
    lerp(m.fill[2], m.dark[2], k) + grain,
  ];
}
