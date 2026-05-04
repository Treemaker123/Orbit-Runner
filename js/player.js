var TRACK_WIDTH    = 240;
var LANE_WIDTH     = 80;
const JUMP_DURATION  = 0.48;
const DUCK_DURATION  = 0.38;
const SHIELD_SECS    = 10;
const SHARDS_NEEDED  = 3;
const LANE_ANIM_SECS = 0.12;
const LANE_COOLDOWN  = 0.18;

class Player {
  constructor() {
    this.center = { x: 0, z: 0 };
    this.position = { x: 0, z: 0 };
    this.direction = { x: 0, z: 1 };

    this.lane = 0; // -1, 0, 1
    this.jumping = false;
    this.jumpTimer = 0;
    this.ducking = false;
    this.duckTimer = 0;
    this.shieldShards = 0;
    this.activeShield = false;
    this.shieldTimer = 0;
    this.health = 1;
    this.activeUpgrades = [];

    this._laneAnimFrom = 0;
    this._laneAnimTo = 0;
    this._laneAnimT = 0;
    this._laneCooldown = 0;

    this._keys = {};
    this._prevKeys = {};

    this.touchLeft = false;
    this.touchRight = false;
    this.touchUp = false;
    this.touchDown = false;
    this.twoFingerTap = false;

    this._tiltBeta = null;
    this._prevTiltBeta = null;
  }

