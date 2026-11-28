import { Pen } from './kit';
import { BOIL_AMOUNT, BOIL_FRAMES, type Design, type PartDef, type Pose } from './rig';

/**
 * Draws a design's parts into canvases, one per frame and boil variant, at a given resolution. The
 * battlefield packs these into one texture; the menus draw them straight onto a canvas with composeRig.
 */

export interface RenderedPart {
  def: PartDef;
  /** Frame name to its boil variants. */
  frames: Map<string, HTMLCanvasElement[]>;
  /** The frame shown when a pose doesn't say. */
  first: string;
}

export interface RenderedRig {
  design: Design;
  res: number;
  parts: Map<string, RenderedPart>;
  /** Children of each part, and of the root under ''. */
  children: Map<string, PartDef[]>;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function renderRig(design: Design, res: number, team: string): RenderedRig {
  const parts = new Map<string, RenderedPart>();
  const children = new Map<string, PartDef[]>([['', []]]);
  design.parts.forEach((def, index) => {
    const [x0, y0, x1, y1] = def.box;
    const frames = new Map<string, HTMLCanvasElement[]>();
    const variants = Math.min(def.boil ?? 1, BOIL_FRAMES);
    for (const [name, draw] of Object.entries(def.frames)) {
      const list: HTMLCanvasElement[] = [];
      for (let v = 0; v < variants; v++) {
        const c = makeCanvas((x1 - x0) * res, (y1 - y0) * res);
        const ctx = c.getContext('2d')!;
        ctx.scale(res, res);
        ctx.translate(-x0, -y0);
        const pen = new Pen(ctx, 11 + index * 31 + v * 7, variants > 1 ? BOIL_AMOUNT : 0);
        draw({ pen, team });
        list.push(c);
      }
      frames.set(name, list);
    }
    parts.set(def.name, { def, frames, first: Object.keys(def.frames)[0] });
    const parent = def.parent ?? '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(def);
    if (!children.has(def.name)) children.set(def.name, []);
  });
  return { design, res, parts, children };
}

/**
 * Draws a posed rig onto a canvas whose transform puts the feet at the origin, one unit to the pixel.
 * Scale and flip the context first to place it.
 */
export function composeRig(ctx: CanvasRenderingContext2D, rig: RenderedRig, pose: Pose, boil: number): void {
  const draw = (def: PartDef, parentPivot: readonly [number, number]) => {
    const p = pose[def.name] ?? {};
    if (p.show === false) return;
    const part = rig.parts.get(def.name)!;
    ctx.save();
    ctx.translate(def.pivot[0] - parentPivot[0] + (p.x ?? 0), def.pivot[1] - parentPivot[1] + (p.y ?? 0));
    if (p.rot) ctx.rotate(p.rot);
    if (p.sx !== undefined || p.sy !== undefined) ctx.scale(p.sx ?? 1, p.sy ?? 1);
    if (p.alpha !== undefined) ctx.globalAlpha *= p.alpha;
    const kids = rig.children.get(def.name) ?? [];
    for (const k of kids) if (k.behind) draw(k, def.pivot);
    const variants = part.frames.get(p.frame ?? part.first) ?? part.frames.get(part.first)!;
    const img = variants[boil % variants.length];
    const [x0, y0, x1, y1] = def.box;
    ctx.drawImage(img, x0 - def.pivot[0], y0 - def.pivot[1], x1 - x0, y1 - y0);
    for (const k of kids) if (!k.behind) draw(k, def.pivot);
    ctx.restore();
  };
  for (const def of rig.children.get('') ?? []) draw(def, [0, 0]);
}
