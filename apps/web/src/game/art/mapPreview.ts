import { EMPTY, GLUE, INK, buildTerrain, createMatch, getMap, type Terrain } from '@doodle/sim';
import { materialFor, type RGB } from './materials';
import { team } from './palette';
import { LINE_GAP, paperColor } from './paper';
import { makeCanvas } from './render';

/**
 * A picture of a map for the stage select: its paper, its ground in its own material, and where each team
 * starts. Close to the battlefield's look, at a fraction of the cost.
 */

const terrains = new Map<string, Terrain>();
const previews = new Map<string, HTMLCanvasElement>();

function terrainFor(mapId: string, seed: number): Terrain {
  const key = `${mapId}:${seed}`;
  let t = terrains.get(key);
  if (!t) {
    t = buildTerrain(getMap(mapId), seed);
    terrains.set(key, t);
  }
  return t;
}

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Where each team's doodles start on this layout. */
export function spawnPoints(
  mapId: string,
  seed: number,
  perTeam: number,
): { x: number; y: number; team: number }[] {
  const state = createMatch({
    mapId,
    mapSeed: seed,
    seed: 1,
    players: Array.from({ length: perTeam * 2 }, (_, i) => ({
      name: '',
      team: i % 2,
      kind: 'pencil' as const,
      controller: 'bot' as const,
    })),
  });
  return state.units.map((u) => ({ x: u.x, y: u.y, team: u.team }));
}

export function renderMapPreview(
  mapId: string,
  seedIn: number | null,
  w: number,
  h: number,
  perTeam = 0,
): HTMLCanvasElement {
  const map = getMap(mapId);
  const seed = seedIn ?? map.seed;
  const key = `${mapId}:${seed}:${w}x${h}:${perTeam}`;
  const hit = previews.get(key);
  if (hit) return hit;

  const t = terrainFor(mapId, seed);
  const mat = materialFor(mapId);
  const W = map.width;
  const H = map.height;
  // Fit the whole page width, with a strip of sky above the ground.
  const scale = Math.min(w / W, h / (H * 1.06));
  const ox = (w - W * scale) / 2;
  const oy = h - H * scale;

  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = paperColor(map.paper);
  ctx.fillRect(0, 0, w, h);
  // The paper's lines, at the same spacing as on the battlefield.
  const gap = LINE_GAP * scale;
  ctx.save();
  if (map.paper === 'ruled' || map.paper === 'sticky') {
    ctx.strokeStyle = map.paper === 'sticky' ? 'rgba(159,195,230,0.35)' : 'rgba(159,195,230,0.8)';
    ctx.lineWidth = Math.max(1, scale * 1.6);
    for (let y = oy % gap; y < h; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    if (map.paper === 'ruled') {
      ctx.strokeStyle = 'rgba(229,139,139,0.8)';
      ctx.beginPath();
      ctx.moveTo(ox + 99 * scale, 0);
      ctx.lineTo(ox + 99 * scale, h);
      ctx.stroke();
    }
  } else if (map.paper === 'graph') {
    ctx.strokeStyle = 'rgba(140,199,181,0.55)';
    ctx.lineWidth = 1;
    for (let x = ox % gap; x < w; x += gap) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = oy % gap; y < h; y += gap) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = 'rgba(120,120,120,0.55)';
    for (let y = oy % gap; y < h; y += gap)
      for (let x = ox % gap; x < w; x += gap) ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  }
  ctx.restore();

  // The ground, sampled per pixel of the preview.
  const solid = new Uint8Array(w * h);
  for (let py = 0; py < h; py++) {
    const wy = Math.floor((py - oy) / scale);
    for (let px = 0; px < w; px++) {
      const wx = Math.floor((px - ox) / scale);
      solid[py * w + px] = wy < 0 ? EMPTY : t.get(wx, wy);
    }
  }
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? EMPTY : solid[y * w + x]);
  const band = mat.top ? Math.max(1, Math.round(mat.top.depth * scale * 2.2)) : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = solid[y * w + x];
      if (v === EMPTY) continue;
      const o = (y * w + x) * 4;
      let c: RGB;
      if (
        at(x - 1, y) === EMPTY ||
        at(x + 1, y) === EMPTY ||
        at(x, y - 1) === EMPTY ||
        at(x, y + 1) === EMPTY
      ) {
        c = v === INK ? [19, 30, 100] : v === GLUE ? [128, 120, 156] : mat.outline;
      } else if (v === INK) c = [52, 84, 196];
      else if (v === GLUE) c = [247, 243, 233];
      else {
        let top = false;
        for (let k = 2; k <= band + 1 && !top; k++) top = at(x, y - k) === EMPTY;
        if (mat.top && top) c = mat.top.color;
        else {
          const hatch = mat.hatch > 0 && (x + y) % 4 === 0;
          const stripe = mat.stripes && x % 3 === 0;
          const k = hatch || stripe ? 0.3 : 0;
          c = [
            mat.fill[0] + (mat.dark[0] - mat.fill[0]) * k,
            mat.fill[1] + (mat.dark[1] - mat.fill[1]) * k,
            mat.fill[2] + (mat.dark[2] - mat.fill[2]) * k,
          ];
        }
      }
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Little pennants where each team starts.
  if (perTeam > 0) {
    const flag = Math.max(6, Math.min(14, w / 60));
    for (const s of spawnPoints(mapId, seed, perTeam)) {
      const x = ox + s.x * scale;
      const y = oy + s.y * scale;
      const [r, g, b] = hexRgb(team(s.team).color);
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = Math.max(1.2, flag / 7);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - flag * 2);
      ctx.stroke();
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      const dir = s.team === 0 ? 1 : -1;
      ctx.moveTo(x, y - flag * 2);
      ctx.lineTo(x + dir * flag * 1.3, y - flag * 1.6);
      ctx.lineTo(x, y - flag * 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  previews.set(key, canvas);
  return canvas;
}
