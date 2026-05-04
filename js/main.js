
const canvas   = document.getElementById('gameCanvas');
const economy  = new Economy();
const missions = new Missions();
const upgrades = new Upgrades();
const game     = new Game(canvas, economy, missions, upgrades);

game.init();
