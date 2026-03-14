// logic.js - Game state, update logic, spawning, combat
const D = require('./data');
const S = require('./storage');

// Game state
let G = {};

function initGameState() {
  G.gameState = D.STATE_MENU;
  G.selectedRole = 'dot';
  G.gameMode = 'normal';
  G.activeMutators = [];
  G.bossRush = false;
  G.playerNickname = 'Player';
  G.voidMode = false;
  G.gameTime = 0;
  G.worldOffsetX = 0; G.worldOffsetY = 0;
  G.screenShakeTimer = 0; G.screenShakeIntensity = 0;
  G.hitPause = 0;
  G.stateInputCooldown = 0;
  G.showTouchTutorial = false;
  G.touchAimAngle = 0;
  G.leftJoy = {active:false,id:null,bx:0,by:0,kx:0,ky:0};
  G.rightJoy = {active:false,id:null,bx:0,by:0,kx:0,ky:0};
  G.achievePopupQueue = [];
  G.achievePopupTimer = 0;
  G.achievePopupText = '';
  // Leaderboard
  G.sessionId = Date.now()+'_'+Math.random().toString(36).slice(2,8);
  G.lastLBSync = 0;
  G.cachedLeaderboard = [];
  // Scroll for start screen
  G.menuScroll = 0;
  G.menuTab = 'upgrades';
}

function clamp(v, mn, mx) { return Math.min(mx, Math.max(mn, v)); }
function diminishingReturn(lv, f) { return 1 - 1/(1+f*lv); }
function getFinalDodge() { return Math.min(D.MAX_DODGE_CHANCE, diminishingReturn(G.player.dodge, D.DODGE_DIMINISH_FACTOR)); }
function getFinalSpeed() { let sm = D.ROLES[G.selectedRole] ? D.ROLES[G.selectedRole].spdMult : 1; return D.BASE_SPEED*sm*(1+diminishingReturn(G.player.speedBonus, D.SPEED_DIMINISH_FACTOR)); }

function checkUnlocks() { for(let k in D.ROLES) { let r=D.ROLES[k]; if(r.locked && r.unlockKey && S.metaStats[r.unlockKey]>=r.unlockVal) r.locked=false; } }

function buyPerm(idx) {
  let u=D.PERM_UPGRADES[idx], lv=S.permLevels[u.key]||0;
  if(lv>=u.max) return false;
  let c=u.cost(lv); if(S.metaStats.soulStones<c) return false;
  S.metaStats.soulStones-=c; S.permLevels[u.key]=(lv||0)+1;
  S.savePerms(); S.saveMeta(); return true;
}

function doPrestige() {
  if(S.metaStats.soulStones<500) return false;
  S.metaStats.soulStones-=500; S.metaStats.prestigeLevel=(S.metaStats.prestigeLevel||0)+1;
  S.permLevels={permHp:0,permDmg:0,permSpd:0,permCrit:0,permArmor:0,permRegen:0};
  S.savePerms(); S.saveMeta(); return true;
}

let SKILL_MODS = {};
function resetSkillMods() {
  SKILL_MODS = {whirlwindRange:0,whirlwindDmgMult:0,whirlwindCDReduce:0,whirlwindKnockback:0,
    arrowRainRadius:0,arrowRainDmgMult:0,arrowRainDuration:0,arrowRainCDReduce:0,
    frostNovaRange:0,frostNovaDuration:0,frostNovaCDReduce:0,frostNovaDot:0,
    cloneDuration:0,cloneDmgMult:0,cloneCDReduce:0,cloneCount:0};
  G.skillLevel = 0;
}

function resetGame(W, H) {
  let role = D.ROLES[G.selectedRole] || D.ROLES.dot;
  G.player = {
    x:0,y:0,hp:Math.floor(D.BASE_MAX_HP*role.hpMult),maxHp:Math.floor(D.BASE_MAX_HP*role.hpMult),
    speed:D.BASE_SPEED,speedBonus:0,level:1,exp:0,nextExp:D.BASE_EXP_NEXT,
    damage:D.BASE_DAMAGE*role.dmgMult,fireInterval:D.BASE_FIRE_INTERVAL/role.fireRateMult,
    bulletSpeed:D.BASE_BULLET_SPEED,bulletCount:D.BASE_BULLET_COUNT,
    critChance:D.BASE_CRIT_CHANCE,critDamage:D.BASE_CRIT_DAMAGE,piercing:D.BASE_PIERCING+role.piercingBase,
    bulletSize:D.BULLET_SIZE,dodge:role.dodgeBase,invincibleTimer:0,radius:D.PLAYER_RADIUS,gold:0,damageFlash:0,
    dashCooldown:0,isDashing:false,dashTimer:0,dashDirX:0,dashDirY:0,
    slowTimer:0,skillTimer:0,skillActive:null,role:G.selectedRole,
    lifesteal:0,magnetRange:G.selectedRole==='ranger'?40:0,comboCount:0,comboTimer:0,
    armor:S.permLevels.permArmor||0,regen:(S.permLevels.permRegen||0)*0.5
  };
  let prestMult=1+(S.metaStats.prestigeLevel||0)*0.05;
  G.player.maxHp=Math.floor(G.player.maxHp*prestMult);G.player.damage*=prestMult;G.player.speed*=prestMult;
  G.player.maxHp=Math.floor(G.player.maxHp*(1+(S.permLevels.permHp||0)*0.03));G.player.hp=G.player.maxHp;
  G.player.damage=G.player.damage*(1+(S.permLevels.permDmg||0)*0.02);
  G.player.speed=G.player.speed*(1+(S.permLevels.permSpd||0)*0.02);
  G.player.critChance=G.player.critChance+(S.permLevels.permCrit||0)*0.01;

  G.enemies=[];G.elites=[];G.bullets=[];G.xpOrbs=[];G.chests=[];G.bosses=[];
  G.floatingTexts=[];G.magicZones=[];G.particles=[];
  G.playerZones=[];G.clones=[];G.friendlyGhosts=[];G.recentDeaths=[];
  G.dmgAccum=new Map();
  G.killCount=0;G.eliteKillCount=0;G.bossKillCount=0;
  G.lastShotTime=0;G.lastSpawnTime=0;G.lastChestSpawnTime=0;
  G.runStats={damageDealt:0,highestCombo:0,goldEarned:0,upgradesTaken:0,totalCrits:0,noDamageTimer:0};
  G.lastBossSpawnTime=0;G.lastBossLevel=0;G.firstBossSpawnTime=0;G.lastEliteSpawnTime=0;
  G.difficultyTimer=0;G.gameTime=0;G.bossCountdown=0;
  G.spawnRate=0.9;G.upgradeOptions=[];G.nearbyChest=null;
  G.shopItems=[null,null,null];G.shopRefreshCount=0;
  G.skillUpOptions=[];
  G.worldOffsetX=0;G.worldOffsetY=0;
  G.leftJoy.active=false;G.rightJoy.active=false;
  G.touchAimAngle=0;G.screenShakeTimer=0;G.screenShakeIntensity=0;
  G.showTouchTutorial=true;G.voidMode=false;G.hitPause=0;
  G.hordeTimer=0;G.hordeWarning=0;G.hordeCount=0;
  resetSkillMods();
  G.W=W;G.H=H;
  G.gameState=D.STATE_PLAYING;
  if(G.activeMutators.includes('glassCannon')){G.player.maxHp=Math.floor(G.player.maxHp*0.5);G.player.hp=G.player.maxHp;G.player.damage*=1.3;}
  if(G.activeMutators.includes('speedRun')){G.player.speedBonus+=3;}
}

function addFloatingText(text,x,y,color){G.floatingTexts.push({text,x,y,life:1.0,color:color||'#ffd966'});}

function getMonsterStatsByLevel(){let vm=G.voidMode?1.5:1;return{healthMult:(1+G.player.level*0.12+G.gameTime/600)*vm,speedMult:Math.min(2.5,1+G.player.level*0.12)*vm,dmgMult:(1+G.player.level*0.1)*vm};}
function getEliteStatScale(){return{healthMult:1+G.player.level*0.2,speedMult:Math.min(2.6,1+G.player.level*0.13),dmgMult:1+G.player.level*0.12};}
function getBossStatScale(){return{healthMult:1+G.player.level*0.3,speedMult:Math.min(3.0,1+G.player.level*0.18),dmgMult:1+G.player.level*0.2};}
function getBossCDMult(){let t=G.firstBossSpawnTime?G.gameTime-G.firstBossSpawnTime:0;return 1.5+3.5/(1+t/300);}

function showDmg(entity,amt,isCrit){
  if(!S.gameSettings.damageNumbers)return;
  let a=G.dmgAccum.get(entity);
  if(!a){a={total:0,crits:0,timer:0.2,x:entity.x,y:entity.y};G.dmgAccum.set(entity,a);}
  a.total+=amt;if(isCrit)a.crits++;a.timer=0.2;a.x=entity.x;a.y=entity.y;
}
function flushDmg(entity){
  let a=G.dmgAccum.get(entity);if(!a)return;
  let col=a.crits>0?'#ff4444':'#ffffff';let txt=Math.round(a.total).toString();
  if(a.crits>0)txt='💥'+txt;
  addFloatingText(txt,a.x,a.y-20,col);G.dmgAccum.delete(entity);
}

function spawnDeathParticles(x,y,r,color,count){
  for(let i=0;i<count;i++){let a=Math.random()*Math.PI*2,spd=60+Math.random()*120,sz=2+Math.random()*3;
    G.particles.push({x,y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,size:sz,life:0.4+Math.random()*0.3,maxLife:0.4+Math.random()*0.3,color});}
}

function spawnXpFromEnemy(ex,ey,er,isBoss,isElite){
  let v=Math.floor(er/2)+2+Math.floor(G.player.level*0.8);if(isBoss)v*=5;if(isElite)v*=2;
  G.xpOrbs.push({x:ex,y:ey,radius:isBoss?14:(isElite?10:Math.min(7,3.8+v*0.475)),value:v});
  let pColor=isBoss?'#ff4444':(isElite?'#ff9933':'#ff6666'),pCount=isBoss?20:(isElite?12:6);
  spawnDeathParticles(ex,ey,er,pColor,pCount);
  if(isBoss)G.hitPause=0.08;
  if(isBoss){let g=Math.floor(30+G.player.level*8/(1+G.player.level*0.03));G.player.gold+=g;G.runStats.goldEarned+=g;addFloatingText(`+${g}💰`,ex,ey-30,'#ffd966');}
  if(isElite){let g=5+Math.min(G.player.level,12);G.player.gold+=g;G.runStats.goldEarned+=g;addFloatingText(`+${g}💰`,ex,ey-30,'#ffd966');}
}

