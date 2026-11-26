import {
  DRAW_MAX_LENGTH,
  DRAW_REACH,
  PICKUP_INFO,
  UNITS,
  aimDirection,
  bodyCenter,
  type GameState,
  type Pickup,
  type PickupKind,
  type ProjectileTrack,
  type Rect,
  type ShotEvent,
  type ShotResult,
  type Unit,
} from '@doodle/sim';
import Phaser from 'phaser';
import { ROTATES_WITH_VELOCITY } from '../art/doodles';
import { LINE_GAP, MARGIN_COLOR } from '../art/paper';
import { TEAMS, team } from '../art/palette';
import { audio } from '../audio';
import { settings } from '../settings';
import { TerrainView } from './TerrainView';
import { DEPTH, UnitView } from './UnitView';
import { BURST_VARIANTS, CHUNK_VARIANTS, CLOUD_VARIANTS, DOODLE_VARIANTS, keys } from './textures';

/** How far the page extends above the map, so high lobs stay on paper. */
const SKY = 760;
const SIDE_PAD = 260;
const BOTTOM_PAD = 220;
const TICK_MS = 1000 / 60;

export interface SceneHooks {
  /** Called every frame before rendering. */
  update(dtMs: number): void;
  /** A Draw-mode line was released. */
  onDrawLine(x0: number, y0: number, x1: number, y1: number): void;
  /** Scene is ready to receive a match. */
  onReady(): void;
}

interface TrackSprite {
  track: ProjectileTrack;
  sprite: Phaser.GameObjects.Image;
  trail: Phaser.GameObjects.Graphics;
  lastIndex: number;
  done: boolean;
  spin: number;
}

interface Cloud {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/** Trail look per projectile, so every weapon reads differently in the air. */
const TRAILS: Record<string, { color: number; alpha: number; width: number; every: number; dots?: boolean }> =
  {
    ink: { color: 0x1f3fbf, alpha: 0.55, width: 3, every: 3, dots: true },
    inkDrop: { color: 0x1f3fbf, alpha: 0.45, width: 2, every: 3, dots: true },
    dart: { color: 0x7a7a7a, alpha: 0.5, width: 1.5, every: 4, dots: true },
    staple: { color: 0x6d7f99, alpha: 0.6, width: 1.5, every: 1 },
    band: { color: 0xc0392b, alpha: 0.5, width: 2, every: 2 },
    drill: { color: 0xd9a830, alpha: 0.6, width: 2, every: 2 },
    default: { color: 0x555555, alpha: 0.55, width: 2, every: 2 },
  };

interface Playback {
  result: ShotResult;
  tick: number;
  acc: number;
  eventIndex: number;
  tracks: TrackSprite[];
  /** Center of the whole shot when it fits on screen; otherwise the camera follows the projectile. */
  frame: { x: number; y: number } | null;
  resolve: () => void;
}

export class BattleScene extends Phaser.Scene {
  private hooks!: SceneHooks;
  private state: GameState | null = null;
  private terrain: TerrainView | null = null;
  private units = new Map<number, UnitView>();
  private world: Phaser.GameObjects.GameObject[] = [];
  private playback: Playback | null = null;
  private guide!: Phaser.GameObjects.Graphics;
  private drawPreview!: Phaser.GameObjects.Graphics;
  private camTarget: { x: number; y: number } | null = null;
  private manualUntil = 0;
  private dragStart: { x: number; y: number; scrollX: number; scrollY: number; moved: boolean } | null = null;
  private drawStart: { x: number; y: number } | null = null;
  private pinchDist = 0;
  aimGuideFor: number | null = null;
  drawMode = false;
  /** Bigger zoom-out on phones. */
  baseZoom = 1;
  /** The zoom the player picked; shots zoom out temporarily and come back to this. */
  private userZoom = 1;
  private clouds: Cloud[] = [];
  /** Wind push on clouds, eased toward the current turn's wind. */
  private cloudWind = 0;
  private targetCloudWind = 0;
  /** Each unit's previous shot path, shown faintly on its next turn. */
  private lastShots = new Map<number, number[]>();
  private pickups = new Map<number, Phaser.GameObjects.Container>();
  private tracer!: Phaser.GameObjects.Graphics;

  constructor() {
    super('battle');
  }

  init(data: { hooks: SceneHooks }): void {
    this.hooks = data.hooks;
  }

  create(): void {
    this.guide = this.add.graphics().setDepth(DEPTH.guide);
    this.drawPreview = this.add.graphics().setDepth(DEPTH.guide);
    this.tracer = this.add.graphics().setDepth(DEPTH.trail);
    this.input.addPointer(1);
    this.setupPointer();
    this.scale.on('resize', () => this.fitZoom());
    this.events.once('shutdown', () => this.clearWorld());
    this.hooks.onReady();
  }

  // -------------------------------------------------------------------------
  // World setup

