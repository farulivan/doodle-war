import {
  MAPS,
  UNITS,
  UNIT_KINDS,
  WALK_SPEED,
  PICKUP_INFO,
  activeUnit,
  applyPickup,
  beginTurn,
  canUseSpecial,
  circleSkipper,
  GLUE,
  clampAngle,
  createMatch,
  drawLine,
  faceActive,
  fire,
  hopActive,
  moveActive,
  rleDecode,
  skipTurn,
  turnQueue,
  worldElevation,
  writeRect,
  type AimUpdate,
  type BotPlan,
  type DrawMessage,
  type GameState,
  type MatchConfig,
  type MatchStart,
  type MoveMessage,
  type MoveResult,
  type OverMessage,
  type ShotMessage,
  type SyncMessage,
  type TurnMessage,
  type Unit,
  type WeaponSlot,
} from '@doodle/sim';
import Phaser from 'phaser';
import { session, type OnlineHandlers } from '../net/online';
import { audio } from './audio';
import { botPlanner } from './botPlanner';
import { recordMatch } from './profile';
import { hud, initialHud, type ActiveInfo, type MatchSummary, type QueueEntry } from './store';
import { BattleScene } from './view/BattleScene';
import { DPR } from './view/dpr';
import { registerTextures } from './view/textures';

const POWER_RATE = 62;
const ANGLE_RATE = 40;
const BOT_ANGLE_RATE = 70;

export interface MatchOptions {
  /** Seconds per human turn; 0 turns the timer off. */
  turnSeconds: number;
}

type BotStage = 'think' | 'planning' | 'move' | 'face' | 'aim' | 'charge';

interface BotTask {
  stage: BotStage;
  wait: number;
  plan: BotPlan | null;
  moved: number;
  power: number;
}

/** Virtual buttons shared by the keyboard and the on-screen touch controls. */
export type Control = 'left' | 'right' | 'up' | 'down' | 'fire';

class GameController {
  private game: Phaser.Game | null = null;
  private scene: BattleScene | null = null;
  private ready: Promise<void> | null = null;
  private state: GameState | null = null;
  private options: MatchOptions = { turnSeconds: 30 };
  private mode: 'none' | 'demo' | 'match' | 'online' = 'none';
  private lastConfig: MatchConfig | null = null;
  private matchToken = 0;

  private held = new Set<Control>();
  private angle = 45;
  private angleHold = 0;
  private power = 0;
  private powerDir = 1;
  private charging = false;
  private walkAcc = 0;
  private slot: WeaponSlot = 0;
  private timer: number | null = null;
  private bot: BotTask | null = null;
  private busy = false;
  private bannerId = 0;
  private toastId = 0;
  private lastHumanTeam: number | null = null;
  /** The active unit got inked last turn, so it moves at half speed. */
  private slowed = false;

  // Online play: who controls each unit, and server messages held while an animation runs.
  private owners: string[] = [];
  private me = '';
  private netQueue: (() => void)[] = [];
  private netBusy = false;
  private aimSentAt = 0;
  private lastAimKey = '';

  constructor() {
    session.bind(this.onlineHandlers());
  }

