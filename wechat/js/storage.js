// storage.js - WeChat localStorage wrapper and persistence

function load(key, def) {
  try { let v = wx.getStorageSync(key); return v ? (typeof def === 'object' ? {...def, ...JSON.parse(v)} : JSON.parse(v)) : def; }
  catch(e) { return def; }
}
function save(key, val) { try { wx.setStorageSync(key, JSON.stringify(val)); } catch(e) {} }

let metaStats = {totalKills:0,totalBossKills:0,bestTime:0,soulStones:0,prestigeLevel:0};
let permLevels = {permHp:0,permDmg:0,permSpd:0,permCrit:0,permArmor:0,permRegen:0};
let gameSettings = {screenShake:'med',damageNumbers:true,minimap:true};
let unlockedAchievements = [];

function loadAll() {
  metaStats = load('rl_meta', metaStats);
  permLevels = load('rl_perms', permLevels);
  gameSettings = load('rl_settings', gameSettings);
  try { unlockedAchievements = JSON.parse(wx.getStorageSync('rl_achievements') || '[]'); } catch(e) { unlockedAchievements = []; }
}
function saveMeta() { save('rl_meta', metaStats); }
function savePerms() { save('rl_perms', permLevels); }
function saveSettings() { save('rl_settings', gameSettings); }
function saveAchievements() { save('rl_achievements', unlockedAchievements); }

function loadHistory() { try { return JSON.parse(wx.getStorageSync('rl_history') || '[]'); } catch(e) { return []; } }
function saveHistory(run) { let h = loadHistory(); h.unshift(run); if(h.length>10)h.length=10; save('rl_history', h); }
function loadBests() { try { return JSON.parse(wx.getStorageSync('rl_bests') || '{}'); } catch(e) { return {}; } }
function saveBest(role, time, kills, level) {
  let b = loadBests();
  if(!b[role] || time > b[role].time) { b[role] = {time, kills, level}; save('rl_bests', b); }
}

loadAll();

module.exports = {
  metaStats, permLevels, gameSettings, unlockedAchievements,
  saveMeta, savePerms, saveSettings, saveAchievements,
  loadHistory, saveHistory, loadBests, saveBest, loadAll,
};
