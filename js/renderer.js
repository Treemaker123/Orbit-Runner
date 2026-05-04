const TRACK_WIDTH = 240;
const LANE_WIDTH  = 80;

export class Renderer {
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
      y:    Math.random(),
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

  // ── Main entry ─────────────────────────────────────────────────────────────

  render(gameState) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const trackX = (W - TRACK_WIDTH) / 2;

    this._time += 0.016;

    ctx.clearRect(0, 0, W, H);

    this.drawBackground(ctx, W, H);
    this.drawTrack(ctx, W, H, trackX);

    const inGame = gameState.state === 'running' || gameState.state === 'paused';

    if (inGame) {
      const scroll     = gameState.track ? gameState.track.getScrollOffset() : 0;
      const playerSY   = H * 0.82;
      const tw         = gameState.turnWarning || null;

      // Turn indicator on the track surface
      if (tw) {
        const sy    = playerSY - tw.distance;
        const pulse = tw.inZone ? 1 : 0.55 + 0.45 * Math.sin(Date.now() * 0.007);
        this.drawTurnIndicator(ctx, trackX, sy, tw.direction, pulse);
      }

      // Obstacles
      if (gameState.obstacles) {
        const vis = gameState.obstacles.getVisible(scroll, H);
        this.drawObstacles(ctx, vis, trackX, scroll, H);
      }

      // Collectibles
      if (gameState.collectibles) {
        const vis = gameState.collectibles.getVisible(scroll, H);
        this.drawCollectibles(ctx, vis, trackX, scroll, H);
      }

      // Player
      if (gameState.player) {
        this.drawPlayer(ctx, gameState.player, trackX, H, W);
      }

      // HUD
      this.drawHUD(
        ctx, W, H,
        gameState.score   || 0,
        gameState.stars   || 0,
        gameState.speed   || 0,
        gameState.player,
        tw,
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
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#000012');
    g.addColorStop(1, '#000825');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this._time * s.spd + s.ph));
      ctx.globalAlpha = 0.25 + s.br * 0.75 * tw;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ── Track ──────────────────────────────────────────────────────────────────

