const BASE_SPEED      = 220;
const SPEED_INCREMENT = 8;
const MAX_SPEED       = 700;

class Game {
  constructor(canvas, economy, missions, upgrades) {
    this.canvas = canvas;
    this.economy = economy;
    this.missions = missions;
    this.upgrades = upgrades;

    this.state = 'menu';

    this.speed = BASE_SPEED;
    this.score = 0;
    this.personalBest = 0;
    this.runTime = 0;
    this.distance = 0;
    this.coresCollected = 0;
    this.turnsCompleted = 0;
    this.maxSpeedReached = false;
    this.slowdownTimer = 0;

    this.effects = [];
    this._lastTs = 0;
  }

  init() {
    this.renderer = new Renderer(this.canvas);
    this.player = new Player();
    this.track = new Track();
    this.obstacles = new Obstacles();
    this.collectibles = new Collectibles();
    this.audio = new AudioManager();

    this.player.initControls();

    this.ui = new UI(this.economy, this.upgrades, this.missions);
    this._setupUICallbacks();

    try {
      const pb = localStorage.getItem('orbit_best_score');
      if (pb) this.personalBest = parseInt(pb, 10) || 0;
    } catch (_) {}

    window.addEventListener('keydown', e => {
      this.audio.resume();
      if (e.code === 'KeyQ') this._handleTurn('left');
      if (e.code === 'KeyE') this._handleTurn('right');
      if (e.code === 'KeyP' || e.code === 'Escape') this._togglePause();
    });

    window.addEventListener('touchstart', () => this.audio.resume(), { passive: true });

    window.addEventListener('resize', () => this.renderer.resize());

    this.ui.showMenu(this.personalBest, this.economy.getBalance());
    requestAnimationFrame(ts => this._loop(ts));
  }