  buildWorld(state: GameState): void {
    this.clearWorld();
    this.state = state;
    const {
      width: W,
      height: H,
      paper,
    } = { width: state.map.width, height: state.map.height, paper: state.map.paper };
    const cam = this.cameras.main;
    cam.setBounds(-SIDE_PAD, -SKY, W + SIDE_PAD * 2, H + SKY + BOTTOM_PAD);

    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.world.push(o);
      return o;
    };

    add(
      this.add
        .tileSprite(-SIDE_PAD, -SKY, W + SIDE_PAD * 2, H + SKY + BOTTOM_PAD, keys.desk)
        .setOrigin(0)
        .setDepth(DEPTH.desk),
    );
    // The sheet of paper and its shadow on the desk.
    add(
      this.add
        .rectangle(10, -SKY + 12, W, H + SKY, 0x000000, 0.28)
        .setOrigin(0)
        .setDepth(DEPTH.desk),
    );
    add(
      this.add
        .tileSprite(0, -SKY, W, H + SKY, keys.paper(paper))
        .setOrigin(0)
        .setDepth(DEPTH.paper),
    );
    // Offset the tile so ruled lines line up with the paper's top edge.
    const deco = add(this.add.graphics().setDepth(DEPTH.decor));
    if (paper === 'ruled') {
      deco.lineStyle(2, Phaser.Display.Color.HexStringToColor(MARGIN_COLOR).color, 0.8);
      deco.lineBetween(96, -SKY, 96, H);
      deco.lineBetween(102, -SKY, 102, H);
      deco.fillStyle(0x6b4a2f, 1);
      for (let y = -SKY + 200; y < H - 100; y += 420) deco.fillCircle(42, y, 16);
    }
    if (paper === 'sticky') {
      deco.fillStyle(0xf2d64b, 0.6);
      deco.fillRect(0, -SKY, W, 60);
    }
    // Torn bottom edge of the page.
    const edge = add(this.add.graphics().setDepth(DEPTH.paper));
    edge.fillStyle(
      Phaser.Display.Color.HexStringToColor(paper === 'sticky' ? '#fff1a6' : '#f6f1e3').color,
      1,
    );
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, H)];
    for (let x = 0; x <= W; x += 18) pts.push(new Phaser.Math.Vector2(x, H + 4 + ((x * 7919) % 11)));
    pts.push(new Phaser.Math.Vector2(W, H));
    edge.fillPoints(pts, true);

    // Margin doodles in the open sky.
    const rng = new Phaser.Math.RandomDataGenerator([String(state.config.mapSeed ?? state.map.seed)]);
    for (let i = 0; i < 14; i++) {
      const x = rng.between(160, W - 160);
      const y = rng.between(-SKY + 120, 360);
      const top = state.terrain.topSurface(x) ?? H;
      if (top < y + 160) continue;
      add(
        this.add
          .image(x, y, keys.doodle(rng.between(0, DOODLE_VARIANTS - 1)))
          .setAlpha(0.32)
          .setAngle(rng.between(-20, 20))
          .setDepth(DEPTH.decor),
      );
    }
    add(
      this.add
        .text(W - 40, -SKY + 40, state.map.name, {
          fontFamily: '"Permanent Marker", cursive',
          fontSize: '42px',
          color: '#6b6b6b',
        })
        .setOrigin(1, 0)
        .setAlpha(0.5)
        .setAngle(-3)
        .setDepth(DEPTH.decor),
    );
    void LINE_GAP;

    // Doodle clouds drift with the wind: a second way to read it at a glance.
    for (let i = 0; i < 7; i++) {
      const img = add(
        this.add
          .image(rng.between(0, W), rng.between(-SKY + 90, 260), keys.cloud(i % CLOUD_VARIANTS))
          .setAlpha(0.55)
          .setScale(rng.realInRange(0.7, 1.25))
          .setDepth(DEPTH.cloud),
      );
      this.clouds.push({ img, speed: rng.realInRange(0.6, 1.3) });
    }

    this.terrain = new TerrainView(this, state.terrain, DEPTH.terrain);
    for (const u of state.units) this.units.set(u.id, new UnitView(this, u));

    this.userZoom = this.baseZoom;
    this.fitZoom();
    const first = state.units[0];
    cam.centerOn(first.x, first.y - 120);
  }

  private clearWorld(): void {
    if (this.playback) {
      for (const ts of this.playback.tracks) {
        ts.sprite.destroy();
        ts.trail.destroy();
      }
      this.playback.resolve();
      this.playback = null;
    }
    // Leftover effects (float texts, puffs, fading units) from the previous match.
    this.tweens.killAll();
    this.time.removeAllEvents();
    // A copy, because destroy() takes each object out of the list being walked.
    for (const o of this.children.list.slice()) {
      if (o !== this.guide && o !== this.drawPreview && o !== this.tracer && !this.world.includes(o))
        o.destroy();
    }
    this.clouds = [];
    this.lastShots.clear();
    this.pickups.clear();
    this.tracer?.clear();
    for (const v of this.units.values()) v.destroy();
    this.units.clear();
    this.terrain?.destroy();
    this.terrain = null;
    for (const o of this.world) o.destroy();
    this.world = [];
    this.guide?.clear();
    this.drawPreview?.clear();
    this.state = null;
  }

  private fitZoom(): void {
    const cam = this.cameras.main;
    const small = Math.min(this.scale.width, this.scale.height) < 560;
    this.baseZoom = small ? 0.6 : this.scale.width < 1000 ? 0.8 : 1;
    if (!this.state) this.userZoom = this.baseZoom;
    this.userZoom = Phaser.Math.Clamp(this.userZoom, this.minZoom(), 1.6);
    cam.setZoom(this.userZoom);
  }

  private minZoom(): number {
    if (!this.state) return 0.3;
    return Math.max(
      0.25,
      Math.min(
        this.scale.width / (this.state.map.width + 300),
        this.scale.height / (this.state.map.height + SKY * 0.6),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Per-frame

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.hooks.update(dt);
    if (this.playback) this.stepPlayback(dt);
    for (const v of this.units.values()) v.update(dt);
    this.updateClouds(dt);
    this.terrain?.flush();
    this.drawGuide();
    this.updateCamera(dt);
  }

  private updateCamera(dt: number): void {
    const cam = this.cameras.main;
    if (!this.camTarget || this.time.now < this.manualUntil) return;
    const k = 1 - Math.pow(0.0025, dt / 1000);
    const tx = this.camTarget.x - cam.width / 2;
    const ty = this.camTarget.y - cam.height / 2;
    cam.scrollX += (tx - cam.scrollX) * k;
    cam.scrollY += (ty - cam.scrollY) * k;
  }

  /** Clouds blow with the turn's wind and wrap around the page. */
  setWind(ax: number): void {
    this.targetCloudWind = ax;
  }

  private updateClouds(dt: number): void {
    if (!this.state) return;
    this.cloudWind += (this.targetCloudWind - this.cloudWind) * Math.min(1, dt / 900);
    const W = this.state.map.width;
    for (const c of this.clouds) {
      c.img.x += this.cloudWind * c.speed * 0.25 * (dt / 1000) + 3 * (dt / 1000);
      if (c.img.x > W + 120) c.img.x = -120;
      if (c.img.x < -120) c.img.x = W + 120;
    }
  }

  /** Smoothly keeps a world point in view. */
  focus(x: number, y: number): void {
    this.camTarget = { x, y };
  }

  focusUnit(id: number): void {
    const v = this.units.get(id);
    if (v) this.focus(v.x, v.y - 60);
  }

  /** Lets the camera follow again even if the player just panned. */
  releaseManualCamera(): void {
    this.manualUntil = 0;
  }

  // -------------------------------------------------------------------------
  // Units

  syncUnits(state: GameState): void {
    for (const u of state.units) {
      const v = this.units.get(u.id);
      if (!v) continue;
      if (u.alive) {
        v.setPose(u.x, u.y, u.tilt, u.facing, u.angle);
        v.syncHp(u.hp);
      }
      v.setInked(u.inked > 0);
    }
  }

  syncUnit(u: Unit, angle = u.angle): void {
    const v = this.units.get(u.id);
    if (v && u.alive) v.setPose(u.x, u.y, u.tilt, u.facing, angle);
  }

  setActive(id: number | null): void {
    for (const v of this.units.values()) v.setActive(v.id === id);
  }

  /** Animates a fall that happened while walking (the sim already moved the unit). */
  animateWalkFall(u: Unit, fromY: number, toY: number, dead: boolean): Promise<void> {
    const v = this.units.get(u.id);
    if (!v) return Promise.resolve();
    audio.play('fall');
    return new Promise((resolve) => {
      const proxy = { y: fromY };
      this.tweens.add({
        targets: proxy,
        y: toY,
        duration: Math.min(1400, Math.sqrt(Math.max(1, toY - fromY)) * 38),
        ease: 'Quad.easeIn',
        onUpdate: () => v.setY(proxy.y),
        onComplete: () => {
          if (dead) {
            v.die('fell');
            this.floatText(
              u.x,
              Math.min(toY, this.state!.map.height) - 40,
              'Fell off the page!',
              '#c0392b',
              26,
            );
          }
          resolve();
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Pickups

  /** Matches pickup sprites to the sim. New ones parachute in. Returns the new kinds. */
  syncPickups(list: Pickup[], animate: boolean): PickupKind[] {
    const fresh: PickupKind[] = [];
    const ids = new Set(list.map((p) => p.id));
    for (const [id, c] of this.pickups) {
      if (ids.has(id)) continue;
      c.destroy();
      this.pickups.delete(id);
    }
    for (const p of list) {
      const existing = this.pickups.get(p.id);
      if (existing) {
        existing.setPosition(p.x, p.y);
        continue;
      }
      fresh.push(p.kind);
      const img = this.add.image(0, -15, keys.pickup(p.kind));
      const c = this.add.container(p.x, p.y, [img]).setDepth(DEPTH.unit - 1);
      this.tweens.add({
        targets: img,
        y: -18,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.pickups.set(p.id, c);
      if (!animate) continue;
      // Float down on a paper parachute, swaying, then drop the chute.
      const chute = this.add.image(0, -44, keys.parachute);
      c.add(chute);
      c.y = p.y - 620;
      audio.play('drop');
      this.tweens.add({ targets: c, y: p.y, duration: 1700, ease: 'Sine.easeOut' });
      this.tweens.add({
        targets: c,
        angle: { from: -10, to: 10 },
        duration: 420,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
        onComplete: () => c.setAngle(0),
      });
      this.tweens.add({
        targets: chute,
        scaleY: 0.1,
        alpha: 0,
        delay: 1650,
        duration: 260,
        onComplete: () => chute.destroy(),
      });
    }
    return fresh;
  }

  /** A unit grabbed a pickup. */
  collectPickup(id: number, kind: PickupKind): void {
    const c = this.pickups.get(id);
    this.pickups.delete(id);
    if (!c) return;
    audio.play('pickup');
    this.floatText(
      c.x,
      c.y - 50,
      PICKUP_INFO[kind].effect,
      kind === 'bandaid' ? '#3b9b4b' : kind === 'star' ? '#c79a00' : '#1f3fbf',
      26,
    );
    for (let i = 0; i < 6; i++)
      this.sparkle(c.x + Phaser.Math.Between(-14, 14), c.y - 15 + Phaser.Math.Between(-14, 14));
    this.tweens.add({
      targets: c,
      scale: 1.6,
      alpha: 0,
      y: c.y - 24,
      duration: 280,
      ease: 'Back.easeIn',
      onComplete: () => c.destroy(),
    });
  }

  /** A blast destroyed a pickup. */
  popPickup(id: number): void {
    const c = this.pickups.get(id);
    this.pickups.delete(id);
    if (!c) return;
    audio.play('pop');
    this.burstParticles(c.x, c.y - 15, keys.scrap, 8, 200);
    c.destroy();
  }

  private fallPickup(id: number, toY: number, ticks: number, lost: boolean): void {
    const c = this.pickups.get(id);
    if (!c) return;
    if (lost) this.pickups.delete(id);
    this.tweens.add({
      targets: c,
      y: toY,
      duration: ticks * TICK_MS,
      ease: 'Quad.easeIn',
      onComplete: () => lost && c.destroy(),
    });
  }

  /** Hop arc: up to the peak, then down to where the sim landed the unit. */
  animateHop(
    u: Unit,
    fromX: number,
    fromY: number,
    peakX: number,
    peakY: number,
    toY: number,
    dead: boolean,
  ): Promise<void> {
    const v = this.units.get(u.id);
    if (!v) return Promise.resolve();
    audio.play('bounce');
    return new Promise((resolve) => {
      const p = { t: 0 };
      const upY = peakY - 10;
      const upMs = 260;
      const downMs = Math.min(1200, 140 + Math.sqrt(Math.max(1, toY - upY)) * 30);
      this.tweens.add({
        targets: p,
        t: 1,
        duration: upMs + downMs,
        onUpdate: () => {
          const ms = p.t * (upMs + downMs);
          const x = fromX + (peakX - fromX) * Math.min(1, ms / upMs);
          const y =
            ms < upMs
              ? fromY + (upY - fromY) * Math.sin((ms / upMs) * (Math.PI / 2))
              : upY + (toY - upY) * Math.pow((ms - upMs) / downMs, 2);
          v.setPose(x, y, ms < upMs ? 0 : u.tilt, v.facing, v.angle);
        },
        onComplete: () => {
          if (dead) {
            v.die('fell');
            this.floatText(
              u.x,
              Math.min(toY, this.state!.map.height) - 40,
              'Fell off the page!',
              '#c0392b',
              26,
            );
          } else {
            this.puff(u.x, u.y, 0.35);
          }
          resolve();
        },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Aim guide and Draw preview

  private drawGuide(): void {
    const g = this.guide;
    g.clear();
    this.drawTracer();
    if (this.aimGuideFor === null || !this.state) return;
    const u = this.state.units[this.aimGuideFor];
    const v = this.units.get(this.aimGuideFor);
    if (!u || !v || !u.alive) return;
    const c = bodyCenter(u);
    const def = UNITS[u.kind];
    const color = team(u.team).hex;

    // Allowed aim range as a faint arc.
    g.lineStyle(2, color, 0.25);
    const steps = 18;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = def.angleMin + ((def.angleMax - def.angleMin) * i) / steps;
      const d = aimDirection({ ...u, facing: v.facing }, a);
      const px = c.x + d.dx * 46;
      const py = c.y + d.dy * 46;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.strokePath();

    // Dashed sight line along the barrel.
    const d = aimDirection({ ...u, facing: v.facing }, v.angle);
    g.lineStyle(2, color, 0.85);
    for (let s = 26; s < 120; s += 14) {
      g.lineBetween(c.x + d.dx * s, c.y + d.dy * s, c.x + d.dx * (s + 7), c.y + d.dy * (s + 7));
    }

    if (this.drawMode) {
      g.lineStyle(2, 0x2244aa, 0.5);
      const segs = 48;
      for (let i = 0; i < segs; i += 2) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        g.lineBetween(
          c.x + Math.cos(a0) * DRAW_REACH,
          c.y + Math.sin(a0) * DRAW_REACH,
          c.x + Math.cos(a1) * DRAW_REACH,
          c.y + Math.sin(a1) * DRAW_REACH,
        );
      }
    }
  }

  /** Faint dotted line along the active unit's previous shot. */
  private drawTracer(): void {
    const t = this.tracer;
    t.clear();
    if (this.aimGuideFor === null || !settings.get().tracer) return;
    const pts = this.lastShots.get(this.aimGuideFor);
    if (!pts) return;
    const u = this.state?.units[this.aimGuideFor];
    t.fillStyle(u ? team(u.team).hex : 0x555555, 0.35);
    for (let i = 0; i < pts.length; i += 8) t.fillCircle(pts[i], pts[i + 1], 2.2);
  }

  private updateDrawPreview(x: number, y: number): void {
    const g = this.drawPreview;
    g.clear();
    if (!this.drawStart || !this.state || this.aimGuideFor === null) return;
    const u = this.state.units[this.aimGuideFor];
    const c = bodyCenter(u);
    let x1 = x;
    let y1 = y;
    const len = Math.hypot(x1 - this.drawStart.x, y1 - this.drawStart.y);
    if (len > DRAW_MAX_LENGTH) {
      const k = DRAW_MAX_LENGTH / len;
      x1 = this.drawStart.x + (x1 - this.drawStart.x) * k;
      y1 = this.drawStart.y + (y1 - this.drawStart.y) * k;
    }
    const ok =
      Math.hypot(this.drawStart.x - c.x, this.drawStart.y - c.y) <= DRAW_REACH &&
      Math.hypot(x1 - c.x, y1 - c.y) <= DRAW_REACH;
    g.lineStyle(8, ok ? 0x2244aa : 0xc0392b, ok ? 0.75 : 0.5);
    g.lineBetween(this.drawStart.x, this.drawStart.y, x1, y1);
  }

  /** The sim accepted a Draw; copy the inked pixels into the view. */
  applyDraw(rect: Rect): void {
    if (!this.terrain || !this.state) return;
    this.terrain.copyFrom(this.state.terrain, rect);
    audio.play('scribble');
    const cx = (rect.x0 + rect.x1) / 2;
    const cy = (rect.y0 + rect.y1) / 2;
    this.burstParticles(cx, cy, keys.inkdot, 10, 120);
  }

  // -------------------------------------------------------------------------
  // Pointer: pan, pinch zoom, wheel zoom and Draw mode

  private setupPointer(): void {
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (this.drawMode && p.leftButtonDown() && !this.input.pointer2?.isDown) {
        this.drawStart = { x: p.worldX, y: p.worldY };
        this.updateDrawPreview(p.worldX, p.worldY);
        return;
      }
      this.dragStart = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1;
      const p2 = this.input.pointer2;
      if (p1?.isDown && p2?.isDown) {
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.pinchDist > 0) this.zoomBy(dist / this.pinchDist);
        this.pinchDist = dist;
        this.dragStart = null;
        return;
      }
      this.pinchDist = 0;
      if (this.drawStart) {
        this.updateDrawPreview(p.worldX, p.worldY);
        return;
      }
      if (this.dragStart && p.isDown) {
        const dx = p.x - this.dragStart.x;
        const dy = p.y - this.dragStart.y;
        if (!this.dragStart.moved && Math.hypot(dx, dy) < 5) return;
        this.dragStart.moved = true;
        cam.scrollX = this.dragStart.scrollX - dx / cam.zoom;
        cam.scrollY = this.dragStart.scrollY - dy / cam.zoom;
        this.manualUntil = this.time.now + 4000;
      }
    });
    const end = (p: Phaser.Input.Pointer) => {
      this.pinchDist = 0;
      if (this.drawStart) {
        const s = this.drawStart;
        this.drawStart = null;
        this.drawPreview.clear();
        this.hooks.onDrawLine(s.x, s.y, p.worldX, p.worldY);
        return;
      }
      this.dragStart = null;
    };
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.zoomBy(Math.pow(1.0015, -dy));
    });
  }

  zoomBy(factor: number): void {
    const cam = this.cameras.main;
    this.userZoom = Phaser.Math.Clamp(cam.zoom * factor, this.minZoom(), 1.6);
    cam.setZoom(this.userZoom);
    this.manualUntil = this.time.now + 2500;
  }

  /** Eases back to the player's chosen zoom after a shot zoomed out. */
  restoreZoom(): void {
    const cam = this.cameras.main;
    if (Math.abs(cam.zoom - this.userZoom) > 0.01) cam.zoomTo(this.userZoom, 450, 'Sine.easeInOut');
  }

  /** Zoom to fit the whole map, or back to normal. */
  toggleOverview(): void {
    const cam = this.cameras.main;
    const overview = cam.zoom <= this.minZoom() + 0.01;
    this.userZoom = overview ? this.baseZoom : this.minZoom();
    cam.zoomTo(this.userZoom, 300);
    if (!overview && this.state) {
      this.camTarget = { x: this.state.map.width / 2, y: this.state.map.height / 2 - SKY * 0.2 };
      this.manualUntil = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Shot playback

  playShot(result: ShotResult): Promise<void> {
    if (result.tracks[0]) this.lastShots.set(result.actorId, result.tracks[0].points);
    return new Promise((resolve) => {
      const actor = this.units.get(result.actorId);
      actor?.recoil();
      audio.play('fire');
      this.puff(result.origin.x, result.origin.y, 0.6);
      this.playback = {
        result,
        tick: -1,
        acc: TICK_MS,
        eventIndex: 0,
        tracks: [],
        frame: this.frameShot(result),
        resolve,
      };
      this.manualUntil = 0;
    });
  }

  /**
   * Zooms out so the whole arc fits on screen, which reads better than chasing a dot
   * across empty sky. Returns the point to hold the camera on, or null to follow.
   */
  private frameShot(result: ShotResult): { x: number; y: number } | null {
    const cam = this.cameras.main;
    let minX = result.origin.x;
    let maxX = result.origin.x;
    let minY = result.origin.y;
    let maxY = result.origin.y;
    for (const t of result.tracks) {
      for (let i = 0; i < t.points.length; i += 2) {
        const x = t.points[i];
        const y = t.points[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (this.state) {
      // Off-page shots would zoom out forever; clamp to the sheet.
      minX = Math.max(minX, -SIDE_PAD);
      maxX = Math.min(maxX, this.state.map.width + SIDE_PAD);
      minY = Math.max(minY, -SKY);
      maxY = Math.min(maxY, this.state.map.height + BOTTOM_PAD);
    }
    const pad = 220;
    const fit = Math.min(cam.width / (maxX - minX + pad), cam.height / (maxY - minY + pad * 1.4));
    const zoom = Math.max(this.minZoom(), Math.min(this.userZoom, fit));
    if (Math.abs(zoom - cam.zoom) > 0.01) cam.zoomTo(zoom, 500, 'Sine.easeInOut');
    if (fit < this.minZoom()) return null;
    // Bias down a little so the HUD at the bottom doesn't cover the landing spot.
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 40 / zoom };
  }

  private stepPlayback(dt: number): void {
    const pb = this.playback!;
    pb.acc += dt;
    while (pb.acc >= TICK_MS && this.playback === pb) {
      pb.acc -= TICK_MS;
      this.advanceTick(pb);
    }
  }

  private advanceTick(pb: Playback): void {
    pb.tick++;
    const { result } = pb;

    for (const track of result.tracks) {
      if (track.spawnTick === pb.tick) {
        const sprite = this.add
          .image(track.points[0], track.points[1], keys.projectile(track.sprite))
          .setDepth(DEPTH.projectile);
        const trail = this.add.graphics().setDepth(DEPTH.trail);
        pb.tracks.push({
          track,
          sprite,
          trail,
          lastIndex: 0,
          done: false,
          spin: (Math.random() - 0.5) * 0.5,
        });
      }
    }

    let lead: TrackSprite | null = null;
    for (const ts of pb.tracks) {
      if (ts.done) continue;
      const idx = pb.tick - ts.track.spawnTick;
      const count = ts.track.points.length / 2;
      if (idx >= count) {
        ts.done = true;
        ts.sprite.setVisible(false);
        continue;
      }
      const x = ts.track.points[idx * 2];
      const y = ts.track.points[idx * 2 + 1];
      const prevX = ts.track.points[Math.max(0, idx - 1) * 2];
      const prevY = ts.track.points[Math.max(0, idx - 1) * 2 + 1];
      ts.sprite.setPosition(x, y);
      if (ROTATES_WITH_VELOCITY[ts.track.sprite]) {
        if (x !== prevX || y !== prevY) ts.sprite.setRotation(Math.atan2(y - prevY, x - prevX));
      } else {
        ts.sprite.rotation += ts.spin;
      }
      const style = TRAILS[ts.track.sprite] ?? TRAILS.default;
      if (idx > 0 && idx % style.every === 0) {
        if (style.dots) {
          ts.trail.fillStyle(style.color, style.alpha);
          ts.trail.fillCircle(x, y, style.width * 0.8);
        } else {
          ts.trail.lineStyle(style.width, style.color, style.alpha);
          ts.trail.lineBetween(prevX, prevY, x, y);
        }
      }
      if (ts.track.sprite === 'staple' && idx % 3 === 0 && !settings.get().reducedMotion) {
        this.sparkle(x, y);
      }
      ts.lastIndex = idx;
      if (!lead) lead = ts;
    }

    if (pb.frame) this.focus(pb.frame.x, pb.frame.y);
    else if (lead) this.focus(lead.sprite.x, lead.sprite.y);

    const events = result.events;
    while (pb.eventIndex < events.length && events[pb.eventIndex].tick <= pb.tick) {
      this.handleEvent(events[pb.eventIndex], pb);
      pb.eventIndex++;
    }

    const linger = 45;
    if (pb.tick >= result.totalTicks + linger && pb.eventIndex >= events.length) {
      for (const ts of pb.tracks) {
        ts.sprite.destroy();
        const trail = ts.trail;
        this.tweens.add({ targets: trail, alpha: 0, duration: 900, onComplete: () => trail.destroy() });
      }
      this.playback = null;
      pb.resolve();
    }
  }

  private handleEvent(e: ShotEvent, pb: Playback): void {
    switch (e.type) {
      case 'explode': {
        this.explosion(e.x, e.y, e.radius, e.ink);
        // Tiny hit-stop: hold the playback a beat so impacts land.
        pb.acc -= e.directUnit !== null ? 110 : 50;
        if (e.directUnit !== null) {
          this.floatText(e.x, e.y - 50, 'DIRECT HIT!', '#c0392b', 30);
        }
        if (!pb.frame) this.focus(e.x, e.y);
        break;
      }
      case 'carve':
        this.terrain?.carve(e.x, e.y, e.radius, this.isInkCarve(pb, e.tick, e.x, e.y));
        break;
      case 'damage': {
        const v = this.units.get(e.unitId);
        if (v) {
          v.setHp(e.hpAfter);
          v.flinch(e.amount > 200 ? 1.4 : 1);
          this.floatText(v.x, v.y - 70, `-${e.amount}`, '#c0392b', e.direct ? 36 : 28);
          if (navigator.vibrate && e.direct) navigator.vibrate(30);
        }
        audio.play('hit');
        break;
      }
      case 'inked':
        this.units.get(e.unitId)?.setInked(true);
        break;
      case 'split':
        audio.play('split');
        this.puff(e.x, e.y, 0.5);
        break;
      case 'bounce':
        audio.play('bounce');
        this.floatText(e.x, e.y - 20, 'boing!', '#555555', 20);
        break;
      case 'lost': {
        if (!this.state) break;
        const W = this.state.map.width;
        const H = this.state.map.height;
        const x = Phaser.Math.Clamp(e.x, 80, W - 80);
        const y = Phaser.Math.Clamp(e.y, -SKY + 80, H - 40);
        this.floatText(x, y, 'off the page!', '#6b6b6b', 22);
        break;
      }
      case 'fall': {
        const v = this.units.get(e.unitId);
        if (!v) break;
        const proxy = { y: e.fromY };
        if (e.toY - e.fromY > 30) audio.play('fall');
        this.tweens.add({
          targets: proxy,
          y: e.toY,
          duration: e.ticks * TICK_MS,
          ease: 'Quad.easeIn',
          onUpdate: () => v.setY(proxy.y),
        });
        break;
      }
      case 'pickup':
        if (e.unitId === null) this.popPickup(e.pickupId);
        else {
          this.collectPickup(e.pickupId, e.kind);
          const u = this.state?.units[e.unitId];
          if (u) this.units.get(u.id)?.syncHp(u.hp);
        }
        break;
      case 'pickupFall':
        this.fallPickup(e.pickupId, e.toY, e.ticks, e.lost);
        break;
      case 'death': {
        const v = this.units.get(e.unitId);
        if (!v) break;
        v.die(e.cause);
        if (e.cause === 'fell' && this.state) {
          this.floatText(v.x, this.state.map.height - 60, 'Fell off the page!', '#c0392b', 26);
        } else {
          this.floatText(v.x, v.y - 90, 'ERASED!', '#2b2b2b', 32);
        }
        break;
      }
    }
  }

  /** Craters from ink explosions get a blue stain instead of graphite. */
  private isInkCarve(pb: Playback, tick: number, x: number, y: number): boolean {
    for (const e of pb.result.events) {
      if (e.tick !== tick || e.type !== 'explode') continue;
      if (Math.abs(e.x - x) <= 1.5 && Math.abs(e.y - y) <= 1.5) return e.ink;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Effects

  explosion(x: number, y: number, radius: number, ink: boolean): void {
    const scale = Math.max(0.45, radius / 48);
    const key = ink
      ? keys.splat(Phaser.Math.Between(0, BURST_VARIANTS - 1))
      : keys.burst(Phaser.Math.Between(0, BURST_VARIANTS - 1));
    const img = this.add
      .image(x, y, key)
      .setDepth(DEPTH.fx)
      .setScale(scale * 0.3)
      .setRotation(Math.random() * Math.PI);
    this.tweens.add({ targets: img, scale: scale * 1.05, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: 220, duration: 420, onComplete: () => img.destroy() });

    const words = ink ? ['SPLAT!', 'SPLOOSH!', 'BLOT!'] : ['POW!', 'BOOM!', 'KRAK!', 'WHAM!', 'BAM!'];
    const word = words[Math.floor(Math.random() * words.length)];
    this.floatText(
      x + Phaser.Math.Between(-20, 20),
      y - radius - 10,
      word,
      ink ? '#1f3fbf' : '#2b2b2b',
      26 + radius * 0.4,
      true,
    );

    const calm = settings.get().reducedMotion;
    // White flash, then an expanding shockwave ring.
    const flash = this.add.circle(x, y, radius * 0.9, 0xffffff, 0.85).setDepth(DEPTH.fx - 2);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.3,
      duration: 140,
      onComplete: () => flash.destroy(),
    });
    const ring = this.add
      .circle(x, y, radius, 0x000000, 0)
      .setStrokeStyle(3, ink ? 0x1f3fbf : 0x2b2b2b, 0.7)
      .setDepth(DEPTH.fx - 1);
    ring.setScale(0.4);
    this.tweens.add({
      targets: ring,
      scale: 1.7,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    const n = calm ? 0.4 : 1;
    this.burstParticles(x, y, keys.scrap, Math.round((6 + radius / 4) * n), 260);
    this.burstParticles(x, y, ink ? keys.inkdot : keys.crumb, Math.round((10 + radius / 3) * n), 320);
    for (let i = 0; i < CHUNK_VARIANTS; i++)
      this.burstParticles(x, y, keys.chunk(i), Math.round((2 + radius / 14) * n), 380);
    this.puff(x, y, scale);
    if (settings.get().screenShake && !calm)
      this.cameras.main.shake(140 + radius * 3, Math.min(0.012, radius / 4500));
    audio.play(ink ? 'splat' : 'boom', radius / 34);
  }

  private burstParticles(x: number, y: number, key: string, count: number, speed: number): void {
    const emitter = this.add.particles(x, y, key, {
      speed: { min: speed * 0.3, max: speed },
      angle: { min: 200, max: 340 },
      gravityY: 700,
      lifespan: { min: 500, max: 1000 },
      rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 },
      scale: { min: 0.7, max: 1.3 },
      emitting: false,
    });
    emitter.setDepth(DEPTH.fx);
    emitter.explode(count);
    this.time.delayedCall(1200, () => emitter.destroy());
  }

  private sparkle(x: number, y: number): void {
    const s = this.add
      .image(x, y, keys.spark)
      .setDepth(DEPTH.fx)
      .setRotation(Math.random() * Math.PI);
    this.tweens.add({
      targets: s,
      alpha: 0,
      scale: 0.2,
      x: x + Phaser.Math.Between(-8, 8),
      y: y + 6,
      duration: 260,
      onComplete: () => s.destroy(),
    });
  }

  /** Confetti in the winning team's colors and happy hops from the survivors. */
  celebrate(winnerTeam: number): void {
    if (!this.state) return;
    for (const u of this.state.units) if (u.alive && u.team === winnerTeam) this.units.get(u.id)?.celebrate();
    const cam = this.cameras.main;
    const colors = winnerTeam >= 0 ? [team(winnerTeam).hex, 0xffd23f, 0xfffdf6] : TEAMS.map((t) => t.hex);
    // Scroll-factor-0 objects still zoom around the screen center, so widen to cover the view.
    const halfW = cam.width / (2 * cam.zoom);
    const top = cam.height / 2 - cam.height / (2 * cam.zoom);
    const emitter = this.add.particles(0, 0, keys.confetti, {
      x: { min: cam.width / 2 - halfW, max: cam.width / 2 + halfW },
      y: top - 10,
      speedY: { min: 80, max: 200 },
      speedX: { min: -60, max: 60 },
      rotate: { start: 0, end: 360 * 3 },
      lifespan: 4200,
      tint: colors,
      frequency: settings.get().reducedMotion ? 120 : 25,
      quantity: 2,
      gravityY: 40,
    });
    emitter.setScrollFactor(0).setDepth(DEPTH.label + 5);
    this.time.delayedCall(2600, () => emitter.stop());
    this.time.delayedCall(7000, () => emitter.destroy());
  }

  private puff(x: number, y: number, scale: number): void {
    for (let i = 0; i < 3; i++) {
      const p = this.add
        .image(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-6, 6), keys.puff)
        .setDepth(DEPTH.fx - 1)
        .setScale(scale * 0.5)
        .setAlpha(0.7);
      this.tweens.add({
        targets: p,
        scale: scale * (1.1 + i * 0.2),
        alpha: 0,
        y: p.y - 30,
        duration: 600 + i * 120,
        onComplete: () => p.destroy(),
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string, size: number, wobble = false): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: '"Permanent Marker", cursive',
        fontSize: `${Math.round(size)}px`,
        color,
        stroke: '#fffdf6',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.label + 1)
      .setAngle(wobble ? Phaser.Math.Between(-14, 14) : 0)
      .setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t,
      y: y - 46,
      alpha: 0,
      delay: 650,
      duration: 650,
      onComplete: () => t.destroy(),
    });
  }
}
