import { UNITS, type Unit, type UnitStatus } from '@doodle/sim';
import Phaser from 'phaser';
import { DESIGNS } from '../art/characters';
import { BUBBLE_MARGIN, drawBubble, makeCanvas } from '../art/doodles';
import { INK, team, teamGlyph } from '../art/palette';
import { BOIL_FRAMES, type Design, type Mood, type PartDef, type RigInput } from '../art/rig';
import { settings } from '../settings';
import { DPR } from './dpr';
import { RIG_RES, frameKey, rigAtlas, type RigAtlas } from './rigTextures';
import { keys } from './textures';

export const DEPTH = {
  desk: 0,
  paper: 1,
  backdrop: 2,
  decor: 3,
  cloud: 4,
  terrain: 10,
  trail: 15,
  unit: 20,
  projectile: 30,
  fx: 40,
  /** Chat bubbles: over blasts, under name tags, damage numbers and the aim guide. */
  bubble: 48,
  label: 50,
  guide: 55,
};

const BAR_W = 50;
const BAR_H = 7;

/** How long a passing mood lasts before the doodle settles back. */
const MOOD_SECONDS: Partial<Record<Mood, number>> = { fire: 0.55, hurt: 0.65 };

/** Text is drawn this much finer than the world, like the name tags, so it stays sharp. */
const TEXT_RES = Math.min(2, window.devicePixelRatio || 1) * 1.5;

const BUBBLE_WRAP = 172;
const BUBBLE_LINES = 3;
const BUBBLE_PAD_X = 10;
const BUBBLE_PAD_Y = 5;
const BUBBLE_TAIL = 10;
/** How far above the head the tail points: clear of the name tag, or of the turn marker too. */
const BUBBLE_LIFT = 40;
const BUBBLE_LIFT_ACTIVE = 70;
let bubbleSerial = 0;

interface Bubble {
  /** Follows the doodle, and grows against the camera's zoom-out so the text stays readable. */
  box: Phaser.GameObjects.Container;
  /** Pops in. */
  body: Phaser.GameObjects.Container;
  /** Its own texture, drawn to fit the text. */
  key: string;
  /** When it starts to fade, on the view's clock. */
  until: number;
  fading: boolean;
}

/** The text wrapped to at most `max` lines, the last ending in "…" when there's more. */
function fitLines(t: Phaser.GameObjects.Text, text: string, max: number): string {
  const lines = t.getWrappedText(text);
  if (lines.length <= max) return text;
  const last = Array.from(lines[max - 1].trimEnd());
  while (last.length > 0 && t.getWrappedText(`${last.join('')}…`).length > 1) last.pop();
  return [...lines.slice(0, max - 1), `${last.join('').trimEnd()}…`].join('\n');
}

interface PartNode {
  def: PartDef;
  box: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  frame: string;
}

/**
 * One doodle on the battlefield: a rig of parts posed every frame from its mood, aim, charge and the wind,
 * plus its name tag, health bar and status icons.
 */
export class UnitView {
  readonly id: number;
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  /** Flips with facing; the outer container tilts with the ground. */
  private readonly rig: Phaser.GameObjects.Container;
  private readonly nodes = new Map<string, PartNode>();
  private readonly design: Design;
  private readonly atlas: RigAtlas;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Text;
  private readonly statusIcons = new Map<UnitStatus, Phaser.GameObjects.Image>();
  private readonly unit: Unit;
  private readonly seed: number;
  private time = Math.random() * 10;
  private boil = 0;
  private boilTimer = 0;
  private bob = 0;
  /** How recently the unit moved; walking shows while it's above zero. */
  private movingFor = 0;
  private shownHp: number;
  private targetHp: number;
  private baseMood: Mood = 'idle';
  private passing: { mood: Mood; until: number } | null = null;
  private moodStart = 0;
  private lastMood: Mood = 'idle';
  private power = 0;
  private look: { x: number; y: number } | null = null;
  private wind = 0;
  private statuses: Record<UnitStatus, boolean> = { inked: false, rooted: false, marked: false };
  private bubble: Bubble | null = null;
  facing: 1 | -1 = 1;
  angle = 45;
  dead = false;

