import { Renderer }     from './renderer.js';
import { UI }           from './ui.js';
import { Player }       from './player.js';
import { Track }        from './track.js';
import { Obstacles }    from './obstacles.js';
import { Collectibles } from './collectibles.js';

const BASE_SPEED      = 220;
const SPEED_INCREMENT = 8;    // px/s per second of gameplay
const MAX_SPEED       = 700;

export class Game {
  /**
   * @param {HTMLCanvasElement}                   canvas
   * @param {import('./economy.js').Economy}      economy
   * @param {import('./missions.js').Missions}    missions
   * @param {import('./upgrades.js').Upgrades}    upgrades
   */
  constructor(canvas, economy, missions, upgrades) {
    this.canvas   = canvas;
    this.economy  = economy;
    this.missions = missions;
    this.upgrades = upgrades;

    // State machine
    this.state = 'menu';   // menu | preRun | running | paused | gameOver

    // Run state
    this.speed           = BASE_SPEED;
    this.score           = 0;
    this.personalBest    = 0;
    this.runTime         = 0;
    this.coresCollected  = 0;
    this.turnsCompleted  = 0;
    this.maxSpeedReached = false;
    this.slowdownTimer   = 0;

    // Flash effects
    this.effects       = [];

    this._lastTs = 0;
  }

  // ══════════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════════

