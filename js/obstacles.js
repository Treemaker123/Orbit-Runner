var TRACK_WIDTH = 240;
var LANE_WIDTH  = 80;

const MIN_OBSTACLE_SPACING = 180;
const MAX_OBSTACLE_SPACING = 480;
const SPACING_DIFFICULTY_RATE = 0.25;

class Obstacles {
  constructor() {
    this.obstacles = [];
    this.nextSpawnDistance = 600;
  }

  reset() {
    this.obstacles = [];
    this.nextSpawnDistance = 600;
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

  _boundsFrom(center, dir, halfForward, halfLateral) {
    const perp = { x: -dir.z, z: dir.x };
    const dx = Math.abs(dir.x) * halfForward + Math.abs(perp.x) * halfLateral;
    const dz = Math.abs(dir.z) * halfForward + Math.abs(perp.z) * halfLateral;
    return {
      minX: center.x - dx,
      maxX: center.x + dx,
      minZ: center.z - dz,
      maxZ: center.z + dz,
    };
  }

  _create(type, sample, lane) {
    const center = sample.position;
    const dir = sample.direction;

    switch (type) {
      case 'asteroid': {
        const verts = Array.from({ length: 7 }, () => 0.78 + Math.random() * 0.22);
        return {
          type,
          lane,
          x: center.x,
          z: center.z,
          direction: dir,
          pathDistance: sample.segment.startDistance + Math.max(0, sample.center.x - sample.segment.position.x) + Math.max(0, sample.center.z - sample.segment.position.z),
          radius: 22,
          verts,
          active: true,
          bounds: this._boundsFrom(center, dir, 18, LANE_WIDTH * 0.28),
        };
      }
      case 'laser': {
        const fullTrack = Math.random() < 0.3;
        const halfLateral = fullTrack ? TRACK_WIDTH * 0.5 : LANE_WIDTH * 0.5;
        return {
          type,
          lane: fullTrack ? null : lane,
          x: center.x,
          z: center.z,
          direction: dir,
          active: true,
          bounds: this._boundsFrom(center, dir, 6, halfLateral),
        };
      }
      case 'tunnel': {
        const gapLane = Math.floor(Math.random() * 3) - 1;
        return {
          type,
          lane: null,
          gapLane,
          x: center.x,
          z: center.z,
          direction: dir,
          active: true,
          bounds: this._boundsFrom(center, dir, 22, TRACK_WIDTH * 0.5),
        };
      }
      case 'gravityZone': {
        return {
          type,
          lane,
          x: center.x,
          z: center.z,
          direction: dir,
          height: 160,
          active: true,
          bounds: this._boundsFrom(center, dir, 80, LANE_WIDTH * 0.5),
        };
      }
      case 'zeroGZone': {
        return {
          type,
          lane: null,
          x: center.x,
          z: center.z,
          direction: dir,
          height: 130,
          active: true,
          bounds: this._boundsFrom(center, dir, 70, TRACK_WIDTH * 0.5),
        };
      }
      case 'wormhole': {
        return {
          type,
          lane,
          x: center.x,
          z: center.z,
          direction: dir,
          radius: 28,
          active: true,
          bounds: this._boundsFrom(center, dir, 16, LANE_WIDTH * 0.28),
        };
      }
      default:
        return null;
    }
  }

  spawn(track, playerDistance, speed) {
    const aheadDistance = playerDistance + 4200;

    while (this.nextSpawnDistance < aheadDistance) {
      const type = this._pickType();
      const lane = Math.floor(Math.random() * 3) - 1;
      const laneOffset = lane * LANE_WIDTH;
      const sample = track.sampleByDistance(this.nextSpawnDistance, laneOffset);
      const obstacle = this._create(type, sample, lane);
      if (obstacle) {
        obstacle.pathDistance = this.nextSpawnDistance;
        this.obstacles.push(obstacle);
      }

      const base = Math.max(MIN_OBSTACLE_SPACING, MAX_OBSTACLE_SPACING - speed * SPACING_DIFFICULTY_RATE);
      this.nextSpawnDistance += base + Math.random() * base * 0.8;
    }
  }

  update(playerDistance) {
    this.obstacles = this.obstacles.filter(o => o.active && o.pathDistance > playerDistance - 500);
  }

  getVisible(playerDistance, drawDistance) {
    return this.obstacles.filter(o => o.active && o.pathDistance > playerDistance - 100 && o.pathDistance < playerDistance + drawDistance);
  }

  _overlap(a, b) {
    return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
  }

  checkCollision(player) {
    const playerBox = player.getWorldHitbox();

    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      if (!this._overlap(playerBox, obs.bounds)) continue;

      switch (obs.type) {
        case 'asteroid':
        case 'wormhole':
          if (!player.jumping) {
            obs.active = false;
            return obs;
          }
          break;
        case 'laser':
          obs.active = false;
          return obs;
        case 'tunnel':
          if (!player.ducking && player.lane !== obs.gapLane) {
            obs.active = false;
            return obs;
          }
          break;
        default:
          break;
      }
    }

    return null;
  }

  getZoneEffect(player) {
    const playerBox = player.getWorldHitbox();
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      if (obs.type !== 'gravityZone' && obs.type !== 'zeroGZone') continue;
      if (obs.lane !== null && obs.lane !== player.lane) continue;
      if (!this._overlap(playerBox, obs.bounds)) continue;
      return obs.type === 'gravityZone' ? 'gravity' : 'zeroG';
    }
    return null;
  }
}
