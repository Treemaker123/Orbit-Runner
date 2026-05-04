// ── Renderer ────────────────────────────────────────────────────────────────
//
// Pseudo-3D / 2.5D perspective renderer (Temple-Run style).
//
// The world is treated as a 3-lane track that runs forward along a Z axis.
// The camera sits just behind/above the player and looks straight down +Z.
// Objects in the world have:
//   • a forward distance  d  (= obj.y - track.scrollY) along the current
//     heading,
//   • a lateral offset    x  (lanes mapped to ±LANE_WORLD_W),
//   • a height             h  (above the ground plane).
//
// When a corner is approaching, every world position with d > distanceToTurn
// gets rotated 90° around the turn point so the upcoming track visibly bends
// left or right in screen space. After the player successfully turns, the
// track snaps so that what was the bent-off section is now "straight ahead"
// — i.e. the world's forward direction has rotated by 90°.
//
// This module deliberately does *not* show any "TURN LEFT [Q]" text. The
// visible bend in the track is the only spatial cue for an upcoming corner.

var TRACK_WIDTH = 240;
var LANE_WIDTH  = 80;

// World-space constants (unitless world pixels)
const LANE_WORLD_W   = 80;            // lateral spacing between lane centres
const TRACK_HALF_W   = LANE_WORLD_W * 1.5;  // half the total track width

// Camera / projection
//
// HORIZON_FRAC and FOCAL together determine how "top-down" vs. how
// "forward-facing" the view feels. A higher horizon (closer to the vertical
// middle) plus a longer focal length yields a flatter, more forward-looking
// camera — the player sees the track stretch into the distance instead of
// looking down on it from above.
const HORIZON_FRAC   = 0.55;          // horizon line as fraction of canvas H
const GROUND_FRAC    = 0.88;          // where the ground meets the camera (d=0)
const FOCAL          = 500;           // perspective focal length (longer = less fish-eye)
const MAX_DRAW_DIST  = 3000;          // cull anything farther than this

// Track strips (alternating colours along the road for a sense of motion)
const STRIP_LEN      = 120;           // world length of each ground strip

class Renderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.stars   = [];
    this._time   = 0;
    this._generateStars();
    this.resize();
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  _generateStars() {
    this.stars = Array.from({ length: 220 }, () => ({
      x:    Math.random(),
      y:    Math.random() * 0.5,            // keep stars above the horizon
      r:    Math.random() * 1.8 + 0.4,
      br:   Math.random(),
      spd:  Math.random() * 0.6 + 0.1,
      ph:   Math.random() * Math.PI * 2,
    }));
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // ── Projection helpers ─────────────────────────────────────────────────────

  /**
   * Project a world-space point onto the screen.
   * @param {number} d  forward distance from camera (>0)
   * @param {number} x  lateral offset (0 = centre)
   * @param {number} h  height above ground (0 = on ground)
   * @returns {{sx:number, sy:number, scale:number}}
   */
  _project(d, x, h) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const horizonY  = H * HORIZON_FRAC;
    const baselineY = H * GROUND_FRAC;

    if (d < 1) d = 1;
    const scale = FOCAL / (FOCAL + d);

    // Ground point at distance d:
    //   d=0       → baselineY  (camera ground)
    //   d→∞       → horizonY
    const groundY = horizonY + (baselineY - horizonY) * scale;

    return {
      sx:    W / 2 + x * scale,
      sy:    groundY - h * scale,
      scale,
    };
  }

  /**
   * Translate an on-track position (forward distance d_along, lateral offset x_along)
   * into camera-space (d_cam, x_cam) accounting for the upcoming 90° corner.
   *
   * If the corner is at distance `dt` in direction `dir` ('left'|'right') and the
   * point is further along the track than the corner, the remainder of the
   * distance gets rotated 90° in the corresponding direction.
   *
   * @param {number} dAlong   distance along the track from the camera
   * @param {number} xLateral lateral offset perpendicular to the track
   * @param {{distance:number, direction:string}|null} turn
   * @returns {{d:number, x:number, bent:boolean}}
   */
  _bend(dAlong, xLateral, turn) {
    if (!turn || dAlong <= turn.distance) {
      return { d: dAlong, x: xLateral, bent: false };
    }
    const dt   = turn.distance;
    const post = dAlong - dt;
    const sign = turn.direction === 'right' ? 1 : -1;

    // After the rotation, the new forward axis points sideways. The new
    // "lateral" axis (= the original lateral, but rotated 90°) points
    // *along the original camera Z*. So a positive lateral offset on the
    // bent track shifts the point *closer to* the camera for a right turn
    // (and *further from* the camera for a left turn).
    const xCam = sign * post;
    const dCam = dt - sign * xLateral;
    return { d: dCam, x: xCam, bent: true };
  }

  // ── Main entry ─────────────────────────────────────────────────────────────

  render(gameState) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    this._time += 0.016;

    ctx.clearRect(0, 0, W, H);

    // Background (sky + horizon)
    this.drawBackground(ctx, W, H);

    const inGame = gameState.state === 'running' || gameState.state === 'paused';
    const turn   = inGame ? (gameState.turnWarning || null) : null;

    // The 3D track and everything that lives in it
    this.drawTrack(ctx, W, H, turn);

    if (inGame) {
      const scrollY = gameState.track ? gameState.track.getScrollOffset() : 0;

      if (gameState.obstacles) {
        const vis = gameState.obstacles.getVisible(scrollY, MAX_DRAW_DIST);
        this.drawObstacles(ctx, vis, scrollY, turn);
      }

      if (gameState.collectibles) {
        const vis = gameState.collectibles.getVisible(scrollY, MAX_DRAW_DIST);
        this.drawCollectibles(ctx, vis, scrollY, turn);
      }

      if (gameState.player) {
        this.drawPlayer(ctx, gameState.player, W, H);
      }

      // HUD (no turn-direction text here — the bending track is the cue)
      this.drawHUD(
        ctx, W, H,
        gameState.score   || 0,
        gameState.stars   || 0,
        gameState.speed   || 0,
        gameState.player,
        gameState.activeUpgrades || [],
      );
    }

    // Flash effects (drawn on top of everything)
    if (gameState.effects) {
      for (const fx of gameState.effects) this.drawEffect(ctx, fx, W, H);
    }
  }

  // ── Background ─────────────────────────────────────────────────────────────

  drawBackground(ctx, W, H) {
    const horizonY = H * HORIZON_FRAC;

    // Sky gradient (above the horizon)
    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0,   '#000010');
    sky.addColorStop(1,   '#101038');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY);

    // Ground gradient (below the horizon, behind the track)
    const ground = ctx.createLinearGradient(0, horizonY, 0, H);
    ground.addColorStop(0, '#06061a');
    ground.addColorStop(1, '#01010a');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Stars (only in the sky portion)
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this._time * s.spd + s.ph));
      ctx.globalAlpha = 0.25 + s.br * 0.75 * tw;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * horizonY, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Subtle horizon glow
    const glow = ctx.createLinearGradient(0, horizonY - 12, 0, horizonY + 24);
    glow.addColorStop(0, 'rgba(0,212,255,0)');
    glow.addColorStop(0.4, 'rgba(0,212,255,0.18)');
    glow.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizonY - 12, W, 36);
  }

  // ── Track ──────────────────────────────────────────────────────────────────

  /**
   * Build the four corner points (in screen space) of a track quad that spans
   * along-track distances [d0, d1].  `turn` may be null.
   * Returns null if the quad is degenerate or off-screen.
   */
  _trackQuad(d0, d1, turn) {
    const lL0 = this._bend(d0, -TRACK_HALF_W, turn);
    const rL0 = this._bend(d0,  TRACK_HALF_W, turn);
    const lL1 = this._bend(d1, -TRACK_HALF_W, turn);
    const rL1 = this._bend(d1,  TRACK_HALF_W, turn);

    const a = this._project(lL0.d, lL0.x, 0);
    const b = this._project(rL0.d, rL0.x, 0);
    const c = this._project(rL1.d, rL1.x, 0);
    const d = this._project(lL1.d, lL1.x, 0);

    return { a, b, c, d };
  }

  drawTrack(ctx, W, H, turn) {
    const horizonY = H * HORIZON_FRAC;
    // Maximum distance to render — never draw further than the corner
    // (the corner is the visual end of the road).
    const maxD = turn ? Math.min(MAX_DRAW_DIST, turn.distance + 1500) : MAX_DRAW_DIST;

    // Use a time-based phase for the alternating ground bands so they appear
    // to fly past the camera, giving a strong sense of forward motion.
    const phase = (this._time * 220) % STRIP_LEN;

    // Draw the ground strips back-to-front for correct overpaint, but here
    // each strip is at a single ground depth so order doesn't matter much.
    let dStart = -phase;
    let stripIndex = 0;
    while (dStart < maxD) {
      const d0 = Math.max(0.5, dStart);
      const d1 = Math.min(maxD, dStart + STRIP_LEN);
      if (d1 > d0 + 1) {
        const q = this._trackQuad(d0, d1, turn);
        ctx.fillStyle = (stripIndex % 2 === 0) ? '#0a0a22' : '#06061a';
        ctx.beginPath();
        ctx.moveTo(q.a.sx, q.a.sy);
        ctx.lineTo(q.b.sx, q.b.sy);
        ctx.lineTo(q.c.sx, q.c.sy);
        ctx.lineTo(q.d.sx, q.d.sy);
        ctx.closePath();
        ctx.fill();
      }
      dStart += STRIP_LEN;
      stripIndex++;
    }

    // Side rails (glowing edges)
    this._drawRail(ctx, -TRACK_HALF_W, maxD, turn, '#00d4ff');
    this._drawRail(ctx,  TRACK_HALF_W, maxD, turn, '#00d4ff');

    // Lane dividers (dashed look — drawn as short segments along the track)
    for (let lane = 1; lane < 3; lane++) {
      const x = (lane - 1.5) * LANE_WORLD_W;   // -40, +40 for 3 lanes
      this._drawLaneDivider(ctx, x, maxD, turn);
    }

    // If a corner is in view, paint a subtle "wall" at the bend so players see
    // the track ends there if they fail to turn — this is the *spatial* cue
    // that replaces the old text banner.
    if (turn) {
      this._drawCornerWall(ctx, turn);
    }

    // Soft horizon vignette so the track fades in nicely
    const fade = ctx.createLinearGradient(0, horizonY, 0, horizonY + 80);
    fade.addColorStop(0, 'rgba(0,0,20,0.6)');
    fade.addColorStop(1, 'rgba(0,0,20,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, horizonY, W, 80);
  }

  _drawRail(ctx, xOffset, maxD, turn, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;

    const STEP = 60;
    ctx.beginPath();
    let first = true;
    for (let d = 0; d <= maxD; d += STEP) {
      const b = this._bend(d, xOffset, turn);
      const p = this._project(b.d, b.x, 0);
      if (first) { ctx.moveTo(p.sx, p.sy); first = false; }
      else        ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawLaneDivider(ctx, xOffset, maxD, turn) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,180,220,0.30)';
    ctx.lineWidth   = 1;

    const DASH = 70;
    const GAP  = 60;
    const phase = (this._time * 220) % (DASH + GAP);
    let d = -phase;
    while (d < maxD) {
      const d0 = Math.max(0.5, d);
      const d1 = Math.min(maxD, d + DASH);
      if (d1 > d0 + 1) {
        const b0 = this._bend(d0, xOffset, turn);
        const b1 = this._bend(d1, xOffset, turn);
        const p0 = this._project(b0.d, b0.x, 0);
        const p1 = this._project(b1.d, b1.x, 0);
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.stroke();
      }
      d += DASH + GAP;
    }
    ctx.restore();
  }

  /**
   * Draw a faint "end of road" wall at the corner so the player has a clear
   * spatial signal that the track turns there.  Colour hints at the direction
   * of the corner.
   */
  _drawCornerWall(ctx, turn) {
    const dt = turn.distance;
    if (dt < 0 || dt > MAX_DRAW_DIST) return;

    // The wall sits at distance dt, spanning the track width, with some height.
    const WALL_H = 90;
    const a = this._project(dt, -TRACK_HALF_W, 0);
    const b = this._project(dt,  TRACK_HALF_W, 0);
    const c = this._project(dt,  TRACK_HALF_W, WALL_H);
    const d = this._project(dt, -TRACK_HALF_W, WALL_H);

    const colR = turn.direction === 'left' ? '139,92,246' : '0,255,255';
    const alphaBase = turn.inZone ? 0.55
                                  : 0.30 + 0.20 * Math.sin(this._time * 4);

    // Wall fill
    const grad = ctx.createLinearGradient(0, c.sy, 0, a.sy);
    grad.addColorStop(0, `rgba(${colR},${alphaBase * 0.05})`);
    grad.addColorStop(1, `rgba(${colR},${alphaBase * 0.55})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.lineTo(d.sx, d.sy);
    ctx.closePath();
    ctx.fill();

    // Wall outline glow
    ctx.save();
    ctx.strokeStyle = `rgba(${colR},${Math.min(1, alphaBase + 0.2)})`;
    ctx.lineWidth   = 2;
    ctx.shadowColor = `rgba(${colR},1)`;
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.moveTo(d.sx, d.sy);
    ctx.lineTo(c.sx, c.sy);
    ctx.stroke();
    ctx.restore();
  }

  // ── Obstacles ──────────────────────────────────────────────────────────────

  drawObstacles(ctx, obstacles, scrollY, turn) {
    // Draw farthest first so closer obstacles overpaint distant ones
    const sorted = obstacles
      .map(o => ({ o, d: o.y - scrollY }))
      .filter(e => e.d > -50 && e.d < MAX_DRAW_DIST)
      .sort((a, b) => b.d - a.d);

    for (const { o, d } of sorted) {
      // Lane → lateral offset on the track. lane === -1 means full-track width.
      const laneCentre = o.lane >= 0 ? (o.lane - 1) * LANE_WORLD_W : 0;

      const bent = this._bend(d, laneCentre, turn);
      const proj = this._project(bent.d, bent.x, 0);

      ctx.save();
      switch (o.type) {
        case 'asteroid':    this._drawAsteroid(ctx, proj, o); break;
        case 'laser':       this._drawLaser(ctx, d, o, turn); break;
        case 'tunnel':      this._drawTunnel(ctx, d, o, turn); break;
        case 'gravityZone': this._drawGravityZone(ctx, proj, o); break;
        case 'zeroGZone':   this._drawZeroGZone(ctx, d, o, turn); break;
        case 'wormhole':    this._drawWormhole(ctx, proj, o); break;
      }
      ctx.restore();
    }
  }

  _drawAsteroid(ctx, proj, obs) {
    const r = obs.radius * proj.scale * 1.4;
    if (r < 1) return;
    const x = proj.sx;
    const y = proj.sy - r * 0.9;     // sit on the ground

    ctx.shadowColor = '#666';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#2a2a3a';
    ctx.strokeStyle = '#5a5a7a';
    ctx.lineWidth   = Math.max(1, 2 * proj.scale);
    ctx.beginPath();
    const verts = obs.verts || Array(7).fill(1);
    for (let i = 0; i < verts.length; i++) {
      const angle = (i / verts.length) * Math.PI * 2 - Math.PI / 6;
      const rv    = r * verts[i];
      if (i === 0) ctx.moveTo(x + Math.cos(angle) * rv, y + Math.sin(angle) * rv);
      else         ctx.lineTo(x + Math.cos(angle) * rv, y + Math.sin(angle) * rv);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (r > 4) {
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#1a1a2a';
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.22, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + r * 0.3, y + r * 0.15, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Draws a horizontal laser beam across one or all lanes at distance d. */
  _drawLaser(ctx, d, obs, turn) {
    const yOff = -8;   // slightly above ground (knee height)
    let x1Off, x2Off;
    if (obs.lane === -1) {
      x1Off = -TRACK_HALF_W; x2Off = TRACK_HALF_W;
    } else {
      x1Off = (obs.lane - 1.5) * LANE_WORLD_W;
      x2Off = (obs.lane - 0.5) * LANE_WORLD_W;
    }
    const b1 = this._bend(d, x1Off, turn);
    const b2 = this._bend(d, x2Off, turn);
    const p1 = this._project(b1.d, b1.x, -yOff);
    const p2 = this._project(b2.d, b2.x, -yOff);

    const lw = Math.max(2, 14 * Math.min(p1.scale, p2.scale));

    ctx.shadowColor = '#ff0044';
    ctx.shadowBlur  = 22;
    ctx.strokeStyle = 'rgba(255,0,68,0.35)';
    ctx.lineWidth   = lw;
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();

    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth   = Math.max(1, lw * 0.25);
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = Math.max(1, lw * 0.08);
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
  }

  /** Tunnel: blocks all lanes except `gapLane`; player must duck. */
  _drawTunnel(ctx, d, obs, turn) {
    const TUNNEL_H = 110;
    for (let lane = 0; lane < 3; lane++) {
      if (lane === obs.gapLane) continue;
      const xC = (lane - 1) * LANE_WORLD_W;
      const xL = xC - LANE_WORLD_W / 2;
      const xR = xC + LANE_WORLD_W / 2;

      const bL = this._bend(d, xL, turn);
      const bR = this._bend(d, xR, turn);
      const pBL = this._project(bL.d, bL.x, 0);
      const pBR = this._project(bR.d, bR.x, 0);
      const pTL = this._project(bL.d, bL.x, TUNNEL_H);
      const pTR = this._project(bR.d, bR.x, TUNNEL_H);

      ctx.fillStyle   = 'rgba(60,0,110,0.82)';
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur  = 12;
      ctx.beginPath();
      ctx.moveTo(pBL.sx, pBL.sy);
      ctx.lineTo(pBR.sx, pBR.sy);
      ctx.lineTo(pTR.sx, pTR.sy);
      ctx.lineTo(pTL.sx, pTL.sy);
      ctx.closePath();
      ctx.fill();
    }

    // Outline around the whole opening
    const bL = this._bend(d, -TRACK_HALF_W, turn);
    const bR = this._bend(d,  TRACK_HALF_W, turn);
    const pBL = this._project(bL.d, bL.x, 0);
    const pBR = this._project(bR.d, bR.x, 0);
    const pTL = this._project(bL.d, bL.x, TUNNEL_H);
    const pTR = this._project(bR.d, bR.x, TUNNEL_H);
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#8b5cf6';
    ctx.shadowBlur  = 16;
    ctx.beginPath();
    ctx.moveTo(pBL.sx, pBL.sy);
    ctx.lineTo(pTL.sx, pTL.sy);
    ctx.lineTo(pTR.sx, pTR.sy);
    ctx.lineTo(pBR.sx, pBR.sy);
    ctx.stroke();
  }

  _drawGravityZone(ctx, proj, obs) {
    const w = LANE_WIDTH * proj.scale;
    const h = obs.height * proj.scale;
    if (w < 1 || h < 1) return;
    const x = proj.sx, y = proj.sy - h * 0.5;

    const g = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2);
    g.addColorStop(0,   'rgba(255,140,0,0)');
    g.addColorStop(0.5, 'rgba(255,140,0,0.35)');
    g.addColorStop(1,   'rgba(255,140,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  }

  _drawZeroGZone(ctx, d, obs, turn) {
    const ZONE_H = 110;
    const bL = this._bend(d, -TRACK_HALF_W, turn);
    const bR = this._bend(d,  TRACK_HALF_W, turn);
    const pBL = this._project(bL.d, bL.x, 0);
    const pBR = this._project(bR.d, bR.x, 0);
    const pTL = this._project(bL.d, bL.x, ZONE_H);
    const pTR = this._project(bR.d, bR.x, ZONE_H);

    ctx.fillStyle = 'rgba(0,230,200,0.10)';
    ctx.beginPath();
    ctx.moveTo(pBL.sx, pBL.sy);
    ctx.lineTo(pBR.sx, pBR.sy);
    ctx.lineTo(pTR.sx, pTR.sy);
    ctx.lineTo(pTL.sx, pTL.sy);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,230,200,0.45)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawWormhole(ctx, proj, obs) {
    const r = obs.radius * proj.scale * 1.6;
    if (r < 1) return;
    const x = proj.sx;
    const y = proj.sy - r;
    const t = Date.now() * 0.0022;

    for (let i = 5; i >= 1; i--) {
      const ri = r * (i / 5);
      ctx.strokeStyle = `rgba(139,92,246,${0.15 + i * 0.14})`;
      ctx.lineWidth   = Math.max(1, 2 * proj.scale);
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(x, y, ri, t, t + Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#120020';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Collectibles ───────────────────────────────────────────────────────────

  drawCollectibles(ctx, items, scrollY, turn) {
    const sorted = items
      .map(i => ({ i, d: i.y - scrollY }))
      .filter(e => e.d > -50 && e.d < MAX_DRAW_DIST)
      .sort((a, b) => b.d - a.d);

    for (const { i: item, d } of sorted) {
      const laneCentre = (item.lane - 1) * LANE_WORLD_W;
      const bent = this._bend(d, laneCentre, turn);
      // Float collectibles slightly above the ground for visibility.
      const proj = this._project(bent.d, bent.x, 30);
      const pulse = Math.sin(item.pulseTimer || 0) * 0.18 + 0.82;
      ctx.save();
      switch (item.type) {
        case 'energyCore':  this._drawEnergyCore(ctx, proj, pulse);  break;
        case 'shieldShard': this._drawShieldShard(ctx, proj, pulse); break;
        case 'slowdownOrb': this._drawSlowdownOrb(ctx, proj, pulse); break;
      }
      ctx.restore();
    }
  }

  _drawEnergyCore(ctx, proj, pulse) {
    const r = 11 * pulse * proj.scale * 1.4;
    if (r < 1) return;
    const x = proj.sx, y = proj.sy;

    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 22 * pulse * proj.scale;
    ctx.strokeStyle = `rgba(255,215,0,${0.28 * pulse})`;
    ctx.lineWidth   = Math.max(1, 7 * proj.scale);
    ctx.beginPath(); ctx.arc(x, y, r + 7 * proj.scale, 0, Math.PI * 2); ctx.stroke();

    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0,   '#ffffff');
    g.addColorStop(0.3, '#ffe066');
    g.addColorStop(1,   '#ff8800');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  _drawShieldShard(ctx, proj, pulse) {
    const sz = 11 * pulse * proj.scale * 1.4;
    if (sz < 1) return;
    const x = proj.sx, y = proj.sy;

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 14 * pulse * proj.scale;
    ctx.fillStyle   = 'rgba(0,255,255,0.8)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = Math.max(1, proj.scale);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a  = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * sz;
      const py = y + Math.sin(a) * sz;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawSlowdownOrb(ctx, proj, pulse) {
    const r = 10 * pulse * proj.scale * 1.4;
    if (r < 1) return;
    const x = proj.sx, y = proj.sy;

    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur  = 14 * pulse * proj.scale;
    ctx.strokeStyle = `rgba(0,255,136,${0.38 * pulse})`;
    ctx.lineWidth   = Math.max(1, 6 * proj.scale);
    ctx.beginPath(); ctx.arc(x, y, r + 5 * proj.scale, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#00dd77';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // ── Player ─────────────────────────────────────────────────────────────────

  drawPlayer(ctx, player, W, H) {
    // The player ship is camera-attached at the camera baseline (d = 0) so
    // that the obstacle/collectible collision logic — which treats the
    // player's world position as `track.scrollY` — lines up exactly with
    // what the player sees. Previously the ship was drawn at d = 60, which
    // meant obstacles registered hits ~60 world-px after they had visually
    // passed under the ship ("invisible collisions").
    const PLAYER_D = 0;             // forward distance of the ship from camera
    const lanePos  = this._playerLanePos(player);
    const xLateral = (lanePos - 1) * LANE_WORLD_W;
    const h        = player.jumping ? Math.sin(player.jumpTimer * Math.PI) * 80 : 0;

    const proj = this._project(PLAYER_D, xLateral, h);

    // Shadow on the ground beneath the ship
    const shadow = this._project(PLAYER_D, xLateral, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(shadow.sx, shadow.sy + 4, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const scale  = proj.scale * 1.3;
    const scaleY = player.ducking ? scale * 0.55 : scale;

    ctx.save();
    ctx.translate(proj.sx, proj.sy - 22 * scaleY);
    ctx.scale(scale, scaleY);

    const H2 = 18, H1 = -18;

    // Engine glow
    const eg = ctx.createRadialGradient(0, H2, 0, 0, H2 + 4, 22);
    eg.addColorStop(0, 'rgba(0,180,255,0.85)');
    eg.addColorStop(1, 'rgba(0,180,255,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, H2 + 4, 22, 0, Math.PI * 2);
    ctx.fill();

    // Engine flame
    const flameLen = 12 + 6 * Math.sin(Date.now() * 0.018);
    const fg = ctx.createLinearGradient(0, H2, 0, H2 + flameLen);
    fg.addColorStop(0, 'rgba(0,220,255,0.9)');
    fg.addColorStop(1, 'rgba(0,80,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-7, H2);
    ctx.lineTo(0,  H2 + flameLen);
    ctx.lineTo(7,  H2);
    ctx.closePath();
    ctx.fill();

    // Shield ring
    if (player.activeShield) {
      const sa = 0.45 + 0.3 * Math.sin(Date.now() * 0.006);
      ctx.strokeStyle = `rgba(0,255,255,${sa})`;
      ctx.lineWidth   = 3;
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur  = 22;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur  = 0;
    }

    // Ship body
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur  = 16;
    const sg = ctx.createLinearGradient(0, H1, 0, H2);
    sg.addColorStop(0, '#00ffff');
    sg.addColorStop(1, '#0090cc');
    ctx.fillStyle   = sg;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth   = 1.5;

    ctx.beginPath();
    ctx.moveTo(0,      H1);
    ctx.lineTo(13,     H2);
    ctx.lineTo(5,      H2 - 8);
    ctx.lineTo(0,      H2);
    ctx.lineTo(-5,     H2 - 8);
    ctx.lineTo(-13,    H2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, H1 + 8); ctx.lineTo(9, H2 - 2);
    ctx.moveTo(0, H1 + 8); ctx.lineTo(-9, H2 - 2);
    ctx.stroke();

    ctx.restore();
  }

  /** Smooth lane position with the player's lane-switch animation. */
  _playerLanePos(player) {
    if (player._laneAnimT > 0) {
      return player._laneAnimTo +
             (player._laneAnimFrom - player._laneAnimTo) * player._laneAnimT;
    }
    return player.lane;
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  // The HUD intentionally shows NO turn-direction text or "TURN LEFT [Q]"
  // banner.  Corners are communicated purely by the bending of the track in
  // 3D space.
  drawHUD(ctx, W, H, score, stars, speed, player, activeUpgrades) {
    // ── Top-left info box ──────────────────────────────────
    ctx.save();
    ctx.fillStyle   = 'rgba(0,0,20,0.72)';
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 1;
    const BOX_W = 190, BOX_H = 76;
    ctx.fillRect(10, 10, BOX_W, BOX_H);
    ctx.strokeRect(10, 10, BOX_W, BOX_H);

    ctx.font      = '13px monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#00d4ff';
    ctx.fillText(`SCORE  ${Math.floor(score).toLocaleString()}`, 20, 30);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`★  ${stars.toLocaleString()}`, 20, 48);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`SPEED  ${Math.floor(speed)} px/s`, 20, 66);
    ctx.restore();

    // ── Shield shards (top-right) ──────────────────────────
    if (player) {
      ctx.save();
      const BX = W - 168, BY = 10;
      ctx.fillStyle   = 'rgba(0,0,20,0.72)';
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth   = 1;
      ctx.fillRect(BX, BY, 158, 62);
      ctx.strokeRect(BX, BY, 158, 62);

      ctx.fillStyle = '#00ffff';
      ctx.font      = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SHIELD SHARDS', BX + 8, BY + 20);

      for (let i = 0; i < 3; i++) {
        const sx     = BX + 10 + i * 30;
        const sy     = BY + 40;
        const filled = i < player.shieldShards || player.activeShield;
        ctx.save();
        ctx.shadowColor = filled ? '#00ffff' : 'transparent';
        ctx.shadowBlur  = filled ? 10 : 0;
        ctx.fillStyle   = filled ? '#00ffff' : '#1a2233';
        ctx.strokeStyle = '#00aacc';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
          const px = sx + Math.cos(a) * 11;
          const py = sy + Math.sin(a) * 11;
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      if (player.activeShield && player.shieldTimer !== Infinity) {
        const t = Math.max(0, player.shieldTimer);
        ctx.fillStyle = '#00ffff';
        ctx.font      = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${t.toFixed(1)}s`, BX + 8, BY + 55);
      }
      ctx.restore();
    }

    // ── Active upgrades (bottom-left) ─────────────────────
    if (activeUpgrades && activeUpgrades.length > 0) {
      ctx.save();
      const BH = 18 + activeUpgrades.length * 16 + 10;
      const BY = H - BH - 10;
      ctx.fillStyle   = 'rgba(0,0,20,0.68)';
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth   = 1;
      ctx.fillRect(10, BY, 170, BH);
      ctx.strokeRect(10, BY, 170, BH);

      ctx.fillStyle = '#8b5cf6';
      ctx.font      = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('UPGRADES', 18, BY + 14);

      activeUpgrades.forEach((u, i) => {
        ctx.fillStyle = '#9ab';
        ctx.fillText(`[${i + 1}] ${u.name} Lv${u.level}`, 18, BY + 28 + i * 16);
      });
      ctx.restore();
    }
  }

  // ── Flash effects ──────────────────────────────────────────────────────────

  drawEffect(ctx, fx, W, H) {
    if (!fx || fx.timer <= 0) return;
    const a = (fx.timer / fx.duration) * (fx.alpha || 0.5);
    ctx.fillStyle = `rgba(${fx.color},${Math.min(1, a)})`;
    ctx.fillRect(0, 0, W, H);
  }
}