  _setupUICallbacks() {
    this.ui.onPlayClick = () => {
      if (!this.economy.canAfford(this.economy.entryFee)) {
        this._flash('255,60,60', 0.45, 0.5);
        return;
      }
      const allDefs = this.upgrades.getUpgradeDefs();
      const all = allDefs.map(def => ({ ...def, level: this.upgrades.getLevel(def.id) }));
      this.ui.showPreRun(all, this.upgrades.getSlots(), this.upgrades.selectedUpgrades);
      this.state = 'preRun';
    };

    this.ui.onPreRunConfirm = selectedIds => {
      this.upgrades.selectForRun(selectedIds);
      this._startRun();
    };

    this.ui.onRevive = () => {
      if (this.economy.spend(this.economy.reviveCost)) this._revive();
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

  _startRun() {
    this.economy.spend(this.economy.entryFee);

    this.speed = BASE_SPEED;
    this.score = 0;
    this.runTime = 0;
    this.distance = 0;
    this.coresCollected = 0;
    this.turnsCompleted = 0;
    this.maxSpeedReached = false;
    this.slowdownTimer = 0;
    this.effects = [];

    this.track.reset();
    this.obstacles.reset();
    this.collectibles.reset();
    this.player.reset();
    this.player.setActiveUpgrades(this.upgrades.getRunUpgrades());

    this.audio.startEngine();
    this._wasJumping = false;

    this.state = 'running';
    this.player.health = 1;
    this.player.activeShield = true;
    this.player.shieldTimer = 4;
    this.state = 'running';
    this.audio.startEngine();
    this.ui.showHUD();
    this._flash('255,255,255', 0.4, 0.5);
  }

  _update(dt) {
    if (this.state !== 'running') return;

    this.runTime += dt;

    let targetSpeed = Math.min(MAX_SPEED, BASE_SPEED + SPEED_INCREMENT * this.runTime);
    if (this.slowdownTimer > 0) {
      this.slowdownTimer -= dt;
      targetSpeed = Math.max(BASE_SPEED * 0.55, targetSpeed * 0.55);
    }
    this.speed = targetSpeed;
    if (this.speed >= MAX_SPEED) this.maxSpeedReached = true;

    this.player.update(dt, this.speed);
    this.distance += this.speed * dt;

    // Update engine sound pitch with speed
    this.audio.setSpeed(this.speed, MAX_SPEED);

    // Detect jump start for sound
    if (this.player.jumping && !this._wasJumping) this.audio.playJump();
    this._wasJumping = this.player.jumping;

    if (this.player.twoFingerTap) {
      this._togglePause();
      return;
    }

    this.track.update(this.distance);

    this.obstacles.update(this.distance);
    this.obstacles.spawn(this.track, this.distance, this.speed);

    const magnetLevel = (this.player.activeUpgrades.find(u => u.id === 'magnet') || {}).level || 0;
    this.collectibles.update(dt, this.distance);
    this.collectibles.spawn(this.track, this.distance);

    const hit = this.obstacles.checkCollision(this.player, this.distance);
    if (hit) {
      const died = this.player.takeDamage();
      this.audio.playHit();
      if (died) {
        this._triggerGameOver('SHIP DESTROYED');
        return;
      }
      this._flash('255,100,0', 0.4, 0.35);
    }

    const collected = this.collectibles.checkCollection(this.player, magnetLevel);
    for (const item of collected) this._processCollectible(item);

    if (this.track.isTurnMissed(this.player)) {
      this._flash('255,0,0', 0.85, 0.55);
      this._triggerGameOver('MISSED TURN!');
      return;
    }

    const coreBoostLv = (this.player.activeUpgrades.find(u => u.id === 'coreMultiplier') || {}).level || 0;
    const coreBonus = 1 + coreBoostLv * 0.5;
    this.score = Math.floor(this.distance / 10 + this.coresCollected * 10 * coreBonus);

    this._tickEffects(dt);
  }

  _processCollectible(item) {
    switch (item.type) {
      case 'energyCore':
        this.coresCollected++;
        this.economy.earn(5);
        this.audio.playCollect();
        break;
      case 'shieldShard':
        this.player.addShieldShard();
        if (this.player.activeShield) {
          this.audio.playShieldActivate();
        } else {
          this.audio.playCollect();
        }
        break;
      case 'slowdownOrb': {
        const extra = (this.player.activeUpgrades.find(u => u.id === 'slowdown') || {}).level || 0;
        this.slowdownTimer += 3 + extra * 1.2;
        this.audio.playCollect();
        break;
      }
    }
  }

  _handleTurn(direction) {
    if (this.state !== 'running') return;

    const result = this.track.attemptTurn(direction, this.player);
    switch (result.result) {
      case 'success':
        this.player.applyTurn(result.newDirection, result.turnPoint);
        this.turnsCompleted++;
        this.renderer.triggerTurnLean(direction);
        this.audio.playTurn();
        break;
      case 'fail':
        this._flash('255,0,0', 0.85, 0.55);
        this.audio.playHit();
        this._triggerGameOver('WRONG TURN!');
        break;
      default:
        break;
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
    this.audio.stopEngine();
    this.audio.playGameOver();

    if (this.score > this.personalBest) {
      this.personalBest = this.score;
      try { localStorage.setItem('orbit_best_score', String(this.personalBest)); } catch (_) {}
    }

    this.missions.updateRunStats({
      distance: this.distance,
      cores: this.coresCollected,
      turns: this.turnsCompleted,
      maxSpeedReached: this.maxSpeedReached,
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
      state: this.state,
      track: this.track,
      player: this.player,
      obstacles: this.obstacles,
      collectibles: this.collectibles,
      score: this.score,
      stars: this.economy.getBalance(),
      speed: this.speed,
      distance: this.distance,
      turnWarning: (this.state === 'running' || this.state === 'paused') ? this.track.getTurnWarning(this.player) : null,
      effects: this.effects,
      activeUpgrades: this.player.activeUpgrades,
    };
  }

  _loop(ts) {
    const MAX_FRAME_TIME = 0.05;
    const dt = this._lastTs === 0 ? 0 : Math.min((ts - this._lastTs) / 1000, MAX_FRAME_TIME);
    this._lastTs = ts;

    this._update(dt);
    this.renderer.render(this._getGameState());

    requestAnimationFrame(ts2 => this._loop(ts2));
  }
}
