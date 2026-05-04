const TRACK_WIDTH = 240;
const LANE_WIDTH  = 80;
const HIT_Y_RANGE = 38; // ±px in world-Y for a collision to register

const MIN_OBSTACLE_SPACING    = 180;  // world-px; minimum gap between obstacles
const MAX_OBSTACLE_SPACING    = 480;  // world-px; gap at zero speed
const SPACING_DIFFICULTY_RATE = 0.25; // gap shrinks by this many px per px/s of speed

export class Obstacles {
  constructor() {
    this.obstacles  = [];
    this.nextSpawnY = 600; // leave a safe gap at run start
  }

  reset() {
    this.obstacles  = [];
    this.nextSpawnY = 600;
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  spawn(scrollY, speed, canvasHeight) {
    const ahead = scrollY + canvasHeight + 300;
    while (this.nextSpawnY < ahead) {
      const type = this._pickType();
      const obs  = this._create(type, this.nextSpawnY);
      if (obs) this.obstacles.push(obs);
      // Spacing decreases as speed increases (harder)
      const base = Math.max(MIN_OBSTACLE_SPACING, MAX_OBSTACLE_SPACING - speed * SPACING_DIFFICULTY_RATE);
      this.nextSpawnY += base + Math.random() * base * 0.8;
    }
  }

  _pickType() {
    const r = Math.random() * 100;
    if (r < 42) return 'asteroid';
    if (r < 60) return 'laser';
    if (r < 73) return 'tunnel';
    if (r < 83) return 'gravityZone';
    if (r < 93) return 'zeroGZone';
    return 'wormhole';
  }

  _create(type, worldY) {
    switch (type) {
      case 'asteroid': {
        const lane = Math.floor(Math.random() * 3);
        // Pre-bake jagged shape so it doesn't flicker
        const verts = Array.from({ length: 7 }, () => 0.78 + Math.random() * 0.22);
        return { type, lane, y: worldY, radius: 22, active: true, verts };
      }
      case 'laser': {
        // 30 % chance full-track laser
        const fullTrack = Math.random() < 0.3;
        const lane = fullTrack ? -1 : Math.floor(Math.random() * 3);
        return { type, lane, y: worldY, active: true };
      }
      case 'tunnel': {
        const gapLane = Math.floor(Math.random() * 3);
        return { type, lane: -1, gapLane, y: worldY, height: 64, active: true };
      }
      case 'gravityZone': {
        const lane = Math.floor(Math.random() * 3);
        return { type, lane, y: worldY, height: 160, active: true };
      }
      case 'zeroGZone': {
        return { type, lane: -1, y: worldY, height: 130, active: true };
      }
      case 'wormhole': {
        const lane = Math.floor(Math.random() * 3);
        return { type, lane, y: worldY, radius: 28, active: true };
      }
      default:
        return null;
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt, speed, scrollY) {
    // Cull obstacles well behind the player
    this.obstacles = this.obstacles.filter(o => o.y > scrollY - 400);
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  getVisible(scrollY, canvasHeight) {
    const playerSY = canvasHeight * 0.82;
    return this.obstacles.filter(o => {
      if (!o.active) return false;
      const sy = playerSY - (o.y - scrollY);
      return sy > -150 && sy < canvasHeight + 150;
    });
  }

  // ── Collision ─────────────────────────────────────────────────────────────

  /**
   * @param {number} playerLane
   * @param {number} playerWorldY  (= track.scrollY)
   * @param {boolean} jumping
   * @param {boolean} ducking
   * @returns {object|null}  the obstacle hit, or null
   */
  checkCollision(playerLane, playerWorldY, jumping, ducking) {
    for (const obs of this.obstacles) {
      if (!obs.active) continue;

      const dy = Math.abs(obs.y - playerWorldY);

      switch (obs.type) {
        case 'asteroid':
          if (jumping) break;              // jump clears ground obstacles
          if (obs.lane !== playerLane) break;
          if (dy <= HIT_Y_RANGE) { obs.active = false; return obs; }
          break;

        case 'laser':
          // Laser cannot be jumped over
          if (obs.lane !== -1 && obs.lane !== playerLane) break;
          if (dy <= HIT_Y_RANGE * 0.55) { obs.active = false; return obs; }
          break;

        case 'tunnel':
          if (ducking) break;              // duck fits through any gap
          if (playerLane === obs.gapLane) break; // correct lane is the gap
          if (dy <= obs.height * 0.5) { obs.active = false; return obs; }
          break;

        case 'wormhole':
          if (obs.lane !== playerLane) break;
          if (dy <= HIT_Y_RANGE * 0.7) { obs.active = false; return obs; }
          break;

        // gravityZone / zeroGZone are handled as zone effects, not direct hits
        default:
          break;
      }
    }
    return null;
  }

  /**
   * Returns 'gravity', 'zeroG', or null.
   */
  getZoneEffect(playerLane, playerWorldY) {
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      if (obs.type !== 'gravityZone' && obs.type !== 'zeroGZone') continue;
      if (Math.abs(obs.y - playerWorldY) > obs.height * 0.5) continue;
      if (obs.lane !== -1 && obs.lane !== playerLane) continue;
      return obs.type === 'gravityZone' ? 'gravity' : 'zeroG';
    }
    return null;
  }
}
