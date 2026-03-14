// game.js - WeChat Mini Game Entry Point
const D = require('./js/data');
const L = require('./js/logic');
const S = require('./js/storage');

// --- Canvas setup ---
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
let W, H;
function initCanvas() {
  const info = wx.getSystemInfoSync();
  W = info.windowWidth; H = info.windowHeight;
  canvas.width = W; canvas.height = H;
}
initCanvas();

L.initGameState();
const G = L.G;
let lastTimestamp = 0;
let menuTab = 'upgrades';

// --- Touch ---
wx.onTouchStart(handleTouchStart);
wx.onTouchMove(handleTouchMove);
wx.onTouchEnd(handleTouchEnd);

// --- Layout helpers (shared between draw & touch) ---
function menuLayout() {
  const cx = W/2;
  const roles = Object.entries(D.ROLES);
  const cardW = Math.min(W*0.14, 120), cardH = H*0.32;
  const totalCardsW = roles.length*(cardW+6)-6;
  const cardsX = cx - totalCardsW/2;
  const cardsY = H*0.14;
  const tabY = cardsY + cardH + H*0.03;
  const tabW = W*0.18, tabH = H*0.06;
  const tabs = ['upgrades','history','achievements'];
  const tabsX = cx - (tabs.length*(tabW+8)-8)/2;
  const contentY = tabY + tabH + H*0.02;
  const btnW = W*0.3, btnH = H*0.1, btnX = cx-btnW/2, btnY = H-btnH-H*0.03;
  return {cx,roles,cardW,cardH,cardsX,cardsY,tabY,tabW,tabH,tabs,tabsX,contentY,btnW,btnH,btnX,btnY};
}
function upgradeLayout(contentY) {
  const upgW = Math.min(W*0.14,110), upgH = H*0.12;
  const cx = W/2;
  const startX = cx - (D.PERM_UPGRADES.length*(upgW+6)-6)/2;
  const uy = contentY + H*0.04;
  return {upgW,upgH,startX,uy};
}
function overlayLayout() {
  const pnW=W*0.7, pnH=H*0.78, pnX=(W-pnW)/2, pnY=(H-pnH)/2;
  return {pnW,pnH,pnX,pnY};
}

