import type { UnitKind } from '@doodle/sim';
import type Phaser from 'phaser';
import { DESIGNS } from '../art/characters';
import { makeCanvas, renderRig, type RenderedRig } from '../art/render';

/** Rig parts are drawn this many times larger than they show at zoom 1, so they stay sharp up close. */
export const RIG_RES = 3;

export const rigKey = (kind: UnitKind) => `rig-${kind}`;
export const frameKey = (part: string, frame: string, boil: number) => `${part}|${frame}|${boil}`;

export interface RigAtlas {
  key: string;
  rig: RenderedRig;
}

const atlases = new Map<UnitKind, RigAtlas>();

/**
 * Draws a doodle's parts once and packs them into one texture, with a frame for every part, frame and
 * boil variant. Team parts are drawn white and tinted per unit. Kept for the whole session: Phaser can't
 * drop a texture that an image still shows.
 */
export function rigAtlas(scene: Phaser.Scene, kind: UnitKind): RigAtlas {
  const key = rigKey(kind);
  const hit = atlases.get(kind);
  if (hit && scene.textures.exists(key)) return hit;

  const rig = renderRig(DESIGNS[kind], RIG_RES, '#ffffff');
  const items: { name: string; c: HTMLCanvasElement }[] = [];
  for (const [part, rendered] of rig.parts) {
    for (const [frame, variants] of rendered.frames) {
      variants.forEach((c, boil) => items.push({ name: frameKey(part, frame, boil), c }));
    }
  }
  // Shelf packing, tallest first.
  items.sort((a, b) => b.c.height - a.c.height);
  const width = 1024;
  const pad = 2;
  let x = 0;
  let y = 0;
  let shelf = 0;
  const placed = items.map((it) => {
    if (x + it.c.width > width) {
      x = 0;
      y += shelf + pad;
      shelf = 0;
    }
    const at = { ...it, x, y };
    x += it.c.width + pad;
    shelf = Math.max(shelf, it.c.height);
    return at;
  });
  const canvas = makeCanvas(width, y + shelf);
  const ctx = canvas.getContext('2d')!;
  for (const p of placed) ctx.drawImage(p.c, p.x, p.y);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (const p of placed) tex.add(p.name, 0, p.x, p.y, p.c.width, p.c.height);

  const atlas = { key, rig };
  atlases.set(kind, atlas);
  return atlas;
}