function damagePlayer(amount){
  G.runStats.noDamageTimer=0;
  if(G.player.isDashing)return;
  amount=Math.max(1,amount-(G.player.armor||0));
  G.player.hp-=amount;G.player.invincibleTimer=D.INVINCIBLE_DURATION;G.player.damageFlash=0.45;
  G.screenShakeTimer=0.2;G.screenShakeIntensity=4+Math.min(amount,8);
  if(G.player.hp<=0){
    G.gameState=D.STATE_GAMEOVER;G.screenShakeTimer=0.35;G.screenShakeIntensity=12;
    S.metaStats.totalKills+=G.killCount;S.metaStats.totalBossKills+=G.bossKillCount;
    let mutBonus=G.activeMutators.reduce((s,m)=>{let mt=D.MUTATORS.find(x=>x.id===m);return s+(mt?mt.soulBonus:0);},0);
    let earnedSouls=Math.floor(G.gameTime/60)*3+G.player.level+G.bossKillCount*5+mutBonus;
    S.metaStats.soulStones+=earnedSouls;
    addFloatingText(`+${earnedSouls} 🔮灵魂石`,G.player.x,G.player.y-60,'#b366ff');
    if(G.gameTime>S.metaStats.bestTime)S.metaStats.bestTime=G.gameTime;
    S.saveMeta();
    S.saveHistory({role:G.selectedRole,time:Math.round(G.gameTime),kills:G.killCount,bossKills:G.bossKillCount,level:G.player.level,soulStones:earnedSouls,date:Date.now()});
    S.saveBest(G.selectedRole,G.gameTime,G.killCount,G.player.level);
  }
}
function tryDodgeOrDamage(amount){
  if(G.player.invincibleTimer>0||G.player.isDashing)return;
  if(Math.random()<getFinalDodge()){addFloatingText('闪避!',G.player.x,G.player.y-40,'#aaffaa');G.player.invincibleTimer=D.INVINCIBLE_DURATION*0.3;}
  else damagePlayer(amount);
}

function triggerDash(){
  if(G.player.dashCooldown>0||G.player.isDashing||G.gameState!==D.STATE_PLAYING)return;
  let dx=0,dy=0;
  if(G.leftJoy.active){dx=G.leftJoy.kx-G.leftJoy.bx;dy=G.leftJoy.ky-G.leftJoy.by;}
  let len=Math.hypot(dx,dy);
  if(len<0.001){dx=Math.cos(G.touchAimAngle);dy=Math.sin(G.touchAimAngle);}else{dx/=len;dy/=len;}
  G.player.isDashing=true;G.player.dashTimer=D.DASH_DURATION;G.player.dashCooldown=D.DASH_COOLDOWN;
  G.player.dashDirX=dx;G.player.dashDirY=dy;
}

function findNearestEnemy(){
  let nearest=null,minD=Infinity;
  for(let e of G.enemies){let d=Math.hypot(e.x-G.player.x,e.y-G.player.y);if(d<minD){minD=d;nearest=e;}}
  for(let e of G.elites){let d=Math.hypot(e.x-G.player.x,e.y-G.player.y);if(d<minD){minD=d;nearest=e;}}
  for(let e of G.bosses){let d=Math.hypot(e.x-G.player.x,e.y-G.player.y);if(d<minD){minD=d;nearest=e;}}
  return nearest;
}

// Skills
function activateSkill(){
  if(G.player.skillTimer>0||G.gameState!==D.STATE_PLAYING)return;
  let role=D.ROLES[G.selectedRole];if(!role||!role.skill)return;
  G.player.skillTimer=Math.max(1,role.skillCD-SKILL_MODS.whirlwindCDReduce*(role.skill==='whirlwind'?1:0)-SKILL_MODS.arrowRainCDReduce*(role.skill==='arrowRain'?1:0)-SKILL_MODS.frostNovaCDReduce*(role.skill==='frostNova'?1:0)-SKILL_MODS.cloneCDReduce*(role.skill==='shadowClone'?1:0));
  if(role.skill==='whirlwind'){
    let sr=120+SKILL_MODS.whirlwindRange,dmg=G.player.damage*(3+SKILL_MODS.whirlwindDmgMult),kb=80+SKILL_MODS.whirlwindKnockback;
    for(let i=G.enemies.length-1;i>=0;i--){let e=G.enemies[i],d=Math.hypot(e.x-G.player.x,e.y-G.player.y);
      if(d<sr+e.radius){e.health-=dmg;if(d>0.01){let a=Math.atan2(e.y-G.player.y,e.x-G.player.x);e.x+=Math.cos(a)*kb;e.y+=Math.sin(a)*kb;}
      if(e.health<=0){spawnXpFromEnemy(e.x,e.y,e.radius);G.enemies.splice(i,1);G.killCount++;}}}
    for(let i=G.elites.length-1;i>=0;i--){let e=G.elites[i],d=Math.hypot(e.x-G.player.x,e.y-G.player.y);
      if(d<sr+e.radius){e.health-=dmg;if(d>0.01){let a=Math.atan2(e.y-G.player.y,e.x-G.player.x);e.x+=Math.cos(a)*(kb*0.75);e.y+=Math.sin(a)*(kb*0.75);}
      if(e.health<=0){spawnXpFromEnemy(e.x,e.y,e.radius,false,true);G.elites.splice(i,1);G.killCount++;}}}
    for(let bs of G.bosses){let d=Math.hypot(bs.x-G.player.x,bs.y-G.player.y);if(d<sr+bs.radius){bs.health-=dmg;}}
    G.player.skillActive={type:'whirlwind',timer:0.4,radius:sr};addFloatingText('⚔️ 旋风斩!',G.player.x,G.player.y-40,'#ff6644');
    G.screenShakeTimer=0.15;G.screenShakeIntensity=5;
  }else if(role.skill==='arrowRain'){
    let tx=G.player.x+Math.cos(G.touchAimAngle)*250,ty=G.player.y+Math.sin(G.touchAimAngle)*250;
    let ar=80+SKILL_MODS.arrowRainRadius,ad=2.0+SKILL_MODS.arrowRainDuration,admg=G.player.damage*(1.5+SKILL_MODS.arrowRainDmgMult);
    G.playerZones.push({x:tx,y:ty,radius:ar,timer:0,duration:ad,tickInterval:0.3,lastTick:0,damage:admg});
    addFloatingText('🏹 箭雨!',tx,ty-40,'#44dd66');
  }else if(role.skill==='frostNova'){
    let sr=200+SKILL_MODS.frostNovaRange,fd=2.5+SKILL_MODS.frostNovaDuration,cnt=0;
    for(let e of G.enemies){if(Math.hypot(e.x-G.player.x,e.y-G.player.y)<sr+e.radius){e.frozen=fd;cnt++;}}
    for(let e of G.elites){if(Math.hypot(e.x-G.player.x,e.y-G.player.y)<sr+e.radius){e.frozen=fd;cnt++;}}
    for(let bs of G.bosses){if(Math.hypot(bs.x-G.player.x,bs.y-G.player.y)<sr+bs.radius){bs.frozen=Math.min(fd,2.0);cnt++;}}
    G.player.skillActive={type:'frostNova',timer:0.5,radius:0};addFloatingText('❄️ 冰冻! x'+cnt,G.player.x,G.player.y-40,'#6688ff');
  }else if(role.skill==='shadowClone'){
    let cn=1+SKILL_MODS.cloneCount,cd=5.0+SKILL_MODS.cloneDuration;
    for(let c=0;c<cn;c++){let ca=c*(Math.PI*2/cn),cx=G.player.x+Math.cos(ca)*30,cy=G.player.y+Math.sin(ca)*30;G.clones.push({x:cx,y:cy,timer:cd,shootTimer:0});}
    addFloatingText('👻 分身!',G.player.x,G.player.y-40,'#bb77ff');
  }else if(role.skill==='raiseDead'){
    let count=0;
    for(let rd of G.recentDeaths){if(rd.timer>0){G.friendlyGhosts.push({x:rd.x,y:rd.y,timer:8,shootTimer:0});count++;}}
    G.recentDeaths=[];
    if(count>0)addFloatingText(`💀 复活 x${count}!`,G.player.x,G.player.y-40,'#44cc88');
    else addFloatingText('💀 无可复活',G.player.x,G.player.y-40,'#666666');
  }
}

// Spawning
function spawnEnemy(now){
  if(G.enemies.length>=60)return;
  let baseDelay=Math.max(0.15,0.9-G.player.level*0.02);
  if(now-G.lastSpawnTime<baseDelay)return;G.lastSpawnTime=now;
  let stats=getMonsterStatsByLevel();
  let sizeVar=Math.random()*0.8+0.5,baseR=5+Math.floor(G.difficultyTimer*0.15);
  let radius=clamp(baseR*sizeVar,4,22);
  let health=Math.max(1,Math.floor(radius/3.2)*stats.healthMult+(G.player.level*0.3));
  let speed=(18+Math.random()*35)*stats.speedMult;
  let typePool=['normal'];
  if(G.player.level>=3)typePool.push('shooter');
  if(G.player.level>=5)typePool.push('exploder');
  if(G.player.level>=6)typePool.push('swarm');
  if(G.player.level>=7)typePool.push('tank');
  if(G.player.level>=8)typePool.push('shielded');
  if(G.player.level>=10)typePool.push('splitter');
  if(G.player.level>=12)typePool.push('healer');
  if(G.player.level>=14)typePool.push('teleporter');
  let type=Math.random()<0.7?'normal':typePool[Math.floor(Math.random()*typePool.length)];
  if(type==='swarm'){
    let sc=5+Math.floor(Math.random()*4);
    let angle2=Math.random()*Math.PI*2,distance2=450+Math.random()*300;
    let cx=G.player.x+Math.cos(angle2)*distance2,cy=G.player.y+Math.sin(angle2)*distance2;
    for(let si=0;si<sc;si++){
      let sa=Math.random()*Math.PI*2,sd=10+Math.random()*20;
      let sr=3+Math.random()*2,shp=Math.max(1,Math.floor(stats.healthMult*0.5+G.player.level*0.1)),sspd=(40+Math.random()*30)*stats.speedMult;
      G.enemies.push({x:cx+Math.cos(sa)*sd,y:cy+Math.sin(sa)*sd,radius:sr,health:shp,maxHealth:shp,speed:sspd,isBoss:false,isElite:false,type:'swarm',attackTimer:0,shieldAngle:0,healTimer:0});
    }
    return;
  }
  if(type==='shooter'){radius=clamp(radius*0.7,4,12);health*=0.6;speed*=0.6;}
  else if(type==='exploder'){radius=clamp(radius*0.5,4,9);health*=0.4;speed*=2.0;}
  else if(type==='tank'){radius=clamp(radius*1.6,12,28);health*=3;speed*=0.4;}
  else if(type==='splitter'){radius=clamp(radius*1.1,10,18);health*=1.5;speed*=0.9;}
  else if(type==='shielded'){radius=clamp(radius*1.2,10,20);health*=2;speed*=0.7;}
  else if(type==='healer'){radius=clamp(radius*0.8,5,14);health*=0.8;speed*=0.5;}
  else if(type==='teleporter'){radius=clamp(radius*0.6,4,10);health*=0.5;speed*=1.2;}
  let angle=Math.random()*Math.PI*2,distance=450+Math.random()*300;
  G.enemies.push({x:G.player.x+Math.cos(angle)*distance,y:G.player.y+Math.sin(angle)*distance,
    radius,health,maxHealth:health,speed,isBoss:false,isElite:false,type:type,attackTimer:0,shieldAngle:0,healTimer:0});
}