  init() {
    this.renderer    = new Renderer(this.canvas);
    this.player      = new Player();
    this.track       = new Track();
    this.obstacles   = new Obstacles();
    this.collectibles= new Collectibles();

    this.player.initControls();

    this.ui = new UI(this.economy, this.upgrades, this.missions);
    this._setupUICallbacks();

    // Load personal best
    try {
      const pb = localStorage.getItem('orbit_best_score');
      if (pb) this.personalBest = parseInt(pb, 10) || 0;
    } catch (_) {}

    // Keyboard: turn controls + pause (handled here, not in Player)
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyQ')               this._handleTurn('left');
      if (e.code === 'KeyE')               this._handleTurn('right');
      if (e.code === 'KeyP' || e.code === 'Escape') this._togglePause();
    });

    // Canvas resize
    window.addEventListener('resize', () => this.renderer.resize());

    // Show initial menu
    this.ui.showMenu(this.personalBest, this.economy.getBalance());

    // Start loop
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ══════════════════════════════════════════════════════
  //  UI callbacks
  // ══════════════════════════════════════════════════════

  _setupUICallbacks() {
    this.ui.onPlayClick = () => {
      if (!this.economy.canAfford(this.economy.entryFee)) {
        this._flash('255,60,60', 0.45, 0.5);
        return;
      }
      const allDefs = this.upgrades.getUpgradeDefs();
      const all     = allDefs.map(def => ({ ...def, level: this.upgrades.getLevel(def.id) }));
      this.ui.showPreRun(all, this.upgrades.getSlots(), this.upgrades.selectedUpgrades);
      this.state = 'preRun';
    };

    this.ui.onPreRunConfirm = selectedIds => {
      this.upgrades.selectForRun(selectedIds);
      this._startRun();
    };

    this.ui.onRevive = () => {
      if (this.economy.spend(this.economy.reviveCost)) {
        this._revive();
      }
    };

    this.ui.onPlayAgain = () => {
      this.state = 'menu';
      this.ui.showMenu(this.personalBest, this.economy.getBalance());
    };

    this.ui.onResume = () => {
      this.state = 'running';
      this.ui.hidePause();
    };

    this.ui.onQuitToMenu = () => {
      this.state = 'menu';
      this.ui.showMenu(this.personalBest, this.economy.getBalance());
    };
  }

  // ══════════════════════════════════════════════════════
  //  Run lifecycle
  // ══════════════════════════════════════════════════════

  _startRun() {
    this.economy.spend(this.economy.entryFee);

    this.speed           = BASE_SPEED;
    this.score           = 0;
    this.runTime         = 0;
    this.coresCollected  = 0;
    this.turnsCompleted  = 0;
    this.maxSpeedReached = false;
    this.slowdownTimer   = 0;
    this.effects         = [];

    this.track.reset();
    this.obstacles.reset();
    this.collectibles.reset();
    this.player.reset();
    this.player.setActiveUpgrades(this.upgrades.getRunUpgrades());

    this.state = 'running';
    this.ui.showHUD();
  }

  _revive() {
    this.player.health      = 1;
    this.player.activeShield= true;
    this.player.shieldTimer = 4;   // brief invincibility
    this.state = 'running';
    this.ui.showHUD();
    this._flash('255,255,255', 0.4, 0.5);
  }

  // ══════════════════════════════════════════════════════
  //  Main update
  // ══════════════════════════════════════════════════════

  _update(dt) {
    if (this.state !== 'running') return;

    this.runTime += dt;

    // ── Speed ──────────────────────────────────────────────
    let targetSpeed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_INCREMENT * this.runTime);
    if (this.slowdownTimer > 0) {
      this.slowdownTimer -= dt;
      targetSpeed = Math.max(BASE_SPEED * 0.55, targetSpeed * 0.55);
    }
    this.speed = targetSpeed;
    if (this.speed >= MAX_SPEED) this.maxSpeedReached = true;

    // ── Track ──────────────────────────────────────────────
    this.track.update(dt, this.speed);

    // ── Player ────────────────────────────────────────────
    this.player.update(dt);

    if (this.player.twoFingerTap) {
      this._togglePause();
      return;
    }

    const scrollY = this.track.scrollY;

    // ── Obstacles ─────────────────────────────────────────
    this.obstacles.update(dt, this.speed, scrollY);
    this.obstacles.spawn(scrollY, this.speed, this.canvas.height);

    // ── Collectibles ──────────────────────────────────────
    const magnetLevel = (this.player.activeUpgrades.find(u => u.id === 'magnet') || {}).level || 0;
    this.collectibles.update(dt, this.speed, scrollY, magnetLevel);
    this.collectibles.spawn(scrollY, this.canvas.height);

    // ── Collision check ───────────────────────────────────
    const hit = this.obstacles.checkCollision(
      this.player.lane,
      scrollY,
      this.player.jumping,
      this.player.ducking,
    );
    if (hit) {
      const died = this.player.takeDamage();
      if (died) { this._triggerGameOver('SHIP DESTROYED'); return; }
      this._flash('255,100,0', 0.4, 0.35);
    }

    // ── Collectible collection ────────────────────────────
    const collected = this.collectibles.checkCollection(this.player.lane, scrollY, magnetLevel);
    for (const item of collected) this._processCollectible(item);

    // ── Turn state ────────────────────────────────────────
    if (this.track.isTurnMissed()) {
      this._flash('255,0,0', 0.85, 0.55);
      this._triggerGameOver('MISSED TURN!');
      return;
    }

    // ── Score ─────────────────────────────────────────────
    const coreBoostLv   = (this.player.activeUpgrades.find(u => u.id === 'coreMultiplier') || {}).level || 0;
    const coreBonus     = 1 + coreBoostLv * 0.5;
    this.score          = Math.floor(scrollY / 10 + this.coresCollected * 10 * coreBonus);

    // ── Effects ───────────────────────────────────────────
    this._tickEffects(dt);
  }

  // ══════════════════════════════════════════════════════
  //  Helper methods
  // ══════════════════════════════════════════════════════

  _processCollectible(item) {
    switch (item.type) {
      case 'energyCore':
        this.coresCollected++;
        this.economy.earn(5);
        break;
      case 'shieldShard':
        this.player.addShieldShard();
        break;
      case 'slowdownOrb': {
        const extra = (this.player.activeUpgrades.find(u => u.id === 'slowdown') || {}).level || 0;
        this.slowdownTimer += 3 + extra * 1.2;
        break;
      }
    }
  }

  _handleTurn(direction) {
    if (this.state !== 'running') return;

    // Check momentumControl upgrade — it widens the zone (handled in Track already via TURN_ZONE_HALF)
    const result = this.track.attemptTurn(direction);
    switch (result) {
      case 'success':
        this.turnsCompleted++;
        this._flash('255,255,255', 0.55, 0.4);
        break;
      case 'fail':
        this._flash('255,0,0', 0.85, 0.55);
        this._triggerGameOver('WRONG TURN!');
        break;
      // 'notInZone' → ignore
    }
  }

  _togglePause() {
    if (this.state === 'running') {
      this.state = 'paused';
      this.ui.showPause();
    } else if (this.state === 'paused') {
      this.state = 'running';
      this.ui.hidePause();
    }
  }

  _triggerGameOver(reason) {
    this.state = 'gameOver';

    if (this.score > this.personalBest) {
      this.personalBest = this.score;
      try { localStorage.setItem('orbit_best_score', String(this.personalBest)); } catch (_) {}
    }

    this.missions.updateRunStats({
      distance:       this.track.scrollY,
      cores:          this.coresCollected,
      turns:          this.turnsCompleted,
      maxSpeedReached:this.maxSpeedReached,
    });
    this.missions.updateStarsProgress(this.economy.getBalance());

    const canRevive = this.economy.canAfford(this.economy.reviveCost);
    this.ui.showGameOver(
      this.score,
      this.personalBest,
      canRevive,
      this.economy.reviveCost,
      this.economy.getBalance(),
      reason,
    );
  }

  _flash(color, alpha, duration) {
    this.effects.push({ type: 'flash', color, alpha, duration, timer: duration });
  }

  _tickEffects(dt) {
    for (const fx of this.effects) fx.timer -= dt;
    this.effects = this.effects.filter(fx => fx.timer > 0);
  }

  _getGameState() {
    return {
      state:         this.state,
      track:         this.track,
      player:        this.player,
      obstacles:     this.obstacles,
      collectibles:  this.collectibles,
      score:         this.score,
      stars:         this.economy.getBalance(),
      speed:         this.speed,
      turnWarning:   (this.state === 'running' || this.state === 'paused')
                       ? this.track.getTurnWarning()
                       : null,
      effects:       this.effects,
      activeUpgrades:this.player.activeUpgrades,
    };
  }

  // ══════════════════════════════════════════════════════
const MAX_FRAME_TIME = 0.05; // cap dt to 50 ms to prevent large jumps when tab is backgrounded
  // ══════════════════════════════════════════════════════

  _loop(ts) {
    const dt     = this._lastTs === 0 ? 0 : Math.min((ts - this._lastTs) / 1000, MAX_FRAME_TIME);
    this._lastTs = ts;

    this._update(dt);
    this.renderer.render(this._getGameState());

    requestAnimationFrame(ts2 => this._loop(ts2));
  }
}
