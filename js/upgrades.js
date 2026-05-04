const UPGRADE_DEFS = [
  {
    id: 'magnet',
    name: 'Magnet',
    desc: 'Attract cores from adjacent lanes',
    maxLevel: 5,
    costs: [300, 500, 800, 1200, 2000],
  },
  {
    id: 'shield',
    name: 'Shield',
    desc: 'Start each run with an energy shield',
    maxLevel: 3,
    costs: [500, 1000, 2000],
  },
  {
    id: 'slowdown',
    name: 'Slowdown',
    desc: 'Slowdown orbs last longer',
    maxLevel: 4,
    costs: [400, 700, 1100, 1800],
  },
  {
    id: 'coreMultiplier',
    name: 'Core Boost',
    desc: 'Energy cores give bonus points',
    maxLevel: 5,
    costs: [300, 600, 1000, 1500, 2500],
  },
  {
    id: 'momentumControl',
    name: 'Momentum',
    desc: 'Wider turn detection window',
    maxLevel: 3,
    costs: [600, 1200, 2500],
  },
  {
    id: 'autoDodge',
    name: 'Auto Dodge',
    desc: 'Chance to auto-dodge obstacles',
    maxLevel: 3,
    costs: [800, 1600, 3000],
  },
];

class Upgrades {
  constructor() {
    this.levels = {};
    this.slots = 1;
    this.selectedUpgrades = [];
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem('orbit_upgrades');
      if (raw) {
        const d = JSON.parse(raw);
        this.levels            = d.levels   || {};
        this.selectedUpgrades  = d.selected || [];
      }
    } catch (_) {}
    try {
      const s = localStorage.getItem('orbit_slots');
      if (s !== null) this.slots = Math.max(1, parseInt(s, 10) || 1);
    } catch (_) {}
  }

  _save() {
    try {
      localStorage.setItem('orbit_upgrades', JSON.stringify({
        levels:   this.levels,
        selected: this.selectedUpgrades,
      }));
    } catch (_) {}
    try {
      localStorage.setItem('orbit_slots', String(this.slots));
    } catch (_) {}
  }

  getUpgradeDefs() { return UPGRADE_DEFS; }

  getLevel(id) { return this.levels[id] || 0; }

  getUpgradeDef(id) { return UPGRADE_DEFS.find(d => d.id === id) || null; }

  /** Cost to bring id to (currentLevel + 1), or null if maxed / unknown. */
  getCostToUpgrade(id) {
    const def = this.getUpgradeDef(id);
    if (!def) return null;
    const lv = this.getLevel(id);
    if (lv >= def.maxLevel) return null;
    return def.costs[lv];
  }

  /** Spend from economy and level up. Returns true on success. */
  upgrade(id, economy) {
    const cost = this.getCostToUpgrade(id);
    if (cost === null) return false;
    if (!economy.spend(cost)) return false;
    this.levels[id] = (this.levels[id] || 0) + 1;
    this._save();
    return true;
  }

  getSlots() { return this.slots; }

  getSlotUnlockCost() {
    if (this.slots === 1) return 2000;
    if (this.slots === 2) return 4000;
    return null;
  }

  unlockSlot(economy) {
    const cost = this.getSlotUnlockCost();
    if (cost === null) return false;
    if (!economy.spend(cost)) return false;
    this.slots++;
    this._save();
    return true;
  }

  /** Set which upgrades will be active for the next run. */
  selectForRun(upgradeIds) {
    this.selectedUpgrades = upgradeIds
      .slice(0, this.slots)
      .filter(id => this.getLevel(id) > 0);
    this._save();
  }

  /** Returns enriched upgrade objects for the active run. */
  getRunUpgrades() {
    return this.selectedUpgrades
      .map(id => {
        const def = this.getUpgradeDef(id);
        if (!def) return null;
        return { ...def, level: this.getLevel(id) };
      })
      .filter(Boolean);
  }
}
