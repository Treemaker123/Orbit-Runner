const SEGMENT_MIN_LEN = 1200;
const SEGMENT_MAX_LEN = 2400;
const TURN_ZONE_AHEAD = 90;
const TURN_ZONE_BEHIND = 140;
const TURN_WARN_DIST = 1800;

class Track {
  constructor() {
    this.segments = [];
    this.turnIndex = 0;
    this._nextStartPos = { x: 0, z: 0 };
    this._nextStartDir = { x: 0, z: 1 };
    this._nextStartDistance = 0;
    this.reset();
  }

  reset() {
    this.segments = [];
    this.turnIndex = 0;
    this._nextStartPos = { x: 0, z: 0 };
    this._nextStartDir = { x: 0, z: 1 };
    this._nextStartDistance = 0;

    for (let i = 0; i < 8; i++) this._generateNextSegment();
  }

  _rotateDir(dir, turnDirection) {
    if (turnDirection === 'left') return { x: -dir.z, z: dir.x };
    return { x: dir.z, z: -dir.x };
  }

  _generateNextSegment() {
    const direction = { x: this._nextStartDir.x, z: this._nextStartDir.z };
    const length = SEGMENT_MIN_LEN + Math.random() * (SEGMENT_MAX_LEN - SEGMENT_MIN_LEN);
    const turnDirection = Math.random() < 0.5 ? 'left' : 'right';

    const end = {
      x: this._nextStartPos.x + direction.x * length,
      z: this._nextStartPos.z + direction.z * length,
    };

    const segment = {
      position: { x: this._nextStartPos.x, z: this._nextStartPos.z },
      direction,
      length,
      turnDirection,
      end,
      startDistance: this._nextStartDistance,
      endDistance: this._nextStartDistance + length,
    };

    this.segments.push(segment);

    this._nextStartPos = { x: end.x, z: end.z };
    this._nextStartDir = this._rotateDir(direction, turnDirection);
    this._nextStartDistance = segment.endDistance;
  }

  update(playerDistance) {
    while (this.turnIndex > 1 && this.segments.length > 10) {
      this.segments.shift();
      this.turnIndex--;
    }

    while (this._nextStartDistance < playerDistance + 9000) {
      this._generateNextSegment();
    }
  }

  _getCurrentTurnSegment() {
    if (this.turnIndex < 0 || this.turnIndex >= this.segments.length) return null;
    return this.segments[this.turnIndex];
  }

  _dot(a, b) {
    return a.x * b.x + a.z * b.z;
  }

  _perp(dir) {
    return { x: -dir.z, z: dir.x };
  }

  getTurnState(player) {
    const seg = this._getCurrentTurnSegment();
    if (!seg) return null;

    const toTurn = {
      x: seg.end.x - player.center.x,
      z: seg.end.z - player.center.z,
    };

    const forwardDist = this._dot(toTurn, seg.direction);
    const lateralDist = Math.abs(this._dot(toTurn, this._perp(seg.direction)));
    const inZone =
      forwardDist <= TURN_ZONE_AHEAD &&
      forwardDist >= -TURN_ZONE_BEHIND &&
      lateralDist <= TRACK_WIDTH * 0.8;

    return {
      segment: seg,
      distance: forwardDist,
      lateralDist,
      inZone,
      direction: seg.turnDirection,
      turnPoint: { x: seg.end.x, z: seg.end.z },
      newDirection: this._rotateDir(seg.direction, seg.turnDirection),
    };
  }

  isTurnMissed(player) {
    const turn = this.getTurnState(player);
    if (!turn) return false;
    return turn.distance < -TURN_ZONE_BEHIND;
  }

  attemptTurn(direction, player) {
    const turn = this.getTurnState(player);
    if (!turn) return { result: 'notInZone' };
    if (!turn.inZone) return { result: 'notInZone' };
    if (direction !== turn.direction) return { result: 'fail' };

    this.turnIndex++;
    return {
      result: 'success',
      newDirection: turn.newDirection,
      turnPoint: turn.turnPoint,
    };
  }

  getTurnWarning(player) {
    const turn = this.getTurnState(player);
    if (!turn) return null;
    if (turn.distance > TURN_WARN_DIST || turn.distance < -TURN_ZONE_BEHIND) return null;

    return {
      direction: turn.direction,
      distance: turn.distance,
      inZone: turn.inZone,
    };
  }

  sampleByDistance(distanceAlongPath, laneOffset = 0) {
    if (distanceAlongPath < 0) distanceAlongPath = 0;

    let seg = this.segments[this.segments.length - 1];
    for (const s of this.segments) {
      if (distanceAlongPath >= s.startDistance && distanceAlongPath <= s.endDistance) {
        seg = s;
        break;
      }
    }

    const local = Math.max(0, Math.min(seg.length, distanceAlongPath - seg.startDistance));
    const center = {
      x: seg.position.x + seg.direction.x * local,
      z: seg.position.z + seg.direction.z * local,
    };

    const perp = this._perp(seg.direction);
    return {
      center,
      direction: { x: seg.direction.x, z: seg.direction.z },
      perp,
      position: {
        x: center.x + perp.x * laneOffset,
        z: center.z + perp.z * laneOffset,
      },
      segment: seg,
    };
  }
}
