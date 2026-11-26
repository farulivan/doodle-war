import type { Unit } from '@doodle/sim';
import Phaser from 'phaser';
import { BARREL_CANVAS, BARREL_PIVOT, UNIT_CANVAS } from '../art/doodles';
import { INK, team } from '../art/palette';
import { settings } from '../settings';
import { BOIL_FRAMES, keys } from './textures';

export const DEPTH = {
  desk: 0,
  paper: 1,
  decor: 2,
  cloud: 3,
  terrain: 10,
  trail: 15,
  unit: 20,
  projectile: 30,
  fx: 40,
  label: 50,
  guide: 55,
};

const BAR_W = 46;
const BAR_H = 6;
/** A shape per team so teams read without relying on color alone. */
export const TEAM_GLYPH = ['●', '▲', '■', '◆'];

/** One unit on the battlefield: boiling doodle body, aimable barrel, name tag and HP bar. */
export class UnitView {
  readonly id: number;
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  /** Inner container that bobs and squashes without moving the unit's real position. */
  private readonly rig: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly barrel: Phaser.GameObjects.Image;
  private readonly inkMark: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly marker: Phaser.GameObjects.Text;
  private readonly unit: Unit;
  private frame = 0;
  private boilTimer = 0;
  private bob = 0;
  private walkTime = 0;
  /** How recently the unit moved; drives the walk bounce. */
  private movingFor = 0;
  private time = Math.random() * 10;
  private shownHp: number;
  private targetHp: number;
  facing: 1 | -1 = 1;
  angle = 45;
  dead = false;

