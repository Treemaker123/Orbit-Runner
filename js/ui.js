export class UI {
  /**
   * @param {import('./economy.js').Economy}  economy
   * @param {import('./upgrades.js').Upgrades} upgrades
   * @param {import('./missions.js').Missions} missions
   */
  constructor(economy, upgrades, missions) {
    this.economy  = economy;
    this.upgrades = upgrades;
    this.missions = missions;

    this.overlay  = document.getElementById('ui-overlay');

    // ── Callback hooks (set by Game) ─────────────────────
    this.onPlayClick      = null;   // () => void
    this.onPreRunConfirm  = null;   // (selectedIds: string[]) => void
    this.onRevive         = null;   // () => void
    this.onPlayAgain      = null;   // () => void
    this.onResume         = null;   // () => void
    this.onQuitToMenu     = null;   // () => void

    this._screens         = {};
    this._preRunSelected  = [];

    this._build();
  }

  // ══════════════════════════════════════════════════════
  //  Build all screens
  // ══════════════════════════════════════════════════════

  _build() {
    this._screens.menu    = this._buildMenu();
    this._screens.preRun  = this._buildPreRun();
    this._screens.gameOver= this._buildGameOver();
    this._screens.pause   = this._buildPause();

    for (const s of Object.values(this._screens)) {
      this.overlay.appendChild(s);
    }
    this._hideAll();
  }

  _hideAll() {
    for (const s of Object.values(this._screens)) {
      s.classList.remove('active');
    }
  }

  // ── Menu ──────────────────────────────────────────────

  _buildMenu() {
    const el = this._el('div', 'screen menu-screen');

    const content = this._el('div', 'screen-content');
    content.innerHTML = `
      <div class="title">ORBIT RUNNER</div>
      <div class="subtitle">Navigate the Cosmic Track</div>
      <div class="info-row">
        <span id="menu-pb">BEST: 0</span>
        <span class="stars-display" id="menu-bal">★ 0</span>
      </div>
      <button class="btn btn-primary" id="btn-play">▶ PLAY  ( 500 ★ )</button>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-upgrades">⚡ UPGRADES</button>
        <button class="btn btn-secondary" id="btn-missions">📋 MISSIONS</button>
      </div>
      <div class="controls-overview">
        <h3>CONTROLS</h3>
        <div class="controls-grid">
          <div class="control-item"><span class="key">A / ◄</span> Lane left</div>
          <div class="control-item"><span class="key">D / ►</span> Lane right</div>
          <div class="control-item"><span class="key">W / ▲</span> Jump</div>
          <div class="control-item"><span class="key">S / ▼</span> Duck</div>
          <div class="control-item"><span class="key">Q</span> Turn left</div>
          <div class="control-item"><span class="key">E</span> Turn right</div>
          <div class="control-item"><span class="key">P / Esc</span> Pause</div>
          <div class="control-item"><span class="key">1 2 3</span> Upgrades</div>
        </div>
      </div>
    `;
    el.appendChild(content);

    // Upgrades modal
    this._upgradesModal = this._buildUpgradesModal();
    el.appendChild(this._upgradesModal);

    // Missions modal
    this._missionsModal = this._buildMissionsModal();
    el.appendChild(this._missionsModal);

    // Wire buttons — innerHTML already parsed, querySelector works immediately
    el.querySelector('#btn-play').addEventListener('click', () => {
      if (this.onPlayClick) this.onPlayClick();
    });
    el.querySelector('#btn-upgrades').addEventListener('click', () => {
      this._refreshUpgradesModal();
      this._upgradesModal.classList.add('active');
    });
    el.querySelector('#btn-missions').addEventListener('click', () => {
      this._refreshMissionsModal();
      this._missionsModal.classList.add('active');
    });

    return el;
  }

  // ── Upgrades modal ────────────────────────────────────

  _buildUpgradesModal() {
    const modal = this._el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">⚡ UPGRADES</div>
        <div class="stars-display" id="upg-bal">★ 0</div>
        <div id="upg-list"></div>
        <div id="upg-slots"></div>
        <button class="btn btn-secondary" id="upg-close" style="margin-top:8px;">✕ CLOSE</button>
      </div>
    `;
    // Wire close button — innerHTML already parsed
    modal.querySelector('#upg-close').addEventListener('click', () => {
      modal.classList.remove('active');
    });
    return modal;
  }

  _refreshUpgradesModal() {
    const modal = this._upgradesModal;
    modal.querySelector('#upg-bal').textContent = `★ ${this.economy.getBalance().toLocaleString()}`;

    // Upgrade list
    const list = modal.querySelector('#upg-list');
    list.innerHTML = '';
    for (const def of this.upgrades.getUpgradeDefs()) {
      const lv   = this.upgrades.getLevel(def.id);
      const cost = this.upgrades.getCostToUpgrade(def.id);
      const card = this._el('div', 'upgrade-shop-card');
      card.innerHTML = `
        <div class="upgrade-shop-name">${def.name}</div>
        <div class="upgrade-shop-level">Lv ${lv}/${def.maxLevel}</div>
        <div class="upgrade-shop-desc">${def.desc}</div>
      `;
      if (cost !== null) {
        const btn = this._el('button', 'upgrade-buy-btn');
        btn.textContent = `↑ ${cost} ★`;
        btn.addEventListener('click', () => {
          if (this.upgrades.upgrade(def.id, this.economy)) {
            this._refreshUpgradesModal();
            this._refreshMenuBalance();
          } else {
            btn.textContent = 'No ★!';
            setTimeout(() => { btn.textContent = `↑ ${cost} ★`; }, 900);
          }
        });
        card.appendChild(btn);
      } else {
        const span = this._el('span', '');
        span.style.cssText = 'color:#4a4;font-size:0.72rem;padding:4px 8px;';
        span.textContent   = 'MAX';
        card.appendChild(span);
      }
      list.appendChild(card);
    }

    // Slots section
    const slotDiv = modal.querySelector('#upg-slots');
    slotDiv.innerHTML = '';
    const slotCost = this.upgrades.getSlotUnlockCost();
    const curSlots = this.upgrades.getSlots();
    const info = this._el('div', 'control-item');
    info.style.marginTop = '8px';
    info.innerHTML = `<span class="key">SLOTS</span> ${curSlots} / 3`;
    slotDiv.appendChild(info);
    if (slotCost !== null) {
      const sb = this._el('button', 'btn btn-gold');
      sb.style.marginTop = '6px';
      sb.textContent     = `Unlock Slot  ${slotCost} ★`;
      sb.addEventListener('click', () => {
        if (this.upgrades.unlockSlot(this.economy)) {
          this._refreshUpgradesModal();
          this._refreshMenuBalance();
        } else {
          sb.textContent = 'Not enough ★';
          setTimeout(() => { sb.textContent = `Unlock Slot  ${slotCost} ★`; }, 900);
        }
      });
      slotDiv.appendChild(sb);
    }
  }

  // ── Missions modal ────────────────────────────────────

  _buildMissionsModal() {
    const modal = this._el('div', 'modal-overlay');
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">📋 MISSIONS</div>
        <div class="section-label">DAILY</div>
        <div id="miss-daily"></div>
        <div class="section-label" style="margin-top:8px;">GENERAL</div>
        <div id="miss-general"></div>
        <button class="btn btn-secondary" id="miss-close" style="margin-top:8px;">✕ CLOSE</button>
      </div>
    `;
    // Wire close button — innerHTML already parsed
    modal.querySelector('#miss-close').addEventListener('click', () => {
      modal.classList.remove('active');
    });
    return modal;
  }

  _refreshMissionsModal() {
    const daily   = this._missionsModal.querySelector('#miss-daily');
    const general = this._missionsModal.querySelector('#miss-general');
    daily.innerHTML   = '';
    general.innerHTML = '';

    const renderMission = (m, container) => {
      const pct  = Math.min(1, m.progress / m.target);
      const done = m.progress >= m.target;
      const card = this._el('div', 'mission-card');
      card.innerHTML = `
        <div class="mission-name">${m.name}</div>
        <div class="mission-desc">${m.desc}</div>
        <div class="mission-progress-bar">
          <div class="mission-progress-fill" style="width:${(pct * 100).toFixed(1)}%"></div>
        </div>
        <div class="mission-progress-text">
          <span>${m.progress} / ${m.target}</span>
          <span>Reward: ${m.reward} ★</span>
        </div>
      `;
      if (m.claimed) {
        const sp = this._el('span', 'mission-claimed');
        sp.textContent = '✓ Claimed';
        card.appendChild(sp);
      } else if (done) {
        const cb = this._el('button', 'mission-claim-btn');
        cb.textContent = `Claim  ${m.reward} ★`;
        cb.addEventListener('click', () => {
          const reward = this.missions.claimReward(m.id);
          if (reward > 0) {
            this.economy.earn(reward);
            this._refreshMissionsModal();
            this._refreshMenuBalance();
          }
        });
        card.appendChild(cb);
      }
      container.appendChild(card);
    };

    for (const m of this.missions.getDailyMissions())   renderMission(m, daily);
    for (const m of this.missions.getGeneralMissions()) renderMission(m, general);
  }

  // ── Pre-run ───────────────────────────────────────────

  _buildPreRun() {
    const el = this._el('div', 'screen pre-run-screen');
    const content = this._el('div', 'screen-content');
    content.style.maxWidth = '480px';
    content.innerHTML = `
      <div class="pre-run-title">SELECT UPGRADES</div>
      <div class="slots-info" id="pr-slots-info">Slots: 1</div>
      <div class="upgrade-list" id="pr-upgrade-list"></div>
      <button class="btn btn-primary" id="pr-confirm">▶ START RUN  ( 500 ★ )</button>
      <button class="btn btn-secondary" id="pr-cancel">✕ CANCEL</button>
    `;
    el.appendChild(content);

    el.querySelector('#pr-confirm').addEventListener('click', () => {
      if (this.onPreRunConfirm) this.onPreRunConfirm(this._preRunSelected);
    });
    el.querySelector('#pr-cancel').addEventListener('click', () => {
      this._hideAll();
      this.showMenu(this._lastPB || 0, this.economy.getBalance());
    });
    return el;
  }

  // ── Game-over ─────────────────────────────────────────

  _buildGameOver() {
    const el = this._el('div', 'screen game-over-screen');
    const content = this._el('div', 'screen-content');
    content.innerHTML = `
      <div class="pause-title" style="color:#ff4466">GAME OVER</div>
      <div class="game-over-reason" id="go-reason"></div>
      <div class="final-score" id="go-score">0</div>
      <div class="best-score"  id="go-best"></div>
      <div id="go-new-record" class="new-record" style="display:none">★ NEW RECORD ★</div>
      <div class="info-row">
        <span class="stars-display" id="go-bal">★ 0</span>
      </div>
      <button class="btn btn-gold"      id="go-revive"   style="display:none">♻ REVIVE  ( 1000 ★ )</button>
      <button class="btn btn-primary"   id="go-again">▶ PLAY AGAIN</button>
      <button class="btn btn-secondary" id="go-menu">⌂ MAIN MENU</button>
    `;
    el.appendChild(content);

    el.querySelector('#go-revive').addEventListener('click', () => {
      if (this.onRevive) this.onRevive();
    });
    el.querySelector('#go-again').addEventListener('click', () => {
      if (this.onPlayAgain) this.onPlayAgain();
    });
    el.querySelector('#go-menu').addEventListener('click', () => {
      if (this.onQuitToMenu) this.onQuitToMenu();
    });
    return el;
  }

  // ── Pause ─────────────────────────────────────────────

  _buildPause() {
    const el = this._el('div', 'screen pause-screen');
    const content = this._el('div', 'screen-content');
    content.innerHTML = `
      <div class="pause-title">PAUSED</div>
      <div class="subtitle">[ P / ESC to resume ]</div>
      <button class="btn btn-primary"   id="pause-resume">▶ RESUME</button>
      <button class="btn btn-secondary" id="pause-menu">⌂ QUIT TO MENU</button>
    `;
    el.appendChild(content);

    el.querySelector('#pause-resume').addEventListener('click', () => {
      if (this.onResume) this.onResume();
    });
    el.querySelector('#pause-menu').addEventListener('click', () => {
      if (this.onQuitToMenu) this.onQuitToMenu();
    });
    return el;
  }

  // ══════════════════════════════════════════════════════
  //  Public screen-management API
  // ══════════════════════════════════════════════════════

  showMenu(personalBest, balance) {
    this._lastPB = personalBest;
    this._hideAll();
    this._screens.menu.classList.add('active');
    this._refreshMenuBalance();
    const pbEl = this._screens.menu.querySelector('#menu-pb');
    if (pbEl) pbEl.textContent = `BEST: ${Math.floor(personalBest).toLocaleString()}`;
  }

  _refreshMenuBalance() {
    const el = this._screens.menu && this._screens.menu.querySelector('#menu-bal');
    if (el) el.textContent = `★ ${this.economy.getBalance().toLocaleString()}`;
  }

  /** Show upgrade-selection popup before a run starts. */
  showPreRun(allUpgrades, slots, previousSelected) {
    this._hideAll();
    this._screens.preRun.classList.add('active');

    this._preRunSelected = (previousSelected || []).filter(id =>
      allUpgrades.find(u => u.id === id && u.level > 0)
    );

    const slotsInfo = this._screens.preRun.querySelector('#pr-slots-info');
    if (slotsInfo) slotsInfo.textContent = `Choose up to ${slots} upgrade${slots > 1 ? 's' : ''}`;

    const list = this._screens.preRun.querySelector('#pr-upgrade-list');
    list.innerHTML = '';

    const unlockedUpgrades = allUpgrades.filter(u => u.level > 0);

    if (unlockedUpgrades.length === 0) {
      const msg = this._el('div', '');
      msg.style.cssText = 'color:#889;font-size:0.82rem;padding:12px 0;text-align:center;';
      msg.textContent   = 'No upgrades yet. Buy from the Upgrades menu.';
      list.appendChild(msg);
    } else {
      for (const upg of unlockedUpgrades) {
        const selected = this._preRunSelected.includes(upg.id);
        const card = this._el('div', `upgrade-card${selected ? ' selected' : ''}`);
        card.dataset.id = upg.id;
        card.innerHTML  = `
          <div class="upgrade-name">${upg.name}</div>
          <div class="upgrade-level">Lv ${upg.level}</div>
          <div class="upgrade-desc">${upg.desc}</div>
        `;
        card.addEventListener('click', () => this._togglePreRunUpgrade(upg.id, card, slots, list));
        list.appendChild(card);
      }
    }
  }

  _togglePreRunUpgrade(id, card, slots, list) {
    const idx = this._preRunSelected.indexOf(id);
    if (idx >= 0) {
      this._preRunSelected.splice(idx, 1);
      card.classList.remove('selected');
    } else {
      if (this._preRunSelected.length >= slots) {
        // Deselect oldest
        const evictId = this._preRunSelected.shift();
        list.querySelectorAll('.upgrade-card').forEach(c => {
          if (c.dataset.id === evictId) c.classList.remove('selected');
        });
      }
      this._preRunSelected.push(id);
      card.classList.add('selected');
    }
  }

  /** Hide all overlays so only the canvas (and HUD drawn on it) is visible. */
  showHUD() {
    this._hideAll();
  }

  /** Called every frame — no DOM updates here (HUD is canvas-drawn). */
  updateHUD(_score, _stars, _speed, _shieldInfo, _turnWarning, _activeUpgrades) {
    // All HUD rendering is done on the canvas by Renderer.drawHUD().
  }

  showGameOver(finalScore, personalBest, canRevive, reviveCost, stars, reason) {
    this._hideAll();
    this._screens.gameOver.classList.add('active');

    const go = this._screens.gameOver;
    go.querySelector('#go-reason').textContent = reason || '';
    go.querySelector('#go-score').textContent  = Math.floor(finalScore).toLocaleString();
    go.querySelector('#go-bal').textContent    = `★ ${stars.toLocaleString()}`;

    const isNewRecord = finalScore > 0 && finalScore >= personalBest;
    const newRecEl    = go.querySelector('#go-new-record');
    const bestEl      = go.querySelector('#go-best');
    newRecEl.style.display = isNewRecord ? 'block' : 'none';
    bestEl.textContent     = `BEST: ${Math.floor(personalBest).toLocaleString()}`;

    const revBtn = go.querySelector('#go-revive');
    revBtn.style.display = canRevive ? 'block' : 'none';
    revBtn.textContent   = `♻ REVIVE  ( ${reviveCost} ★ )`;
  }

  showPause() {
    this._screens.pause.classList.add('active');
  }

  hidePause() {
    this._screens.pause.classList.remove('active');
  }

  // ══════════════════════════════════════════════════════
  //  Helpers
  // ══════════════════════════════════════════════════════

  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
