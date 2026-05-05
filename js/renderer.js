var TRACK_WIDTH = 360;
var LANE_WIDTH  = 120;

const TRACK_HALF_W = TRACK_WIDTH * 0.5;
const CAMERA_BACK_DISTANCE = 200;
const CAMERA_HEIGHT = 32;
const CAMERA_FORWARD_OFFSET = 480;

const HORIZON_FRAC = 0.32;
const GROUND_FRAC = 0.97;
const PROJECTION_FOCAL = 460;
// Smaller values increase near-field perspective exaggeration.
const PROJECTION_NEAR = 55;
// Cull points very close to camera to avoid unstable giant projections.
const NEAR_CLIP = 15;
const MAX_DRAW_DIST = 3400;
const STRIP_LEN = 120;
const PLAYER_SCREEN_Y_CLAMP_RATIO = 0.90;

// Duration in seconds of the smooth camera direction snap after a turn.
const TURN_SNAP_DURATION = 0.13;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = [];
    this._time = 0;
    this._turnSnapTimer = 0;       // counts down from TURN_SNAP_DURATION to 0
    this._turnOldDir = { x: 0, z: 1 };
    this._turnNewDir = { x: 0, z: 1 };
    this._lastFrameTime = 0;
    this._generateStars();
    this.resize();
  }

  // Called by Game when a successful turn occurs.  oldDir and newDir are
  // unit direction vectors; the camera pivots from oldDir to newDir over
  // TURN_SNAP_DURATION seconds, so the 90-degree direction change feels
  // like a quick, grounded snap rather than a sudden jump.
  triggerTurnSnap(oldDir, newDir) {
    this._turnSnapTimer = TURN_SNAP_DURATION;
    this._turnOldDir = { x: oldDir.x, z: oldDir.z };
    this._turnNewDir = { x: newDir.x, z: newDir.z };
  }

  _generateStars() {
    this.stars = Array.from({ length: 220 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.5,
      r: Math.random() * 1.8 + 0.4,
      br: Math.random(),
      spd: Math.random() * 0.6 + 0.1,
      ph: Math.random() * Math.PI * 2,
    }));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _cameraFromPlayer(player) {
    // During a turn snap, smoothly rotate the camera direction from the old
    // heading to the new one over TURN_SNAP_DURATION seconds.
    let dir;
    if (this._turnSnapTimer > 0) {
      const elapsed = TURN_SNAP_DURATION - this._turnSnapTimer;
      const raw = elapsed / TURN_SNAP_DURATION; // 0 = turn start, 1 = turn complete
      const ease = raw * raw * (3 - 2 * raw); // smoothstep
      const ix = this._turnOldDir.x + (this._turnNewDir.x - this._turnOldDir.x) * ease;
      const iz = this._turnOldDir.z + (this._turnNewDir.z - this._turnOldDir.z) * ease;
      const len = Math.sqrt(ix * ix + iz * iz);
      dir = len > 0.001 ? { x: ix / len, z: iz / len } : player.direction;
    } else {
      dir = player.direction;
    }

    const cameraPos = {
      x: player.position.x - dir.x * CAMERA_BACK_DISTANCE,
      y: CAMERA_HEIGHT,
      z: player.position.z - dir.z * CAMERA_BACK_DISTANCE,
    };
    const lookAt = {
      x: player.position.x + dir.x * CAMERA_FORWARD_OFFSET,
      y: 0,
      z: player.position.z + dir.z * CAMERA_FORWARD_OFFSET,
    };

    const forward = { x: dir.x, z: dir.z };
    const right = { x: forward.z, z: -forward.x };

    return { cameraPos, lookAt, forward, right };
  }

  _projectWorld(point, camera, W, H) {
    const relX = point.x - camera.cameraPos.x;
    const relZ = point.z - camera.cameraPos.z;

    const d = relX * camera.forward.x + relZ * camera.forward.z;
    if (d <= NEAR_CLIP || d > MAX_DRAW_DIST) return null;

    const lateral = relX * camera.right.x + relZ * camera.right.z;
    // Use a near-plane term so perspective can be stronger than the old PROJECTION_FOCAL/(PROJECTION_FOCAL+d) curve.
    const scale = PROJECTION_FOCAL / (PROJECTION_NEAR + d);

    const horizonY = H * HORIZON_FRAC;
    const baselineY = H * GROUND_FRAC;
    const groundY = horizonY + (baselineY - horizonY) * scale;

    return {
      sx: W * 0.5 + lateral * scale,
      sy: groundY - (point.y || 0) * scale,
      scale,
      d,
    };
  }

  render(gameState) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    // Compute frame delta for turn-snap animation (cap to 100 ms to avoid jumps).
    const now = performance.now();
    const frameDt = this._lastFrameTime > 0
      ? Math.min((now - this._lastFrameTime) / 1000, 0.1)
      : 0.016;
    this._lastFrameTime = now;

    this._time += 0.016;

    if (this._turnSnapTimer > 0) {
      this._turnSnapTimer = Math.max(0, this._turnSnapTimer - frameDt);
    }

    ctx.clearRect(0, 0, W, H);

    this.drawBackground(ctx, W, H);

    const inGame = gameState.state === 'running' || gameState.state === 'paused';
    if (inGame && gameState.player && gameState.track) {
      const camera = this._cameraFromPlayer(gameState.player);
      this.drawTrack(ctx, gameState.track, gameState.distance || 0, camera, W, H);

      if (gameState.obstacles) {
        const vis = gameState.obstacles.getVisible(gameState.distance || 0, MAX_DRAW_DIST);
        this.drawObstacles(ctx, vis, camera, W, H);
      }

      if (gameState.collectibles) {
        const vis = gameState.collectibles.getVisible(gameState.distance || 0, MAX_DRAW_DIST);
        this.drawCollectibles(ctx, vis, camera, W, H);
      }

      this.drawPlayer(ctx, gameState.player, camera, W, H);
    }

    if (inGame && gameState.player && gameState.track) {
      this.drawHUD(
        ctx,
        W,
        H,
        gameState.score || 0,
        gameState.stars || 0,
        gameState.speed || 0,
        gameState.player,
        gameState.activeUpgrades || [],
      );
    }

    if (gameState.effects) {
      for (const fx of gameState.effects) this.drawEffect(ctx, fx, W, H);
    }
  }

  drawBackground(ctx, W, H) {
    const horizonY = H * HORIZON_FRAC;

    const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
    sky.addColorStop(0, '#000010');
    sky.addColorStop(1, '#101038');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizonY);

    const ground = ctx.createLinearGradient(0, horizonY, 0, H);
    ground.addColorStop(0, '#06061a');
    ground.addColorStop(1, '#01010a');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this._time * s.spd + s.ph));
      ctx.globalAlpha = 0.25 + s.br * 0.75 * tw;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * horizonY, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawTrack(ctx, track, playerDistance, camera, W, H) {
    const phase = (this._time * 220) % STRIP_LEN;

    let relativeDistance = MAX_DRAW_DIST;
    while (relativeDistance >= -phase) {
      const d0 = Math.max(0, relativeDistance);
      const d1 = Math.max(0, relativeDistance + STRIP_LEN);
      const abs0 = playerDistance + d0;
      const abs1 = playerDistance + d1;

      const s0 = track.sampleByDistance(abs0, 0);
      const s1 = track.sampleByDistance(abs1, 0);

      const stripIndex = Math.floor(abs0 / STRIP_LEN);
      const color = stripIndex % 2 === 0 ? '#0a0a22' : '#06061a';

      if (s0.segment !== s1.segment) {
        // This strip straddles a corner – split it so each half stays within
        // its own segment, then fill the outer-elbow gap between them.
        const P   = s0.segment.end;
        const p2  = { x: -s1.segment.direction.z, z: s1.segment.direction.x };

        // Half that ends at the corner (uses s0's perp throughout)
        const sMid   = { center: { x: P.x, z: P.z }, perp: s0.perp };
        this._drawTrackQuad(ctx, s0, sMid, camera, W, H, color);

        // The outer-elbow square that neither half covers
        this._drawCornerFill(ctx, P, s0.perp, p2, camera, W, H, color);

        // Half that starts at the corner (uses s1's perp throughout)
        const sStart = { center: { x: P.x, z: P.z }, perp: p2 };
        this._drawTrackQuad(ctx, sStart, s1, camera, W, H, color);
      } else {
        this._drawTrackQuad(ctx, s0, s1, camera, W, H, color);
      }

      relativeDistance -= STRIP_LEN;
    }

    // Glowing edge lines with proper L-shaped elbows at every corner
    this._drawTrackEdge(ctx, track, playerDistance, camera, W, H);

    this._drawLaneDivider(ctx, track, playerDistance, camera, W, H, -LANE_WIDTH * 0.5);
    this._drawLaneDivider(ctx, track, playerDistance, camera, W, H, LANE_WIDTH * 0.5);
  }

  // Draws a single trapezoid strip between two sampled track cross-sections.
  _drawTrackQuad(ctx, s0, s1, camera, W, H, color) {
    const hw = TRACK_HALF_W;
    const l0 = { x: s0.center.x - s0.perp.x * hw, y: 0, z: s0.center.z - s0.perp.z * hw };
    const r0 = { x: s0.center.x + s0.perp.x * hw, y: 0, z: s0.center.z + s0.perp.z * hw };
    const l1 = { x: s1.center.x - s1.perp.x * hw, y: 0, z: s1.center.z - s1.perp.z * hw };
    const r1 = { x: s1.center.x + s1.perp.x * hw, y: 0, z: s1.center.z + s1.perp.z * hw };

    const pL0 = this._projectWorld(l0, camera, W, H);
    const pR0 = this._projectWorld(r0, camera, W, H);
    const pL1 = this._projectWorld(l1, camera, W, H);
    const pR1 = this._projectWorld(r1, camera, W, H);
    if (!pL0 || !pR0 || !pL1 || !pR1) return;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pL0.sx, pL0.sy);
    ctx.lineTo(pR0.sx, pR0.sy);
    ctx.lineTo(pR1.sx, pR1.sy);
    ctx.lineTo(pL1.sx, pL1.sy);
    ctx.closePath();
    ctx.fill();
  }

  // Fills the outer-elbow square that opens up at a 90-degree corner.
  // p1 = perp of the incoming segment, p2 = perp of the outgoing segment.
  // The quad is: P → (P - p1*hw) → (P - p1*hw - p2*hw) → (P - p2*hw)
  _drawCornerFill(ctx, P, p1, p2, camera, W, H, color) {
    const hw = TRACK_HALF_W;
    const ptP     = { x: P.x,                         y: 0, z: P.z };
    const ptL1    = { x: P.x - p1.x * hw,             y: 0, z: P.z - p1.z * hw };
    const ptElbow = { x: P.x - p1.x * hw - p2.x * hw, y: 0, z: P.z - p1.z * hw - p2.z * hw };
    const ptL2    = { x: P.x - p2.x * hw,             y: 0, z: P.z - p2.z * hw };

    const pP     = this._projectWorld(ptP,     camera, W, H);
    const pL1    = this._projectWorld(ptL1,    camera, W, H);
    const pElbow = this._projectWorld(ptElbow, camera, W, H);
    const pL2    = this._projectWorld(ptL2,    camera, W, H);
    if (!pP || !pL1 || !pElbow || !pL2) return;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pP.sx,     pP.sy);
    ctx.lineTo(pL1.sx,    pL1.sy);
    ctx.lineTo(pElbow.sx, pElbow.sy);
    ctx.lineTo(pL2.sx,    pL2.sy);
    ctx.closePath();
    ctx.fill();
  }

  // Draws both outer edge lines as glowing cyan paths with a proper L-shaped
  // elbow inserted at every corner within view.
  _drawTrackEdge(ctx, track, playerDistance, camera, W, H) {
    const hw   = TRACK_HALF_W;
    const segs = track.segments;

    for (const sign of [-1, 1]) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,210,255,0.82)';
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur  = 10;

      ctx.beginPath();
      let penDown = false;

      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (seg.endDistance < playerDistance ||
            seg.startDistance > playerDistance + MAX_DRAW_DIST) {
          penDown = false;
          continue;
        }

        const perp = { x: -seg.direction.z, z: seg.direction.x };
        const off  = hw * sign;

        // Start point: clamp to visible range
        const visStart   = Math.max(seg.startDistance, playerDistance);
        const localStart = visStart - seg.startDistance;
        const cStart     = {
          x: seg.position.x + seg.direction.x * localStart,
          z: seg.position.z + seg.direction.z * localStart,
        };
        const ptStart = { x: cStart.x + perp.x * off, y: 0, z: cStart.z + perp.z * off };

        // End point is always the segment's turn corner
        const ptEnd = { x: seg.end.x + perp.x * off, y: 0, z: seg.end.z + perp.z * off };

        const pStart = this._projectWorld(ptStart, camera, W, H);
        const pEnd   = this._projectWorld(ptEnd,   camera, W, H);

        if (!penDown) {
          if (pStart) { ctx.moveTo(pStart.sx, pStart.sy); penDown = true; }
        } else if (pStart) {
          ctx.lineTo(pStart.sx, pStart.sy);
        }
        if (pEnd && penDown) ctx.lineTo(pEnd.sx, pEnd.sy);
        if (!pEnd) penDown = false;

        // Insert the corner elbow so the edge bends at a right angle instead
        // of a diagonal.
        if (i + 1 < segs.length && penDown) {
          const seg2 = segs[i + 1];
          if (seg2.startDistance <= playerDistance + MAX_DRAW_DIST) {
            const p2      = { x: -seg2.direction.z, z: seg2.direction.x };
            const ptElbow = {
              x: seg.end.x + (perp.x + p2.x) * off,
              y: 0,
              z: seg.end.z + (perp.z + p2.z) * off,
            };
            const pElbow = this._projectWorld(ptElbow, camera, W, H);
            if (pElbow) ctx.lineTo(pElbow.sx, pElbow.sy);
          }
        }
      }

      ctx.stroke();
      ctx.restore();
    }
  }

  _drawLaneDivider(ctx, track, playerDistance, camera, W, H, laneOffset) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,180,220,0.30)';
    ctx.lineWidth = 1;

    const DASH = 70;
    const GAP = 60;
    const phase = (this._time * 220) % (DASH + GAP);

    let d = 0 - phase;
    while (d < MAX_DRAW_DIST) {
      const d0 = Math.max(0, d);
      const d1 = Math.min(MAX_DRAW_DIST, d + DASH);
      const a = track.sampleByDistance(playerDistance + d0, laneOffset);
      const b = track.sampleByDistance(playerDistance + d1, laneOffset);
      const p0 = this._projectWorld({ x: a.position.x, y: 0, z: a.position.z }, camera, W, H);
      const p1 = this._projectWorld({ x: b.position.x, y: 0, z: b.position.z }, camera, W, H);
      if (p0 && p1) {
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.stroke();
      }
      d += DASH + GAP;
    }

    ctx.restore();
  }

  drawObstacles(ctx, obstacles, camera, W, H) {
    const sorted = obstacles
      .map(o => ({ o, p: this._projectWorld({ x: o.x, y: 0, z: o.z }, camera, W, H) }))
      .filter(e => !!e.p)
      .sort((a, b) => b.p.d - a.p.d);

    for (const { o, p } of sorted) {
      ctx.save();
      switch (o.type) {
        case 'asteroid':
          this._drawAsteroid(ctx, p, o);
          break;
        case 'laser':
          this._drawLaser(ctx, o, camera, W, H);
          break;
        case 'tunnel':
          this._drawTunnel(ctx, o, camera, W, H);
          break;
        case 'gravityZone':
          this._drawZone(ctx, p, '#ff8c00', 0.3);
          break;
        case 'zeroGZone':
          this._drawZone(ctx, p, '#00e6c8', 0.25);
          break;
        case 'wormhole':
          this._drawWormhole(ctx, p, o);
          break;
      }
      ctx.restore();
    }
  }

  _drawAsteroid(ctx, proj, obs) {
    const r = obs.radius * proj.scale * 1.4;
    if (r < 1) return;
    const x = proj.sx;
    const y = proj.sy - r * 0.9;

    ctx.shadowColor = '#666';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#2a2a3a';
    ctx.strokeStyle = '#5a5a7a';
    ctx.lineWidth = Math.max(1, 2 * proj.scale);
    ctx.beginPath();
    const verts = obs.verts || Array(7).fill(1);
    for (let i = 0; i < verts.length; i++) {
      const angle = (i / verts.length) * Math.PI * 2 - Math.PI / 6;
      const rv = r * verts[i];
      if (i === 0) ctx.moveTo(x + Math.cos(angle) * rv, y + Math.sin(angle) * rv);
      else ctx.lineTo(x + Math.cos(angle) * rv, y + Math.sin(angle) * rv);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  _drawLaser(ctx, obs, camera, W, H) {
    const dir = obs.direction;
    const perp = { x: -dir.z, z: dir.x };
    const halfLateral = obs.lane === null ? TRACK_HALF_W : LANE_WIDTH * 0.5;
    const p1w = { x: obs.x - perp.x * halfLateral, y: 22, z: obs.z - perp.z * halfLateral };
    const p2w = { x: obs.x + perp.x * halfLateral, y: 22, z: obs.z + perp.z * halfLateral };

    const p1 = this._projectWorld(p1w, camera, W, H);
    const p2 = this._projectWorld(p2w, camera, W, H);
    if (!p1 || !p2) return;

    const lw = Math.max(2, 14 * Math.min(p1.scale, p2.scale));
    ctx.shadowColor = '#ff0044';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(255,0,68,0.35)';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();
  }

  _drawTunnel(ctx, obs, camera, W, H) {
    const dir = obs.direction;
    const perp = { x: -dir.z, z: dir.x };
    const TUNNEL_H = 110;

    for (let lane = -1; lane <= 1; lane++) {
      if (lane === obs.gapLane) continue;
      const laneCenter = lane * LANE_WIDTH;
      const halfLane = LANE_WIDTH * 0.5;

      const bl = { x: obs.x + perp.x * (laneCenter - halfLane), y: 0, z: obs.z + perp.z * (laneCenter - halfLane) };
      const br = { x: obs.x + perp.x * (laneCenter + halfLane), y: 0, z: obs.z + perp.z * (laneCenter + halfLane) };
      const tl = { x: bl.x, y: TUNNEL_H, z: bl.z };
      const tr = { x: br.x, y: TUNNEL_H, z: br.z };

      const pBL = this._projectWorld(bl, camera, W, H);
      const pBR = this._projectWorld(br, camera, W, H);
      const pTL = this._projectWorld(tl, camera, W, H);
      const pTR = this._projectWorld(tr, camera, W, H);
      if (!pBL || !pBR || !pTL || !pTR) continue;

      ctx.fillStyle = 'rgba(60,0,110,0.82)';
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(pBL.sx, pBL.sy);
      ctx.lineTo(pBR.sx, pBR.sy);
      ctx.lineTo(pTR.sx, pTR.sy);
      ctx.lineTo(pTL.sx, pTL.sy);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _drawZone(ctx, proj, color, alpha) {
    const w = LANE_WIDTH * proj.scale * 1.1;
    const h = 90 * proj.scale;
    if (w < 1 || h < 1) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(proj.sx - w * 0.5, proj.sy - h, w, h);
    ctx.restore();
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
      ctx.lineWidth = Math.max(1, 2 * proj.scale);
      ctx.beginPath();
      ctx.arc(x, y, ri, t, t + Math.PI * 1.6);
      ctx.stroke();
    }
  }

  drawCollectibles(ctx, items, camera, W, H) {
    const sorted = items
      .map(i => ({ i, p: this._projectWorld({ x: i.x, y: 50, z: i.z }, camera, W, H) }))
      .filter(e => !!e.p)
      .sort((a, b) => b.p.d - a.p.d);

    for (const { i: item, p: proj } of sorted) {
      const pulse = Math.sin(item.pulseTimer || 0) * 0.18 + 0.82;
      ctx.save();
      switch (item.type) {
        case 'energyCore':
          this._drawEnergyCore(ctx, proj, pulse);
          break;
        case 'shieldShard':
          this._drawShieldShard(ctx, proj, pulse);
          break;
        case 'slowdownOrb':
          this._drawSlowdownOrb(ctx, proj, pulse);
          break;
      }
      ctx.restore();
    }
  }

  _drawEnergyCore(ctx, proj, pulse) {
    const sz = 15 * pulse * proj.scale * 1.4;
    if (sz < 1) return;
    const x = proj.sx;
    const y = proj.sy - sz * 0.2; // float slightly above the projected ground point

    // Outer neon glow
    ctx.shadowColor = '#ffe040';
    ctx.shadowBlur = 30 * pulse * proj.scale;

    // Outer translucent diamond
    ctx.fillStyle = 'rgba(255,215,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(x,            y - sz * 1.15); // top
    ctx.lineTo(x + sz * 0.72, y);            // right
    ctx.lineTo(x,            y + sz * 1.15); // bottom
    ctx.lineTo(x - sz * 0.72, y);            // left
    ctx.closePath();
    ctx.fill();

    // Inner solid diamond
    ctx.shadowBlur = 14 * pulse * proj.scale;
    ctx.fillStyle = '#ffe040';
    ctx.beginPath();
    ctx.moveTo(x,            y - sz * 0.68);
    ctx.lineTo(x + sz * 0.44, y);
    ctx.lineTo(x,            y + sz * 0.68);
    ctx.lineTo(x - sz * 0.44, y);
    ctx.closePath();
    ctx.fill();

    // Bright center sparkle
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, sz * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawShieldShard(ctx, proj, pulse) {
    const sz = 11 * pulse * proj.scale * 1.4;
    if (sz < 1) return;
    const x = proj.sx, y = proj.sy;

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 16 * pulse * proj.scale;

    const w = sz * 1.3;
    const h = sz * 1.65;
    const top = y - h * 0.55;
    const bot = y + h * 0.45;

    // Shield outline path: flat top with rounded shoulders, pointed bottom
    ctx.fillStyle = 'rgba(0,210,255,0.88)';
    ctx.beginPath();
    ctx.moveTo(x, top);                       // top center
    ctx.lineTo(x + w * 0.5, top + h * 0.12); // top-right shoulder
    ctx.lineTo(x + w * 0.5, top + h * 0.5);  // right mid
    ctx.lineTo(x, bot);                       // bottom point
    ctx.lineTo(x - w * 0.5, top + h * 0.5);  // left mid
    ctx.lineTo(x - w * 0.5, top + h * 0.12); // top-left shoulder
    ctx.closePath();
    ctx.fill();

    // Inner highlight
    ctx.strokeStyle = 'rgba(180,255,255,0.55)';
    ctx.lineWidth = Math.max(1, sz * 0.13);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  _drawSlowdownOrb(ctx, proj, pulse) {
    const r = 10 * pulse * proj.scale * 1.4;
    if (r < 1) return;
    const x = proj.sx, y = proj.sy;

    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 14 * pulse * proj.scale;
    ctx.fillStyle = '#00dd77';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlayer(ctx, player, camera, W, H) {
    // Project the ground-level position (y=0) so the clamp gives a stable base Y.
    const basePoint = this._projectWorld({
      x: player.position.x,
      y: 0,
      z: player.position.z,
    }, camera, W, H);
    if (!basePoint) return;
    const playerScreenY = Math.min(basePoint.sy, H * PLAYER_SCREEN_Y_CLAMP_RATIO);
    // Apply jump height in screen space after clamping so it is always visible.
    const jumpOffset = player.getJumpHeight() * basePoint.scale;

    const scale = basePoint.scale * 0.7;
    const scaleY = player.ducking ? scale * 0.55 : scale;

    ctx.save();
    ctx.translate(basePoint.sx, playerScreenY - jumpOffset - 10 * scaleY);
    ctx.scale(scale, scaleY);

    const H2 = 18, H1 = -18;

    const eg = ctx.createRadialGradient(0, H2, 0, 0, H2 + 4, 22);
    eg.addColorStop(0, 'rgba(0,180,255,0.85)');
    eg.addColorStop(1, 'rgba(0,180,255,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, H2 + 4, 22, 0, Math.PI * 2);
    ctx.fill();

    const flameLen = 12 + 6 * Math.sin(Date.now() * 0.018);
    const fg = ctx.createLinearGradient(0, H2, 0, H2 + flameLen);
    fg.addColorStop(0, 'rgba(0,220,255,0.9)');
    fg.addColorStop(1, 'rgba(0,80,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-7, H2);
    ctx.lineTo(0, H2 + flameLen);
    ctx.lineTo(7, H2);
    ctx.closePath();
    ctx.fill();

    if (player.activeShield) {
      const sa = 0.45 + 0.3 * Math.sin(Date.now() * 0.006);
      ctx.strokeStyle = `rgba(0,255,255,${sa})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
    }

    const sg = ctx.createLinearGradient(0, H1, 0, H2);
    sg.addColorStop(0, '#00ffff');
    sg.addColorStop(1, '#0090cc');
    ctx.fillStyle = sg;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(0, H1);
    ctx.lineTo(13, H2);
    ctx.lineTo(5, H2 - 8);
    ctx.lineTo(0, H2);
    ctx.lineTo(-5, H2 - 8);
    ctx.lineTo(-13, H2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  drawHUD(ctx, W, H, score, stars, speed, player, activeUpgrades) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,20,0.72)';
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 1;
    const BOX_W = 190, BOX_H = 76;
    ctx.fillRect(10, 10, BOX_W, BOX_H);
    ctx.strokeRect(10, 10, BOX_W, BOX_H);

    ctx.font = '13px monospace';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#00d4ff';
    ctx.fillText(`SCORE  ${Math.floor(score).toLocaleString()}`, 20, 30);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`★  ${stars.toLocaleString()}`, 20, 48);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`SPEED  ${Math.floor(speed)} px/s`, 20, 66);
    ctx.restore();

    if (player) {
      ctx.save();
      const BX = W - 178, BY = 10;
      const BOX_W2 = 168;
      const BOX_H2 = 70;
      ctx.fillStyle = 'rgba(0,0,20,0.72)';
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1;
      ctx.fillRect(BX, BY, BOX_W2, BOX_H2);
      ctx.strokeRect(BX, BY, BOX_W2, BOX_H2);

      ctx.fillStyle = '#00ffff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('SHIELD SHARDS', BX + 8, BY + 20);

      // Shard count as number
      const shardCount = player.activeShield ? 3 : player.shieldShards;
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = shardCount > 0 ? '#00ffff' : '#334455';
      ctx.textAlign = 'right';
      ctx.fillText(`${shardCount} / 3`, BX + BOX_W2 - 8, BY + 20);
      ctx.textAlign = 'left';

      // Draw three shield icons
      for (let i = 0; i < 3; i++) {
        const sx = BX + 14 + i * 36;
        const sy = BY + 50;
        const filled = i < player.shieldShards || player.activeShield;
        const icolor = filled ? 'rgba(0,210,255,0.92)' : 'rgba(30,55,80,0.8)';
        const strokeC = filled ? 'rgba(160,255,255,0.6)' : 'rgba(60,100,130,0.5)';
        const sz2 = 11;
        const w2 = sz2 * 1.15;
        const h2 = sz2 * 1.45;
        const top2 = sy - h2 * 0.55;
        const bot2 = sy + h2 * 0.45;

        ctx.fillStyle = icolor;
        ctx.beginPath();
        ctx.moveTo(sx, top2);
        ctx.lineTo(sx + w2 * 0.5, top2 + h2 * 0.12);
        ctx.lineTo(sx + w2 * 0.5, top2 + h2 * 0.5);
        ctx.lineTo(sx, bot2);
        ctx.lineTo(sx - w2 * 0.5, top2 + h2 * 0.5);
        ctx.lineTo(sx - w2 * 0.5, top2 + h2 * 0.12);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = strokeC;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    if (activeUpgrades && activeUpgrades.length > 0) {
      ctx.save();
      const BH = 18 + activeUpgrades.length * 16 + 10;
      const BY = H - BH - 10;
      ctx.fillStyle = 'rgba(0,0,20,0.68)';
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1;
      ctx.fillRect(10, BY, 170, BH);
      ctx.strokeRect(10, BY, 170, BH);

      ctx.fillStyle = '#8b5cf6';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('UPGRADES', 18, BY + 14);

      activeUpgrades.forEach((u, i) => {
        ctx.fillStyle = '#9ab';
        ctx.fillText(`[${i + 1}] ${u.name} Lv${u.level}`, 18, BY + 28 + i * 16);
      });
      ctx.restore();
    }
  }

  drawEffect(ctx, fx, W, H) {
    if (!fx || fx.timer <= 0) return;
    const a = (fx.timer / fx.duration) * (fx.alpha || 0.5);
    ctx.fillStyle = `rgba(${fx.color},${Math.min(1, a)})`;
    ctx.fillRect(0, 0, W, H);
  }
}