function spawnElite(now){
  if(G.killCount>=30*(G.eliteKillCount+1)){
    G.eliteKillCount++;let n=1+Math.floor(G.player.level/3);
    let es=getEliteStatScale();
    for(let i=0;i<n;i++){let r=18+Math.random()*8,hp=Math.floor((15+G.player.level*5+Math.floor(G.difficultyTimer))*es.healthMult),spd=(35+G.player.level*1.5)*es.speedMult;
      let a=Math.random()*Math.PI*2,d=400+Math.random()*200;
      G.elites.push({x:G.player.x+Math.cos(a)*d,y:G.player.y+Math.sin(a)*d,radius:r,health:hp,maxHealth:hp,speed:spd,isElite:true,isBoss:false});}
    addFloatingText(`⚡ 精英出现 x${n}`,G.player.x,G.player.y-60,'#ffaa55');
  }
}

function checkBossCountdown(now){
  if(G.bossCountdown>0)return;
  if(G.player.level>=5&&G.player.level%5===0&&G.player.level!==G.lastBossLevel){G.bossCountdown=D.BOSS_COUNTDOWN_TIME;addFloatingText(`⚠️ Boss ${D.BOSS_COUNTDOWN_TIME}秒后出现`,G.player.x,G.player.y-80,'#ff5555');return;}
  let t=now-G.lastBossSpawnTime;if(t>=D.BOSS_SPAWN_INTERVAL-D.BOSS_COUNTDOWN_TIME&&G.lastBossSpawnTime>0){G.bossCountdown=D.BOSS_COUNTDOWN_TIME;addFloatingText(`⚠️ Boss ${D.BOSS_COUNTDOWN_TIME}秒后出现`,G.player.x,G.player.y-80,'#ff5555');}
}

function spawnBoss(now){
  let tks=['berserker','ranger','sorcerer'];if(G.player.level>=10)tks.push('summoner');if(G.player.level>=15)tks.push('juggernaut');if(G.player.level>=20)tks.push('twins');if(G.player.level>=25)tks.push('archmage');
  let tk=tks[Math.floor(Math.random()*tks.length)];
  if(tk==='twins'){
    let bsc=getBossStatScale();
    for(let twin of ['twins_fire','twins_ice']){
      let tbt=D.BOSS_TYPES[twin];
      let tr=(35+Math.random()*15)*tbt.radiusMult,thp=Math.floor((80+G.player.level*30+G.difficultyTimer*2)*tbt.healthMult*bsc.healthMult);
      let tspd=(30+G.player.level*1.5)*tbt.speedMult*bsc.speedMult,ta=Math.random()*Math.PI*2;
      let tx=G.player.x+Math.cos(ta)*500,ty=G.player.y+Math.sin(ta)*500;
      G.bosses.push({x:tx,y:ty,radius:tr,health:thp,maxHealth:thp,speed:tspd,isBoss:true,bossType:twin,
        attackTimer:0,attackInterval:tbt.attackInterval,contactDamage:tbt.contactDamage,
        chargeTimer:0,isCharging:false,chargeDuration:0,chargeDx:0,chargeDy:0,chargeSpeed:tspd*3,
        teleportCooldown:0,attackPhase:0,summonCount:0,hasAbsorbed:false,armor:0,enraged:false,twinAlive:true,fireTrailTimer:0});
      addFloatingText(`💀 ${tbt.name}!`,tx,ty-50,tbt.color);
    }
    if(!G.firstBossSpawnTime)G.firstBossSpawnTime=now;G.lastBossSpawnTime=now;G.lastBossLevel=G.player.level;
    return;
  }
  let bt=D.BOSS_TYPES[tk],bsc=getBossStatScale();
  let r=(35+Math.random()*15)*bt.radiusMult,hp=Math.floor((80+G.player.level*30+G.difficultyTimer*2)*bt.healthMult*bsc.healthMult);
  let spd=(30+G.player.level*1.5)*bt.speedMult*bsc.speedMult,a=Math.random()*Math.PI*2;
  let x=G.player.x+Math.cos(a)*500,y=G.player.y+Math.sin(a)*500;
  G.bosses.push({x,y,radius:r,health:hp,maxHealth:hp,speed:spd,isBoss:true,bossType:tk,
    attackTimer:0,attackInterval:bt.attackInterval,contactDamage:bt.contactDamage,
    chargeTimer:0,isCharging:false,chargeDuration:0,chargeDx:0,chargeDy:0,chargeSpeed:spd*2,
    teleportCooldown:0,attackPhase:0,summonCount:0,hasAbsorbed:false,armor:0,enraged:false,twinAlive:true,fireTrailTimer:0});
  if(tk==='juggernaut'){G.bosses[G.bosses.length-1].armor=3;}
  addFloatingText(`💀 ${bt.name} BOSS!`,x,y-50,bt.color);
  if(!G.firstBossSpawnTime)G.firstBossSpawnTime=now;G.lastBossSpawnTime=now;G.lastBossLevel=G.player.level;
}

function spawnChest(now){if(now-G.lastChestSpawnTime<D.CHEST_SPAWN_INTERVAL)return;G.lastChestSpawnTime=now;let a=Math.random()*Math.PI*2,d=300+Math.random()*400;G.chests.push({x:G.player.x+Math.cos(a)*d,y:G.player.y+Math.sin(a)*d,radius:18,isOpen:false});}

function openChest(ci){
  if(ci<0||ci>=G.chests.length)return;let ch=G.chests[ci];if(ch.isOpen)return;ch.isOpen=true;
  const items=[
    {n:'❤️ 回血30%',f:()=>{let h=Math.floor(G.player.maxHp*0.3);G.player.hp=Math.min(G.player.maxHp,G.player.hp+h);addFloatingText(`+${h} HP`,G.player.x,G.player.y-30,'#ff8888');}},
    {n:'💪 攻击力+2',f:()=>{G.player.damage+=2;addFloatingText('攻击+2',G.player.x,G.player.y-30,'#ffaa66');}},
    {n:'🏹 子弹+1',f:()=>{G.player.bulletCount=Math.min(10,G.player.bulletCount+1);addFloatingText('子弹+1',G.player.x,G.player.y-30,'#66ccff');}},
    {n:'⚡ 攻速提升',f:()=>{G.player.fireInterval=Math.max(0.08,G.player.fireInterval-0.03);addFloatingText('攻速提升',G.player.x,G.player.y-30,'#aadd66');}},
    {n:'🔫 子弹大小+2',f:()=>{G.player.bulletSize+=2;addFloatingText('子弹大小+2',G.player.x,G.player.y-30,'#ffaa88');}},
    {n:'💥 暴击率+3%',f:()=>{G.player.critChance=Math.min(0.8,G.player.critChance+0.03);addFloatingText('暴击+3%',G.player.x,G.player.y-30,'#ffdd44');}},
    {n:'🗡️ 暴击伤害+20%',f:()=>{G.player.critDamage+=0.2;addFloatingText('爆伤+20%',G.player.x,G.player.y-30,'#ffaa00');}},
    {n:'🎯 穿透+1',f:()=>{G.player.piercing+=1;addFloatingText('穿透+1',G.player.x,G.player.y-30,'#aaccff');}},
    {n:'💰 金币',f:()=>{let g=20+G.player.level*5;G.player.gold+=g;G.runStats.goldEarned+=g;addFloatingText(`+${g}金币`,G.player.x,G.player.y-30,'#ffd966');}},
    {n:'💖 最大生命+10',f:()=>{G.player.maxHp+=10;G.player.hp+=10;addFloatingText('生命上限+10',G.player.x,G.player.y-30,'#ff8888');}},
    {n:'👟 速度+1',f:()=>{G.player.speedBonus+=1;addFloatingText('速度提升',G.player.x,G.player.y-30,'#88ff88');}},
    {n:'🌀 闪避+1',f:()=>{G.player.dodge+=1;addFloatingText('闪避提升',G.player.x,G.player.y-30,'#88aaff');}},
    {n:'🌀 XP吸取',f:()=>{for(let o of G.xpOrbs)o.vacuumed=true;addFloatingText('XP吸取!',G.player.x,G.player.y-30,'#88ddff');}},
  ];
  items[Math.floor(Math.random()*items.length)].f();
  setTimeout(()=>{let idx=G.chests.findIndex(c=>c===ch);if(idx!==-1)G.chests.splice(idx,1);},500);
}