  constructor(scene: Phaser.Scene, unit: Unit) {
    this.scene = scene;
    this.unit = unit;
    this.id = unit.id;
    this.seed = unit.id * 1.37 + 0.5;
    this.shownHp = unit.hp;
    this.targetHp = unit.hp;
    this.design = DESIGNS[unit.kind];
    this.atlas = rigAtlas(scene, unit.kind);

    this.rig = scene.add.container(0, 0);
    this.container = scene.add.container(unit.x, unit.y, [this.rig]).setDepth(DEPTH.unit);
    const tint = team(unit.team).hex;
    const build = (def: PartDef, parentPivot: readonly [number, number]): Phaser.GameObjects.Container => {
      const rendered = this.atlas.rig.parts.get(def.name)!;
      const [x0, y0, x1, y1] = def.box;
      const image = scene.add
        .image(0, 0, this.atlas.key, frameKey(def.name, rendered.first, 0))
        .setOrigin((def.pivot[0] - x0) / (x1 - x0), (def.pivot[1] - y0) / (y1 - y0))
        .setScale(1 / RIG_RES);
      if (def.team) image.setTint(tint);
      const box = scene.add.container(def.pivot[0] - parentPivot[0], def.pivot[1] - parentPivot[1]);
      const kids = this.atlas.rig.children.get(def.name) ?? [];
      for (const k of kids) if (k.behind) box.add(build(k, def.pivot));
      box.add(image);
      for (const k of kids) if (!k.behind) box.add(build(k, def.pivot));
      this.nodes.set(def.name, { def, box, image, frame: rendered.first });
      return box;
    };
    for (const def of this.atlas.rig.children.get('') ?? []) this.rig.add(build(def, [0, 0]));

    const t = team(unit.team);
    const res = TEXT_RES;
    this.label = scene.add
      .text(unit.x, unit.y - 60, `${teamGlyph(unit.team)} ${unit.name}`, {
        fontFamily: '"Patrick Hand", cursive',
        fontSize: '17px',
        color: t.color,
        stroke: '#fffdf6',
        strokeThickness: 5,
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.label);
    this.bar = scene.add.graphics().setDepth(DEPTH.label);
    this.marker = scene.add
      .text(unit.x, unit.y - 84, '▼', {
        fontFamily: '"Permanent Marker", cursive',
        fontSize: '24px',
        color: t.color,
        stroke: '#fffdf6',
        strokeThickness: 5,
        resolution: res,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.label)
      .setVisible(false);
    for (const s of ['inked', 'rooted', 'marked'] as const) {
      this.statusIcons.set(
        s,
        scene.add
          .image(0, 0, keys.status(s))
          .setScale(1 / 3)
          .setDepth(DEPTH.label)
          .setVisible(false),
      );
    }

    this.boilTimer = Math.random() * 120;
    this.setPose(unit.x, unit.y, unit.tilt, unit.facing, unit.angle);
    this.applyPose(0);
    this.drawBar();
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  /** Top of the doodle's head, for floating text. */
  get headY(): number {
    return this.container.y + this.design.frame[1];
  }

  setPose(x: number, y: number, tilt: number, facing: 1 | -1, angle: number): void {
    if (x !== this.container.x) this.movingFor = 150;
    this.container.setPosition(x, y);
    this.container.setRotation(tilt);
    this.facing = facing;
    this.angle = angle;
    this.rig.setScale(facing, 1);
    this.placeLabels();
  }

  setY(y: number): void {
    this.container.y = y;
    this.placeLabels();
  }

  setXY(x: number, y: number): void {
    this.container.setPosition(x, y);
    this.placeLabels();
  }

  private placeLabels(): void {
    const x = this.container.x;
    const y = this.container.y;
    const top = y + this.design.frame[1];
    this.label.setPosition(x, top - 14);
    this.marker.setPosition(x, top - 36 + Math.sin(this.bob) * 4);
    let ix = x + BAR_W / 2 + 10;
    for (const [s, icon] of this.statusIcons) {
      const on = this.statuses[s] && !this.dead;
      icon.setVisible(on);
      if (on) {
        icon.setPosition(ix, top - 6.5);
        ix += 17;
      }
    }
    this.drawBar();
    this.placeBubble();
  }

  /** The doodle whose turn it is aims; the rest idle. */
  setActive(active: boolean): void {
    this.marker.setVisible(active && !this.dead);
    this.baseMood = active ? 'aim' : 'idle';
  }

  setCharge(power: number): void {
    this.power = power;
    if (power > 0 && this.baseMood === 'aim') this.baseMood = 'charge';
    else if (power <= 0 && this.baseMood === 'charge') this.baseMood = 'aim';
  }

  /** Where to look, in the world, or null for along the aim. */
  setLook(x: number | null, y?: number): void {
    this.look = x === null ? null : { x, y: y ?? 0 };
  }

  /** Wind across the page, in px/s². */
  setWind(ax: number): void {
    this.wind = Math.max(-1, Math.min(1, ax / 160));
  }

  setFalling(falling: boolean): void {
    if (falling) this.passing = { mood: 'fly', until: Infinity };
    else if (this.passing?.mood === 'fly') this.passing = null;
  }

  setStatus(status: UnitStatus, on: boolean): void {
    this.statuses[status] = on;
    this.placeLabels();
  }

  setStatuses(u: Unit): void {
    this.statuses = { inked: u.inked > 0, rooted: u.rooted > 0, marked: u.marked };
    this.placeLabels();
  }

  setHp(hp: number): void {
    this.targetHp = hp;
  }

  syncHp(hp: number): void {
    this.targetHp = hp;
    this.shownHp = hp;
    this.drawBar();
  }

  private pass(mood: Mood): void {
    this.passing = { mood, until: this.time + (MOOD_SECONDS[mood] ?? 0.6) };
  }

  /** The shot left the barrel. */
  recoil(): void {
    this.pass('fire');
  }

  /** Flash and wince when hit. */
  flinch(strength = 1): void {
    if (this.dead) return;
    this.pass('hurt');
    for (const n of this.nodes.values())
      if (!n.def.team) n.image.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(60, () => {
      for (const n of this.nodes.values())
        if (!n.def.team) n.image.setTint(0xff9a8a).setTintMode(Phaser.TintModes.MULTIPLY);
    });
    this.scene.time.delayedCall(200, () => {
      for (const n of this.nodes.values()) if (!n.def.team) n.image.clearTint();
    });
    if (strength > 1.2 && !settings.get().reducedMotion) {
      this.scene.tweens.add({
        targets: this.rig,
        scaleY: 0.86,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
  }

  /** Victory hops until the match is cleared. */
  celebrate(): void {
    if (this.dead) return;
    this.baseMood = 'victory';
    this.passing = null;
  }

  private mood(): Mood {
    if (this.dead) return 'dead';
    if (this.passing && this.time < this.passing.until) return this.passing.mood;
    this.passing = null;
    if (this.baseMood === 'idle' && this.movingFor > 0) return 'walk';
    if ((this.baseMood === 'aim' || this.baseMood === 'charge') && this.movingFor > 0) return 'walk';
    return this.baseMood;
  }

  update(dtMs: number): void {
    this.time += dtMs / 1000;
    const calm = settings.get().reducedMotion;
    this.boilTimer += dtMs;
    if (this.boilTimer > 125) {
      this.boilTimer = 0;
      this.boil = calm ? 0 : (this.boil + 1) % BOIL_FRAMES;
    }
    if (this.shownHp !== this.targetHp) {
      const diff = this.targetHp - this.shownHp;
      const stepHp = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dtMs / 120));
      this.shownHp = Math.abs(stepHp) >= Math.abs(diff) ? this.targetHp : this.shownHp + stepHp;
      this.drawBar();
    }
    this.bob += dtMs / 140;
    this.marker.setPosition(
      this.container.x,
      this.container.y + this.design.frame[1] - 36 + Math.sin(this.bob) * 4,
    );
    this.movingFor = Math.max(0, this.movingFor - dtMs);
    this.applyPose(dtMs);
    if (this.bubble) {
      this.placeBubble();
      if (!this.bubble.fading && this.time >= this.bubble.until) this.fadeBubble();
    }
  }

  /** A chat line in a speech bubble over the doodle. A new line takes the place of the last. */
  say(text: string): void {
    if (this.dead) return;
    this.clearBubble();
    const scene = this.scene;
    const label = scene.add.text(0, 0, '', {
      fontFamily: '"Patrick Hand", cursive',
      fontSize: '16px',
      color: INK,
      align: 'center',
      wordWrap: { width: BUBBLE_WRAP, useAdvancedWrap: true },
      resolution: TEXT_RES,
    });
    label.setText(fitLines(label, text, BUBBLE_LINES)).setOrigin(0.5, 1);
    const m = BUBBLE_MARGIN;
    const w = Math.ceil(label.width) + BUBBLE_PAD_X * 2 + m * 2;
    const h = Math.ceil(label.height) + BUBBLE_PAD_Y * 2 + BUBBLE_TAIL + m * 2;
    const key = `bubble-${++bubbleSerial}`;
    const canvas = makeCanvas(Math.ceil(w * TEXT_RES), Math.ceil(h * TEXT_RES));
    drawBubble(canvas, w, h, BUBBLE_TAIL, this.seed * 31 + bubbleSerial, TEXT_RES);
    scene.textures.addCanvas(key, canvas);
    // The tail's tip sits on the anchor; the text sits in the box above it.
    const bg = scene.add
      .image(0, m, key)
      .setOrigin(0.5, 1)
      .setScale(1 / TEXT_RES);
    label.setPosition(0, -(BUBBLE_TAIL + BUBBLE_PAD_Y));
    const body = scene.add.container(0, 0, [bg, label]);
    const box = scene.add.container(0, 0, [body]).setDepth(DEPTH.bubble);
    // Longer lines stay up longer, from 3.5 to 7 seconds.
    const seconds = Math.min(7, 3.5 + Array.from(text).length * 0.045);
    this.bubble = { box, body, key, until: this.time + seconds, fading: false };
    this.placeBubble();
    if (!settings.get().reducedMotion) {
      body.setScale(0.6);
      scene.tweens.add({ targets: body, scale: 1, duration: 200, ease: 'Back.easeOut' });
    }
  }

  private placeBubble(): void {
    const b = this.bubble;
    if (!b) return;
    const lift = this.marker.visible ? BUBBLE_LIFT_ACTIVE : BUBBLE_LIFT;
    b.box.setPosition(this.container.x, this.container.y + this.design.frame[1] - lift);
    // Zoomed in, it scales with the world like the name tag. Zoomed out, it keeps its size on screen.
    const zoom = this.scene.cameras.main.zoom / DPR;
    b.box.setScale(Math.max(1, 1 / zoom));
  }

  private fadeBubble(): void {
    const b = this.bubble;
    if (!b || b.fading) return;
    b.fading = true;
    this.scene.tweens.add({
      targets: b.box,
      alpha: 0,
      duration: 300,
      onComplete: () => {
        if (this.bubble === b) this.clearBubble();
      },
    });
  }

  private clearBubble(): void {
    const b = this.bubble;
    if (!b) return;
    this.bubble = null;
    this.scene.tweens.killTweensOf([b.box, b.body]);
    b.box.destroy();
    if (this.scene.textures.exists(b.key)) this.scene.textures.remove(b.key);
  }

  private applyPose(_dtMs: number): void {
    const mood = this.mood();
    if (mood !== this.lastMood) {
      this.lastMood = mood;
      this.moodStart = this.time;
    }
    let look: [number, number] | null = null;
    if (this.look) {
      // Into the rig's own space: unflipped and untilted.
      const dx = this.look.x - this.container.x;
      const dy = this.look.y - (this.container.y - 22);
      const c = Math.cos(-this.container.rotation);
      const s = Math.sin(-this.container.rotation);
      look = [(dx * c - dy * s) * this.facing, dx * s + dy * c];
    }
    const input: RigInput = {
      t: this.time,
      mood,
      moodT: this.time - this.moodStart,
      aim: this.angle,
      look,
      power: this.power / 100,
      wind: this.wind * -this.facing,
      lowHp: this.targetHp < this.unit.maxHp * 0.25,
      seed: this.seed,
      calm: settings.get().reducedMotion,
    };
    const pose = this.design.pose(input);
    for (const [name, node] of this.nodes) {
      const p = pose[name] ?? {};
      const def = node.def;
      const parent = def.parent ? this.nodes.get(def.parent)!.def.pivot : ([0, 0] as const);
      node.box.setPosition(def.pivot[0] - parent[0] + (p.x ?? 0), def.pivot[1] - parent[1] + (p.y ?? 0));
      node.box.setRotation(p.rot ?? 0);
      node.box.setScale(p.sx ?? 1, p.sy ?? 1);
      node.box.setVisible(p.show !== false);
      node.box.setAlpha(p.alpha ?? 1);
      const frame = p.frame ?? node.frame;
      const variants = this.atlas.rig.parts.get(name)!.frames.get(frame)?.length ?? 1;
      node.image.setFrame(frameKey(name, frame, this.boil % variants));
    }
  }

  private drawBar(): void {
    const g = this.bar;
    g.clear();
    if (this.dead) return;
    const x = this.container.x - BAR_W / 2;
    const y = this.container.y + this.design.frame[1] - 10;
    const frac = Math.max(0, Math.min(1, this.shownHp / this.unit.maxHp));
    const ink = Phaser.Display.Color.HexStringToColor(INK).color;
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(x + 1.5, y + 2, BAR_W, BAR_H, 3.5);
    g.fillStyle(0xfffdf6, 1);
    g.fillRoundedRect(x, y, BAR_W, BAR_H, 3.5);
    const color = frac > 0.5 ? team(this.unit.team).hex : frac > 0.25 ? 0xe0a31e : 0xd2402f;
    if (frac > 0) {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x + 1.5, y + 1.5, Math.max(3, (BAR_W - 3) * frac), BAR_H - 3, 2);
    }
    g.lineStyle(1.8, ink, 1);
    g.strokeRoundedRect(x, y, BAR_W, BAR_H, 3.5);
  }

  die(cause: 'hp' | 'fell'): void {
    if (this.dead) return;
    this.dead = true;
    this.passing = null;
    this.fadeBubble();
    this.marker.setVisible(false);
    for (const icon of this.statusIcons.values()) icon.setVisible(false);
    this.bar.clear();
    this.scene.tweens.killTweensOf(this.rig);
    if (cause === 'fell') {
      this.scene.tweens.add({ targets: [this.container, this.label], alpha: 0, duration: 500 });
      return;
    }
    // An eraser scrubs the doodle out, then its ghost floats away.
    const cx = this.container.x;
    const cy = this.container.y - 20;
    const eraser = this.scene.add
      .image(cx - 18, cy - 4, keys.eraser)
      .setDepth(DEPTH.fx)
      .setAngle(-20)
      .setAlpha(0);
    this.scene.tweens.add({ targets: eraser, alpha: 1, duration: 120 });
    this.scene.tweens.add({
      targets: eraser,
      x: cx + 18,
      duration: 140,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
    const crumbs = this.scene.add.particles(cx, cy + 8, keys.crumb, {
      speed: { min: 40, max: 120 },
      angle: { min: 200, max: 340 },
      gravityY: 500,
      lifespan: 700,
      scale: { min: 0.5, max: 1 },
      tint: 0xf29bb0,
      frequency: 40,
      quantity: 2,
    });
    crumbs.setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: [this.container, this.label], alpha: 0, delay: 350, duration: 900 });
    this.scene.time.delayedCall(1150, () => {
      crumbs.stop();
      this.scene.tweens.add({
        targets: eraser,
        alpha: 0,
        y: eraser.y - 20,
        duration: 300,
        onComplete: () => eraser.destroy(),
      });
      this.scene.time.delayedCall(800, () => crumbs.destroy());
      const ghost = this.scene.add.image(cx, cy, keys.ghost).setDepth(DEPTH.fx).setAlpha(0.9);
      this.scene.tweens.add({
        targets: ghost,
        y: cy - 90,
        alpha: 0,
        duration: 1600,
        ease: 'Sine.easeOut',
        onComplete: () => ghost.destroy(),
      });
      this.scene.tweens.add({
        targets: ghost,
        x: cx + 10,
        duration: 400,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut',
      });
    });
  }

  destroy(): void {
    this.clearBubble();
    this.container.destroy();
    this.label.destroy();
    this.bar.destroy();
    this.marker.destroy();
    for (const icon of this.statusIcons.values()) icon.destroy();
  }
}

/** The barrel's reach, for the aim guide. */
export function barrelReach(u: Unit): number {
  return UNITS[u.kind].mount.length;
}
