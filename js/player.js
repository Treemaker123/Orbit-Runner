const TRACK_WIDTH    = 240;
const LANE_WIDTH     = 80;
const JUMP_DURATION  = 0.48;
const DUCK_DURATION  = 0.38;
const SHIELD_SECS    = 10;
const SHARDS_NEEDED  = 3;
const LANE_ANIM_SECS = 0.12;
const LANE_COOLDOWN  = 0.18;

export class Player {
  constructor() {
    this.lane           = 1;
    this.jumping        = false;
    this.jumpTimer      = 0;        // 0→1 during jump
    this.ducking        = false;
    this.duckTimer      = 0;        // 0→1 during duck
    this.shieldShards   = 0;
    this.activeShield   = false;
    this.shieldTimer    = 0;
    this.health         = 1;
    this.activeUpgrades = [];

    // Lane animation
    this._laneAnimFrom  = 1;
    this._laneAnimTo    = 1;
    this._laneAnimT     = 0;        // 1→0
    this._laneCooldown  = 0;

    // Raw input flags (set by event listeners)
    this._keys          = {};
    this._prevKeys      = {};

    // Touch gesture flags (consumed each frame)
    this.touchLeft      = false;
    this.touchRight     = false;
    this.touchUp        = false;
    this.touchDown      = false;
    this.twoFingerTap   = false;

    // Tilt
    this._tiltBeta      = null;
    this._prevTiltBeta  = null;
  }