  constructor(scene: Phaser.Scene, unit: Unit) {
    this.scene = scene;
    this.unit = unit;
    this.id = unit.id;
    this.shownHp = unit.hp;
    this.targetHp = unit.hp;

    this.barrel = scene.add.image(0, 0, keys.barrel(unit.kind));
    this.body = scene.add.image(0, 0, keys.body(unit.kind, unit.team, 0));
    this.body.setOrigin(UNIT_CANVAS.footX / UNIT_CANVAS.w, UNIT_CANVAS.footY / UNIT_CANVAS.h);
    this.inkMark = scene.add.image(0, -18, keys.inkmark).setVisible(false).setAlpha(0.9);
    this.rig = scene.add.container(0, 0, [this.barrel, this.body, this.inkMark]);
    this.container = scene.add.container(unit.x, unit.y, [this.rig]).setDepth(DEPTH.unit);

    const t = team(unit.team);
    this.label = scene.add
      .text(unit.x, unit.y - 54, `${TEAM_GLYPH[unit.team % TEAM_GLYPH.length]} ${unit.name}`, {
        fontFamily: '"Patrick Hand", cursive',
        fontSize: '17px',
        color: t.color,
        stroke: '#fffdf6',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.label);
    this.bar = scene.add.graphics().setDepth(DEPTH.label);
    this.marker = scene.add
      .text(unit.x, unit.y - 76, '↓', {
        fontFamily: '"Permanent Marker", cursive',
        fontSize: '28px',
        color: t.color,
        stroke: '#fffdf6',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.label)
      .setVisible(false);

    this.boilTimer = Math.random() * 160;
    this.setPose(unit.x, unit.y, unit.tilt, unit.facing, unit.angle);
    this.drawBar();
  }

  get x(): number {
    return this.container.x;
  }

  get y(): number {
    return this.container.y;
  }

  setPose(x: number, y: number, tilt: number, facing: 1 | -1, angle: number): void {
    if (x !== this.container.x) this.movingFor = 140;
    this.container.setPosition(x, y);
    this.container.setRotation(tilt);
    this.facing = facing;
    this.angle = angle;
    this.body.setFlipX(facing === -1);
    const pivot = BARREL_PIVOT[this.unit.kind];
    this.barrel.setPosition(pivot.x * facing, pivot.y);
    const pivotX = 2 / BARREL_CANVAS.w;
    if (facing === 1) {
      this.barrel.setFlipX(false).setOrigin(pivotX, 0.5).setRotation(-Phaser.Math.DegToRad(angle));
    } else {
      this.barrel
        .setFlipX(true)
        .setOrigin(1 - pivotX, 0.5)
        .setRotation(Phaser.Math.DegToRad(angle));
    }
    this.inkMark.setFlipX(facing === -1);
    this.placeLabels();
  }

  setY(y: number): void {
    this.container.y = y;
    this.placeLabels();
  }

  private placeLabels(): void {
    const x = this.container.x;
    const y = this.container.y;
    this.label.setPosition(x, y - 46);
    this.marker.setPosition(x, y - 70 + Math.sin(this.bob) * 4);
    this.drawBar();
  }

  setActive(active: boolean): void {
    this.marker.setVisible(active && !this.dead);
  }

  setInked(inked: boolean): void {
    this.inkMark.setVisible(inked && !this.dead);
  }

  setHp(hp: number): void {
    this.targetHp = hp;
  }

  syncHp(hp: number): void {
    this.targetHp = hp;
    this.shownHp = hp;
    this.drawBar();
  }

  recoil(): void {
    const dx = -this.facing * 4;
    this.scene.tweens.add({
      targets: this.barrel,
      x: this.barrel.x + dx,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.rig,
      scaleX: 1.08,
      scaleY: 0.92,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** Flash and shake when hit. */
  flinch(strength = 1): void {
    if (this.dead) return;
    this.body.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(70, () => this.body.setTint(0xff8a80).setTintMode(Phaser.TintModes.MULTIPLY));
    this.scene.time.delayedCall(190, () => this.body.clearTint());
    const amp = 3 * strength;
    this.scene.tweens.add({
      targets: this.rig,
      x: { from: -amp, to: amp },
      duration: 45,
      yoyo: true,
      repeat: 3,
      onComplete: () => this.rig.setX(0),
    });
  }

  /** Little victory hops. */
  celebrate(): void {
    if (this.dead) return;
    this.scene.tweens.add({
      targets: this.rig,
      y: -14,
      duration: 220,
      yoyo: true,
      repeat: -1,
      repeatDelay: 260,
      ease: 'Quad.easeOut',
    });
  }

  update(dtMs: number): void {
    this.time += dtMs / 1000;
    this.boilTimer += dtMs;
    if (this.boilTimer > 160) {
      this.boilTimer = 0;
      this.frame = (this.frame + 1) % BOIL_FRAMES;
      this.body.setTexture(keys.body(this.unit.kind, this.unit.team, this.frame));
    }
    if (this.shownHp !== this.targetHp) {
      const diff = this.targetHp - this.shownHp;
      const stepHp = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dtMs / 120));
      this.shownHp = Math.abs(stepHp) >= Math.abs(diff) ? this.targetHp : this.shownHp + stepHp;
      this.drawBar();
    }
    this.bob += dtMs / 140;
    this.marker.setPosition(this.container.x, this.container.y - 70 + Math.sin(this.bob) * 4);

    if (this.dead || settings.get().reducedMotion) return;
    // Walk bounce while moving, slow breathing while idle.
    this.movingFor = Math.max(0, this.movingFor - dtMs);
    if (this.movingFor > 0) {
      this.walkTime += dtMs / 1000;
      this.body.y = -Math.abs(Math.sin(this.walkTime * 16)) * 2.6;
      this.body.rotation = Math.sin(this.walkTime * 16) * 0.05;
      this.body.setScale(1, 1);
    } else {
      this.body.y *= 0.8;
      this.body.rotation *= 0.8;
      const breathe = Math.sin(this.time * 2.4) * 0.018;
      this.body.setScale(1 - breathe * 0.5, 1 + breathe);
    }
  }

  private drawBar(): void {
    const g = this.bar;
    g.clear();
    if (this.dead) return;
    const x = this.container.x - BAR_W / 2;
    const y = this.container.y - 44;
    const frac = Math.max(0, Math.min(1, this.shownHp / this.unit.maxHp));
    g.fillStyle(0xfffdf6, 0.95);
    g.fillRect(x, y, BAR_W, BAR_H);
    const color = frac > 0.5 ? team(this.unit.team).hex : frac > 0.25 ? 0xe0a31e : 0xc0392b;
    g.fillStyle(color, 1);
    g.fillRect(x + 1, y + 1, (BAR_W - 2) * frac, BAR_H - 2);
    g.lineStyle(1.5, Phaser.Display.Color.HexStringToColor(INK).color, 1);
    g.strokeRect(x, y, BAR_W, BAR_H);
  }

  die(cause: 'hp' | 'fell'): void {
    if (this.dead) return;
    this.dead = true;
    this.marker.setVisible(false);
    this.inkMark.setVisible(false);
    this.bar.clear();
    this.scene.tweens.killTweensOf(this.rig);
    if (cause === 'fell') {
      this.scene.tweens.add({ targets: [this.container, this.label], alpha: 0, duration: 500 });
      return;
    }
    // An eraser scrubs the doodle out, then its ghost floats away.
    const cx = this.container.x;
    const cy = this.container.y - 16;
    const eraser = this.scene.add
      .image(cx - 16, cy - 4, keys.eraser)
      .setDepth(DEPTH.fx)
      .setAngle(-20)
      .setAlpha(0);
    this.scene.tweens.add({ targets: eraser, alpha: 1, duration: 120 });
    this.scene.tweens.add({
      targets: eraser,
      x: cx + 16,
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
    this.body.setTint(0x9a9a9a);
    this.barrel.setTint(0x9a9a9a);
    this.scene.tweens.add({ targets: [this.container, this.label], alpha: 0, delay: 250, duration: 900 });
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
    this.container.destroy();
    this.label.destroy();
    this.bar.destroy();
    this.marker.destroy();
  }
}
