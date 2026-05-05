const SEGMENT_MIN_LEN = 1200;
const SEGMENT_MAX_LEN = 2400;

class Track {
  constructor() {
    this.segments = [];
    this._nextStartDistance = 0;
    this.reset();
  }

  reset() {
    this.segments = [];
    this._nextStartDistance = 0;

    for (let i = 0; i < 8; i++) this._generateNextSegment();
  }

  _generateNextSegment() {
    const direction = { x: 0, z: 1 };
    const length = SEGMENT_MIN_LEN + Math.random() * (SEGMENT_MAX_LEN - SEGMENT_MIN_LEN);

    const segment = {
      position: { x: 0, z: this._nextStartDistance },
      direction,
      length,
      end: { x: 0, z: this._nextStartDistance + length },
      startDistance: this._nextStartDistance,
      endDistance: this._nextStartDistance + length,
    };

    this.segments.push(segment);
    this._nextStartDistance = segment.endDistance;
  }

  update(playerDistance) {
    while (this.segments.length > 10 && this.segments[0].endDistance < playerDistance - 500) {
      this.segments.shift();
    }

    while (this._nextStartDistance < playerDistance + 9000) {
      this._generateNextSegment();
    }
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

    const perp = { x: -seg.direction.z, z: seg.direction.x };
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