  drawTrack(ctx, W, H, trackX) {
    // Track floor
    ctx.fillStyle = '#08081e';
    ctx.fillRect(trackX, 0, TRACK_WIDTH, H);

    // Subtle edge glow strips
    const leftGlow = ctx.createLinearGradient(trackX, 0, trackX + 18, 0);
    leftGlow.addColorStop(0, 'rgba(0,212,255,0.18)');
    leftGlow.addColorStop(1, 'rgba(0,212,255,0)');
    ctx.fillStyle = leftGlow;
    ctx.fillRect(trackX, 0, 18, H);

    const rightGlow = ctx.createLinearGradient(trackX + TRACK_WIDTH - 18, 0, trackX + TRACK_WIDTH, 0);
    rightGlow.addColorStop(0, 'rgba(0,212,255,0)');
    rightGlow.addColorStop(1, 'rgba(0,212,255,0.18)');
    ctx.fillStyle = rightGlow;
    ctx.fillRect(trackX + TRACK_WIDTH - 18, 0, 18, H);

    // Track border
    ctx.save();
    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.moveTo(trackX, 0); ctx.lineTo(trackX, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(trackX + TRACK_WIDTH, 0); ctx.lineTo(trackX + TRACK_WIDTH, H);
    ctx.stroke();
    ctx.restore();

    // Lane dividers (dashed)
    ctx.save();
    ctx.strokeStyle = 'rgba(0,180,220,0.28)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([22, 16]);
    for (let i = 1; i < 3; i++) {
      const lx = trackX + i * LANE_WIDTH;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Turn indicator ──────────────────────────────────────────────────────────

  drawTurnIndicator(ctx, trackX, screenY, direction, alpha) {
    if (screenY < -60 || screenY > this.canvas.height + 60) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);

    const cx   = trackX + TRACK_WIDTH / 2;
    const col  = direction === 'left' ? '#8b5cf6' : '#00ffff';
    const colR = direction === 'left' ? '139,92,246' : '0,255,255';

    // Band across the track
    const band = ctx.createLinearGradient(trackX, 0, trackX + TRACK_WIDTH, 0);
    if (direction === 'left') {
      band.addColorStop(0, `rgba(${colR},0.35)`);
      band.addColorStop(1, `rgba(${colR},0.04)`);
    } else {
      band.addColorStop(0, `rgba(${colR},0.04)`);
      band.addColorStop(1, `rgba(${colR},0.35)`);
    }
    ctx.fillStyle = band;
    ctx.fillRect(trackX, screenY - 42, TRACK_WIDTH, 84);

    // Arrow
    ctx.strokeStyle = col;
    ctx.fillStyle   = col;
    ctx.lineWidth   = 3;
    ctx.shadowColor = col;
    ctx.shadowBlur  = 18;

    const tip  = direction === 'left' ? trackX + 28          : trackX + TRACK_WIDTH - 28;
    const tail = direction === 'left' ? trackX + TRACK_WIDTH - 28 : trackX + 28;
    const hw   = 20; // arrowhead half-width

    ctx.beginPath();
    ctx.moveTo(tail, screenY);
    ctx.lineTo(tip,  screenY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tip, screenY);
    ctx.lineTo(tip + (direction === 'left' ? hw : -hw), screenY - hw);
    ctx.lineTo(tip + (direction === 'left' ? hw : -hw), screenY + hw);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 13px monospace';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `TURN ${direction.toUpperCase()}  [${direction === 'left' ? 'Q' : 'E'}]`,
      cx, screenY - 46,
    );
    ctx.textBaseline = 'alphabetic';

    ctx.restore();
  }

  // ── Obstacles ──────────────────────────────────────────────────────────────

  drawObstacles(ctx, obstacles, trackX, scrollOffset, canvasH) {
    const playerSY = canvasH * 0.82;
    for (const obs of obstacles) {
      const sy  = playerSY - (obs.y - scrollOffset);
      const lx  = obs.lane >= 0
        ? trackX + obs.lane * LANE_WIDTH + LANE_WIDTH / 2
        : trackX + TRACK_WIDTH / 2;
      ctx.save();
      switch (obs.type) {
        case 'asteroid':    this._drawAsteroid(ctx, lx, sy, obs); break;
        case 'laser':       this._drawLaser(ctx, trackX, sy, obs); break;
        case 'tunnel':      this._drawTunnel(ctx, trackX, sy, obs); break;
        case 'gravityZone': this._drawGravityZone(ctx, lx, sy, obs); break;
        case 'zeroGZone':   this._drawZeroGZone(ctx, trackX, sy, obs); break;
        case 'wormhole':    this._drawWormhole(ctx, lx, sy, obs); break;
      }
      ctx.restore();
    }
  }

  _drawAsteroid(ctx, x, y, obs) {
    const r = obs.radius;
    ctx.shadowColor = '#666';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = '#2a2a3a';
    ctx.strokeStyle = '#5a5a7a';
    ctx.lineWidth   = 2;
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
    // Crater
    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#1a1a2a';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.22, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y + r * 0.15, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawLaser(ctx, trackX, y, obs) {
    const x1 = obs.lane === -1 ? trackX                     : trackX + obs.lane * LANE_WIDTH;
    const x2 = obs.lane === -1 ? trackX + TRACK_WIDTH       : x1 + LANE_WIDTH;
    ctx.shadowColor = '#ff0044';
    ctx.shadowBlur  = 22;
    // Outer glow
    ctx.strokeStyle = 'rgba(255,0,68,0.35)';
    ctx.lineWidth   = 14;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    // Core beam
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth   = 3;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    // Bright centre
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
    // End caps
    ctx.fillStyle = '#ff0044';
    ctx.beginPath(); ctx.arc(x1, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y, 5, 0, Math.PI * 2); ctx.fill();
  }

  _drawTunnel(ctx, trackX, y, obs) {
    const h = obs.height;
    // Blocked lanes
    for (let l = 0; l < 3; l++) {
      if (l === obs.gapLane) continue;
      ctx.fillStyle   = 'rgba(60,0,110,0.82)';
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur  = 12;
      ctx.fillRect(trackX + l * LANE_WIDTH, y - h / 2, LANE_WIDTH, h);
    }
    // Outer border
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth   = 2;
    ctx.shadowColor = '#8b5cf6';
    ctx.shadowBlur  = 16;
    ctx.strokeRect(trackX, y - h / 2, TRACK_WIDTH, h);
    // Gap lane tint
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(0,255,255,0.07)';
    ctx.fillRect(trackX + obs.gapLane * LANE_WIDTH, y - h / 2, LANE_WIDTH, h);
    // DUCK label
    ctx.fillStyle   = '#ffff44';
    ctx.font        = 'bold 11px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('DUCK', trackX + obs.gapLane * LANE_WIDTH + LANE_WIDTH / 2, y + 4);
  }

  _drawGravityZone(ctx, x, y, obs) {
    const w = LANE_WIDTH, h = obs.height;
    const g = ctx.createLinearGradient(x - w / 2, y - h / 2, x - w / 2, y + h / 2);
    g.addColorStop(0, 'rgba(255,140,0,0)');
    g.addColorStop(0.5, 'rgba(255,140,0,0.35)');
    g.addColorStop(1, 'rgba(255,140,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = 'rgba(255,160,0,0.85)';
    ctx.font      = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GRAVITY', x, y + 4);
  }

  _drawZeroGZone(ctx, trackX, y, obs) {
    const h = obs.height;
    ctx.fillStyle = 'rgba(0,230,200,0.08)';
    ctx.fillRect(trackX, y - h / 2, TRACK_WIDTH, h);
    ctx.strokeStyle = 'rgba(0,230,200,0.45)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(trackX, y - h / 2, TRACK_WIDTH, h);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,230,200,0.85)';
    ctx.font      = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ZERO-G', trackX + TRACK_WIDTH / 2, y + 4);
  }

  _drawWormhole(ctx, x, y, obs) {
    const r   = obs.radius;
    const t   = Date.now() * 0.0022;
    for (let i = 5; i >= 1; i--) {
      const ri = r * (i / 5);
      ctx.strokeStyle = `rgba(139,92,246,${0.15 + i * 0.14})`;
      ctx.lineWidth   = 2;
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur  = 8;
      ctx.beginPath();
      ctx.arc(x, y, ri, t, t + Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = '#120020';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Collectibles ───────────────────────────────────────────────────────────

  drawCollectibles(ctx, items, trackX, scrollOffset, canvasH) {
    const playerSY = canvasH * 0.82;
    for (const item of items) {
      const sy  = playerSY - (item.y - scrollOffset);
      const x   = trackX + item.lane * LANE_WIDTH + LANE_WIDTH / 2;
      const pls = Math.sin(item.pulseTimer || 0) * 0.18 + 0.82;
      ctx.save();
      switch (item.type) {
        case 'energyCore':  this._drawEnergyCore(ctx, x, sy, pls); break;
        case 'shieldShard': this._drawShieldShard(ctx, x, sy, pls); break;
        case 'slowdownOrb': this._drawSlowdownOrb(ctx, x, sy, pls); break;
      }
      ctx.restore();
    }
  }

  _drawEnergyCore(ctx, x, y, pulse) {
    const r = 11 * pulse;
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur  = 22 * pulse;
    // Outer ring
    ctx.strokeStyle = `rgba(255,215,0,${0.28 * pulse})`;
    ctx.lineWidth   = 7;
    ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
    // Core gradient
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0,   '#ffffff');
    g.addColorStop(0.3, '#ffe066');
    g.addColorStop(1,   '#ff8800');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  _drawShieldShard(ctx, x, y, pulse) {
    const sz = 11 * pulse;
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur  = 14 * pulse;
    ctx.fillStyle   = 'rgba(0,255,255,0.8)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
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

  _drawSlowdownOrb(ctx, x, y, pulse) {
    const r = 10 * pulse;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur  = 14 * pulse;
    ctx.strokeStyle = `rgba(0,255,136,${0.38 * pulse})`;
    ctx.lineWidth   = 6;
    ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle   = '#00dd77';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle      = '#000';
    ctx.font           = 'bold 9px monospace';
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'middle';
    ctx.fillText('S', x, y);
    ctx.textBaseline   = 'alphabetic';
  }

  // ── Player ─────────────────────────────────────────────────────────────────

  drawPlayer(ctx, player, trackX, canvasH, canvasW) {
    const x     = player.getX(canvasW);
    const y     = player.getVisualY(canvasH);
    const scale = player.getScale();

    ctx.save();
    ctx.translate(x, y);
    const scaleY = player.ducking ? scale * 0.55 : scale;
    ctx.scale(scale, scaleY);

    const H2 = 18, H1 = -18; // half-heights

    // Engine glow
    const eg = ctx.createRadialGradient(0, H2, 0, 0, H2 + 4, 22);
    eg.addColorStop(0, 'rgba(0,180,255,0.85)');
    eg.addColorStop(1, 'rgba(0,180,255,0)');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, H2 + 4, 22, 0, Math.PI * 2);
    ctx.fill();

    // Animated engine flame
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
    ctx.moveTo(0,      H1);          // nose
    ctx.lineTo(13,     H2);          // right wing tip
    ctx.lineTo(5,      H2 - 8);      // right inner
    ctx.lineTo(0,      H2);          // tail centre
    ctx.lineTo(-5,     H2 - 8);      // left inner
    ctx.lineTo(-13,    H2);          // left wing tip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Wing detail lines
    ctx.shadowBlur  = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, H1 + 8); ctx.lineTo(9, H2 - 2);
    ctx.moveTo(0, H1 + 8); ctx.lineTo(-9, H2 - 2);
    ctx.stroke();

    ctx.restore();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  drawHUD(ctx, W, H, score, stars, speed, player, turnWarning, activeUpgrades) {
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
        ctx.fillText(`${t.toFixed(1)}s`, BX + 8, BY + 55); // BY+55 = bottom third of the 62px-tall shield HUD box
      }
      ctx.restore();
    }

    // ── Turn warning banner (bottom-centre) ───────────────
    if (turnWarning) {
      ctx.save();
      const wa  = turnWarning.inZone ? 1 : 0.55 + 0.45 * Math.sin(Date.now() * 0.008);
      const BW  = 290, BH = 52;
      const BX  = (W - BW) / 2;
      const BY  = H - 130;
      const col = turnWarning.direction === 'left' ? '139,92,246' : '0,255,255';

      ctx.fillStyle   = `rgba(${col},${0.25 * wa})`;
      ctx.strokeStyle = `rgba(${col},${wa})`;
      ctx.lineWidth   = 2;
      ctx.fillRect(BX, BY, BW, BH);
      ctx.strokeRect(BX, BY, BW, BH);

      ctx.globalAlpha  = wa;
      ctx.fillStyle    = '#ffffff';
      ctx.font         = `bold ${turnWarning.inZone ? 21 : 17}px monospace`;
      ctx.textAlign    = 'center';
      const key   = turnWarning.direction === 'left' ? 'Q' : 'E';
      const arrow = turnWarning.direction === 'left' ? '◄' : '►';
      ctx.fillText(
        `${arrow} TURN ${turnWarning.direction.toUpperCase()} [${key}] ${arrow}`,
        W / 2, BY + 33,
      );
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
