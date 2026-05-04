var LANE_WIDTH = 80;
const PULSE_SPEED = 3.2;

class Collectibles {
  constructor() {
    this.items = [];
    this.nextSpawnDistance = 200;
  }

  reset() {
    this.items = [];
    this.nextSpawnDistance = 200;
  }

  _pickType() {
    const r = Math.random();
    if (r < 0.68) return 'energyCore';
    if (r < 0.88) return 'shieldShard';
    return 'slowdownOrb';
  }

  spawn(track, playerDistance) {
    const aheadDistance = playerDistance + 4200;

    while (this.nextSpawnDistance < aheadDistance) {
      const type = this._pickType();
      const lane = Math.floor(Math.random() * 3) - 1;
      const sample = track.sampleByDistance(this.nextSpawnDistance, lane * LANE_WIDTH);

      this.items.push({
        type,
        lane,
        x: sample.position.x,
        z: sample.position.z,
        pathDistance: this.nextSpawnDistance,
        active: true,
        collected: false,
        pulseTimer: Math.random() * Math.PI * 2,
      });

      this.nextSpawnDistance += 190 + Math.random() * 220;
    }
  }

  update(dt, playerDistance) {
    for (const item of this.items) {
      if (item.active) item.pulseTimer = (item.pulseTimer + dt * PULSE_SPEED) % (Math.PI * 2);
    }
    this.items = this.items.filter(i => i.active && i.pathDistance > playerDistance - 400);
  }

  getVisible(playerDistance, drawDistance) {
    return this.items.filter(i => i.active && !i.collected && i.pathDistance > playerDistance - 100 && i.pathDistance < playerDistance + drawDistance);
  }

  checkCollection(player, magnetLevel) {
    const collected = [];
    const baseRadius = 26;
    const magnetRadius = baseRadius + magnetLevel * (LANE_WIDTH * 0.6);
    const center = player.getHitboxCenter();

    for (const item of this.items) {
      if (!item.active || item.collected) continue;

      const dx = item.x - center.x;
      const dz = item.z - center.z;
      const dist2 = dx * dx + dz * dz;

      if (dist2 <= magnetRadius * magnetRadius) {
        item.collected = true;
        item.active = false;
        collected.push(item);
      }
    }

    return collected;
  }
}
