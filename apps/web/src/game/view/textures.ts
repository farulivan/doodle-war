import { UNIT_KINDS, type ProjectileSprite, type UnitKind } from '@doodle/sim';
import type Phaser from 'phaser';
import {
  BARREL_CANVAS,
  PROJECTILE_SIZE,
  UNIT_CANVAS,
  drawBarrel,
  drawBurst,
  drawChunk,
  drawCloud,
  drawEraser,
  drawGhost,
  drawParachute,
  drawPickup,
  PICKUP_SIZE,
  drawMarginDoodle,
  drawProjectile,
  drawPuff,
  drawScribbleOut,
  drawSplat,
  makeCanvas,
} from '../art/doodles';
import { drawDeskTile, drawPaperTile } from '../art/paper';
import { TEAMS } from '../art/palette';
import { drawUnitBody } from '../art/doodles';

export const BOIL_FRAMES = 3;
export const BURST_VARIANTS = 3;
export const DOODLE_VARIANTS = 8;

export const keys = {
  body: (kind: UnitKind, team: number, frame: number) => `body-${kind}-${team}-${frame}`,
  barrel: (kind: UnitKind) => `barrel-${kind}`,
  projectile: (sprite: ProjectileSprite) => `proj-${sprite}`,
  burst: (i: number) => `burst-${i}`,
  splat: (i: number) => `splat-${i}`,
  doodle: (i: number) => `doodle-${i}`,
  paper: (style: string) => `paper-${style}`,
  desk: 'desk',
  puff: 'puff',
  xout: 'xout',
  scrap: 'scrap',
  crumb: 'crumb',
  inkdot: 'inkdot',
  inkmark: 'inkmark',
  cloud: (i: number) => `cloud-${i}`,
  chunk: (i: number) => `chunk-${i}`,
  eraser: 'eraser',
  ghost: 'ghost',
  spark: 'spark',
  confetti: 'confetti',
  ring: 'ring',
  pickup: (kind: string) => `pickup-${kind}`,
  parachute: 'parachute',
};

export const CLOUD_VARIANTS = 3;
export const CHUNK_VARIANTS = 3;

const PROJECTILE_SPRITES: ProjectileSprite[] = [
  'graphite',
  'lead',
  'drill',
  'ink',
  'inkDrop',
  'dart',
  'crumple',
  'staple',
  'band',
];

function add(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

/** Draws every procedural texture once at boot. */
export function registerTextures(scene: Phaser.Scene): void {
  for (const kind of UNIT_KINDS) {
    for (let t = 0; t < TEAMS.length; t++) {
      for (let f = 0; f < BOIL_FRAMES; f++) {
        const c = makeCanvas(UNIT_CANVAS.w, UNIT_CANVAS.h);
        drawUnitBody(c, kind, t, 11 + f * 7);
        add(scene, keys.body(kind, t, f), c);
      }
    }
    const b = makeCanvas(BARREL_CANVAS.w, BARREL_CANVAS.h);
    drawBarrel(b, kind, 5);
    add(scene, keys.barrel(kind), b);
  }

  for (const sprite of PROJECTILE_SPRITES) {
    const c = makeCanvas(PROJECTILE_SIZE, PROJECTILE_SIZE);
    drawProjectile(c, sprite, 3);
    add(scene, keys.projectile(sprite), c);
  }

  for (let i = 0; i < BURST_VARIANTS; i++) {
    const c = makeCanvas(128, 128);
    drawBurst(c, 2 + i * 5);
    add(scene, keys.burst(i), c);
    const s = makeCanvas(128, 128);
    drawSplat(s, 3 + i * 4);
    add(scene, keys.splat(i), s);
  }

  for (let i = 0; i < DOODLE_VARIANTS; i++) {
    const c = makeCanvas(i === 3 || i === 5 ? 140 : 80, 80);
    drawMarginDoodle(c, i, 9 + i);
    add(scene, keys.doodle(i), c);
  }

  for (const style of ['ruled', 'graph', 'dotted', 'sticky']) {
    add(scene, keys.paper(style), drawPaperTile(style as never));
  }
  add(scene, keys.desk, drawDeskTile());

  for (let i = 0; i < CLOUD_VARIANTS; i++) {
    const c = makeCanvas(150, 80);
    drawCloud(c, 21 + i * 4);
    add(scene, keys.cloud(i), c);
  }
  for (let i = 0; i < CHUNK_VARIANTS; i++) {
    const c = makeCanvas(14, 14);
    drawChunk(c, 5 + i * 3);
    add(scene, keys.chunk(i), c);
  }
  for (const kind of ['bandaid', 'star', 'refill'] as const) {
    const c = makeCanvas(PICKUP_SIZE, PICKUP_SIZE);
    drawPickup(c, kind, 4);
    add(scene, keys.pickup(kind), c);
  }
  const chute = makeCanvas(44, 40);
  drawParachute(chute, 3);
  add(scene, keys.parachute, chute);

  const eraser = makeCanvas(46, 22);
  drawEraser(eraser, 8);
  add(scene, keys.eraser, eraser);
  const ghost = makeCanvas(34, 40);
  drawGhost(ghost, 12);
  add(scene, keys.ghost, ghost);
  add(
    scene,
    keys.spark,
    simpleShape(6, 2, (ctx) => {
      ctx.fillStyle = '#fff6c2';
      ctx.fillRect(0, 0, 6, 2);
    }),
  );
  // White square: tinted per particle for confetti.
  add(
    scene,
    keys.confetti,
    simpleShape(8, 5, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 8, 5);
    }),
  );

  const puff = makeCanvas(48, 48);
  drawPuff(puff, 4);
  add(scene, keys.puff, puff);

  const xout = makeCanvas(48, 48);
  drawScribbleOut(xout, 6);
  add(scene, keys.xout, xout);

  add(
    scene,
    keys.scrap,
    simpleShape(10, 8, (ctx) => {
      ctx.fillStyle = '#fffdf6';
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.fillRect(1, 1, 8, 6);
      ctx.strokeRect(1.5, 1.5, 7, 5);
    }),
  );
  add(
    scene,
    keys.crumb,
    simpleShape(6, 6, (ctx) => {
      ctx.fillStyle = '#4a4a4a';
      ctx.beginPath();
      ctx.arc(3, 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }),
  );
  add(
    scene,
    keys.inkdot,
    simpleShape(8, 8, (ctx) => {
      ctx.fillStyle = '#1f3fbf';
      ctx.beginPath();
      ctx.arc(4, 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }),
  );
  add(
    scene,
    keys.inkmark,
    simpleShape(40, 30, (ctx) => {
      ctx.fillStyle = 'rgba(31,63,191,0.85)';
      for (const [x, y, r] of [
        [12, 12, 6],
        [24, 17, 7],
        [31, 9, 4],
        [17, 23, 3],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
  );
}

function simpleShape(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d')!);
  return c;
}
