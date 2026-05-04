class Economy {
  constructor() {
    this.entryFee = 500;
    this.reviveCost = 1000;
    this.balance = 5000;
    this._load();
  }

  _load() {
    try {
      const saved = localStorage.getItem('orbit_stars');
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (!isNaN(val)) this.balance = val;
      }
    } catch (_) {}
  }

  save() {
    try {
      localStorage.setItem('orbit_stars', String(this.balance));
    } catch (_) {}
  }

  getBalance() { return this.balance; }

  canAfford(amt) { return this.balance >= amt; }

  spend(amt) {
    if (!this.canAfford(amt)) return false;
    this.balance -= amt;
    this.save();
    return true;
  }

  earn(amt) {
    this.balance += Math.floor(amt);
    this.save();
  }

  refillToMinimum(minBalance) {
    const target = Math.max(0, Math.floor(minBalance));
    if (this.balance >= target) return false;
    this.balance = target;
    this.save();
    return true;
  }
}
