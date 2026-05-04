const SEGMENT_MIN_LEN = 1200;
const SEGMENT_MAX_LEN = 2400;
const TURN_ZONE_HALF  = 120; // radius of the valid-turn window (±world-px around the turn point)
// Distance at which an upcoming corner becomes visible in the perspective world.
// Larger than the previous value because the track now physically bends in 3D
// space — players need to *see* the bend approaching, not read a text prompt.
const TURN_WARN_DIST  = 1800;

class Track {
  constructor() {
    this.segments = [];
    this.scrollY  = 0;
    this._nextSegmentStartY = 0;
    this._currentTurnHandled = false;
    this.reset();
  }

  reset() {
    this.segments = [];
    this.scrollY  = 0;
    this._nextSegmentStartY = 0;
    this._currentTurnHandled = false;
    // Pre-generate several segments ahead
    for (let i = 0; i < 6; i++) this._generateNextSegment();
  }

  _generateNextSegment() {
    const length        = SEGMENT_MIN_LEN + Math.random() * (SEGMENT_MAX_LEN - SEGMENT_MIN_LEN);
    const turnDirection = Math.random() < 0.5 ? 'left' : 'right';
    const startY        = this._nextSegmentStartY;
    const turnY         = startY + length;
    this.segments.push({ startY, length, turnDirection, turnY });
    this._nextSegmentStartY = turnY;
  }

  update(dt, speed) {
    this.scrollY += speed * dt;

    // Remove segments whose turn is well behind the player
    while (
      this.segments.length > 1 &&
      this.segments[0].turnY < this.scrollY - TURN_ZONE_HALF * 3
    ) {
      this.segments.shift();
      this._currentTurnHandled = false;
    }

    // Keep plenty of segments ahead
    while (this._nextSegmentStartY < this.scrollY + 8000) {
      this._generateNextSegment();
    }
  }

  /** Returns the nearest upcoming turn (the first segment whose turn hasn't been passed). */
  getUpcomingTurn() {
    for (const seg of this.segments) {
      if (seg.turnY >= this.scrollY - TURN_ZONE_HALF) return seg;
    }
    return null;
  }

  /** Pixels between player and next turn (positive = ahead, negative = behind). */
  getTurnDistance() {
    const turn = this.getUpcomingTurn();
    return turn ? turn.turnY - this.scrollY : Infinity;
  }

  isInTurnZone() {
    return Math.abs(this.getTurnDistance()) <= TURN_ZONE_HALF;
  }

  /** True when the player has scrolled past the turn without handling it. */
  isTurnMissed() {
    const turn = this.getUpcomingTurn();
    if (!turn) return false;
    if (this._currentTurnHandled) return false;
    return this.scrollY > turn.turnY + TURN_ZONE_HALF;
  }

  /**
   * Attempt a turn input.
   * @param {'left'|'right'} direction
   * @returns {'success'|'fail'|'notInZone'}
   */
  attemptTurn(direction) {
    const turn = this.getUpcomingTurn();
    if (!turn) return 'notInZone';
    if (this._currentTurnHandled) return 'notInZone';

    const dist = turn.turnY - this.scrollY;
    if (Math.abs(dist) > TURN_ZONE_HALF) return 'notInZone';

    if (direction === turn.turnDirection) {
      this._currentTurnHandled = true;
      // The world physically rotates 90° here. Snap the camera to the turn
      // point and consume the segment so that everything past the corner —
      // which was generated as the *next* segment of track — now becomes
      // "straight ahead" along the new forward direction.
      this.scrollY = turn.turnY;
      this.segments.shift();
      this._currentTurnHandled = false;
      return 'success';
    }
    return 'fail';
  }

  getScrollOffset() { return this.scrollY; }

  /**
   * Returns warning data when a turn is within TURN_WARN_DIST, or null.
   * @returns {{direction:string, distance:number, inZone:boolean}|null}
   */
  getTurnWarning() {
    const turn = this.getUpcomingTurn();
    if (!turn) return null;
    const dist = turn.turnY - this.scrollY;
    if (dist > TURN_WARN_DIST || dist < -TURN_ZONE_HALF) return null;
    if (this._currentTurnHandled) return null;
    return {
      direction: turn.turnDirection,
      distance:  dist,
      inZone:    Math.abs(dist) <= TURN_ZONE_HALF,
    };
  }
}
