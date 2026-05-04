var LANE_WIDTH  = 80;
const COLLECT_Y   = 44; // ±worldY pixels for collection
const PULSE_SPEED = 3.2;

class Collectibles {
  constructor() {
    this.items      = [];
    this.nextSpawnY = 200;
  }

  reset() {
    this.items      = [];
    this.nextSpawnY = 200;
  }

  // ── Spawning ──────────────────────────────────────────────────────────────

  spawn(scrollY, canvasHeight) {
    const ahead = scrollY + canvasHeight + 300;
    while (this.nextSpawnY < ahead) {
      const type = this._pickType();
      const lane = Math.floor(Math.random() * 3);
      this.items.push({
        type,
        lane,
        y:           this.nextSpawnY,
        active:      true,
        collected:   false,
        pulseTimer:  Math.random() * Math.PI * 2,
      });
      this.nextSpawnY += 190 + Math.random() * 220;
    }
  }

  _pickType() {
    const r = Math.random();
    if (r < 0.68) return 'energyCore';
    if (r < 0.88) return 'shieldShard';
    return 'slowdownOrb';
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt, speed, scrollY, magnetLevel) {
    for (const item of this.items) {
      if (item.active) item.pulseTimer = (item.pulseTimer + dt * PULSE_SPEED) % (Math.PI * 2);
    }
    // Cull items behind the player
    this.items = this.items.filter(i => i.y > scrollY - 300);
  }

  // ── Visibility ────────────────────────────────────────────────────────────

  getVisible(scrollY, canvasHeight) {
    const playerSY = canvasHeight * 0.82;
    return this.items.filter(i => {
      if (!i.active || i.collected) return false;
      const sy = playerSY - (i.y - scrollY);
      return sy > -80 && sy < canvasHeight + 80;
    });
  }

  // ── Collection ────────────────────────────────────────────────────────────

  /**
   * Check which items the player collects this frame.
   * @param {number} playerLane
   * @param {number} playerWorldY  (= track.scrollY)
   * @param {number} magnetLevel   0-5
   * @returns {object[]} collected items
   */
  checkCollection(playerLane, playerWorldY, magnetLevel) {
    const collected = [];
    const MAGNET_LANE_FRACTION = 0.6; // each magnet level extends reach by 60% of a lane width
    const magnetReach = magnetLevel * MAGNET_LANE_FRACTION;

    for (const item of this.items) {
      if (!item.active || item.collected) continue;

      const dy       = Math.abs(item.y - playerWorldY);
      if (dy > COLLECT_Y) continue;

      const laneDist = Math.abs(item.lane - playerLane);
      if (laneDist <= magnetReach || item.lane === playerLane) {
        item.collected = true;
        item.active    = false;
        collected.push(item);
      }
    }
    return collected;
  }
}