// Shooting
function shootBullet(now){
  if(G.gameState!==D.STATE_PLAYING||now-G.lastShotTime<G.player.fireInterval)return;G.lastShotTime=now;
  let aimDx,aimDy;
  if(G.rightJoy.active){let jdx=G.rightJoy.kx-G.rightJoy.bx,jdy=G.rightJoy.ky-G.rightJoy.by;if(Math.hypot(jdx,jdy)>D.JOY_DEAD)G.touchAimAngle=Math.atan2(jdy,jdx);}
  aimDx=Math.cos(G.touchAimAngle);aimDy=Math.sin(G.touchAimAngle);
  let bc=G.player.bulletCount,ba=Math.atan2(aimDy,aimDx),sp=0.35;
  let wep=(D.ROLES[G.selectedRole]||D.ROLES.dot).weapon||'dot';
  if(wep==='sword'){
    let sr=85+G.player.bulletSize*2,dmg=G.player.damage*1.4;
    let crit=Math.random()<G.player.critChance;if(crit)dmg*=G.player.critDamage;
    for(let j=G.enemies.length-1;j>=0;j--){let e=G.enemies[j],d=Math.hypot(e.x-G.player.x,e.y-G.player.y),ea=Math.atan2(e.y-G.player.y,e.x-G.player.x);
      let da=Math.abs(((ea-ba+Math.PI*3)%(Math.PI*2))-Math.PI);
      if(d<sr+e.radius&&da<0.8){e.health-=dmg;showDmg(e,dmg,crit);G.runStats.damageDealt+=dmg;if(crit)G.runStats.totalCrits++;if(G.player.lifesteal>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+dmg*G.player.lifesteal);
        if(e.health<=0){flushDmg(e);spawnXpFromEnemy(e.x,e.y,e.radius);G.enemies.splice(j,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}}}
    for(let j=G.elites.length-1;j>=0;j--){let e=G.elites[j],d=Math.hypot(e.x-G.player.x,e.y-G.player.y),ea=Math.atan2(e.y-G.player.y,e.x-G.player.x);
      let da=Math.abs(((ea-ba+Math.PI*3)%(Math.PI*2))-Math.PI);
      if(d<sr+e.radius&&da<0.8){e.health-=dmg;showDmg(e,dmg,crit);G.runStats.damageDealt+=dmg;if(crit)G.runStats.totalCrits++;if(G.player.lifesteal>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+dmg*G.player.lifesteal);
        if(e.health<=0){if(e.marked){G.friendlyGhosts.push({x:e.x,y:e.y,timer:5,shootTimer:0});}flushDmg(e);spawnXpFromEnemy(e.x,e.y,e.radius,false,true);G.elites.splice(j,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}}}
    for(let bs of G.bosses){let d=Math.hypot(bs.x-G.player.x,bs.y-G.player.y),ea=Math.atan2(bs.y-G.player.y,bs.x-G.player.x);
      let da=Math.abs(((ea-ba+Math.PI*3)%(Math.PI*2))-Math.PI);if(d<sr+bs.radius&&da<0.8){bs.health-=dmg;showDmg(bs,dmg,crit);G.runStats.damageDealt+=dmg;if(crit)G.runStats.totalCrits++;if(G.player.lifesteal>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+dmg*G.player.lifesteal);}}
    G.player.skillActive={type:'swordSlash',timer:0.15,angle:ba,range:sr};
  }else if(wep==='arrow'){
    for(let i=0;i<bc;i++){let a=bc===1?ba:ba+(i/(bc-1)-0.5)*sp,bx=Math.cos(a),by=Math.sin(a);
      let crit=Math.random()<G.player.critChance,dm=crit?G.player.critDamage:1.0;
      G.bullets.push({x:G.player.x+bx*(G.player.radius+3),y:G.player.y+by*(G.player.radius+3),vx:bx*G.player.bulletSpeed*1.3,vy:by*G.player.bulletSpeed*1.3,
        radius:G.player.bulletSize,damage:G.player.damage*dm,piercing:G.player.piercing,hitEnemies:new Set(),isCrit:crit,life:2.5,fromBoss:false,weaponType:'arrow'});}
  }else if(wep==='orb'){
    for(let i=0;i<bc;i++){let a=bc===1?ba:ba+(i/(bc-1)-0.5)*sp;
      let crit=Math.random()<G.player.critChance,dm=crit?G.player.critDamage:1.0;
      G.bullets.push({x:G.player.x+Math.cos(a)*(G.player.radius+3),y:G.player.y+Math.sin(a)*(G.player.radius+3),
        vx:Math.cos(a)*G.player.bulletSpeed*0.5,vy:Math.sin(a)*G.player.bulletSpeed*0.5,
        radius:G.player.bulletSize+4,damage:G.player.damage*dm*1.8,piercing:G.player.piercing+2,hitEnemies:new Set(),isCrit:crit,life:4.0,fromBoss:false,weaponType:'orb'});}
  }else if(wep==='dagger'){
    for(let i=0;i<bc+1;i++){let a=bc+1===1?ba:ba+(i/bc-0.5)*0.5,bx=Math.cos(a),by=Math.sin(a);
      let crit=Math.random()<G.player.critChance,dm=crit?G.player.critDamage:1.0;
      G.bullets.push({x:G.player.x+bx*(G.player.radius+3),y:G.player.y+by*(G.player.radius+3),vx:bx*G.player.bulletSpeed*1.5,vy:by*G.player.bulletSpeed*1.5,
        radius:G.player.bulletSize-1,damage:G.player.damage*dm*0.7,piercing:0,hitEnemies:new Set(),isCrit:crit,life:1.2,fromBoss:false,weaponType:'dagger'});}
  }else if(wep==='soulBolt'){
    let crit=Math.random()<G.player.critChance,dm=crit?G.player.critDamage:1.0;
    G.bullets.push({x:G.player.x+Math.cos(ba)*(G.player.radius+3),y:G.player.y+Math.sin(ba)*(G.player.radius+3),
      vx:Math.cos(ba)*G.player.bulletSpeed*0.9,vy:Math.sin(ba)*G.player.bulletSpeed*0.9,
      radius:G.player.bulletSize+2,damage:G.player.damage*dm,piercing:G.player.piercing+1,hitEnemies:new Set(),isCrit:crit,life:3.0,fromBoss:false,weaponType:'soulBolt',marks:true});
  }else{
    for(let i=0;i<bc;i++){let a=bc===1?ba:ba+(i/(bc-1)-0.5)*sp,bx=Math.cos(a),by=Math.sin(a);
      let crit=Math.random()<G.player.critChance,dm=crit?G.player.critDamage:1.0;
      G.bullets.push({x:G.player.x+bx*(G.player.radius+3),y:G.player.y+by*(G.player.radius+3),vx:bx*G.player.bulletSpeed,vy:by*G.player.bulletSpeed,
        radius:G.player.bulletSize,damage:G.player.damage*dm,piercing:G.player.piercing,hitEnemies:new Set(),isCrit:crit,life:3.0,fromBoss:false,weaponType:'dot'});}
  }
}

// Upgrade/Shop systems
function generateUpgradeOptions(){
  let wep=(D.ROLES[G.selectedRole]||D.ROLES.dot).weapon||'dot';
  const pool=[
    {name:'❤️ 最大生命 +8',apply:p=>{p.maxHp+=8;p.hp+=8;}},
    {name:'⚡ 伤害 +2',apply:p=>{p.damage+=2+Math.floor(p.level/5)*0.5;}},
    {name:'👟 速度+1',apply:p=>{p.speedBonus+=1;}},
    {name:'🌀 闪避+1',apply:p=>{p.dodge+=1;}},
    {name:'💥 暴击率 +4%',apply:p=>{p.critChance=Math.min(0.8,p.critChance+0.04);}},
    {name:'🗡️ 暴击伤害 +30%',apply:p=>{p.critDamage+=0.3;}},
    {name:'🧲 磁铁范围 +40',apply:p=>{p.magnetRange=Math.min(200,p.magnetRange+40);}},
    {name:'🩸 生命窃取 +0.5%',apply:p=>{p.lifesteal=Math.min(0.12,p.lifesteal+0.005);}},
  ];
  if(wep==='sword'){pool.push({name:'⚔️ 斩击范围 +15',apply:p=>{p.bulletSize+=5;}},{name:'⚔️ 剑气数 +1',apply:p=>{p.bulletCount=Math.min(8,p.bulletCount+1);}},{name:'⚔️ 挥击速度',apply:p=>{p.fireInterval=Math.max(0.2,p.fireInterval-0.05);}});}
  else if(wep==='arrow'){pool.push({name:'🏹 箭矢数 +1',apply:p=>{p.bulletCount=Math.min(10,p.bulletCount+1);}},{name:'🏹 射速提升',apply:p=>{p.fireInterval=Math.max(0.08,p.fireInterval-0.03);}},{name:'🏹 穿透 +1',apply:p=>{p.piercing+=1;}});}
  else if(wep==='orb'){pool.push({name:'🔮 法球大小 +4',apply:p=>{p.bulletSize+=4;}},{name:'🔮 施法速度',apply:p=>{p.fireInterval=Math.max(0.15,p.fireInterval-0.04);}},{name:'🔮 穿透 +1',apply:p=>{p.piercing+=1;}});}
  else if(wep==='dagger'){pool.push({name:'🗡 飞刀数 +1',apply:p=>{p.bulletCount=Math.min(10,p.bulletCount+1);}},{name:'🗡 出刀速度',apply:p=>{p.fireInterval=Math.max(0.06,p.fireInterval-0.03);}},{name:'🗡 穿透 +1',apply:p=>{p.piercing+=1;}});}
  else if(wep==='soulBolt'){pool.push({name:'💀 灵魂弹数+1',apply:p=>{p.bulletCount=Math.min(8,p.bulletCount+1);}},{name:'💀 施法速度',apply:p=>{p.fireInterval=Math.max(0.1,p.fireInterval-0.03);}},{name:'💀 穿透+1',apply:p=>{p.piercing+=1;}});}
  else{pool.push({name:'🔵 光弹数 +1',apply:p=>{p.bulletCount=Math.min(10,p.bulletCount+1);}},{name:'🔵 射速提升',apply:p=>{p.fireInterval=Math.max(0.08,p.fireInterval-0.03);}},{name:'🔵 穿透 +1',apply:p=>{p.piercing+=1;}},{name:'🔵 弹幕大小 +3',apply:p=>{p.bulletSize+=3;}});}
  return[...pool].sort(()=>Math.random()-0.5).slice(0,3);
}
function applyUpgrade(i){
  G.runStats.upgradesTaken++;
  if(i<0||i>=G.upgradeOptions.length)return;const old=G.player.nextExp;G.upgradeOptions[i].apply(G.player);
  G.player.damage*=1.03;G.player.level++;G.player.exp-=old;G.player.nextExp=Math.floor(D.BASE_EXP_NEXT+G.player.level*D.EXP_INCREASE_PER_LEVEL);G.upgradeOptions=[];
  if(G.player.exp>=G.player.nextExp){G.gameState=D.STATE_UPGRADE;G.upgradeOptions=generateUpgradeOptions();}else G.gameState=D.STATE_PLAYING;
}
function checkLevelUp(){if(G.player.exp>=G.player.nextExp&&G.gameState===D.STATE_PLAYING){G.gameState=D.STATE_UPGRADE;G.upgradeOptions=generateUpgradeOptions();}}

function shopPrice(base){return Math.floor(base*(1+Math.floor(G.player.level/3)*0.4));}
function generateShopItems(){
  let pool=[
    {name:'❤️ 回血50%',price:shopPrice(30),effect:()=>{G.player.hp=Math.min(G.player.maxHp,G.player.hp+G.player.maxHp*0.5);}},
    {name:'💪 攻击力+3',price:shopPrice(45),effect:()=>{G.player.damage+=3;}},
    {name:'💖 最大生命+15',price:shopPrice(45),effect:()=>{G.player.maxHp+=15;G.player.hp+=15;}},
    {name:'🗡️ 暴击伤害+30%',price:shopPrice(55),effect:()=>{G.player.critDamage+=0.3;}},
  ];
  if(G.player.bulletCount<10)pool.push({name:'🏹 子弹数+1',price:shopPrice(60),effect:()=>{G.player.bulletCount=Math.min(10,G.player.bulletCount+1);}});
  if(G.player.fireInterval>0.08)pool.push({name:'⚡ 攻速提升',price:shopPrice(50),effect:()=>{G.player.fireInterval=Math.max(0.08,G.player.fireInterval-0.04);}});
  if(G.player.critChance<0.8)pool.push({name:'💥 暴击率+5%',price:shopPrice(45),effect:()=>{G.player.critChance=Math.min(0.8,G.player.critChance+0.05);}});
  pool.push({name:'🎯 穿透+1',price:shopPrice(40),effect:()=>{G.player.piercing+=1;}});
  return pool.sort(()=>Math.random()-0.5).slice(0,3);
}
function refreshShop(){if(G.gameState!==D.STATE_SHOP)return;let c=10*Math.pow(2,G.shopRefreshCount);if(G.player.gold<c){addFloatingText('金币不足',G.player.x,G.player.y-40,'#ff5555');return;}G.player.gold-=c;G.shopRefreshCount++;let ni=generateShopItems();G.shopItems=[ni[0]||null,ni[1]||null,ni[2]||null];addFloatingText('商店已刷新',G.player.x,G.player.y-30,'#aaffaa');}
function buyShopItem(i){if(i<0||i>=3)return;let it=G.shopItems[i];if(!it){addFloatingText('已售罄',G.player.x,G.player.y-40,'#aaaaaa');return;}if(G.player.gold<it.price){addFloatingText('金币不足',G.player.x,G.player.y-40,'#ff5555');return;}G.player.gold-=it.price;it.effect();addFloatingText('已购买 '+it.name,G.player.x,G.player.y-30,'#aaffaa');G.shopItems[i]=null;}

function generateSkillUpOptions(){
  let role=D.ROLES[G.selectedRole];if(!role||!role.skill)return[];
  return[...(D.SKILL_UPGRADES[role.skill]||[])].sort(()=>Math.random()-0.5).slice(0,3);
}
function applySkillUpgrade(i){
  if(i<0||i>=G.skillUpOptions.length)return;
  G.skillUpOptions[i].apply(SKILL_MODS);G.skillLevel++;
  G.skillUpOptions=[];G.gameState=G.activeMutators.includes('noShop')?D.STATE_PLAYING:D.STATE_SHOP;G.stateInputCooldown=0.15;
}

// Achievement checking
function checkAchievements(){
  for(let a of D.ACHIEVEMENTS){
    if(S.unlockedAchievements.includes(a.id))continue;
    let pass=false;
    try{
      if(a.id==='kill100')pass=G.killCount>=100;
      else if(a.id==='kill1000')pass=(S.metaStats.totalKills||0)>=1000;
      else if(a.id==='boss5')pass=G.bossKillCount>=5;
      else if(a.id==='combo20')pass=G.runStats.highestCombo>=20;
      else if(a.id==='crit50')pass=G.runStats.totalCrits>=50;
      else if(a.id==='survive10')pass=G.gameTime>=600;
      else if(a.id==='survive30')pass=G.gameTime>=1800;
      else if(a.id==='survive60')pass=G.gameTime>=3600;
      else if(a.id==='nodmg60')pass=G.runStats.noDamageTimer>=60;
      else if(a.id==='crit50pct')pass=G.player.critChance>=0.5;
      else if(a.id==='proj6')pass=G.player.bulletCount>=6;
      else if(a.id==='speed400')pass=getFinalSpeed()>=400;
      else if(a.id==='lifesteal3')pass=G.player.lifesteal>=0.03;
      else if(a.id==='allRoles'){let b=S.loadBests();pass=Object.keys(D.ROLES).every(k=>b[k]&&b[k].time>=600);}
      else if(a.id==='role20min'){let b=S.loadBests();pass=Object.keys(D.ROLES).every(k=>b[k]&&b[k].time>=1200);}
    }catch(e){}
    if(pass){
      S.unlockedAchievements.push(a.id);S.saveAchievements();
      S.metaStats.soulStones+=a.reward;S.saveMeta();
      G.achievePopupQueue.push(`${a.icon} ${a.name} +${a.reward}🔮`);
    }
  }
}

// Boss attack helpers
function rangerBossShoot(boss){
  let dx=G.player.x-boss.x,dy=G.player.y-boss.y,ba=Math.atan2(dy,dx);
  let bd=Math.floor(2*getBossStatScale().dmgMult);
  for(let i=0;i<5;i++){let a=ba+(i/4-0.5)*0.7;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*220,vy:Math.sin(a)*220,radius:6,damage:bd,piercing:0,hitEnemies:new Set(),isCrit:false,life:3.5,fromBoss:true});}
}
function sorcererBossAttack(boss){
  boss.attackPhase=(boss.attackPhase||0)+1;let sd=getBossStatScale().dmgMult;
  if(boss.attackPhase%2===1){G.magicZones.push({x:G.player.x,y:G.player.y,radius:70,warningTime:1.2,activeTime:0.6,damage:Math.floor(4*sd),phase:'warning',timer:0});addFloatingText('✨ 魔法区域!',G.player.x,G.player.y-30,'#aa66ff');}
  else{let bd2=Math.floor(3*sd);for(let i=0;i<8;i++){let a=(i/8)*Math.PI*2;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*160,vy:Math.sin(a)*160,radius:7,damage:bd2,piercing:0,hitEnemies:new Set(),isCrit:false,life:3.5,fromBoss:true});}}
}