// --- Round rect helper ---
function rr(x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

// ===== DRAW MENU =====
function drawMenu() {
  ctx.fillStyle='#0b0e14'; ctx.fillRect(0,0,W,H);
  const {cx,roles,cardW,cardH,cardsX,cardsY,tabY,tabW,tabH,tabs,tabsX,contentY,btnW,btnH,btnX,btnY} = menuLayout();

  // Title
  ctx.textAlign='center';
  ctx.fillStyle='#fadf9e'; ctx.font=`bold ${H*0.07}px sans-serif`;
  ctx.fillText('Dot · Roguelike', cx, H*0.09);
  ctx.fillStyle='#7e8a9a'; ctx.font=`${H*0.035}px sans-serif`;
  ctx.fillText('点·火柴人 · 肉鸽', cx, H*0.13);

  // Role cards
  roles.forEach(([key,r],i) => {
    const rx = cardsX + i*(cardW+6), sel = G.selectedRole===key, locked = r.locked;
    ctx.globalAlpha = locked?0.4:1;
    ctx.fillStyle = sel?'#2a2f3b':'#1a1f2b';
    ctx.strokeStyle = sel?'#ffd966':(locked?'#3a3025':'#4a3f35');
    ctx.lineWidth = sel?2.5:1.5;
    rr(rx,cardsY,cardW,cardH,8); ctx.fill(); ctx.stroke();
    // dot icon
    ctx.beginPath(); ctx.arc(rx+cardW/2, cardsY+H*0.06, 10, 0, Math.PI*2);
    ctx.fillStyle=r.color; ctx.shadowColor=r.glow; ctx.shadowBlur=10; ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle='#fadf9e'; ctx.font=`bold ${H*0.025}px sans-serif`;
    ctx.fillText(r.name, rx+cardW/2, cardsY+H*0.1);
    ctx.fillStyle='#7e8a9a'; ctx.font=`${H*0.018}px sans-serif`;
    r.desc.split('·').forEach((d,di)=>ctx.fillText(d.trim(), rx+cardW/2, cardsY+H*0.135+di*H*0.025));
    if(r.skill){ctx.fillStyle='#aaddff'; ctx.font=`${H*0.017}px sans-serif`; ctx.fillText(r.skillName, rx+cardW/2, cardsY+cardH-H*0.06);}
    if(locked){ctx.fillStyle='#ff6655'; ctx.font=`${H*0.014}px sans-serif`; ctx.fillText('🔒 '+r.unlockDesc.slice(0,10), rx+cardW/2, cardsY+cardH-H*0.025);}
    ctx.globalAlpha=1;
  });

  // Tabs
  tabs.forEach((t,i)=>{
    const tx=tabsX+i*(tabW+8), active=menuTab===t;
    ctx.fillStyle=active?'#262d3a':'#1a1f2b'; ctx.strokeStyle=active?'#aa8b6e':'#3a3025'; ctx.lineWidth=1.5;
    rr(tx,tabY,tabW,tabH,6); ctx.fill(); ctx.stroke();
    ctx.fillStyle=active?'#fadf9e':'#7e8a9a'; ctx.font=`${H*0.022}px sans-serif`;
    const labels=['🔮 强化','📜 历史','🏅 成就'];
    ctx.fillText(labels[i], tx+tabW/2, tabY+tabH*0.62);
  });

  // Tab content
  if(menuTab==='upgrades') drawUpgradeTab(contentY);
  else if(menuTab==='history') drawHistoryTab(contentY);
  else drawAchievementsTab(contentY);

  // Soul stones
  ctx.fillStyle='#b366ff'; ctx.font=`${H*0.024}px sans-serif`;
  ctx.fillText(`🔮 灵魂石: ${S.metaStats.soulStones}`, cx, contentY+H*0.025);

  // Start button
  ctx.fillStyle='#3a2820'; ctx.strokeStyle='#aa8b6e'; ctx.lineWidth=2;
  rr(btnX,btnY,btnW,btnH,12); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#fadf9e'; ctx.font=`bold ${H*0.042}px sans-serif`;
  ctx.fillText('▶ 开始游戏', cx, btnY+btnH*0.64);
  ctx.textAlign='left';
}

function drawUpgradeTab(contentY) {
  const {upgW,upgH,startX,uy} = upgradeLayout(contentY);
  D.PERM_UPGRADES.forEach((u,i)=>{
    const lv=S.permLevels[u.key]||0, cost=u.cost(lv), maxed=lv>=u.max, canBuy=!maxed&&S.metaStats.soulStones>=cost;
    const ux=startX+i*(upgW+6);
    ctx.fillStyle=maxed?'#1a2a1a':canBuy?'#1e2533':'#1a1f2b';
    ctx.strokeStyle=maxed?'#44aa44':canBuy?'#6666aa':'#3a3025'; ctx.lineWidth=1.5;
    rr(ux,uy,upgW,upgH,6); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fadf9e'; ctx.font=`${H*0.022}px sans-serif`; ctx.textAlign='center';
    ctx.fillText(u.name, ux+upgW/2, uy+H*0.032);
    ctx.fillStyle='#7e8a9a'; ctx.font=`${H*0.017}px sans-serif`;
    ctx.fillText(`${lv}/${u.max}`, ux+upgW/2, uy+H*0.058);
    ctx.fillStyle=maxed?'#44aa44':'#b366ff'; ctx.font=`${H*0.016}px sans-serif`;
    ctx.fillText(maxed?'已满':`${cost}🔮`, ux+upgW/2, uy+H*0.082);
    ctx.textAlign='left';
  });
}

function drawHistoryTab(contentY) {
  const history = S.loadHistory();
  ctx.font=`${H*0.02}px sans-serif`; ctx.textAlign='left';
  if(!history.length){ctx.fillStyle='#7e8a9a'; ctx.textAlign='center'; ctx.fillText('暂无记录',W/2,contentY+H*0.07); ctx.textAlign='left'; return;}
  history.slice(0,5).forEach((run,i)=>{
    const role=D.ROLES[run.role], rn=role?role.name:run.role;
    const m=Math.floor(run.time/60), s=run.time%60;
    ctx.fillStyle='#cbad8e';
    ctx.fillText(`${rn} | ${m}:${s.toString().padStart(2,'0')} | Lv${run.level} | 💀${run.kills} | 👑${run.bossKills} | +${run.soulStones}🔮`, W*0.08, contentY+H*0.05+i*H*0.04);
  });
}

function drawAchievementsTab(contentY) {
  const unlocked=S.unlockedAchievements, cols=5;
  const aw=W*0.17, ah=H*0.1, sx=(W-cols*(aw+6)+6)/2;
  D.ACHIEVEMENTS.forEach((a,i)=>{
    const isUnlocked=unlocked.includes(a.id), col=i%cols, row=Math.floor(i/cols);
    const ax=sx+col*(aw+6), ay=contentY+H*0.03+row*(ah+5);
    ctx.fillStyle=isUnlocked?'#1a2a1a':'#12151e'; ctx.strokeStyle=isUnlocked?'#44aa44':'#3a3025'; ctx.lineWidth=1;
    rr(ax,ay,aw,ah,5); ctx.fill(); ctx.stroke();
    ctx.fillStyle=isUnlocked?'#fadf9e':'#555566'; ctx.font=`${H*0.02}px sans-serif`; ctx.textAlign='center';
    ctx.fillText(a.icon+' '+a.name, ax+aw/2, ay+ah*0.45);
    ctx.fillStyle=isUnlocked?'#7e8a9a':'#444455'; ctx.font=`${H*0.015}px sans-serif`;
    ctx.fillText(a.desc.slice(0,10), ax+aw/2, ay+ah*0.72);
    ctx.textAlign='left';
  });
}

// ===== DRAW GAME =====
function draw() {
  ctx.fillStyle='#10131f'; ctx.fillRect(0,0,W,H);
  if(G.gameState===D.STATE_MENU){drawMenu();return;}

  const player=G.player;
  let shX=0,shY=0;
  if(G.screenShakeTimer>0){shX=(Math.random()-0.5)*G.screenShakeIntensity;shY=(Math.random()-0.5)*G.screenShakeIntensity;}
  ctx.save(); ctx.translate(shX,shY);

  const w2s=(wx,wy)=>({x:wx-G.worldOffsetX,y:wy-G.worldOffsetY});
  const now=Date.now();

  // Grid
  ctx.strokeStyle=G.voidMode?'#301840':'#202a33'; ctx.lineWidth=1;
  const gsx=Math.floor(G.worldOffsetX/40)*40-G.worldOffsetX, gsy=Math.floor(G.worldOffsetY/40)*40-G.worldOffsetY;
  for(let i=gsx;i<W;i+=40){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,H);ctx.stroke();}
  for(let i=gsy;i<H;i+=40){ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(W,i);ctx.stroke();}

  // Magic zones
  for(let z of G.magicZones){const{x,y}=w2s(z.x,z.y);
    if(z.phase==='warning'){const p=0.3+0.3*Math.sin(z.timer*8);ctx.beginPath();ctx.arc(x,y,z.radius,0,Math.PI*2);ctx.fillStyle=`rgba(170,100,255,${p*0.2})`;ctx.fill();ctx.strokeStyle=`rgba(170,100,255,${p})`;ctx.lineWidth=3;ctx.stroke();}
    else{ctx.beginPath();ctx.arc(x,y,z.radius,0,Math.PI*2);ctx.fillStyle='rgba(170,50,255,0.45)';ctx.shadowColor='#aa00ff';ctx.shadowBlur=20;ctx.fill();ctx.shadowBlur=0;}}

  // Arrow rain zones
  for(let z of G.playerZones){const{x,y}=w2s(z.x,z.y);ctx.beginPath();ctx.arc(x,y,z.radius,0,Math.PI*2);ctx.fillStyle=`rgba(68,221,102,${0.2+0.15*Math.sin(z.timer*10)})`;ctx.fill();ctx.strokeStyle='rgba(68,221,102,0.5)';ctx.lineWidth=2;ctx.stroke();}

  // Clones
  for(let c of G.clones){const{x,y}=w2s(c.x,c.y),al=Math.min(1,c.timer/0.5);ctx.beginPath();ctx.arc(x,y,D.PLAYER_RADIUS,0,Math.PI*2);ctx.fillStyle=`rgba(187,119,255,${al*0.5})`;ctx.shadowColor='#9944ff';ctx.shadowBlur=15;ctx.fill();ctx.shadowBlur=0;}

  // Friendly ghosts
  for(let g of G.friendlyGhosts){const{x,y}=w2s(g.x,g.y),al=Math.min(1,g.timer)*0.6;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fillStyle=`rgba(68,204,136,${al})`;ctx.shadowColor='#22ff66';ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;}

  // XP orbs
  for(let o of G.xpOrbs){const{x,y}=w2s(o.x,o.y);ctx.beginPath();ctx.arc(x,y,o.radius,0,Math.PI*2);ctx.fillStyle='#f7d44a';ctx.shadowColor='#ffb347';ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;}

  // Bullets
  for(let b of G.bullets){const{x,y}=w2s(b.x,b.y);
    if(b.fromBoss){ctx.beginPath();ctx.arc(x,y,b.radius-1,0,Math.PI*2);ctx.fillStyle='#ff6666';ctx.shadowColor='#ff0000';ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;}
    else if(b.weaponType==='arrow'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle=b.isCrit?'#ffdd44':'#88ff88';ctx.shadowColor=b.isCrit?'#ff8800':'#44ff44';ctx.shadowBlur=10;ctx.beginPath();ctx.moveTo(b.radius+4,0);ctx.lineTo(-b.radius,-3);ctx.lineTo(-b.radius,3);ctx.closePath();ctx.fill();ctx.restore();}
    else if(b.weaponType==='orb'){ctx.beginPath();ctx.arc(x,y,b.radius,0,Math.PI*2);ctx.fillStyle=b.isCrit?'#ffcc66':'rgba(100,140,255,0.9)';ctx.shadowColor=b.isCrit?'#ff8800':'#4466ff';ctx.shadowBlur=18;ctx.fill();ctx.shadowBlur=0;}
    else if(b.weaponType==='dagger'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle=b.isCrit?'#ffaa66':'#cc99ff';ctx.shadowColor=b.isCrit?'#ff8800':'#9944ff';ctx.shadowBlur=8;ctx.fillRect(-4,-2,8,4);ctx.restore();}
    else if(b.weaponType==='soulBolt'){ctx.beginPath();ctx.arc(x,y,b.radius,0,Math.PI*2);ctx.fillStyle=b.isCrit?'#88ffaa':'#44cc88';ctx.shadowColor='#22ff66';ctx.shadowBlur=14;ctx.fill();ctx.shadowBlur=0;}
    else if(b.weaponType==='swordEnergy'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle=b.isCrit?'#ffcc44':'#ff9944';ctx.shadowColor=b.isCrit?'#ffaa00':'#cc6600';ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(b.radius+6,0);ctx.lineTo(0,-b.radius);ctx.lineTo(-b.radius*0.5,0);ctx.lineTo(0,b.radius);ctx.closePath();ctx.fill();ctx.restore();}
    else{ctx.beginPath();ctx.arc(x,y,b.radius-1,0,Math.PI*2);ctx.fillStyle=b.isCrit?'#ffaa66':'#6dd5ff';ctx.shadowColor=b.isCrit?'#ff8800':'#00a6ff';ctx.shadowBlur=12;ctx.fill();ctx.shadowBlur=0;}}

  // Chests
  for(let c of G.chests){if(c.isOpen)continue;const{x,y}=w2s(c.x,c.y);ctx.beginPath();ctx.arc(x,y,c.radius,0,Math.PI*2);ctx.fillStyle='#00ccaa';ctx.shadowColor='#00ffcc';ctx.shadowBlur=20;ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#000';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('?',x,y+6);ctx.textAlign='left';}

  // Enemies
  ctx.shadowBlur=0;
  for(let e of G.enemies){const{x,y}=w2s(e.x,e.y);
    if(e.type==='teleporter'){const p=0.5+0.5*Math.sin(now/150);ctx.globalAlpha=0.5+p*0.5;}
    ctx.beginPath();ctx.arc(x,y,e.radius,0,Math.PI*2);
    const col=D.ENEMY_COLORS[e.type];
    if(col){ctx.fillStyle=e.type==='exploder'?`rgba(255,${Math.floor(136*(0.7+0.3*Math.sin(now/100)))},0,1)`:col;ctx.shadowColor=col;}
    else{const hp=e.health/e.maxHealth;ctx.fillStyle=`hsl(0,80%,${40+20*hp}%)`;ctx.shadowColor='#ff4444';}
    ctx.shadowBlur=14;ctx.fill();ctx.shadowBlur=0;ctx.globalAlpha=1;
    if(e.type==='shielded'){const sa=e.shieldAngle||0;ctx.save();ctx.translate(x,y);ctx.rotate(sa+Math.PI);ctx.beginPath();ctx.arc(0,0,e.radius+4,-Math.PI/4,Math.PI/4);ctx.strokeStyle='#aaaaff';ctx.lineWidth=3;ctx.stroke();ctx.restore();}
    if((e.frozen||0)>0){ctx.beginPath();ctx.arc(x,y,e.radius+2,0,Math.PI*2);ctx.fillStyle='rgba(100,150,255,0.35)';ctx.fill();}
    if(e.marked){ctx.beginPath();ctx.arc(x,y,e.radius+3,0,Math.PI*2);ctx.strokeStyle='rgba(68,204,136,0.6)';ctx.lineWidth=1.5;ctx.stroke();}}

  // Elites
  for(let e of G.elites){const{x,y}=w2s(e.x,e.y);ctx.beginPath();ctx.arc(x,y,e.radius,0,Math.PI*2);ctx.fillStyle=(e.frozen||0)>0?'#6699cc':'#ff9933';ctx.shadowColor=(e.frozen||0)>0?'#4488ff':'#ff7700';ctx.shadowBlur=18;ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#fff';ctx.font=`${Math.max(10,H*0.018)}px sans-serif`;ctx.textAlign='center';ctx.fillText('精英',x,y-e.radius-4);
    const bw=e.radius*2.5,bh=4,bx=x-bw/2,by=y-e.radius-10;ctx.fillStyle='#333';ctx.fillRect(bx,by,bw,bh);const hp=e.health/e.maxHealth;ctx.fillStyle=hp>0.5?'#ff9933':hp>0.25?'#ff6600':'#ff3300';ctx.fillRect(bx,by,bw*hp,bh);ctx.textAlign='left';}

  // Bosses
  for(let bs of G.bosses){const{x,y}=w2s(bs.x,bs.y),bt=D.BOSS_TYPES[bs.bossType];if(!bt)continue;
    ctx.beginPath();ctx.arc(x,y,bs.radius,0,Math.PI*2);ctx.fillStyle=(bs.frozen||0)>0?'#6699cc':bt.color;ctx.shadowColor=(bs.frozen||0)>0?'#4488ff':bt.glow;ctx.shadowBlur=25;ctx.fill();ctx.shadowBlur=0;
    if(bs.chargeWindup>0){const wp=1-bs.chargeWindup/0.8;ctx.save();ctx.setLineDash([12,8]);ctx.lineWidth=4+wp*4;ctx.strokeStyle=`rgba(255,60,30,${0.3+wp*0.5})`;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+bs.chargeDx*400,y+bs.chargeDy*400);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
    if(bs.isCharging){ctx.beginPath();ctx.arc(x,y,bs.radius+8,0,Math.PI*2);ctx.strokeStyle='rgba(255,100,50,0.7)';ctx.lineWidth=4;ctx.stroke();}
    if((bs.frozen||0)>0){ctx.beginPath();ctx.arc(x,y,bs.radius+3,0,Math.PI*2);ctx.fillStyle='rgba(100,150,255,0.25)';ctx.fill();}
    ctx.fillStyle='#fff';ctx.font=`bold ${H*0.022}px sans-serif`;ctx.textAlign='center';ctx.fillText(bt.name,x,y-bs.radius-8);
    const bw=bs.radius*2.5,bh=6,bx2=x-bw/2,by2=y-bs.radius-16;ctx.fillStyle='#333';ctx.fillRect(bx2,by2,bw,bh);ctx.fillStyle=bt.color;ctx.fillRect(bx2,by2,bw*(bs.health/bs.maxHealth),bh);ctx.strokeStyle='#666';ctx.lineWidth=1;ctx.strokeRect(bx2,by2,bw,bh);ctx.textAlign='left';}

  // Player
  const roleData=D.ROLES[G.selectedRole]||D.ROLES.dot;
  const sp=w2s(player.x,player.y);
  ctx.shadowBlur=25;ctx.shadowColor=roleData.glow;
  if(player.invincibleTimer>0&&(Math.floor(now/200)%2===0))ctx.fillStyle='#fffbe3';
  else ctx.fillStyle=roleData.color;
  if(player.isDashing){ctx.fillStyle='#aaddff';for(let t=1;t<=3;t++){ctx.beginPath();ctx.arc(sp.x-player.dashDirX*t*14,sp.y-player.dashDirY*t*14,player.radius*(1-t*0.15),0,Math.PI*2);ctx.fillStyle=`rgba(170,220,255,${0.4-t*0.1})`;ctx.fill();}ctx.fillStyle='#aaddff';}
  ctx.beginPath();ctx.arc(sp.x,sp.y,player.radius,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;

  // Skill visuals
  if(player.skillActive){const sa=player.skillActive;
    if(sa.type==='whirlwind'){const p=sa.timer/0.4;ctx.beginPath();ctx.arc(sp.x,sp.y,120*p,0,Math.PI*2);ctx.strokeStyle=`rgba(255,100,68,${p*0.7})`;ctx.lineWidth=4;ctx.stroke();}
    if(sa.type==='swordSlash'){const p=sa.timer/0.15;ctx.save();ctx.translate(sp.x,sp.y);ctx.rotate(sa.angle);ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,sa.range*p,-0.8,0.8);ctx.closePath();ctx.fillStyle=`rgba(255,180,80,${p*0.4})`;ctx.fill();ctx.strokeStyle=`rgba(255,220,150,${p*0.8})`;ctx.lineWidth=3;ctx.stroke();ctx.restore();}
    if(sa.type==='frostNova'){ctx.beginPath();ctx.arc(sp.x,sp.y,sa.radius,0,Math.PI*2);ctx.strokeStyle=`rgba(100,136,255,${sa.timer*1.5})`;ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=`rgba(150,200,255,${sa.timer*0.2})`;ctx.fill();}}

  // Damage flash
  if(player.damageFlash>0){const al=Math.min(1,player.damageFlash/0.3);ctx.beginPath();ctx.arc(sp.x,sp.y,player.radius+5,0,Math.PI*2);ctx.strokeStyle=`rgba(255,40,40,${al*0.8})`;ctx.lineWidth=3;ctx.stroke();}

  // Particles
  for(let p of G.particles){const{x,y}=w2s(p.x,p.y);ctx.globalAlpha=p.life/p.maxLife;ctx.fillStyle=p.color;ctx.fillRect(x-p.size/2,y-p.size/2,p.size,p.size);}ctx.globalAlpha=1;

  // Floating texts
  ctx.textAlign='center';
  for(let ft of G.floatingTexts){const{x,y}=w2s(ft.x,ft.y);ctx.globalAlpha=ft.life;ctx.font=`bold ${H*0.027}px sans-serif`;ctx.fillStyle=ft.color;ctx.fillText(ft.text,x,y-(1-ft.life)*20);}
  ctx.globalAlpha=1;ctx.textAlign='left';

  // Overlay screens
  const {pnW,pnH,pnX,pnY}=overlayLayout();

  if(G.gameState===D.STATE_UPGRADE&&G.upgradeOptions.length===3){
    ctx.fillStyle='rgba(15,23,42,0.92)';rr(pnX,pnY,pnW,pnH,12);ctx.fill();ctx.strokeStyle='#c79a6e';ctx.lineWidth=4;rr(pnX,pnY,pnW,pnH,12);ctx.stroke();
    ctx.fillStyle='#f7e3b2';ctx.font=`bold ${H*0.055}px sans-serif`;ctx.textAlign='center';ctx.fillText('⚡ 升级选择',W/2,pnY+H*0.1);
    G.upgradeOptions.forEach((opt,i)=>{
      const by=pnY+H*0.17+i*H*0.19,bh=H*0.15;
      ctx.fillStyle='#1e2533';ctx.strokeStyle='#c7b087';ctx.lineWidth=1.5;rr(pnX+pnW*0.08,by,pnW*0.84,bh,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='#f0dbb4';ctx.font=`${H*0.033}px sans-serif`;ctx.fillText(opt.name,W/2,by+bh*0.58);
    });
    ctx.fillStyle='#888';ctx.font=`${H*0.024}px sans-serif`;ctx.fillText('点击选择升级',W/2,pnY+pnH-H*0.04);
    ctx.textAlign='left';}

  if(G.gameState===D.STATE_SKILL_UP&&G.skillUpOptions.length===3){
    ctx.fillStyle='rgba(15,10,30,0.92)';rr(pnX,pnY,pnW,pnH,12);ctx.fill();ctx.strokeStyle='#aa66ff';ctx.lineWidth=4;rr(pnX,pnY,pnW,pnH,12);ctx.stroke();
    const role=D.ROLES[G.selectedRole];
    ctx.fillStyle='#ddb0ff';ctx.font=`bold ${H*0.05}px sans-serif`;ctx.textAlign='center';ctx.fillText(`✨ ${role.skillName} Lv${G.skillLevel+1}`,W/2,pnY+H*0.1);
    G.skillUpOptions.forEach((opt,i)=>{
      const by=pnY+H*0.17+i*H*0.19,bh=H*0.15;
      ctx.fillStyle='#1e1530';ctx.strokeStyle='#aa66ff';ctx.lineWidth=1.5;rr(pnX+pnW*0.08,by,pnW*0.84,bh,8);ctx.fill();ctx.stroke();
      ctx.fillStyle='#e0c0ff';ctx.font=`${H*0.033}px sans-serif`;ctx.fillText(opt.name,W/2,by+bh*0.58);
    });
    ctx.fillStyle='#9988aa';ctx.font=`${H*0.024}px sans-serif`;ctx.fillText('点击选择技能强化',W/2,pnY+pnH-H*0.04);
    ctx.textAlign='left';}

  if(G.gameState===D.STATE_SHOP){
    ctx.fillStyle='rgba(10,18,28,0.92)';rr(pnX,pnY,pnW,pnH,12);ctx.fill();ctx.strokeStyle='#ffd966';ctx.lineWidth=4;rr(pnX,pnY,pnW,pnH,12);ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#f7e3b2';ctx.font=`bold ${H*0.055}px sans-serif`;ctx.fillText('🏪 神秘商店',W/2,pnY+H*0.1);
    ctx.fillStyle='#ffd966';ctx.font=`${H*0.032}px sans-serif`;ctx.fillText(`💰 ${player.gold}`,W/2,pnY+H*0.15);
    G.shopItems.forEach((it,i)=>{
      const by=pnY+H*0.19+i*H*0.16,bh=H*0.13;
      ctx.fillStyle=it?'#1a2218':'#181818';ctx.strokeStyle='#c7b087';ctx.lineWidth=1.5;rr(pnX+pnW*0.08,by,pnW*0.84,bh,8);ctx.fill();ctx.stroke();
      ctx.fillStyle=it?'#f0dbb4':'#666';ctx.font=`${H*0.03}px sans-serif`;
      ctx.fillText(it?`${it.name}  ${it.price}💰`:'已售罄',W/2,by+bh*0.6);
    });
    const rc=10*Math.pow(2,G.shopRefreshCount);
    const rbx=pnX+pnW*0.05,rby=pnY+pnH-H*0.12,rbw=pnW*0.4,rbh=H*0.09;
    ctx.fillStyle='#1e2a1e';ctx.strokeStyle='#3a5a3a';ctx.lineWidth=1.5;rr(rbx,rby,rbw,rbh,6);ctx.fill();ctx.stroke();
    ctx.fillStyle='#b5c9b0';ctx.font=`${H*0.028}px sans-serif`;ctx.fillText(`刷新(${rc}💰)`,rbx+rbw/2,rby+rbh*0.62);
    const lbx=pnX+pnW*0.55,lbw=pnW*0.4;
    ctx.fillStyle='#2a1e1e';ctx.strokeStyle='#5a3a3a';rr(lbx,rby,lbw,rbh,6);ctx.fill();ctx.stroke();
    ctx.fillStyle='#f0dbb4';ctx.fillText('离开商店',lbx+lbw/2,rby+rbh*0.62);
    ctx.textAlign='left';}

  if(G.gameState===D.STATE_PAUSED){
    ctx.fillStyle='rgba(0,0,0,0.72)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#dddddd';ctx.font=`bold ${H*0.12}px sans-serif`;ctx.textAlign='center';ctx.fillText('⏸ 暂停',W/2,H*0.42);
    ctx.fillStyle='#aaaaaa';ctx.font=`${H*0.04}px sans-serif`;ctx.fillText('点击屏幕继续',W/2,H*0.57);ctx.textAlign='left';}

  if(G.gameState===D.STATE_GAMEOVER){
    ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';ctx.fillStyle='#e05a5a';ctx.font=`bold ${H*0.08}px sans-serif`;ctx.fillText('💔 熄灭了',W/2,H*0.1);
    const mn=Math.floor(G.gameTime/60),sc=Math.floor(G.gameTime%60);
    const timeStr=`${mn.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`;
    const stats=[['⏱️ 存活',timeStr,'#fadf9e'],['⚡ 等级',''+player.level,'#fadf9e'],['💀 击杀',''+G.killCount,'#fadf9e'],['👑 Boss',''+G.bossKillCount,'#fadf9e'],['💰 金币',''+G.runStats.goldEarned,'#ffd966'],['🔮 灵魂石','+'+Math.round(G.gameTime/60*3+player.level+G.bossKillCount*5),'#b366ff'],['⚔️ 伤害',''+Math.round(G.runStats.damageDealt),'#fadf9e'],['🔥 最高连击','x'+G.runStats.highestCombo,'#ffaa44']];
    ctx.font=`${H*0.035}px sans-serif`;
    stats.forEach(([lbl,val,col],i)=>{
      const ly=H*0.18+i*H*0.07;
      ctx.fillStyle='#cbad8e';ctx.textAlign='left';ctx.fillText(lbl,W*0.2,ly);
      ctx.fillStyle=col;ctx.textAlign='right';ctx.fillText(val,W*0.8,ly);
    });
    ctx.fillStyle='#b5a87d';ctx.font=`${H*0.038}px sans-serif`;ctx.textAlign='center';ctx.fillText('点击屏幕返回主菜单',W/2,H*0.9);ctx.textAlign='left';}

  ctx.restore(); // end shake

  // HUD (no shake)
  if(G.gameState!==D.STATE_GAMEOVER&&G.gameState!==D.STATE_MENU) drawHUD();
  if(G.gameState===D.STATE_PLAYING) drawTouchControls();
}

function drawHUD() {
  const p=G.player;
  // HP bar
  const hbW=W*0.28,hbH=H*0.032,hbX=W*0.04,hbY=H*0.03;
  ctx.fillStyle='#333';ctx.fillRect(hbX,hbY,hbW,hbH);
  const hpPct=Math.max(0,p.hp/p.maxHp);
  ctx.fillStyle=hpPct>0.5?'#44bb44':hpPct>0.25?'#bb8800':'#cc2222';
  ctx.fillRect(hbX,hbY,hbW*hpPct,hbH);
  ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.strokeRect(hbX,hbY,hbW,hbH);
  ctx.fillStyle='#fff';ctx.font=`${H*0.022}px sans-serif`;
  ctx.fillText(`${p.hp.toFixed(1)}/${p.maxHp.toFixed(1)}`,hbX+3,hbY+hbH-2);
  // XP bar
  const xbY=hbY+hbH+3,xbW=W*0.28;
  ctx.fillStyle='#222';ctx.fillRect(hbX,xbY,xbW,H*0.018);
  ctx.fillStyle='#4466ff';ctx.fillRect(hbX,xbY,xbW*(p.exp/p.nextExp),H*0.018);
  ctx.fillStyle='#aabbff';ctx.font=`${H*0.016}px sans-serif`;
  ctx.fillText(`Lv${p.level}  ${p.exp}/${p.nextExp}`,hbX+2,xbY+H*0.016);
  // Timer / kills / gold
  const mn=Math.floor(G.gameTime/60),sc=Math.floor(G.gameTime%60);
  ctx.fillStyle='#cbad8e';ctx.font=`${H*0.028}px sans-serif`;ctx.textAlign='center';
  ctx.fillText(`⏱ ${mn}:${sc.toString().padStart(2,'0')}`,W/2,H*0.04);
  ctx.fillText(`💀${G.killCount}  👑${G.bossKillCount}  💰${p.gold}`,W/2,H*0.075);
  ctx.textAlign='left';
  // Minimap
  if(S.gameSettings.minimap){
    const mmW=W*0.15,mmH=H*0.2,mmX=W-mmW-8,mmY=8,mmRange=800,mmS=mmW/(mmRange*2);
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.fillRect(mmX,mmY,mmW,mmH);ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=1;ctx.strokeRect(mmX,mmY,mmW,mmH);
    for(let e of G.enemies){const mx=mmX+mmW/2+(e.x-p.x)*mmS,my=mmY+mmH/2+(e.y-p.y)*mmS;if(mx>=mmX&&mx<=mmX+mmW&&my>=mmY&&my<=mmY+mmH){ctx.fillStyle=D.ENEMY_COLORS[e.type]||'#ff4444';ctx.fillRect(mx-1,my-1,2,2);}}
    for(let e of G.elites){const mx=mmX+mmW/2+(e.x-p.x)*mmS,my=mmY+mmH/2+(e.y-p.y)*mmS;if(mx>=mmX&&mx<=mmX+mmW&&my>=mmY&&my<=mmY+mmH){ctx.fillStyle='#ff9933';ctx.fillRect(mx-2,my-2,4,4);}}
    for(let bs of G.bosses){const bt=D.BOSS_TYPES[bs.bossType];if(!bt)continue;const mx=mmX+mmW/2+(bs.x-p.x)*mmS,my=mmY+mmH/2+(bs.y-p.y)*mmS;if(mx>=mmX&&mx<=mmX+mmW&&my>=mmY&&my<=mmY+mmH){ctx.fillStyle=bt.color;ctx.beginPath();ctx.arc(mx,my,3,0,Math.PI*2);ctx.fill();}}
    ctx.fillStyle='#fff';ctx.fillRect(mmX+mmW/2-2,mmY+mmH/2-2,4,4);}
  // Combo
  if(p.comboCount>=3){const cc=p.comboCount>=10?'#ff4444':p.comboCount>=5?'#ffaa44':'#ffdd88';ctx.fillStyle=cc;ctx.font=`bold ${H*0.035}px sans-serif`;ctx.textAlign='center';ctx.fillText(`连击 x${p.comboCount}`,W/2,H*0.13);ctx.textAlign='left';}
  // Horde warning
  if(G.hordeWarning>0){ctx.fillStyle='#ff5555';ctx.font=`bold ${H*0.05}px sans-serif`;ctx.textAlign='center';ctx.fillText(`⚠️ 大波敌人 ${Math.ceil(G.hordeWarning)}s`,W/2,H*0.5);ctx.textAlign='left';}
  // Boss countdown
  if(G.bossCountdown>0){ctx.fillStyle='#ff5555';ctx.font=`bold ${H*0.038}px sans-serif`;ctx.textAlign='center';ctx.fillText(`⚠️ Boss ${Math.ceil(G.bossCountdown)}s`,W/2,H*0.18);ctx.textAlign='left';}
  // Void mode
  if(G.voidMode){ctx.fillStyle='#9944ff';ctx.font=`bold ${H*0.025}px sans-serif`;ctx.textAlign='center';ctx.fillText('☠️ 虚空模式',W/2,H*0.15);ctx.textAlign='left';}
  // Achievement popup
  if(G.achievePopupTimer>0){
    const al=G.achievePopupTimer>0.5?1:G.achievePopupTimer*2;ctx.globalAlpha=al;
    const pw=W*0.38,ph=H*0.1,px=W-pw-8,py=H-ph-8;
    ctx.fillStyle='#1a1f2b';ctx.strokeStyle='#ffd966';ctx.lineWidth=2;rr(px,py,pw,ph,8);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fadf9e';ctx.font=`${H*0.024}px sans-serif`;ctx.textAlign='center';ctx.fillText(G.achievePopupText,px+pw/2,py+ph*0.6);ctx.globalAlpha=1;ctx.textAlign='left';}
  // Pause button
  ctx.fillStyle='rgba(255,255,255,0.18)';ctx.fillRect(W-68,5,58,42);
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText('⏸',W-39,33);ctx.textAlign='left';
}

function drawTouchControls() {
  const p=G.player;
  // Dash button
  const dbX=W/2,dbY=H-50,dbR=28;
  ctx.beginPath();ctx.arc(dbX,dbY,dbR,0,Math.PI*2);
  if(p.dashCooldown>0){ctx.fillStyle='rgba(100,100,100,0.35)';ctx.fill();const pct=1-p.dashCooldown/D.DASH_COOLDOWN;ctx.beginPath();ctx.moveTo(dbX,dbY);ctx.arc(dbX,dbY,dbR,-Math.PI/2,-Math.PI/2+pct*Math.PI*2);ctx.closePath();ctx.fillStyle='rgba(100,200,255,0.3)';ctx.fill();}
  else{ctx.fillStyle='rgba(100,200,255,0.4)';ctx.fill();}
  ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(dbX,dbY,dbR,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font=`${H*0.024}px sans-serif`;ctx.textAlign='center';ctx.fillText('闪避',dbX,dbY+5);
  // Skill button
  const rd=D.ROLES[G.selectedRole];
  if(rd&&rd.skill){
    const sbX=W/2+75,sbY=H-50,sbR=28;
    ctx.beginPath();ctx.arc(sbX,sbY,sbR,0,Math.PI*2);
    if(p.skillTimer>0){ctx.fillStyle='rgba(100,100,100,0.35)';ctx.fill();const pct=1-p.skillTimer/rd.skillCD;ctx.beginPath();ctx.moveTo(sbX,sbY);ctx.arc(sbX,sbY,sbR,-Math.PI/2,-Math.PI/2+pct*Math.PI*2);ctx.closePath();ctx.fillStyle='rgba(255,200,100,0.3)';ctx.fill();}
    else{ctx.fillStyle='rgba(255,200,100,0.4)';ctx.fill();}
    ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(sbX,sbY,sbR,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font=`${H*0.02}px sans-serif`;ctx.fillText(rd.skillName,sbX,sbY+5);}
  ctx.textAlign='left';
  // Joystick hints
  if(!G.leftJoy.active){ctx.fillStyle='rgba(255,255,255,0.12)';ctx.font=`${H*0.028}px sans-serif`;ctx.fillText('移动',28,H-28);}
  if(!G.rightJoy.active){ctx.fillStyle='rgba(255,255,255,0.12)';ctx.font=`${H*0.028}px sans-serif`;ctx.textAlign='right';ctx.fillText('瞄准',W-28,H-28);ctx.textAlign='left';}
  // Draw joysticks
  [G.leftJoy,G.rightJoy].forEach(j=>{if(!j.active)return;
    ctx.beginPath();ctx.arc(j.bx,j.by,D.JOY_R,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.1)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.22)';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(j.kx,j.ky,D.JOY_KNOB,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.38)';ctx.fill();});
  // Touch tutorial
  if(G.showTouchTutorial){
    ctx.fillStyle='rgba(0,0,0,0.72)';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#fadf9e';ctx.font=`bold ${H*0.04}px sans-serif`;ctx.textAlign='center';
    [W*0.25,W*0.75].forEach((tx,i)=>{ctx.beginPath();ctx.arc(tx,H*0.55,50,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.arc(tx,H*0.55,18,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fill();ctx.fillStyle='#fadf9e';ctx.fillText(i===0?'← 左: 移动 →':'← 右: 攻击方向 →',tx,H*0.33);});
    ctx.fillStyle='#aaa';ctx.font=`${H*0.028}px sans-serif`;ctx.fillText('自动射击 · 右摇杆改变方向',W/2,H*0.75);
    const blink=0.5+0.5*Math.sin(Date.now()/300);ctx.fillStyle=`rgba(255,223,158,${blink})`;ctx.font=`bold ${H*0.035}px sans-serif`;ctx.fillText('点击屏幕开始',W/2,H*0.88);
    ctx.textAlign='left';}}

// ===== TOUCH HANDLERS =====
function handleTouchStart(e) {
  for(const t of e.changedTouches){
    const x=t.clientX,y=t.clientY;
    if(G.gameState===D.STATE_MENU){handleMenuTouch(x,y);continue;}
    if(G.gameState===D.STATE_GAMEOVER){backToMenu();continue;}
    if(G.gameState===D.STATE_PAUSED){G.gameState=D.STATE_PLAYING;continue;}
    if(G.showTouchTutorial){G.showTouchTutorial=false;continue;}
    if(G.gameState===D.STATE_UPGRADE&&G.upgradeOptions.length===3){handleUpgradeTouch(x,y);continue;}
    if(G.gameState===D.STATE_SKILL_UP&&G.skillUpOptions.length===3){handleSkillUpTouch(x,y);continue;}
    if(G.gameState===D.STATE_SHOP){handleShopTouch(x,y);continue;}
    if(G.gameState===D.STATE_PLAYING){
      // Pause
      if(x>W-68&&x<W-10&&y<47){G.gameState=D.STATE_PAUSED;continue;}
      // Dash
      if(Math.hypot(x-W/2,y-(H-50))<36){L.triggerDash();continue;}
      // Skill
      const rd=D.ROLES[G.selectedRole];
      if(rd&&rd.skill&&Math.hypot(x-(W/2+75),y-(H-50))<36){L.activateSkill();continue;}
      // Joystick
      if(x<W/2){if(!G.leftJoy.active){G.leftJoy.active=true;G.leftJoy.id=t.identifier;G.leftJoy.bx=x;G.leftJoy.by=y;G.leftJoy.kx=x;G.leftJoy.ky=y;}}
      else{if(!G.rightJoy.active){G.rightJoy.active=true;G.rightJoy.id=t.identifier;G.rightJoy.bx=x;G.rightJoy.by=y;G.rightJoy.kx=x;G.rightJoy.ky=y;}}}}}

function handleTouchMove(e) {
  for(const t of e.changedTouches){
    const x=t.clientX,y=t.clientY;
    if(G.leftJoy.active&&G.leftJoy.id===t.identifier){G.leftJoy.kx=x;G.leftJoy.ky=y;const dx=x-G.leftJoy.bx,dy=y-G.leftJoy.by,d=Math.hypot(dx,dy);if(d>D.JOY_R){G.leftJoy.kx=G.leftJoy.bx+dx/d*D.JOY_R;G.leftJoy.ky=G.leftJoy.by+dy/d*D.JOY_R;}}
    if(G.rightJoy.active&&G.rightJoy.id===t.identifier){G.rightJoy.kx=x;G.rightJoy.ky=y;const dx=x-G.rightJoy.bx,dy=y-G.rightJoy.by,d=Math.hypot(dx,dy);if(d>D.JOY_R){G.rightJoy.kx=G.rightJoy.bx+dx/d*D.JOY_R;G.rightJoy.ky=G.rightJoy.by+dy/d*D.JOY_R;}if(d>D.JOY_DEAD)G.touchAimAngle=Math.atan2(dy,dx);}}}

function handleTouchEnd(e) {
  for(const t of e.changedTouches){
    if(G.leftJoy.active&&G.leftJoy.id===t.identifier){G.leftJoy.active=false;G.leftJoy.id=null;}
    if(G.rightJoy.active&&G.rightJoy.id===t.identifier){G.rightJoy.active=false;G.rightJoy.id=null;}}}

function handleMenuTouch(x,y) {
  const {roles,cardW,cardH,cardsX,cardsY,tabY,tabW,tabH,tabs,tabsX,contentY,btnW,btnH,btnX,btnY}=menuLayout();
  // Role cards
  for(let i=0;i<roles.length;i++){const [key,r]=roles[i],rx=cardsX+i*(cardW+6);if(x>=rx&&x<=rx+cardW&&y>=cardsY&&y<=cardsY+cardH){if(!r.locked)G.selectedRole=key;return;}}
  // Tabs
  for(let i=0;i<tabs.length;i++){const tx=tabsX+i*(tabW+8);if(x>=tx&&x<=tx+tabW&&y>=tabY&&y<=tabY+tabH){menuTab=tabs[i];return;}}
  // Upgrade buttons
  if(menuTab==='upgrades'){const {upgW,upgH,startX,uy}=upgradeLayout(contentY);for(let i=0;i<D.PERM_UPGRADES.length;i++){const ux=startX+i*(upgW+6);if(x>=ux&&x<=ux+upgW&&y>=uy&&y<=uy+upgH){L.buyPerm(i);return;}}}
  // Start button
  if(x>=btnX&&x<=btnX+btnW&&y>=btnY&&y<=btnY+btnH)startGame();}

function handleUpgradeTouch(x,y) {
  if(G.stateInputCooldown>0)return;
  const {pnW,pnH,pnX,pnY}=overlayLayout();
  for(let i=0;i<3;i++){const by=pnY+H*0.17+i*H*0.19,bh=H*0.15;if(x>=pnX+pnW*0.08&&x<=pnX+pnW*0.92&&y>=by&&y<=by+bh){L.applyUpgrade(i);return;}}}

function handleSkillUpTouch(x,y) {
  if(G.stateInputCooldown>0)return;
  const {pnW,pnH,pnX,pnY}=overlayLayout();
  for(let i=0;i<3;i++){const by=pnY+H*0.17+i*H*0.19,bh=H*0.15;if(x>=pnX+pnW*0.08&&x<=pnX+pnW*0.92&&y>=by&&y<=by+bh){L.applySkillUpgrade(i);return;}}}

function handleShopTouch(x,y) {
  if(G.stateInputCooldown>0)return;
  const {pnW,pnH,pnX,pnY}=overlayLayout();
  for(let i=0;i<3;i++){const by=pnY+H*0.19+i*H*0.16,bh=H*0.13;if(x>=pnX+pnW*0.08&&x<=pnX+pnW*0.92&&y>=by&&y<=by+bh){L.buyShopItem(i);return;}}
  const rby=pnY+pnH-H*0.12,rbh=H*0.09;
  if(x>=pnX+pnW*0.05&&x<=pnX+pnW*0.45&&y>=rby&&y<=rby+rbh){L.refreshShop();return;}
  if(x>=pnX+pnW*0.55&&x<=pnX+pnW*0.95&&y>=rby&&y<=rby+rbh){G.gameState=D.STATE_PLAYING;}}

function startGame() {
  L.checkUnlocks();
  L.resetGame(W,H);
}

function backToMenu() {
  L.checkUnlocks();
  L.initGameState();
  S.loadAll();
}

// ===== GAME LOOP =====
function tick(now) {
  if(!lastTimestamp){lastTimestamp=now;requestAnimationFrame(tick);return;}
  const dt=Math.min(0.05,(now-lastTimestamp)/1000);lastTimestamp=now;
  if(G.stateInputCooldown>0)G.stateInputCooldown-=dt;
  if(G.hitPause>0){G.hitPause-=dt;}
  else if(G.gameState!==D.STATE_PAUSED&&G.gameState!==D.STATE_MENU&&!G.showTouchTutorial){
    L.updateGame(dt,now/1000);}
  // Achievement popup
  if(G.achievePopupTimer>0){G.achievePopupTimer-=dt;}
  else if(G.achievePopupQueue&&G.achievePopupQueue.length>0){G.achievePopupText=G.achievePopupQueue.shift();G.achievePopupTimer=2.5;}
  if(G.gameState!==D.STATE_PLAYING&&G.screenShakeTimer>0)G.screenShakeTimer-=dt;
  try{L.syncLeaderboard();}catch(e){}
  draw();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
