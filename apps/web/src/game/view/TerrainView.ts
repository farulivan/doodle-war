import { EMPTY, INK, Terrain, type Rect } from '@doodle/sim';
import type Phaser from 'phaser';

const CHUNK = 256;
/** Each chunk texture overlaps its neighbors by 1px so no seams show at fractional scroll. */
const BLEED = 1;
const TEX = CHUNK + BLEED * 2;
/** Shading depends on distance to the nearest edge, measured up to this many px. */
const EDGE_RANGE = 22;
const REGION = TEX + EDGE_RANGE * 2;

// Pencil-on-paper palette, as RGBA bytes.
const OUTLINE = [43, 43, 43, 255];
const OUTLINE_SOFT = [88, 86, 82, 245];
const INK_OUTLINE = [19, 40, 111, 255];

let nextViewId = 1;

/**
 * Renders the terrain mask as pencil shading, split into 256px chunks so a crater only
 * re-uploads the few chunks it touches. Keeps its own copy of the mask and replays the
 * sim's integer carve operations in step with the shot animation.
 */
export class TerrainView {
  readonly view: Terrain;
  private readonly scene: Phaser.Scene;
  private readonly id = nextViewId++;
  private readonly cols: number;
  private readonly rows: number;
  private readonly textures: Phaser.Textures.CanvasTexture[] = [];
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly dirty = new Set<number>();
  /** 1 = graphite smudge, 2 = ink stain, around craters. */
  private readonly scorch: Uint8Array;
  private readonly image: ImageData;
  /** Chamfer distance-to-edge scratch buffer (units of 1/3 px). */
  private readonly dist = new Uint8Array(REGION * REGION);

  constructor(scene: Phaser.Scene, source: Terrain, depth: number) {
    this.scene = scene;
    this.view = source.clone();
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

    const empty = (x: number, y: number) => x < 0 || x >= w || y < 0 || y >= h || data[y * w + x] === EMPTY;

    this.computeEdgeDistance(ox, oy);
    const dist = this.dist;

    for (let lx = 0; lx < TEX; lx++) {
      const x = ox + lx;
      for (let ly = 0; ly < TEX; ly++) {
        const y = oy + ly;
        const o = (ly * TEX + lx) * 4;
        if (x < 0 || y < 0 || x >= w || y >= h) {
          px[o + 3] = 0;
          continue;
        }
        const v = data[y * w + x];
        if (v === EMPTY) {
          px[o + 3] = 0;
          continue;
        }
        const edge = dist[(ly + EDGE_RANGE) * REGION + lx + EDGE_RANGE] / 3;
        const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        const grain = ((hash >>> 8) & 15) - 8;

        let r: number;
        let g: number;
        let b: number;
        let a = 255;
        if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) {
          const c = v === INK ? INK_OUTLINE : OUTLINE;
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
          const c = v === INK ? INK_OUTLINE : OUTLINE_SOFT;
          r = c[0];
          g = c[1];
          b = c[2];
          a = c[3];
        } else if (v === INK) {
          r = 34 + grain;
          g = 68 + grain;
          b = 170 + grain;
        } else {
          const tone = shade(x, y, edge, grain);
          r = tone + 6;
          g = tone + 2;
          b = tone - 8;
          a = 236;
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

/** Graphite shading: darker along edges, hatched throughout, cross-hatched in the interior. */
function shade(x: number, y: number, edge: number, grain: number): number {
  const rim = Math.max(0, 1 - edge / EDGE_RANGE);
  let tone = 222 - rim * rim * 42;
  const diag = (x + y) % 7;
  if (diag === 0) tone -= 44;
  else if (diag === 1) tone -= 12;
  if (edge >= EDGE_RANGE - 1 && (x - y + 7000) % 9 === 0) tone -= 26;
  return tone + grain;
}