// Leaderboard
function syncLeaderboard(){
  let now=Date.now();if(now-G.lastLBSync<2000)return;G.lastLBSync=now;
  wx.request({url:SB_URL+'/live_sessions',method:'POST',
    header:{'apikey':D.SB_KEY,'Authorization':'Bearer '+D.SB_KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
    data:{session_id:G.sessionId,nick:G.playerNickname,duration:Math.round(G.gameTime*10)/10,updated_at:new Date().toISOString()},
    fail:()=>{}});
  let cutoff=new Date(now-10000).toISOString();
  wx.request({url:D.SB_URL+'/live_sessions?select=session_id,nick,duration&updated_at=gte.'+encodeURIComponent(cutoff)+'&order=duration.desc&limit=3',
    header:{'apikey':D.SB_KEY,'Authorization':'Bearer '+D.SB_KEY},
    success:res=>{if(Array.isArray(res.data))G.cachedLeaderboard=res.data;},fail:()=>{}});
}
function getLiveLeaderboard(){
  let lb=G.cachedLeaderboard.map(e=>e.session_id===G.sessionId?{...e,duration:G.gameTime}:e);
  if(!lb.find(e=>e.session_id===G.sessionId))lb.push({session_id:G.sessionId,nick:G.playerNickname,duration:G.gameTime});
  lb.sort((a,b)=>b.duration-a.duration);return lb.slice(0,3);
}
function formatDuration(s){let m=Math.floor(s/60),sec=Math.floor(s%60);return `${m}:${sec.toString().padStart(2,'0')}`;}

// Main update
function updateGame(dt, nowS){
  if(G.gameState!==D.STATE_PLAYING)return;
  G.gameTime+=dt;
  G.runStats.noDamageTimer+=dt;
  if(G.gameTime>=1800&&!G.voidMode){G.voidMode=true;addFloatingText('⚠️ 虚空降临!',G.player.x,G.player.y-80,'#9944ff');G.screenShakeTimer=0.5;G.screenShakeIntensity=10;}
  if(G.player.regen>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+G.player.regen*dt);
  if(G.player.invincibleTimer>0)G.player.invincibleTimer-=dt;
  if(G.player.damageFlash>0)G.player.damageFlash-=dt;
  if(G.player.dashCooldown>0)G.player.dashCooldown-=dt;
  if(G.screenShakeTimer>0)G.screenShakeTimer-=dt;
  if(G.player.skillTimer>0)G.player.skillTimer-=dt;
  if(G.player.slowTimer>0)G.player.slowTimer-=dt;
  if(G.player.skillActive){G.player.skillActive.timer-=dt;if(G.player.skillActive.timer<=0)G.player.skillActive=null;}
  if(G.player.comboTimer>0){G.player.comboTimer-=dt;if(G.player.comboCount>G.runStats.highestCombo)G.runStats.highestCombo=G.player.comboCount;if(G.player.comboTimer<=0)G.player.comboCount=0;}

  // Sword energy projectile
  if((D.ROLES[G.selectedRole]||D.ROLES.dot).weapon==='sword'){
    G.player.swordEnergyTimer=(G.player.swordEnergyTimer||0)+dt;
    if(G.player.swordEnergyTimer>=3.0){G.player.swordEnergyTimer=0;
      let aimDx=Math.cos(G.touchAimAngle),aimDy=Math.sin(G.touchAimAngle);
      let ba=Math.atan2(aimDy,aimDx),bc=G.player.bulletCount;
      let crit=Math.random()<G.player.critChance,dm=crit?G.player.critDamage:1.0;
      for(let i=0;i<bc;i++){let a=bc===1?ba:ba+(i/(bc-1)-0.5)*0.4,bx=Math.cos(a),by=Math.sin(a);
        G.bullets.push({x:G.player.x+bx*(G.player.radius+5),y:G.player.y+by*(G.player.radius+5),vx:bx*G.player.bulletSpeed*0.8,vy:by*G.player.bulletSpeed*0.8,
          radius:G.player.bulletSize+2,damage:G.player.damage*dm*1.2,piercing:G.player.piercing,hitEnemies:new Set(),isCrit:crit,life:2.0,fromBoss:false,weaponType:'swordEnergy'});}
      addFloatingText('⚔️',G.player.x,G.player.y-30,'#ff9944');
    }
  }

  // Movement
  if(G.player.isDashing){
    G.player.dashTimer-=dt;let ds=getFinalSpeed()*D.DASH_SPEED_MULT;
    G.player.x+=G.player.dashDirX*ds*dt;G.player.y+=G.player.dashDirY*ds*dt;
    if(G.player.dashTimer<=0)G.player.isDashing=false;
  }else{
    if(G.leftJoy.active){let jdx=G.leftJoy.kx-G.leftJoy.bx,jdy=G.leftJoy.ky-G.leftJoy.by,jd=Math.hypot(jdx,jdy);
      if(jd>D.JOY_DEAD){let sp2=getFinalSpeed()*(G.player.slowTimer>0?0.6:1)*Math.min(1,jd/D.JOY_R);G.player.x+=(jdx/jd)*sp2*dt;G.player.y+=(jdy/jd)*sp2*dt;}}
  }
  G.worldOffsetX=G.player.x-G.W/2;G.worldOffsetY=G.player.y-G.H/2;

  shootBullet(nowS);G.difficultyTimer+=dt;
  if(G.gameMode!=='bossRush')spawnEnemy(nowS);
  spawnChest(nowS);
  if(G.gameMode!=='bossRush')spawnElite(nowS);
  if(G.gameMode==='bossRush'){if(G.gameTime-G.lastBossSpawnTime>=55&&G.bossCountdown<=0){G.bossCountdown=D.BOSS_COUNTDOWN_TIME;addFloatingText(`⚠️ Boss ${D.BOSS_COUNTDOWN_TIME}秒后出现`,G.player.x,G.player.y-80,'#ff5555');}}else{checkBossCountdown(nowS);}

  // Horde events
  G.hordeTimer+=dt;
  if(G.activeMutators.includes('pacifist')){G.player.pacifistTimer=(G.player.pacifistTimer||0)+dt;if(G.player.pacifistTimer>=240){addFloatingText('💀 时间到!',G.player.x,G.player.y-60,'#ff0000');damagePlayer(9999);}}
  if(G.hordeWarning>0){G.hordeWarning-=dt;if(G.hordeWarning<=0){
    let n=25+Math.floor(G.player.level*3);G.hordeCount++;
    let maxNew=Math.max(0,60-G.enemies.length);n=Math.min(n,maxNew);
    for(let i=0;i<n;i++){let a=Math.random()*Math.PI*2,d=350+Math.random()*200;
      let stats=getMonsterStatsByLevel(),r=5+Math.random()*6,hp=Math.max(1,Math.floor(r/3)*stats.healthMult+G.player.level*0.2),spd2=(30+Math.random()*50)*stats.speedMult;
      G.enemies.push({x:G.player.x+Math.cos(a)*d,y:G.player.y+Math.sin(a)*d,radius:r,health:hp,maxHealth:hp,speed:spd2,isBoss:false,isElite:false,type:'normal',attackTimer:0});}
    addFloatingText(`⚠️ 大波敌人! x${n}`,G.player.x,G.player.y-60,'#ff5555');
    let bonus=15+G.hordeCount*10;G.player.gold+=bonus;G.runStats.goldEarned+=bonus;addFloatingText(`+${bonus}💰 生存奖励`,G.player.x,G.player.y-30,'#ffd966');
  }}
  if(G.hordeTimer>=D.HORDE_INTERVAL&&G.hordeWarning<=0){G.hordeTimer=0;G.hordeWarning=D.HORDE_WARNING_TIME;addFloatingText('⚠️ 大波敌人即将来袭!',G.player.x,G.player.y-80,'#ff5555');}
  if(G.bossCountdown>0){G.bossCountdown-=dt;if(G.bossCountdown<=0){G.bossCountdown=0;spawnBoss(nowS);}}

  // Frost DOT
  if(SKILL_MODS.frostNovaDot>0){
    for(let i=G.enemies.length-1;i>=0;i--){let e=G.enemies[i];if((e.frozen||0)>0){e.health-=SKILL_MODS.frostNovaDot*dt;if(e.health<=0){spawnXpFromEnemy(e.x,e.y,e.radius);G.enemies.splice(i,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}}}
    for(let i=G.elites.length-1;i>=0;i--){let e=G.elites[i];if((e.frozen||0)>0){e.health-=SKILL_MODS.frostNovaDot*dt;if(e.health<=0){spawnXpFromEnemy(e.x,e.y,e.radius,false,true);G.elites.splice(i,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}}}
    for(let bs of G.bosses){if((bs.frozen||0)>0)bs.health-=SKILL_MODS.frostNovaDot*dt;}
  }

  // Enemy movement
  for(let e of G.enemies){
    if((e.frozen||0)>0){e.frozen-=dt;continue;}
    let dx=G.player.x-e.x,dy=G.player.y-e.y,dist=Math.hypot(dx,dy);
    if(e.type==='shooter'){let pref=220;if(dist>pref+30&&dist>0.01){let mv=e.speed*dt;e.x+=(dx/dist)*mv;e.y+=(dy/dist)*mv;}else if(dist<pref-30&&dist>0.01){let mv=e.speed*dt*0.5;e.x-=(dx/dist)*mv;e.y-=(dy/dist)*mv;}
      e.attackTimer=(e.attackTimer||0)+dt;if(e.attackTimer>=(G.activeMutators.includes('bulletHell')?1.0:2.0)&&dist>0.01){e.attackTimer=0;let sd=Math.floor(1*getMonsterStatsByLevel().dmgMult);G.bullets.push({x:e.x,y:e.y,vx:(dx/dist)*150,vy:(dy/dist)*150,radius:4,damage:sd,piercing:0,hitEnemies:new Set(),isCrit:false,life:3.0,fromBoss:true});}
    }else if(e.type==='shielded'){e.shieldAngle=Math.atan2(dy,dx);if(dist>0.01){let mv=e.speed*dt;e.x+=(dx/dist)*mv;e.y+=(dy/dist)*mv;}
    }else if(e.type==='healer'){let pref=200;if(dist>pref+30&&dist>0.01){let mv=e.speed*dt;e.x+=(dx/dist)*mv;e.y+=(dy/dist)*mv;}else if(dist<pref-30&&dist>0.01){let mv=e.speed*dt*0.5;e.x-=(dx/dist)*mv;e.y-=(dy/dist)*mv;}
      e.healTimer=(e.healTimer||0)+dt;if(e.healTimer>=3.0){e.healTimer=0;for(let h of G.enemies){if(h===e||h.health>=h.maxHealth)continue;if(Math.hypot(h.x-e.x,h.y-e.y)<150){h.health=Math.min(h.maxHealth,h.health+h.maxHealth*0.15);addFloatingText('+治疗',h.x,h.y-20,'#44bb44');}}}
    }else if(e.type==='swarm'){let fx=0,fy=0,fc=0;for(let oe of G.enemies){if(oe.type==='swarm'&&oe!==e){let od=Math.hypot(oe.x-e.x,oe.y-e.y);if(od<80&&od>0.01){fx+=(oe.x-e.x)/od;fy+=(oe.y-e.y)/od;fc++;}}}if(fc>0){fx/=fc;fy/=fc;}let tx=dx*0.7+fx*0.3,ty=dy*0.7+fy*0.3;let td=Math.hypot(tx,ty);if(td>0.01){let mv=e.speed*dt;e.x+=(tx/td)*mv;e.y+=(ty/td)*mv;}
    }else if(e.type==='teleporter'){e.teleportTimer=(e.teleportTimer||0)+dt;e.teleportInvuln=Math.max(0,(e.teleportInvuln||0)-dt);if(e.teleportTimer>=2.0){e.teleportTimer=0;e.teleportInvuln=0.3;let ta=Math.random()*Math.PI*2;e.x=G.player.x+Math.cos(ta)*150;e.y=G.player.y+Math.sin(ta)*150;spawnDeathParticles(e.x,e.y,e.radius,'#cc44cc',4);}if(dist>0.01&&e.teleportInvuln<=0){let mv=e.speed*dt;e.x+=(dx/dist)*mv;e.y+=(dy/dist)*mv;}
    }else{if(dist>0.01){let mv=e.speed*dt;e.x+=(dx/dist)*mv;e.y+=(dy/dist)*mv;}}
  }

  // Elite movement
  for(let e of G.elites){if((e.frozen||0)>0){e.frozen-=dt;continue;}let dx=G.player.x-e.x,dy=G.player.y-e.y,d=Math.hypot(dx,dy);if(d>0.01){let mv=e.speed*dt;e.x+=(dx/d)*mv;e.y+=(dy/d)*mv;}}

  // Boss AI
  for(let boss of G.bosses){
    if((boss.frozen||0)>0){boss.frozen-=dt;continue;}
    let dx=G.player.x-boss.x,dy=G.player.y-boss.y,dist=Math.hypot(dx,dy);
    if(boss.bossType==='berserker'){
      if(!boss.isCharging&&!boss.chargeWindup){if(dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}boss.chargeTimer+=dt;
        if(boss.chargeTimer>=boss.attackInterval*getBossCDMult()&&dist<400){boss.chargeWindup=0.8;boss.chargeTimer=0;if(dist>0.01){boss.chargeDx=dx/dist;boss.chargeDy=dy/dist;}boss.chargeTargetX=G.player.x;boss.chargeTargetY=G.player.y;addFloatingText('⚠️ 冲锋!',boss.x,boss.y-30,'#ff4444');}}
      else if(boss.chargeWindup>0){boss.chargeWindup-=dt;if(boss.chargeWindup<=0){boss.chargeWindup=0;boss.isCharging=true;boss.chargeDuration=0.6;addFloatingText('💨',boss.x,boss.y-30,'#ff4444');}}
      else if(boss.isCharging){boss.chargeDuration-=dt;boss.x+=boss.chargeDx*boss.chargeSpeed*dt;boss.y+=boss.chargeDy*boss.chargeSpeed*dt;if(boss.chargeDuration<=0)boss.isCharging=false;}
    }else if(boss.bossType==='ranger'){
      let pref=280;if(dist>pref+50&&dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}else if(dist<pref-50&&dist>0.01){let mv=boss.speed*dt*0.7;boss.x-=(dx/dist)*mv;boss.y-=(dy/dist)*mv;}
      boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()){boss.attackTimer=0;rangerBossShoot(boss);}
    }else if(boss.bossType==='sorcerer'){
      if(dist>300&&dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}
      boss.teleportCooldown-=dt;if(dist<120&&boss.teleportCooldown<=0){let ta=Math.random()*Math.PI*2,td=300+Math.random()*150;boss.x=G.player.x+Math.cos(ta)*td;boss.y=G.player.y+Math.sin(ta)*td;boss.teleportCooldown=5;addFloatingText('✨',boss.x,boss.y-30,'#aa66ff');}
      boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()){boss.attackTimer=0;sorcererBossAttack(boss);}
    }else if(boss.bossType==='summoner'){
      let pref=350;if(dist<pref-50&&dist>0.01){let mv=boss.speed*dt*1.5;boss.x-=(dx/dist)*mv;boss.y-=(dy/dist)*mv;}else if(dist>pref+50&&dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}
      boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()){boss.attackTimer=0;boss.summonCount=(boss.summonCount||0)+1;let n=3+Math.floor(Math.random()*3);let stats=getMonsterStatsByLevel();
        for(let si=0;si<n;si++){let sa=Math.random()*Math.PI*2,sd=40+Math.random()*30;let sr=6+Math.random()*4,shp=Math.max(2,Math.floor(sr/3)*stats.healthMult+G.player.level*0.3),sspd=(25+Math.random()*30)*stats.speedMult;
          if(boss.summonCount%3===0){sr=14;shp=Math.floor(shp*3);sspd*=0.7;G.elites.push({x:boss.x+Math.cos(sa)*sd,y:boss.y+Math.sin(sa)*sd,radius:sr,health:shp,maxHealth:shp,speed:sspd,isElite:true,isBoss:false});}
          else{G.enemies.push({x:boss.x+Math.cos(sa)*sd,y:boss.y+Math.sin(sa)*sd,radius:sr,health:shp,maxHealth:shp,speed:sspd,isBoss:false,isElite:false,type:'normal',attackTimer:0,shieldAngle:0,healTimer:0});}}
        addFloatingText(boss.summonCount%3===0?'👹 精英召唤!':'👻 召唤!',boss.x,boss.y-40,'#ffaa00');}
      if(!boss.hasAbsorbed&&boss.health<boss.maxHealth*0.3){boss.hasAbsorbed=true;let absorbed=0;
        for(let ei=G.enemies.length-1;ei>=0;ei--){let me=G.enemies[ei];if(Math.hypot(me.x-boss.x,me.y-boss.y)<200){boss.health=Math.min(boss.maxHealth,boss.health+boss.maxHealth*0.05);spawnDeathParticles(me.x,me.y,me.radius,'#ffaa00',4);G.enemies.splice(ei,1);absorbed++;}}
        if(absorbed>0)addFloatingText(`🔮 吸收了${absorbed}个随从!`,boss.x,boss.y-50,'#ff4444');G.screenShakeTimer=0.3;G.screenShakeIntensity=8;}
    }else if(boss.bossType==='juggernaut'){
      if(!boss.enraged&&boss.health<boss.maxHealth*0.5){boss.enraged=true;boss.speed*=2;boss.attackInterval*=0.5;addFloatingText('💢 暴怒!',boss.x,boss.y-50,'#ff4444');G.screenShakeTimer=0.3;G.screenShakeIntensity=10;}
      if(dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}
      boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()){boss.attackTimer=0;let sd=getBossStatScale().dmgMult;
        if(dist<150){let sr=180;for(let e of G.enemies){if(Math.hypot(e.x-boss.x,e.y-boss.y)<sr){let ka=Math.atan2(e.y-boss.y,e.x-boss.x);e.x+=Math.cos(ka)*60;e.y+=Math.sin(ka)*60;}}if(Math.hypot(G.player.x-boss.x,G.player.y-boss.y)<sr+G.player.radius){tryDodgeOrDamage(Math.floor(6*sd));}addFloatingText('💥 地震!',boss.x,boss.y-30,'#88aa88');G.screenShakeTimer=0.25;G.screenShakeIntensity=8;}
        else{let ba=Math.atan2(dy,dx),bd=Math.floor(4*sd);for(let i=0;i<3;i++){let a=ba+(i-1)*0.3;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*140,vy:Math.sin(a)*140,radius:10,damage:bd,piercing:0,hitEnemies:new Set(),isCrit:false,life:4.0,fromBoss:true});}}}
    }else if(boss.bossType==='twins_fire'){
      if(dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}
      boss.fireTrailTimer=(boss.fireTrailTimer||0)+dt;if(boss.fireTrailTimer>=0.3){boss.fireTrailTimer=0;G.magicZones.push({x:boss.x,y:boss.y,radius:25,warningTime:0,activeTime:2.0,damage:Math.floor(2*getBossStatScale().dmgMult),phase:'active',timer:0});}
    }else if(boss.bossType==='twins_ice'){
      let pref=250;if(dist>pref+50&&dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}else if(dist<pref-50&&dist>0.01){let mv=boss.speed*dt*0.7;boss.x-=(dx/dist)*mv;boss.y-=(dy/dist)*mv;}
      boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()){boss.attackTimer=0;let sd=getBossStatScale().dmgMult;let ba=Math.atan2(dy,dx);
        for(let i=0;i<3;i++){let a=ba+(i-1)*0.25;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,radius:6,damage:Math.floor(2*sd),piercing:0,hitEnemies:new Set(),isCrit:false,life:3.0,fromBoss:true,slows:true});}}
    }else if(boss.bossType==='archmage'){
      let hpPct=boss.health/boss.maxHealth;
      if(hpPct>0.6){if(dist>300&&dist>0.01){let mv=boss.speed*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()){boss.attackTimer=0;boss.attackPhase=(boss.attackPhase||0)+1;let sd=getBossStatScale().dmgMult;let ba=Math.atan2(dy,dx);
        if(boss.attackPhase%3===1){for(let i=0;i<5;i++){let a=ba+(i/4-0.5)*0.8;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*200,vy:Math.sin(a)*200,radius:6,damage:Math.floor(2*sd),piercing:0,hitEnemies:new Set(),isCrit:false,life:3.0,fromBoss:true});}}
        else if(boss.attackPhase%3===2){G.magicZones.push({x:G.player.x,y:G.player.y,radius:60,warningTime:1.0,activeTime:0.5,damage:Math.floor(3*sd),phase:'warning',timer:0});}
        else{for(let i=0;i<8;i++){let a=(i/8)*Math.PI*2;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*160,vy:Math.sin(a)*160,radius:5,damage:Math.floor(2*sd),piercing:0,hitEnemies:new Set(),isCrit:false,life:3.0,fromBoss:true});}}}}
      else if(hpPct>0.3){if(!boss.phase2Done){boss.phase2Done=true;for(let ci=0;ci<2;ci++){let ca=Math.random()*Math.PI*2,cd=80;G.bosses.push({x:boss.x+Math.cos(ca)*cd,y:boss.y+Math.sin(ca)*cd,radius:boss.radius*0.7,health:1,maxHealth:1,speed:boss.speed*1.2,isBoss:true,bossType:'archmage',attackTimer:0,attackInterval:boss.attackInterval*1.5,contactDamage:2,chargeTimer:0,isCharging:false,chargeDuration:0,chargeDx:0,chargeDy:0,chargeSpeed:0,teleportCooldown:0,attackPhase:0,summonCount:0,hasAbsorbed:false,armor:0,enraged:false,twinAlive:true,fireTrailTimer:0,isClone:true,phase2Done:true,phase3Done:true});}addFloatingText('👥 镜像分身!',boss.x,boss.y-50,'#ff88ff');}
        if(dist>0.01){let mv=boss.speed*1.3*dt;boss.x+=(dx/dist)*mv;boss.y+=(dy/dist)*mv;}boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()*0.8){boss.attackTimer=0;let sd=getBossStatScale().dmgMult;let ba=Math.atan2(dy,dx);for(let i=0;i<6;i++){let a=ba+(i/5-0.5)*1.0;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*200,vy:Math.sin(a)*200,radius:5,damage:Math.floor(2*sd),piercing:0,hitEnemies:new Set(),isCrit:false,life:3.0,fromBoss:true});}}}
      else{if(!boss.phase3Done){boss.phase3Done=true;addFloatingText('⚡ 最终形态!',boss.x,boss.y-50,'#ff44ff');boss.radius=Math.max(20,boss.radius*0.7);boss.speed*=1.5;}
        boss.teleportCooldown=(boss.teleportCooldown||0)-dt;if(boss.teleportCooldown<=0){boss.teleportCooldown=3;let ta=Math.random()*Math.PI*2,td=200+Math.random()*100;boss.x=G.player.x+Math.cos(ta)*td;boss.y=G.player.y+Math.sin(ta)*td;spawnDeathParticles(boss.x,boss.y,boss.radius,'#ff44ff',8);}
        if(dist<120){tryDodgeOrDamage(Math.floor(1*getBossStatScale().dmgMult));}
        boss.attackTimer+=dt;if(boss.attackTimer>=boss.attackInterval*getBossCDMult()*0.5){boss.attackTimer=0;let sd=getBossStatScale().dmgMult;for(let i=0;i<12;i++){let a=(i/12)*Math.PI*2;G.bullets.push({x:boss.x,y:boss.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,radius:5,damage:Math.floor(2*sd),piercing:0,hitEnemies:new Set(),isCrit:false,life:3.5,fromBoss:true});}}}
    }
  }

  // Clones
  for(let i=G.clones.length-1;i>=0;i--){let c=G.clones[i];c.timer-=dt;if(c.timer<=0){G.clones.splice(i,1);continue;}
    let ne=findNearestEnemy();if(ne){let cd=Math.hypot(ne.x-c.x,ne.y-c.y);if(cd>0.01){c.x+=(ne.x-c.x)/cd*150*dt;c.y+=(ne.y-c.y)/cd*150*dt;}
      c.shootTimer-=dt;if(c.shootTimer<=0){c.shootTimer=0.5;let ca=Math.atan2(ne.y-c.y,ne.x-c.x),cdm=1+SKILL_MODS.cloneDmgMult;
        G.bullets.push({x:c.x,y:c.y,vx:Math.cos(ca)*400,vy:Math.sin(ca)*400,radius:4,damage:G.player.damage*0.5*cdm,piercing:0,hitEnemies:new Set(),isCrit:false,life:2.0,fromBoss:false,weaponType:'dot'});}}}

  // Friendly ghosts
  for(let i=G.friendlyGhosts.length-1;i>=0;i--){let g=G.friendlyGhosts[i];g.timer-=dt;if(g.timer<=0){G.friendlyGhosts.splice(i,1);continue;}
    let ne=findNearestEnemy();if(ne){let gd=Math.hypot(ne.x-g.x,ne.y-g.y);if(gd>0.01){g.x+=(ne.x-g.x)/gd*120*dt;g.y+=(ne.y-g.y)/gd*120*dt;}
      g.shootTimer-=dt;if(g.shootTimer<=0){g.shootTimer=0.8;let ga=Math.atan2(ne.y-g.y,ne.x-g.x);
        G.bullets.push({x:g.x,y:g.y,vx:Math.cos(ga)*350,vy:Math.sin(ga)*350,radius:4,damage:G.player.damage*0.4,piercing:0,hitEnemies:new Set(),isCrit:false,life:2.0,fromBoss:false,weaponType:'soulBolt',marks:true});}}}

  // Player zones (arrow rain)
  for(let i=G.playerZones.length-1;i>=0;i--){let z=G.playerZones[i];z.timer+=dt;if(z.timer>=z.duration){G.playerZones.splice(i,1);continue;}
    z.lastTick+=dt;if(z.lastTick>=z.tickInterval){z.lastTick=0;
      for(let j=G.enemies.length-1;j>=0;j--){let e=G.enemies[j];if(Math.hypot(e.x-z.x,e.y-z.y)<z.radius+e.radius){e.health-=z.damage;if(e.health<=0){spawnXpFromEnemy(e.x,e.y,e.radius);G.enemies.splice(j,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}}}
      for(let j=G.elites.length-1;j>=0;j--){let e=G.elites[j];if(Math.hypot(e.x-z.x,e.y-z.y)<z.radius+e.radius){e.health-=z.damage;if(e.health<=0){spawnXpFromEnemy(e.x,e.y,e.radius,false,true);G.elites.splice(j,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}}}
      for(let bs of G.bosses){if(Math.hypot(bs.x-z.x,bs.y-z.y)<z.radius+bs.radius){bs.health-=z.damage;}}}}

  // Magic zones
  for(let i=G.magicZones.length-1;i>=0;i--){let z=G.magicZones[i];z.timer+=dt;
    if(z.phase==='warning'&&z.timer>=z.warningTime){z.phase='active';z.timer=0;}
    if(z.phase==='active'){if(z.timer>=z.activeTime){G.magicZones.splice(i,1);continue;}
      let pd=Math.hypot(G.player.x-z.x,G.player.y-z.y);if(pd<z.radius+G.player.radius)tryDodgeOrDamage(z.damage);}}

  // Bullets
  for(let i=G.bullets.length-1;i>=0;i--){let b=G.bullets[i];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0){G.bullets.splice(i,1);continue;}
    if(b.fromBoss){let pd=Math.hypot(G.player.x-b.x,G.player.y-b.y);
      if(pd<G.player.radius+b.radius){tryDodgeOrDamage(b.damage);if(b.slows)G.player.slowTimer=Math.max(G.player.slowTimer,1.5);G.bullets.splice(i,1);continue;}}
    else{let hit=false;
      // vs enemies
      for(let j=G.enemies.length-1;j>=0;j--){let e=G.enemies[j];if(b.hitEnemies.has(e))continue;let ed=Math.hypot(e.x-b.x,e.y-b.y);
        if(ed<e.radius+b.radius){
          if(e.type==='shielded'){let ba2=Math.atan2(b.vy,b.vx),da=Math.abs(((ba2-(e.shieldAngle||0)+Math.PI*3)%(Math.PI*2))-Math.PI);if(da<Math.PI/4){b.life=0;hit=true;break;}}
          if((e.teleportInvuln||0)>0){b.hitEnemies.add(e);continue;}
          e.health-=b.damage;b.hitEnemies.add(e);if(b.marks)e.marked=true;showDmg(e,b.damage,b.isCrit);G.runStats.damageDealt+=b.damage;if(b.isCrit)G.runStats.totalCrits++;
          if(G.player.lifesteal>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+b.damage*G.player.lifesteal);
          if(e.health<=0){
            if(e.marked){G.friendlyGhosts.push({x:e.x,y:e.y,timer:5,shootTimer:0});}
            flushDmg(e);G.recentDeaths.push({x:e.x,y:e.y,timer:10});
            if(e.type==='exploder'){let er2=50;for(let pe of G.enemies){if(pe!==e&&Math.hypot(pe.x-e.x,pe.y-e.y)<er2){pe.health-=5;}}let pd2=Math.hypot(G.player.x-e.x,G.player.y-e.y);if(pd2<er2+G.player.radius)tryDodgeOrDamage(3);spawnDeathParticles(e.x,e.y,er2,'#ff8800',15);}
            if(e.type==='splitter'){let stats=getMonsterStatsByLevel();for(let mi=0;mi<2;mi++){let ma=Math.random()*Math.PI*2,mr=e.radius*0.5,mhp=Math.max(1,Math.floor(e.maxHealth*0.3)),msp=e.speed*1.3;G.enemies.push({x:e.x+Math.cos(ma)*15,y:e.y+Math.sin(ma)*15,radius:mr,health:mhp,maxHealth:mhp,speed:msp,isBoss:false,isElite:false,type:'mini',attackTimer:0,shieldAngle:0,healTimer:0});}}
            spawnXpFromEnemy(e.x,e.y,e.radius);G.enemies.splice(j,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;
          }
          if(b.piercing<=0){hit=true;break;}else b.piercing--;}}
      if(!hit){// vs elites
        for(let j=G.elites.length-1;j>=0;j--){let e=G.elites[j];if(b.hitEnemies.has(e))continue;let ed=Math.hypot(e.x-b.x,e.y-b.y);
          if(ed<e.radius+b.radius){e.health-=b.damage;b.hitEnemies.add(e);if(b.marks)e.marked=true;showDmg(e,b.damage,b.isCrit);G.runStats.damageDealt+=b.damage;if(b.isCrit)G.runStats.totalCrits++;if(G.player.lifesteal>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+b.damage*G.player.lifesteal);
            if(e.health<=0){if(e.marked){G.friendlyGhosts.push({x:e.x,y:e.y,timer:5,shootTimer:0});}flushDmg(e);spawnXpFromEnemy(e.x,e.y,e.radius,false,true);G.elites.splice(j,1);G.killCount++;G.player.comboCount++;G.player.comboTimer=2;}if(b.piercing<=0){hit=true;break;}else b.piercing--;}}}
      if(!hit){// vs bosses
        for(let j=G.bosses.length-1;j>=0;j--){let bs=G.bosses[j];if(b.hitEnemies.has(bs))continue;let bd=Math.hypot(bs.x-b.x,bs.y-b.y);
          if(bd<bs.radius+b.radius){let bDmg=b.damage;if(bs.armor>0)bDmg=Math.max(1,bDmg-bs.armor);
            bs.health-=bDmg;b.hitEnemies.add(bs);showDmg(bs,bDmg,b.isCrit);G.runStats.damageDealt+=bDmg;if(b.isCrit)G.runStats.totalCrits++;if(G.player.lifesteal>0)G.player.hp=Math.min(G.player.maxHp,G.player.hp+b.damage*G.player.lifesteal);
            if(bs.health<=0){flushDmg(bs);G.bosses.splice(j,1);
              if(bs.isClone){spawnDeathParticles(bs.x,bs.y,bs.radius,'#ff88ff',8);continue;}
              spawnXpFromEnemy(bs.x,bs.y,bs.radius,true);G.killCount++;G.bossKillCount++;G.player.pacifistTimer=0;
              // Twin enrage
              if(bs.bossType==='twins_fire'||bs.bossType==='twins_ice'){for(let ob of G.bosses){if((ob.bossType==='twins_fire'||ob.bossType==='twins_ice')&&ob.twinAlive){ob.twinAlive=false;ob.enraged=true;ob.speed*=1.5;ob.attackInterval*=0.5;ob.health=ob.maxHealth;addFloatingText('💢 双子暴怒!',ob.x,ob.y-50,'#ff4444');}}}
              // Skill upgrade
              if(G.skillLevel<D.MAX_SKILL_LEVEL&&D.ROLES[G.selectedRole]&&D.ROLES[G.selectedRole].skill){G.skillUpOptions=generateSkillUpOptions();G.gameState=D.STATE_SKILL_UP;G.stateInputCooldown=0.15;}
              else{G.gameState=G.activeMutators.includes('noShop')?D.STATE_PLAYING:D.STATE_SHOP;G.shopItems=generateShopItems();G.shopRefreshCount=0;G.stateInputCooldown=0.15;}
            }
            if(b.piercing<=0){hit=true;break;}else b.piercing--;}}}
      if(hit)G.bullets.splice(i,1);
    }
  }

  // XP orbs
  let magR=80+G.player.magnetRange;
  for(let i=G.xpOrbs.length-1;i>=0;i--){let o=G.xpOrbs[i],dx=G.player.x-o.x,dy=G.player.y-o.y,d=Math.hypot(dx,dy);
    if(d<magR||o.vacuumed){let ms=o.vacuumed?800:300;if(d>0.01){o.x+=(dx/d)*ms*dt;o.y+=(dy/d)*ms*dt;}}
    if(d<G.player.radius+o.radius){G.player.exp+=o.value;G.xpOrbs.splice(i,1);}}

  // Auto-open chests
  for(let i=0;i<G.chests.length;i++){let c=G.chests[i];if(c.isOpen)continue;
    let cd=Math.hypot(c.x-G.player.x,c.y-G.player.y);if(cd<c.radius+G.player.radius+20){openChest(i);break;}}

  // Player vs enemies contact
  if(G.player.invincibleTimer<=0&&!G.player.isDashing){
    for(let e of G.enemies){let dx=G.player.x-e.x,dy=G.player.y-e.y,dist=Math.hypot(dx,dy),md=G.player.radius+e.radius;
      if(dist<md){if(dist>0.001){let ov=md-dist,a=Math.atan2(dy,dx);G.player.x+=Math.cos(a)*ov*0.6;G.player.y+=Math.sin(a)*ov*0.6;}
        tryDodgeOrDamage(Math.floor(Math.max(2,Math.floor(e.radius/3))*getMonsterStatsByLevel().dmgMult));}}
    for(let e of G.elites){let dx=G.player.x-e.x,dy=G.player.y-e.y,dist=Math.hypot(dx,dy),md=G.player.radius+e.radius;
      if(dist<md){if(dist>0.001){let ov=md-dist,a=Math.atan2(dy,dx);G.player.x+=Math.cos(a)*ov*0.6;G.player.y+=Math.sin(a)*ov*0.6;}tryDodgeOrDamage(Math.floor(Math.max(2,Math.floor(e.radius/4))*getEliteStatScale().dmgMult));}}
    for(let bs of G.bosses){let dx=G.player.x-bs.x,dy=G.player.y-bs.y,dist=Math.hypot(dx,dy),md=G.player.radius+bs.radius;
      if(dist<md){if(dist>0.001){let ov=md-dist,a=Math.atan2(dy,dx);G.player.x+=Math.cos(a)*ov*0.4;G.player.y+=Math.sin(a)*ov*0.4;}tryDodgeOrDamage(Math.floor(bs.contactDamage*getBossStatScale().dmgMult));}}
  }

  // Floating texts
  for(let i=G.floatingTexts.length-1;i>=0;i--){G.floatingTexts[i].life-=dt;if(G.floatingTexts[i].life<=0)G.floatingTexts.splice(i,1);}
  // Particles
  for(let i=G.particles.length-1;i>=0;i--){let p=G.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;p.vx*=0.95;p.vy*=0.95;if(p.life<=0)G.particles.splice(i,1);}
  // Flush accumulated damage
  for(let[e,a]of G.dmgAccum){a.timer-=dt;if(a.timer<=0){let col=a.crits>0?'#ff4444':'#ffffff';let txt=Math.round(a.total).toString();if(a.crits>0)txt='💥'+txt;addFloatingText(txt,a.x,a.y-20,col);G.dmgAccum.delete(e);}}

  checkLevelUp();
  if(Math.floor(G.gameTime*2)%6===0)checkAchievements();
}

module.exports = {
  G, SKILL_MODS, initGameState, resetGame, updateGame, checkUnlocks, buyPerm, doPrestige,
  triggerDash, activateSkill, applyUpgrade, applySkillUpgrade,
  buyShopItem, refreshShop, generateShopItems,
  addFloatingText, getFinalSpeed, getFinalDodge, clamp,
  syncLeaderboard, getLiveLeaderboard, formatDuration,
};