  /** Creates the Phaser game once. Safe to call repeatedly. */
  mount(parent: HTMLElement): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await Promise.all([
        document.fonts.load('32px "Permanent Marker"'),
        document.fonts.load('20px "Patrick Hand"'),
      ]).catch(() => undefined);
      await new Promise<void>((resolve) => {
        // The canvas renders at the screen's pixel density and is shown at CSS size, so the doodles stay
        // sharp on high-DPI screens. Phaser 4 has no setting for this, so the size is kept by hand.
        const size = () => [Math.max(1, parent.clientWidth) * DPR, Math.max(1, parent.clientHeight) * DPR];
        const [w, h] = size();
        this.game = new Phaser.Game({
          type: Phaser.WEBGL,
          parent,
          backgroundColor: '#6b4a2f',
          scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / DPR },
          render: { antialias: true, mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
          input: { mouse: { preventDefaultWheel: true } },
          banner: false,
        });
        window.addEventListener('resize', () => {
          const [nw, nh] = size();
          this.game?.scale.resize(nw, nh);
        });
        this.game.events.once('ready', () => {
          const scene = new BattleScene();
          this.game!.scene.add('battle', scene, true, {
            hooks: {
              update: (dt: number) => this.update(dt),
              onDrawLine: (x0: number, y0: number, x1: number, y1: number) => this.commitDraw(x0, y0, x1, y1),
              onReady: () => {
                registerTextures(scene);
                this.scene = scene;
                resolve();
              },
            },
          });
        });
      });
      this.bindKeyboard();
    })();
    return this.ready;
  }

  // -------------------------------------------------------------------------
  // Match lifecycle

  async startDemo(): Promise<void> {
    await this.ready;
    const rng = Math.random;
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
    const names = ['Doodles', 'Scribbles', 'Smudge', 'Sketchy', 'Inky', 'Penny'];
    const config: MatchConfig = {
      mapId: pick(MAPS).id,
      seed: Math.floor(rng() * 1e9),
      players: [0, 1, 2, 3].map((i) => ({
        name: names[i],
        team: i % 2,
        kind: pick(UNIT_KINDS),
        controller: 'bot' as const,
        botLevel: pick(['normal', 'hard'] as const),
      })),
    };
    this.begin(config, 'demo', { turnSeconds: 0 });
    audio.music('menu');
  }

  async startMatch(config: MatchConfig, options: MatchOptions): Promise<void> {
    await this.ready;
    this.begin(config, 'match', options);
    audio.music('battle');
  }

  async rematch(): Promise<void> {
    if (!this.lastConfig) return;
    await this.ready;
    this.begin({ ...this.lastConfig, seed: Math.floor(Math.random() * 1e9) }, 'match', this.options);
  }

  stop(): void {
    this.matchToken++;
    this.state = null;
    this.mode = 'none';
    this.netQueue = [];
    this.netBusy = false;
    this.resetTurnInput();
    this.scene?.setActive(null);
    hud.set({ ...initialHud });
  }

  private begin(config: MatchConfig, mode: 'demo' | 'match', options: MatchOptions): void {
    if (!this.scene) return;
    this.matchToken++;
    this.mode = mode;
    this.options = options;
    if (mode === 'match') this.lastConfig = config;
    this.state = createMatch(config);
    this.lastHumanTeam = null;
    this.resetTurnInput();
    this.game?.scene.resume('battle');
    this.scene.buildWorld(this.state);
    const humanTeams = new Set(config.players.filter((p) => p.controller === 'human').map((p) => p.team));
    hud.set({
      ...initialHud,
      mode,
      timerMax: options.turnSeconds,
      soloHuman: humanTeams.size <= 1,
    });
    const token = this.matchToken;
    window.setTimeout(() => token === this.matchToken && this.nextTurn(), mode === 'demo' ? 400 : 900);
  }

  private resetTurnInput(): void {
    this.held.clear();
    this.charging = false;
    this.power = 0;
    this.powerDir = 1;
    this.walkAcc = 0;
    this.slot = 0;
    this.timer = null;
    this.bot = null;
    this.busy = false;
    if (this.scene) {
      this.scene.aimGuideFor = null;
      this.scene.drawMode = false;
    }
  }

  private nextTurn(): void {
    const state = this.state;
    const scene = this.scene;
    if (!state || !scene) return;
    if (state.phase === 'over') {
      this.finish();
      return;
    }
    this.resetTurnInput();
    const actor = beginTurn(state);
    if (!actor) {
      this.finish();
      return;
    }
    this.presentTurn(actor, this.options.turnSeconds);
  }

  /** Shows a turn that has started, locally or on the server, and hands out control. */
  private presentTurn(actor: Unit, seconds: number): void {
    const state = this.state!;
    const scene = this.scene!;
    this.resetTurnInput();
    this.slowed = state.turn.moveLeft < UNITS[actor.kind].moveBudget;
    if (this.mode !== 'demo') {
      if (state.turn.moveLeft === 0) this.toast(`${actor.name} is stuck in glue: no walking this turn`);
      else if (this.slowed) this.toast(`${actor.name} is inked: half movement`);
    }
    scene.syncUnits(state);
    const dropped = scene.syncPickups(state.pickups, true);
    if (dropped.length && this.mode !== 'demo')
      this.toast(
        `${/^[AEIOU]/.test(PICKUP_INFO[dropped[0]].name) ? 'An' : 'A'} ${PICKUP_INFO[dropped[0]].name} floated down! Walk over it to grab it.`,
      );
    scene.setActive(actor.id);
    scene.setWind(state.turn.wind.ax);
    scene.releaseManualCamera();
    scene.restoreZoom();
    scene.focusUnit(actor.id);
    this.angle = actor.angle;

    if (this.mode === 'online') {
      const mine = this.owners[actor.id] === this.me;
      audio.play('turn');
      this.banner(
        mine
          ? 'Your turn!'
          : actor.controller === 'bot'
            ? `${actor.name} is thinking...`
            : `${actor.name}'s turn`,
        state.suddenDeath ? 'Deadline! All damage x1.5' : undefined,
      );
      this.timer = seconds > 0 ? seconds : null;
      if (mine) scene.aimGuideFor = actor.id;
      hud.set({ phase: mine ? 'aim' : 'bot' });
      this.publish(true);
      return;
    }

    const isHuman = actor.controller === 'human' && this.mode === 'match';
    const hotseatSwap =
      isHuman && this.lastHumanTeam !== null && this.lastHumanTeam !== actor.team && !hud.get().soloHuman;
    if (isHuman) this.lastHumanTeam = actor.team;

    if (this.mode === 'match') {
      audio.play('turn');
      this.banner(
        isHuman
          ? hud.get().soloHuman
            ? 'Your turn!'
            : `${actor.name}'s turn`
          : `${actor.name} is thinking...`,
        hotseatSwap ? 'Pass the device!' : state.suddenDeath ? 'Deadline! All damage x1.5' : undefined,
      );
    }

    if (isHuman) {
      scene.aimGuideFor = actor.id;
      this.timer = seconds > 0 ? seconds : null;
      hud.set({ phase: 'aim' });
    } else {
      this.bot = { stage: 'think', wait: this.mode === 'demo' ? 500 : 750, plan: null, moved: 0, power: 0 };
      hud.set({ phase: 'bot' });
    }
    this.publish(true);
  }

  private finish(): void {
    const state = this.state;
    if (!state) return;
    this.scene?.setActive(null);
    if (this.mode === 'demo') {
      this.scene?.celebrate(state.winner ?? -1);
      const token = this.matchToken;
      window.setTimeout(() => token === this.matchToken && void this.startDemo(), 3500);
      return;
    }
    const winner = state.winner ?? -1;
    const humanTeams = new Set(state.units.filter((u) => u.controller === 'human').map((u) => u.team));
    let humanWon = humanTeams.size === 1 ? humanTeams.has(winner) : null;
    if (this.mode === 'online') {
      const myTeam = state.units.find((u) => this.owners[u.id] === this.me)?.team;
      humanWon = myTeam === undefined ? null : myTeam === winner;
    }
    const summary: MatchSummary = {
      winner,
      humanWon,
      online: this.mode === 'online',
      turns: state.turn.number,
      rows: state.units.map((u) => ({
        id: u.id,
        name: u.name,
        team: u.team,
        kind: u.kind,
        alive: u.alive,
        damageDealt: Math.round(u.stats.damageDealt),
        damageTaken: Math.round(u.stats.damageTaken),
        kills: u.stats.kills,
        shots: u.stats.shots,
      })),
    };
    audio.play(humanWon === false ? 'lose' : 'win');
    if (humanWon !== null) {
      const mine = state.units.filter((u) =>
        this.mode === 'online' ? this.owners[u.id] === this.me : u.controller === 'human',
      );
      recordMatch(
        humanWon,
        mine.reduce((sum, u) => sum + u.stats.damageDealt, 0),
      );
    }
    this.scene?.celebrate(winner);
    // Let the confetti fly for a moment before the results card covers it.
    const token = this.matchToken;
    hud.set({ phase: 'over', timer: null });
    window.setTimeout(() => token === this.matchToken && hud.set({ summary }), 1600);
  }

  // -------------------------------------------------------------------------
  // Frame update

  private update(dt: number): void {
    const state = this.state;
    const scene = this.scene;
    if (!state || !scene) return;
    if (this.mode === 'online') {
      this.updateOnline(dt);
      return;
    }
    if (hud.get().paused) return;
    const actor = activeUnit(state);
    if (!actor || state.phase === 'over' || this.busy) {
      return;
    }
    if (this.bot) this.updateBot(dt, actor);
    else if (hud.get().phase === 'aim') this.updateHuman(dt, actor);
    this.showAim(actor);
    this.publish(false);
  }

  /** The aiming doodle's face follows its charge, and the guide its weapon. */
  private showAim(actor: Unit): void {
    const scene = this.scene!;
    scene.aimSlot = this.slot;
    scene.setCharge(actor.id, this.charging ? this.power : 0);
  }

  private updateHuman(dt: number, actor: Unit): void {
    const scene = this.scene!;
    const state = this.state!;
    const sec = dt / 1000;

    if (this.timer !== null) {
      this.timer = Math.max(0, this.timer - sec);
      if (this.timer === 0) {
        this.timer = null;
        if (this.charging) this.release();
        else if (this.mode !== 'online') this.timeUp();
        return;
      }
    }

    const left = this.held.has('left');
    const right = this.held.has('right');
    if (left !== right && !this.charging) {
      const dir: 1 | -1 = right ? 1 : -1;
      if (actor.facing !== dir) {
        faceActive(state, dir);
        if (this.mode === 'online') session.send('move', { dir, px: 0 });
      }
      this.walkAcc += WALK_SPEED * sec;
      const px = Math.floor(this.walkAcc);
      if (px >= 1) {
        this.walkAcc -= px;
        // Online: predict locally (the walk is integer-deterministic) and tell the server.
        const send = Math.min(px, Math.floor(state.turn.moveLeft));
        const res = moveActive(state, dir, px);
        if (this.mode === 'online' && send > 0) session.send('move', { dir, px: send });
        this.showCollected(res);
        if (res.fall || res.glide) {
          this.busy = true;
          const token = this.matchToken;
          void this.animateMoveFall(actor, res).then(() => {
            if (token !== this.matchToken) return;
            this.busy = false;
            if (res.turnEnded) this.afterTurn();
            else scene.syncUnit(actor, this.angle);
          });
          return;
        }
      }
      scene.syncUnit(actor, this.angle);
      scene.focusUnit(actor.id);
    } else {
      this.walkAcc = 0;
    }

    const up = this.held.has('up');
    const down = this.held.has('down');
    if (up !== down) {
      this.angleHold += dt;
      if (this.angleHold > 220) {
        this.angle = clampAngle(actor, this.angle + (up ? 1 : -1) * ANGLE_RATE * sec);
        scene.syncUnit(actor, this.angle);
      }
    } else {
      this.angleHold = 0;
    }

    if (this.charging) {
      this.power += this.powerDir * POWER_RATE * sec;
      if (this.power >= 100) {
        this.power = 100;
        this.powerDir = -1;
      } else if (this.power <= 0) {
        this.power = 0;
        this.powerDir = 1;
      }
    }
  }

  private updateBot(dt: number, actor: Unit): void {
    const bot = this.bot!;
    const scene = this.scene!;
    const state = this.state!;
    const sec = dt / 1000;
    bot.wait -= dt;
    if (bot.wait > 0) return;

    switch (bot.stage) {
      case 'think': {
        bot.stage = 'planning';
        const token = this.matchToken;
        const turn = state.turn.number;
        void botPlanner.plan(state, actor).then((plan) => {
          if (token !== this.matchToken || this.bot !== bot || state.turn.number !== turn) return;
          bot.plan = plan;
          bot.stage = plan.move !== 0 ? 'move' : 'face';
          bot.wait = 150;
        });
        break;
      }
      case 'planning':
        break;
      case 'move': {
        const plan = bot.plan!;
        const dir: 1 | -1 = plan.move > 0 ? 1 : -1;
        const want = Math.abs(plan.move);
        this.walkAcc += WALK_SPEED * sec;
        const px = Math.min(Math.floor(this.walkAcc), want - bot.moved);
        if (px >= 1) {
          this.walkAcc -= px;
          const res = moveActive(state, dir, px);
          bot.moved += px;
          this.showCollected(res);
          if (res.fall || res.glide) {
            this.busy = true;
            const token = this.matchToken;
            void this.animateMoveFall(actor, res).then(() => {
              if (token !== this.matchToken) return;
              this.busy = false;
              if (res.turnEnded) this.afterTurn();
              else {
                // Footing changed: plan again from the new spot.
                bot.stage = 'think';
                bot.plan = null;
              }
            });
            return;
          }
          if (res.moved === 0) bot.moved = want;
        }
        scene.syncUnit(actor, this.angle);
        scene.focusUnit(actor.id);
        if (bot.moved >= want) {
          bot.stage = 'face';
          bot.wait = 200;
        }
        break;
      }
      case 'face': {
        faceActive(state, bot.plan!.facing);
        scene.syncUnit(actor, this.angle);
        bot.stage = 'aim';
        bot.wait = 200;
        break;
      }
      case 'aim': {
        const target = bot.plan!.angle;
        const step = BOT_ANGLE_RATE * sec;
        if (Math.abs(target - this.angle) <= step) {
          this.angle = target;
          bot.stage = 'charge';
          bot.wait = 250;
          this.charging = true;
          this.power = 0;
        } else {
          this.angle += Math.sign(target - this.angle) * step;
        }
        scene.syncUnit(actor, this.angle);
        break;
      }
      case 'charge': {
        this.slot = bot.plan!.slot;
        this.power = Math.min(bot.plan!.power, this.power + POWER_RATE * sec);
        if (this.power >= bot.plan!.power) {
          this.charging = false;
          void this.doFire(bot.plan!.power, true);
        }
        break;
      }
    }
  }

  /** A walk that ended in a glide, a drop, or both. */
  private animateMoveFall(actor: Unit, res: MoveResult): Promise<void> {
    const scene = this.scene!;
    if (res.glide) {
      return scene.animateGlide(actor, res.glide, res.fall ? res.fall.toY : null, !!res.fall?.dead);
    }
    const fall = res.fall!;
    return scene.animateWalkFall(actor, fall.fromY, fall.toY, fall.dead);
  }

  private showCollected(res: MoveResult): void {
    if (!res.collected.length || !this.scene || !this.state) return;
    for (const c of res.collected) this.scene.collectPickup(c.pickupId, c.kind);
    this.scene.syncUnits(this.state);
    this.publish(true);
  }

  private timeUp(): void {
    this.toast("Time's up!");
    skipTurn(this.state!);
    this.afterTurn();
  }

  // -------------------------------------------------------------------------
  // Actions

  private release(): void {
    if (!this.charging) return;
    this.charging = false;
    void this.doFire(this.power, false);
  }

  private async doFire(power: number, exactAngle: boolean): Promise<void> {
    const state = this.state;
    const scene = this.scene;
    if (!state || !scene) return;
    const actor = activeUnit(state);
    if (!actor) return;
    const token = this.matchToken;
    this.busy = true;
    this.bot = null;
    this.timer = null;
    scene.aimGuideFor = null;
    scene.drawMode = false;
    hud.set({ phase: 'shot', drawMode: false, timer: null });
    const angle = exactAngle ? this.angle : Math.round(this.angle);
    if (this.mode === 'online') {
      // The server resolves the shot and sends it to everyone, us included.
      session.send('fire', { angle, power: Math.round(power * 10) / 10, slot: this.slot });
      return;
    }
    const result = fire(state, { angle, power: Math.round(power * 10) / 10, slot: this.slot });
    this.publish(true);
    await scene.playShot(result);
    if (token !== this.matchToken) return;
    this.busy = false;
    this.afterTurn();
  }

  private afterTurn(): void {
    const state = this.state;
    if (!state) return;
    this.scene!.aimGuideFor = null;
    this.scene!.setActive(null);
    hud.set({ phase: state.phase === 'over' ? 'over' : 'between', drawMode: false, timer: null });
    this.publish(true);
    if (this.mode === 'online') return;
    const token = this.matchToken;
    const delay = state.phase === 'over' ? 900 : this.mode === 'demo' ? 500 : 700;
    window.setTimeout(() => token === this.matchToken && this.nextTurn(), delay);
  }

  private commitDraw(x0: number, y0: number, x1: number, y1: number): void {
    const state = this.state;
    if (!state || !this.scene || hud.get().phase !== 'aim') return;
    this.scene.drawMode = false;
    hud.set({ drawMode: false });
    if (this.mode === 'online') {
      session.send('draw', { x0, y0, x1, y1 });
      return;
    }
    const res = drawLine(state, x0, y0, x1, y1);
    if (!res.ok) {
      this.toast(res.reason ?? "Can't draw there");
      return;
    }
    this.scene.applyDraw(res.rect!);
    this.publish(true);
  }

  // -------------------------------------------------------------------------
  // Input from the keyboard and the HUD

  press(control: Control): void {
    audio.unlock();
    if (!this.canAct()) return;
    if (this.held.has(control)) return;
    this.held.add(control);
    const actor = activeUnit(this.state!)!;
    if (control === 'up' || control === 'down') {
      this.angle = clampAngle(actor, Math.round(this.angle) + (control === 'up' ? 1 : -1));
      this.angleHold = 0;
      this.scene!.syncUnit(actor, this.angle);
    }
    if (control === 'fire' && !this.charging && !hud.get().drawMode) {
      this.charging = true;
      this.power = 0;
      this.powerDir = 1;
    }
  }

  releaseControl(control: Control): void {
    this.held.delete(control);
    if (control === 'fire' && this.charging && this.canAct()) this.release();
  }

  /** Hop out of a hole. */
  hop(): void {
    if (!this.canAct() || this.charging) return;
    const state = this.state!;
    const actor = activeUnit(state)!;
    const res = hopActive(state);
    if (!res.ok) {
      this.toast(state.turn.moveLeft < 30 ? 'Not enough movement left to hop' : 'No room to hop here');
      return;
    }
    if (this.mode === 'online') session.send('hop', {});
    this.busy = true;
    const token = this.matchToken;
    void this.scene!.animateHop(
      actor,
      res.fromX,
      res.fromY,
      res.peakX,
      res.peakY,
      res.fall ? res.fall.toY : actor.y,
      !actor.alive,
    ).then(() => {
      if (token !== this.matchToken) return;
      this.busy = false;
      this.showCollected(res);
      if (res.turnEnded) this.afterTurn();
      else this.scene!.syncUnit(actor, this.angle);
      this.publish(true);
    });
  }

  selectWeapon(slot: WeaponSlot): void {
    if (!this.canAct()) return;
    const actor = activeUnit(this.state!)!;
    if (slot === 2 && !canUseSpecial(actor)) {
      this.toast('Special meter not full yet');
      return;
    }
    audio.play('click');
    this.slot = slot;
    this.publish(true);
  }

  toggleDraw(): void {
    if (!this.canAct() || this.charging) return;
    const actor = activeUnit(this.state!)!;
    if (actor.drawUsed) {
      this.toast('Draw is used up for this match');
      return;
    }
    const on = !hud.get().drawMode;
    this.scene!.drawMode = on;
    hud.set({ drawMode: on });
    if (on) this.toast('Drag near your unit to ink a line');
  }

  toggleOverview(): void {
    this.scene?.toggleOverview();
  }

  zoom(factor: number): void {
    this.scene?.zoomBy(factor);
  }

  recenter(): void {
    const actor = this.state && activeUnit(this.state);
    if (actor && this.scene) {
      this.scene.releaseManualCamera();
      this.scene.focusUnit(actor.id);
    }
  }

  setPaused(paused: boolean): void {
    if (this.mode === 'online') {
      // Online matches keep running; this only opens the menu.
      hud.set({ paused });
      return;
    }
    if (this.mode !== 'match') return;
    hud.set({ paused });
    this.held.clear();
    if (paused) this.game?.scene.pause('battle');
    else this.game?.scene.resume('battle');
  }

  private canAct(): boolean {
    if (!this.state || hud.get().phase !== 'aim' || this.busy || hud.get().paused) return false;
    if (this.mode === 'match') return true;
    if (this.mode !== 'online') return false;
    const actor = activeUnit(this.state);
    return !!actor && this.owners[actor.id] === this.me;
  }

  private bindKeyboard(): void {
    const map: Record<string, Control> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
      Space: 'fire',
      Enter: 'fire',
    };
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (this.mode !== 'match' && this.mode !== 'online') return;
      const control = map[e.code];
      if (control) {
        e.preventDefault();
        if (!e.repeat) this.press(control);
        return;
      }
      if (e.repeat) return;
      switch (e.code) {
        case 'Digit1':
          this.selectWeapon(0);
          break;
        case 'Digit2':
          this.selectWeapon(1);
          break;
        case 'Digit3':
          this.selectWeapon(2);
          break;
        case 'KeyE':
          this.toggleDraw();
          break;
        case 'KeyJ':
        case 'ShiftLeft':
        case 'ShiftRight':
          this.hop();
          break;
        case 'Tab':
          e.preventDefault();
          this.toggleOverview();
          break;
        case 'KeyC':
          this.recenter();
          break;
        case 'Equal':
        case 'NumpadAdd':
          this.zoom(1.15);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          this.zoom(1 / 1.15);
          break;
        case 'KeyM':
          audio.setMuted(!audio.muted);
          this.toast(audio.muted ? 'Sound off' : 'Sound on');
          break;
        case 'Escape':
        case 'KeyP':
          if (hud.get().phase !== 'over') this.setPaused(!hud.get().paused);
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      const control = map[e.code];
      if (control) this.releaseControl(control);
    });
    window.addEventListener('blur', () => {
      if (this.charging && this.canAct()) this.release();
      this.held.clear();
    });
  }

  // -------------------------------------------------------------------------
  // Online play

  private updateOnline(dt: number): void {
    const state = this.state!;
    const actor = activeUnit(state);
    if (!actor || state.phase === 'over') return;
    const phase = hud.get().phase;
    if (phase === 'aim' && !this.busy && !hud.get().paused) {
      this.updateHuman(dt, actor);
      this.sendAim(actor);
    } else if (phase === 'bot' && this.timer !== null) {
      this.timer = Math.max(0, this.timer - dt / 1000);
    }
    if (!this.busy) this.showAim(actor);
    this.publish(false);
  }

  /** Lets other players watch our barrel and power bar, about 10 times a second. */
  private sendAim(actor: Unit): void {
    const now = performance.now();
    const key = `${Math.round(this.angle)}|${actor.facing}|${Math.round(this.power)}|${this.charging}|${this.slot}`;
    if (key === this.lastAimKey || now - this.aimSentAt < 100) return;
    this.lastAimKey = key;
    this.aimSentAt = now;
    session.send('aim', {
      unitId: actor.id,
      angle: this.angle,
      facing: actor.facing,
      power: this.power,
      charging: this.charging,
      slot: this.slot,
    });
  }

  /** Runs a server message now, or after the current animation finishes. */
  private enqueue(fn: () => void): void {
    if (this.netBusy) this.netQueue.push(fn);
    else fn();
  }

  private async runBusy(task: () => Promise<void>): Promise<void> {
    this.netBusy = true;
    const token = this.matchToken;
    try {
      await task();
    } finally {
      if (token === this.matchToken) {
        this.netBusy = false;
        while (!this.netBusy && this.netQueue.length) this.netQueue.shift()!();
      }
    }
  }

  private applyUnits(units: Unit[]): void {
    const state = this.state!;
    for (const u of units) Object.assign(state.units[u.id], u);
  }

  private loadOnline(msg: MatchStart, me: string): void {
    if (!this.scene) return;
    this.matchToken++;
    this.mode = 'online';
    this.me = me;
    this.owners = msg.owners;
    this.netQueue = [];
    this.netBusy = false;
    const state = createMatch(msg.config);
    state.terrain.data.set(rleDecode(msg.terrain, state.terrain.data.length));
    this.state = state;
    this.applyUnits(msg.units);
    this.resetTurnInput();
    this.game?.scene.resume('battle');
    this.scene.buildWorld(state);
    hud.set({ ...initialHud, mode: 'match', online: true, timerMax: 30, soloHuman: true });
    audio.music('battle');
  }

  private onlineHandlers(): OnlineHandlers {
    return {
      start: (msg, me) => {
        this.loadOnline(msg, me);
        hud.set({
          banner: {
            id: ++this.bannerId,
            text: 'Fight!',
            sub: msg.config.players.length > 2 ? 'Team battle' : undefined,
          },
        });
      },
      sync: (msg: SyncMessage, me) => {
        this.loadOnline(msg, me);
        const state = this.state!;
        state.turn = msg.turn;
        state.suddenDeath = msg.suddenDeath;
        state.pickups = msg.pickups;
        this.scene?.syncPickups(state.pickups, false);
        if (msg.phase === 'over') return;
        const actor = activeUnit(state);
        if (actor) {
          hud.set({ timerMax: msg.seconds || 30 });
          this.presentTurn(actor, msg.seconds);
        }
      },
      turn: (msg: TurnMessage) =>
        this.enqueue(() => {
          const state = this.state;
          if (!state || this.mode !== 'online') return;
          state.turn = msg.turn;
          state.suddenDeath = msg.suddenDeath;
          state.pickups = msg.pickups;
          this.applyUnits(msg.units);
          const actor = activeUnit(state);
          if (!actor) return;
          this.angle = actor.angle;
          hud.set({ timerMax: msg.seconds || 30 });
          this.presentTurn(actor, msg.seconds);
        }),
      move: (msg: MoveMessage) =>
        this.enqueue(() => {
          const state = this.state;
          if (!state || this.mode !== 'online') return;
          const u = state.units[msg.unitId];
          // Our own walk is predicted locally; only remote walks need applying.
          if (this.owners[msg.unitId] === this.me) return;
          u.x = msg.x;
          u.y = msg.y;
          u.tilt = msg.tilt;
          u.facing = msg.facing;
          state.turn.moveLeft = msg.moveLeft;
          for (const c of msg.collected) {
            applyPickup(u, c.kind);
            state.pickups = state.pickups.filter((p) => p.id !== c.pickupId);
            this.scene?.collectPickup(c.pickupId, c.kind);
          }
          if (msg.glide) {
            const glide = msg.glide;
            if (msg.fall?.dead) {
              u.alive = false;
              u.hp = 0;
            }
            void this.runBusy(() =>
              this.scene!.animateGlide(u, glide, msg.fall ? msg.fall.toY : null, !!msg.fall?.dead),
            );
          } else if (msg.hop) {
            const h = msg.hop;
            if (msg.fall?.dead) {
              u.alive = false;
              u.hp = 0;
            }
            void this.runBusy(() =>
              this.scene!.animateHop(
                u,
                h.fromX,
                h.fromY,
                h.peakX,
                h.peakY,
                msg.fall ? msg.fall.toY : msg.y,
                !!msg.fall?.dead,
              ),
            );
          } else if (msg.fall) {
            if (msg.fall.dead) {
              u.alive = false;
              u.hp = 0;
            }
            void this.runBusy(() =>
              this.scene!.animateWalkFall(u, msg.fall!.fromY, msg.fall!.toY, msg.fall!.dead),
            );
          } else {
            this.scene?.syncUnit(u, this.angle);
            this.scene?.focusUnit(u.id);
          }
        }),
      aim: (msg: AimUpdate) =>
        this.enqueue(() => {
          const state = this.state;
          if (!state || this.mode !== 'online' || this.owners[msg.unitId] === this.me) return;
          const u = state.units[msg.unitId];
          u.facing = msg.facing;
          if (state.turn.activeId === msg.unitId) {
            this.angle = msg.angle;
            this.power = msg.power;
            this.charging = msg.charging;
            this.slot = msg.slot;
          }
          this.scene?.syncUnit(u, msg.angle);
        }),
      shot: (msg: ShotMessage) =>
        this.enqueue(() => {
          const state = this.state;
          const scene = this.scene;
          if (!state || !scene || this.mode !== 'online') return;
          this.busy = true;
          this.timer = null;
          scene.aimGuideFor = null;
          scene.drawMode = false;
          hud.set({ phase: 'shot', drawMode: false, timer: null, charging: false });
          // Keep the mirror terrain in step so walking prediction stays exact.
          for (const e of msg.result.events) {
            if (e.type === 'carve') state.terrain.carveCircle(e.x, e.y, e.radius);
            if (e.type === 'build') state.terrain.fillCircle(e.x, e.y, e.radius, GLUE, circleSkipper(e.skip));
            if (e.type === 'pickup') state.pickups = state.pickups.filter((p) => p.id !== e.pickupId);
            if (e.type === 'pickupFall') {
              const p = state.pickups.find((x) => x.id === e.pickupId);
              if (p) p.y = e.toY;
              if (e.lost) state.pickups = state.pickups.filter((x) => x.id !== e.pickupId);
            }
          }
          const actor = state.units[msg.result.actorId];
          this.angle = msg.result.input.angle;
          this.power = msg.result.input.power;
          scene.syncUnit(actor, this.angle);
          void this.runBusy(async () => {
            await scene.playShot(msg.result);
            this.applyUnits(msg.units);
            scene.syncUnits(state);
            this.busy = false;
            this.afterTurn();
          });
        }),
      draw: (msg: DrawMessage) =>
        this.enqueue(() => {
          const state = this.state;
          if (!state || !this.scene) return;
          const w = msg.rect.x1 - msg.rect.x0 + 1;
          const h = msg.rect.y1 - msg.rect.y0 + 1;
          writeRect(state.terrain.data, state.terrain.width, msg.rect, rleDecode(msg.data, w * h));
          state.units[msg.unitId].drawUsed = true;
          state.turn.drew = true;
          this.scene.applyDraw(msg.rect);
          this.publish(true);
        }),
      skip: (msg) =>
        this.enqueue(() => {
          if (this.owners[msg.unitId] === this.me) this.toast("Time's up!");
          this.afterTurn();
        }),
      over: (msg: OverMessage) =>
        this.enqueue(() => {
          const state = this.state;
          if (!state) return;
          this.applyUnits(msg.units);
          state.phase = 'over';
          state.winner = msg.winner;
          state.turn.number = msg.turns;
          this.finish();
        }),
      toast: (text) => this.toast(text),
    };
  }

  /** Leaves an online match view (the lobby screen takes over). */
  leaveOnlineView(): void {
    if (this.mode === 'online') this.stop();
  }

  // -------------------------------------------------------------------------
  // HUD

  private banner(text: string, sub?: string): void {
    hud.set({ banner: { id: ++this.bannerId, text, sub } });
  }

  toast(text: string): void {
    hud.set({ toast: { id: ++this.toastId, text } });
  }

  /** Pushes current state to the HUD. `full` also rebuilds the queue and active info. */
  private publish(full: boolean): void {
    const state = this.state;
    if (!state) return;
    const actor = activeUnit(state);
    const patch: Partial<typeof initialHud> = {
      angle: Math.round(this.angle),
      elevation: actor ? worldElevation(actor, this.angle) : 0,
      power: this.power,
      charging: this.charging,
      slot: this.slot,
      moveLeft: Math.round(state.turn.moveLeft),
      timer: this.timer === null ? null : Math.ceil(this.timer),
    };
    if (full) {
      const entry = (u: Unit): QueueEntry => ({
        id: u.id,
        name: u.name,
        team: u.team,
        kind: u.kind,
        hp: Math.round(u.hp),
        maxHp: u.maxHp,
        controller: u.controller,
      });
      const active: ActiveInfo | null = actor
        ? {
            ...entry(actor),
            special: actor.special,
            drawUsed: actor.drawUsed,
            lastPower: actor.lastPower,
            inked: this.slowed && state.turn.moveLeft > 0,
            rooted: actor.rooted > 0 || (state.turn.moveLeft === 0 && state.turn.moveUsed === 0),
            marked: actor.marked,
          }
        : null;
      patch.active = active;
      patch.queue = turnQueue(state).map(entry);
      patch.moveMax = actor ? UNITS[actor.kind].moveBudget : 1;
      patch.windStrength = state.turn.wind.strength;
      patch.windAngle = state.turn.wind.angle;
      patch.turnNumber = state.turn.number;
      patch.suddenDeath = state.suddenDeath;
    }
    hud.set(patch);
  }
}

export const controller = new GameController();