  initControls() {
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      this._keys[e.key]  = true;
    });
    window.addEventListener('keyup', e => {
      this._keys[e.code] = false;
      this._keys[e.key]  = false;
    });

    // Touch
    let tx0 = 0, ty0 = 0, tc = 0;
    window.addEventListener('touchstart', e => {
      tc = e.touches.length;
      if (e.touches.length >= 1) {
        tx0 = e.touches[0].clientX;
        ty0 = e.touches[0].clientY;
      }
    }, { passive: true });

    window.addEventListener('touchend', e => {
      if (tc >= 2) { this.twoFingerTap = true; return; }
      const dx = e.changedTouches[0].clientX - tx0;
      const dy = e.changedTouches[0].clientY - ty0;
      if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) this.touchRight = true; else this.touchLeft = true;
      } else if (dy < -50) {
        this.touchUp   = true;
      } else if (dy > 50) {
        this.touchDown = true;
      }
    }, { passive: true });

    // Device orientation for lane tilt
    window.addEventListener('deviceorientation', e => {
      this._tiltBeta = e.beta;
    }, { passive: true });
  }

  reset() {
    this.lane          = 1;
    this.jumping       = false;
    this.jumpTimer     = 0;
    this.ducking       = false;
    this.duckTimer     = 0;
    this.shieldShards  = 0;
    this.activeShield  = false;
    this.shieldTimer   = 0;
    this.health        = 1;
    this._laneAnimFrom = 1;
    this._laneAnimTo   = 1;
    this._laneAnimT    = 0;
    this._laneCooldown = 0;
    this._keys         = {};
    this._prevKeys     = {};
    this.touchLeft     = false;
    this.touchRight    = false;
    this.touchUp       = false;
    this.touchDown     = false;
    this.twoFingerTap  = false;
  }

  setActiveUpgrades(upgrades) {
    this.activeUpgrades = upgrades;
    const shield = upgrades.find(u => u.id === 'shield');
    if (shield && shield.level > 0) {
      this.activeShield = true;
      this.shieldTimer  = SHIELD_SECS * shield.level; // more levels → longer
    }
  }

  update(dt) {
    // Cooldowns
    this._laneCooldown  = Math.max(0, this._laneCooldown - dt);
    this._laneAnimT     = Math.max(0, this._laneAnimT - dt / LANE_ANIM_SECS);

    // ── Lane switching ─────────────────────────────────────
    let wantLeft  = this._keys['KeyA'] || this._keys['ArrowLeft']  || this.touchLeft;
    let wantRight = this._keys['KeyD'] || this._keys['ArrowRight'] || this.touchRight;

    // Tilt
    if (this._tiltBeta !== null && this._prevTiltBeta !== null) {
      const delta = this._tiltBeta - this._prevTiltBeta;
      if (delta < -12) wantLeft  = true;
      if (delta >  12) wantRight = true;
    }
    this._prevTiltBeta = this._tiltBeta;

    if (this._laneCooldown <= 0) {
      if (wantLeft)       this.switchLane(-1);
      else if (wantRight) this.switchLane(+1);
    }

    // ── Jump ───────────────────────────────────────────────
    if ((this._keys['KeyW'] || this._keys['ArrowUp'] || this.touchUp) &&
        !this.jumping && !this.ducking) {
      this.jump();
    }

    // ── Duck ───────────────────────────────────────────────
    if ((this._keys['KeyS'] || this._keys['ArrowDown'] || this.touchDown) && !this.jumping) {
      this.duck();
    }

    // Consume single-frame touch flags
    this.touchLeft     = false;
    this.touchRight    = false;
    this.touchUp       = false;
    this.touchDown     = false;
    this.twoFingerTap  = false;

    // ── Jump timer ────────────────────────────────────────
    if (this.jumping) {
      this.jumpTimer += dt / JUMP_DURATION;
      if (this.jumpTimer >= 1) { this.jumping = false; this.jumpTimer = 0; }
    }

    // ── Duck timer ────────────────────────────────────────
    if (this.ducking) {
      this.duckTimer += dt / DUCK_DURATION;
      if (this.duckTimer >= 1) { this.ducking = false; this.duckTimer = 0; }
    }

    // ── Shield timer ──────────────────────────────────────
    if (this.activeShield && this.shieldTimer !== Infinity) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) { this.activeShield = false; this.shieldTimer = 0; }
    }
  }

  switchLane(dir) {
    const next = Math.max(0, Math.min(2, this.lane + dir));
    if (next === this.lane) return;
    this._laneAnimFrom = this.lane;
    this._laneAnimTo   = next;
    this._laneAnimT    = 1;
    this.lane          = next;
    this._laneCooldown = LANE_COOLDOWN;
  }

  jump() { this.jumping = true; this.jumpTimer = 0; }

  duck() { this.ducking = true; this.duckTimer = 0; }

  addShieldShard() {
    this.shieldShards++;
    if (this.shieldShards >= SHARDS_NEEDED) this.activateShield();
  }

  activateShield() {
    this.activeShield = true;
    this.shieldTimer  = SHIELD_SECS;
    this.shieldShards = 0;
  }

  /**
   * Apply one hit.
   * @returns {boolean} true if the player is now dead.
   */
  takeDamage() {
    // Auto-dodge check
    const ad = this.activeUpgrades.find(u => u.id === 'autoDodge');
    if (ad && ad.level > 0 && Math.random() < ad.level * 0.1) return false; // 10% dodge chance per level

    // Shield absorb
    if (this.activeShield) {
      this.activeShield = false;
      this.shieldTimer  = 0;
      return false;
    }

    this.health--;
    return this.health <= 0;
  }

  /**
   * Visual X position (with lane-switch animation).
   */
  getX(canvasWidth) {
    const trackX = (canvasWidth - TRACK_WIDTH) / 2;
    let lanePos;
    if (this._laneAnimT > 0) {
      // Interpolate from the previous lane to the current lane
      lanePos = this._laneAnimTo + (this._laneAnimFrom - this._laneAnimTo) * this._laneAnimT;
    } else {
      lanePos = this.lane;
    }
    return trackX + lanePos * LANE_WIDTH + LANE_WIDTH / 2;
  }

  /**
   * Visual Y position (with jump arc and duck offset).
   */
  getVisualY(canvasHeight) {
    const base = canvasHeight * 0.82;
    if (this.jumping) return base - Math.sin(this.jumpTimer * Math.PI) * 42;
    if (this.ducking) return base + 8;
    return base;
  }

  getScale() {
    if (this.ducking) return 0.65;
    if (this.jumping) return 1 + Math.sin(this.jumpTimer * Math.PI) * 0.18;
    return 1;
  }

  /** Hitbox in world/screen-relative coords centred on player. */
  getHitbox(canvasWidth, canvasHeight) {
    const x = this.getX(canvasWidth);
    const y = canvasHeight * 0.82;
    const hw = LANE_WIDTH * 0.7 * 0.5;
    const hh = 36 * 0.7 * 0.5;
    return { x: x - hw, y: y - hh, w: hw * 2, h: hh * 2 };
  }
}
