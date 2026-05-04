const DAILY_TEMPLATES = [
  {
    type: 'cores',
    name: 'Core Collector',
    desc: 'Collect {n} energy cores in a single run',
    targets: [10, 20, 40],
    reward: 200,
  },
  {
    type: 'distance',
    name: 'Distance Runner',
    desc: 'Travel {n} metres in a single run',
    targets: [500, 1200, 2500],
    reward: 250,
  },
  {
    type: 'turns',
    name: 'Turn Master',
    desc: 'Complete {n} turns successfully',
    targets: [3, 6, 12],
    reward: 300,
  },
];

const GENERAL_DEFS = [
  { id: 'g_first',   name: 'First Flight',   desc: 'Complete your first run',                 type: 'runs',     target: 1,     reward: 500  },
  { id: 'g_cores',   name: 'Core Hoarder',   desc: 'Collect 100 energy cores total',          type: 'cores',    target: 100,   reward: 1000 },
  { id: 'g_dist',    name: 'Long Haul',      desc: 'Travel 5 000 m total',                    type: 'distance', target: 5000,  reward: 1500 },
  { id: 'g_turns',   name: 'Turn Veteran',   desc: 'Complete 50 turns total',                 type: 'turns',    target: 50,    reward: 2000 },
  { id: 'g_speed',   name: 'Speed Demon',    desc: 'Reach maximum speed in a run',            type: 'maxSpeed', target: 1,     reward: 3000 },
  { id: 'g_rich',    name: 'Rich Pilot',     desc: 'Accumulate 10 000 ★ at once',            type: 'stars',    target: 10000, reward: 500  },
];

class Missions {
  constructor() {
    this.dailyDate = '';
    this.dailyMissions = [];
    this.generalProgress = {};
    this.generalClaimed = {};
    this._load();
    this._checkDailyReset();
  }

  _load() {
    try {
      const raw = localStorage.getItem('orbit_daily');
      if (raw) {
        const d = JSON.parse(raw);
        this.dailyDate = d.date || '';
        this.dailyMissions = d.missions || [];
      }
    } catch (_) {}
    try {
      const raw = localStorage.getItem('orbit_general_progress');
      if (raw) {
        const d = JSON.parse(raw);
        this.generalProgress = d.progress || {};
        this.generalClaimed  = d.claimed  || {};
      }
    } catch (_) {}
  }

  _save() {
    try {
      localStorage.setItem('orbit_daily', JSON.stringify({
        date: this.dailyDate,
        missions: this.dailyMissions,
      }));
    } catch (_) {}
    try {
      localStorage.setItem('orbit_general_progress', JSON.stringify({
        progress: this.generalProgress,
        claimed:  this.generalClaimed,
      }));
    } catch (_) {}
  }

  _checkDailyReset() {
    const today = new Date().toDateString();
    if (this.dailyDate !== today) {
      this.dailyDate = today;
      this._generateDailyMissions();
    }
  }

  _generateDailyMissions() {
    this.dailyMissions = DAILY_TEMPLATES.map((t, i) => {
      const n = t.targets[Math.floor(Math.random() * t.targets.length)];
      return {
        id: `d${i}`,
        name: t.name,
        desc: t.desc.replace('{n}', n),
        type: t.type,
        target: n,
        progress: 0,
        claimed: false,
        reward: t.reward,
      };
    });
    this._save();
  }

  /** Called after each run with cumulative run stats. */
  updateRunStats(stats) {
    // Daily missions – progress resets each day but accumulates within the day
    for (const m of this.dailyMissions) {
      if (m.claimed) continue;
      let add = 0;
      if (m.type === 'cores')    add = stats.cores    || 0;
      if (m.type === 'distance') add = Math.floor(stats.distance || 0);
      if (m.type === 'turns')    add = stats.turns    || 0;
      m.progress = Math.min(m.target, m.progress + add);
    }
    // General missions – accumulate forever
    for (const def of GENERAL_DEFS) {
      if (this.generalClaimed[def.id]) continue;
      const cur = this.generalProgress[def.id] || 0;
      let add = 0;
      if (def.type === 'runs')     add = 1;
      if (def.type === 'cores')    add = stats.cores    || 0;
      if (def.type === 'distance') add = Math.floor(stats.distance || 0);
      if (def.type === 'turns')    add = stats.turns    || 0;
      if (def.type === 'maxSpeed' && stats.maxSpeedReached) add = 1;
      this.generalProgress[def.id] = Math.min(def.target, cur + add);
    }
    this._save();
  }

  /** Called with current balance so the stars mission can be checked. */
  updateStarsProgress(balance) {
    for (const def of GENERAL_DEFS) {
      if (def.type === 'stars' && !this.generalClaimed[def.id]) {
        this.generalProgress[def.id] = Math.min(def.target, balance);
      }
    }
    this._save();
  }

  getDailyMissions() {
    return this.dailyMissions.map(m => ({ ...m }));
  }

  getGeneralMissions() {
    return GENERAL_DEFS.map(def => ({
      ...def,
      progress: this.generalProgress[def.id] || 0,
      claimed:  this.generalClaimed[def.id]  || false,
    }));
  }

  /**
   * Mark mission as claimed.
   * @returns {number} reward amount, or 0 if not claimable.
   */
  claimReward(missionId) {
    // Check daily
    const dm = this.dailyMissions.find(m => m.id === missionId);
    if (dm && !dm.claimed && dm.progress >= dm.target) {
      dm.claimed = true;
      this._save();
      return dm.reward;
    }
    // Check general
    const gdef = GENERAL_DEFS.find(d => d.id === missionId);
    if (gdef && !this.generalClaimed[missionId]) {
      const prog = this.generalProgress[missionId] || 0;
      if (prog >= gdef.target) {
        this.generalClaimed[missionId] = true;
        this._save();
        return gdef.reward;
      }
    }
    return 0;
  }
}