  initControls() {
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      this._keys[e.key] = true;
    });
    window.addEventListener('keyup', e => {
      this._keys[e.code] = false;
      this._keys[e.key] = false;
    });

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
        if (dx > 0) this.touchRight = true;
        else this.touchLeft = true;
      } else if (dy < -50) {
        this.touchUp = true;
      } else if (dy > 50) {
        this.touchDown = true;
      }
    }, { passive: true });

    window.addEventListener('deviceorientation', e => {
      this._tiltBeta = e.beta;
    }, { passive: true });
  }

  reset() {
    this.center = { x: 0, z: 0 };
    this.position = { x: 0, z: 0 };
    this.direction = { x: 0, z: 1 };

    this.lane = 0;
    this.jumping = false;
    this.jumpTimer = 0;
    this.ducking = false;
    this.duckTimer = 0;
    this.shieldShards = 0;
    this.activeShield = false;
    this.shieldTimer = 0;
    this.health = 1;

    this._laneAnimFrom = 0;
    this._laneAnimTo = 0;
    this._laneAnimT = 0;
    this._laneCooldown = 0;

    this._keys = {};
    this._prevKeys = {};
    this.touchLeft = false;
    this.touchRight = false;
    this.touchUp = false;
    this.touchDown = false;
    this.twoFingerTap = false;

    this._syncWorldPosition();
  }

  setActiveUpgrades(upgrades) {
    this.activeUpgrades = upgrades;
    const shield = upgrades.find(u => u.id === 'shield');
    if (shield && shield.level > 0) {
      this.activeShield = true;
      this.shieldTimer = SHIELD_SECS * shield.level;
    }
  }

  _perp(dir) {
    return { x: -dir.z, z: dir.x };
  }

  _laneVisual() {
    if (this._laneAnimT > 0) {
      return this._laneAnimTo + (this._laneAnimFrom - this._laneAnimTo) * this._laneAnimT;
    }
    return this.lane;
  }

  _syncWorldPosition() {
    const laneVisual = this._laneVisual();
    const p = this._perp(this.direction);
    this.position.x = this.center.x + p.x * laneVisual * LANE_WIDTH;
    this.position.z = this.center.z + p.z * laneVisual * LANE_WIDTH;
  }

  update(dt, speed) {
    this._laneCooldown = Math.max(0, this._laneCooldown - dt);
    this._laneAnimT = Math.max(0, this._laneAnimT - dt / LANE_ANIM_SECS);

    const pressedLeft =
      (this._keys['KeyA'] && !this._prevKeys['KeyA']) ||
      (this._keys['ArrowLeft'] && !this._prevKeys['ArrowLeft']);
    const pressedRight =
      (this._keys['KeyD'] && !this._prevKeys['KeyD']) ||
      (this._keys['ArrowRight'] && !this._prevKeys['ArrowRight']);

    let wantLeft = pressedLeft || this.touchLeft;
    let wantRight = pressedRight || this.touchRight;

    if (this._tiltBeta !== null && this._prevTiltBeta !== null) {
      const delta = this._tiltBeta - this._prevTiltBeta;
      if (delta < -12) wantLeft = true;
      if (delta > 12) wantRight = true;
    }
    this._prevTiltBeta = this._tiltBeta;

    if (this._laneCooldown <= 0) {
      if (wantLeft) this.switchLane(-1);
      else if (wantRight) this.switchLane(1);
    }

    const pressedJump =
      (this._keys['KeyW'] && !this._prevKeys['KeyW']) ||
      (this._keys['ArrowUp'] && !this._prevKeys['ArrowUp']);
    if ((pressedJump || this.touchUp) && !this.jumping && !this.ducking) this.jump();

    const pressedDuck =
      (this._keys['KeyS'] && !this._prevKeys['KeyS']) ||
      (this._keys['ArrowDown'] && !this._prevKeys['ArrowDown']);
    if ((pressedDuck || this.touchDown) && !this.jumping && !this.ducking) this.duck();

    this._prevKeys = Object.assign({}, this._keys);

    this.touchLeft = false;
    this.touchRight = false;
    this.touchUp = false;
    this.touchDown = false;
    this.twoFingerTap = false;

    if (this.jumping) {
      this.jumpTimer += dt / JUMP_DURATION;
      if (this.jumpTimer >= 1) {
        this.jumping = false;
        this.jumpTimer = 0;
      }
    }

    if (this.ducking) {
      this.duckTimer += dt / DUCK_DURATION;
      if (this.duckTimer >= 1) {
        this.ducking = false;
        this.duckTimer = 0;
      }
    }

    if (this.activeShield && this.shieldTimer !== Infinity) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.activeShield = false;
        this.shieldTimer = 0;
      }
    }

    this.center.x += this.direction.x * speed * dt;
    this.center.z += this.direction.z * speed * dt;
    this._syncWorldPosition();
  }

  applyTurn(newDirection, turnPoint) {
    const oldDir = { x: this.direction.x, z: this.direction.z };
    const fromTurn = {
      x: this.center.x - turnPoint.x,
      z: this.center.z - turnPoint.z,
    };
    const overshoot = Math.max(0, fromTurn.x * oldDir.x + fromTurn.z * oldDir.z);

    this.center.x = turnPoint.x + newDirection.x * overshoot;
    this.center.z = turnPoint.z + newDirection.z * overshoot;
    this.direction = { x: newDirection.x, z: newDirection.z };
    this._syncWorldPosition();
  }

  switchLane(dir) {
    const next = Math.max(-1, Math.min(1, this.lane + dir));
    if (next === this.lane) return;
    this._laneAnimFrom = this.lane;
    this._laneAnimTo = next;
    this._laneAnimT = 1;
    this.lane = next;
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
    this.shieldTimer = SHIELD_SECS;
    this.shieldShards = 0;
  }

  takeDamage() {
    const ad = this.activeUpgrades.find(u => u.id === 'autoDodge');
    if (ad && ad.level > 0 && Math.random() < ad.level * 0.1) return false;

    if (this.activeShield) {
      this.activeShield = false;
      this.shieldTimer = 0;
      return false;
    }

    this.health--;
    return this.health <= 0;
  }

  getJumpHeight() {
    return this.jumping ? Math.sin(this.jumpTimer * Math.PI) * 80 : 0;
  }

  getWorldHitbox() {
    const halfW = LANE_WIDTH * 0.28;
    const halfD = 18;
    return {
      minX: this.position.x - halfW,
      maxX: this.position.x + halfW,
      minZ: this.position.z - halfD,
      maxZ: this.position.z + halfD,
    };
  }
}
