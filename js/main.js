import { Economy  } from './economy.js';
import { Missions } from './missions.js';
import { Upgrades } from './upgrades.js';
import { Game     } from './game.js';

const canvas   = document.getElementById('gameCanvas');
const economy  = new Economy();
const missions = new Missions();
const upgrades = new Upgrades();
const game     = new Game(canvas, economy, missions, upgrades);

game.init();
