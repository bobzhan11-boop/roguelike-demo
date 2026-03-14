// data.js - All game constants, roles, bosses, enemies, achievements, etc.

const ROLES = {
  dot:{name:'白点',color:'#f0f0ff',glow:'#ffffff',hpMult:1,dmgMult:1,spdMult:1,fireRateMult:1,dodgeBase:0,piercingBase:0,skill:null,skillName:null,skillCD:0,desc:'平衡型 · 无技能',weapon:'dot',locked:false},
  warrior:{name:'战士',color:'#804808',glow:'#a06010',hpMult:1.4,dmgMult:1.1,spdMult:0.8,fireRateMult:0.7,dodgeBase:0,piercingBase:0,skill:'whirlwind',skillName:'旋风斩',skillCD:8,desc:'高血量 · 近战AOE',weapon:'sword',locked:true,unlockKey:'totalKills',unlockVal:500,unlockDesc:'累计击杀500敌人'},
  ranger:{name:'游侠',color:'#44dd66',glow:'#22ff44',hpMult:0.7,dmgMult:1.3,spdMult:1.0,fireRateMult:1.0,dodgeBase:0,piercingBase:0,skill:'arrowRain',skillName:'箭雨',skillCD:10,desc:'高伤害 · 远程AOE',weapon:'arrow',locked:true,unlockKey:'bestTime',unlockVal:600,unlockDesc:'单次存活10分钟'},
  mage:{name:'法师',color:'#6688ff',glow:'#4466ff',hpMult:0.8,dmgMult:1.1,spdMult:0.8,fireRateMult:1.3,dodgeBase:0,piercingBase:1,skill:'frostNova',skillName:'冰冻新星',skillCD:12,desc:'控制型 · 自带穿透',weapon:'orb',locked:true,unlockKey:'totalBossKills',unlockVal:3,unlockDesc:'累计击杀3个Boss'},
  shadow:{name:'影刺',color:'#bb77ff',glow:'#9944ff',hpMult:0.6,dmgMult:1.1,spdMult:1.3,fireRateMult:1.0,dodgeBase:1,piercingBase:0,skill:'shadowClone',skillName:'分身',skillCD:15,desc:'高闪避 · 召唤分身',weapon:'dagger',locked:true,unlockKey:'bestTime',unlockVal:900,unlockDesc:'单次存活15分钟'},
  necromancer:{name:'死灵',color:'#44cc88',glow:'#22ff66',hpMult:0.8,dmgMult:1.0,spdMult:1.0,fireRateMult:1.2,dodgeBase:0,piercingBase:1,skill:'raiseDead',skillName:'亡灵复苏',skillCD:20,desc:'穿透+标记·召唤亡灵',weapon:'soulBolt',locked:true,unlockKey:'totalBossKills',unlockVal:10,unlockDesc:'累计击杀10个Boss'},
};

const BOSS_TYPES = {
  berserker:{name:'狂战士',color:'#cc2222',glow:'#ff4444',speedMult:1.4,healthMult:1.3,radiusMult:1.3,contactDamage:8,attackInterval:3.0},
  ranger:{name:'游侠',color:'#22aa55',glow:'#44ff88',speedMult:0.7,healthMult:1.0,radiusMult:0.9,contactDamage:3,attackInterval:1.8},
  sorcerer:{name:'巫师',color:'#7744cc',glow:'#aa66ff',speedMult:0.5,healthMult:0.9,radiusMult:1.0,contactDamage:4,attackInterval:2.5},
  summoner:{name:'召唤师',color:'#cc8800',glow:'#ffaa00',speedMult:0.6,healthMult:0.7,radiusMult:1.0,contactDamage:3,attackInterval:4.0},
  juggernaut:{name:'铁甲巨人',color:'#556655',glow:'#88aa88',speedMult:0.3,healthMult:2.5,radiusMult:1.5,contactDamage:10,attackInterval:3.5},
  twins_fire:{name:'炎之双子',color:'#ff4422',glow:'#ff6644',speedMult:1.5,healthMult:0.6,radiusMult:0.9,contactDamage:6,attackInterval:2.0},
  twins_ice:{name:'冰之双子',color:'#4488ff',glow:'#66aaff',speedMult:0.8,healthMult:0.6,radiusMult:0.9,contactDamage:4,attackInterval:2.5},
  archmage:{name:'大法师',color:'#ff44ff',glow:'#ff88ff',speedMult:0.6,healthMult:1.2,radiusMult:1.1,contactDamage:5,attackInterval:2.0},
};

const ENEMY_COLORS = {normal:null,shooter:'#4466cc',exploder:'#ff8800',tank:'#336633',splitter:'#44aaaa',mini:'#44aaaa',shielded:'#8888cc',healer:'#44bb44',teleporter:'#cc44cc',swarm:'#aacc55'};

const PERM_UPGRADES = [
  {key:'permHp',name:'❤️ 生命',desc:'+3% 最大生命',max:10,cost:i=>20+i*15},
  {key:'permDmg',name:'⚡ 攻击',desc:'+2% 伤害',max:10,cost:i=>25+i*20},
  {key:'permSpd',name:'👟 速度',desc:'+2% 移速',max:5,cost:i=>30+i*20},
  {key:'permCrit',name:'💥 暴击',desc:'+1% 暴击率',max:10,cost:i=>20+i*15},
  {key:'permArmor',name:'🛡 护甲',desc:'受伤-1',max:5,cost:i=>40+i*30},
  {key:'permRegen',name:'💚 再生',desc:'+0.5/s 回血',max:3,cost:i=>60+i*50},
];

const ACHIEVEMENTS = [
  {id:'kill100',name:'杀戮者',desc:'单次击杀100敌人',icon:'💀',reward:5},
  {id:'kill1000',name:'屠杀者',desc:'累计击杀1000敌人',icon:'☠️',reward:10},
  {id:'boss5',name:'Boss猎人',desc:'单次击杀5个Boss',icon:'👑',reward:15},
  {id:'combo20',name:'连击大师',desc:'达到20连击',icon:'🔥',reward:5},
  {id:'crit50',name:'暴击狂人',desc:'单次暴击50次',icon:'💥',reward:5},
  {id:'survive10',name:'坚持不懈',desc:'存活10分钟',icon:'⏱️',reward:5},
  {id:'survive30',name:'持久战',desc:'存活30分钟',icon:'🕐',reward:15},
  {id:'survive60',name:'不朽传说',desc:'存活60分钟',icon:'🕛',reward:30},
  {id:'nodmg60',name:'无伤60秒',desc:'连续60秒不受伤',icon:'🛡️',reward:10},
  {id:'crit50pct',name:'暴击专家',desc:'暴击率达50%',icon:'🎯',reward:5},
  {id:'proj6',name:'弹幕大师',desc:'拥有6+投射物',icon:'🏹',reward:5},
  {id:'speed400',name:'闪电侠',desc:'速度达400',icon:'⚡',reward:5},
  {id:'lifesteal3',name:'吸血鬼',desc:'生命窃取3%',icon:'🩸',reward:5},
  {id:'allRoles',name:'全能战士',desc:'每个角色存活10分钟',icon:'🌟',reward:20},
  {id:'role20min',name:'角色大师',desc:'每角色存活20分钟',icon:'👑',reward:25},
];

const MUTATORS = [
  {id:'glassCannon',name:'玻璃大炮',desc:'-50% HP, +30% 伤害',soulBonus:5},
  {id:'bulletHell',name:'弹幕地狱',desc:'敌人2x射击速度',soulBonus:5},
  {id:'speedRun',name:'极速挑战',desc:'+30% 全速度',soulBonus:3},
  {id:'noShop',name:'无商店',desc:'击杀Boss无商店',soulBonus:8},
  {id:'pacifist',name:'限时猎杀',desc:'每4分钟必须杀Boss',soulBonus:10},
];

const SKILL_UPGRADES = {
  whirlwind:[
    {name:'⚔️ 范围+30',apply:m=>{m.whirlwindRange+=30;}},
    {name:'💥 伤害+1x',apply:m=>{m.whirlwindDmgMult+=1;}},
    {name:'⏱️ 冷却-1s',apply:m=>{m.whirlwindCDReduce+=1;}},
    {name:'🌪️ 击退+40',apply:m=>{m.whirlwindKnockback+=40;}},
  ],
  arrowRain:[
    {name:'🏹 范围+25',apply:m=>{m.arrowRainRadius+=25;}},
    {name:'💥 伤害+0.5x',apply:m=>{m.arrowRainDmgMult+=0.5;}},
    {name:'⏳ 持续+1s',apply:m=>{m.arrowRainDuration+=1;}},
    {name:'⏱️ 冷却-1.5s',apply:m=>{m.arrowRainCDReduce+=1.5;}},
  ],
  frostNova:[
    {name:'❄️ 范围+50',apply:m=>{m.frostNovaRange+=50;}},
    {name:'🧊 冻结+1s',apply:m=>{m.frostNovaDuration+=1;}},
    {name:'⏱️ 冷却-2s',apply:m=>{m.frostNovaCDReduce+=2;}},
    {name:'🔥 冰灼+1/s',apply:m=>{m.frostNovaDot+=1;}},
  ],
  shadowClone:[
    {name:'👻 持续+2s',apply:m=>{m.cloneDuration+=2;}},
    {name:'💥 伤害+0.3x',apply:m=>{m.cloneDmgMult+=0.3;}},
    {name:'⏱️ 冷却-2s',apply:m=>{m.cloneCDReduce+=2;}},
    {name:'👥 +1分身',apply:m=>{m.cloneCount+=1;}},
  ],
  raiseDead:[
    {name:'💀 亡灵持续+3s',apply:m=>{m.cloneDuration+=3;}},
    {name:'💥 亡灵伤害+0.5x',apply:m=>{m.cloneDmgMult+=0.5;}},
    {name:'⏱️ 冷却-3s',apply:m=>{m.cloneCDReduce+=3;}},
    {name:'👻 标记爆炸',apply:m=>{m.frostNovaDot+=2;}},
  ],
};

// Constants
const PLAYER_RADIUS=12, BASE_SPEED=220, BASE_MAX_HP=20, BASE_DAMAGE=2.0, BASE_FIRE_INTERVAL=0.28;
const BASE_BULLET_SPEED=480, BASE_BULLET_COUNT=1, BASE_CRIT_CHANCE=0.05, BASE_CRIT_DAMAGE=1.5;
const BASE_PIERCING=0, BULLET_SIZE=5, INVINCIBLE_DURATION=0.7;
const DODGE_DIMINISH_FACTOR=0.2, SPEED_DIMINISH_FACTOR=0.4, MAX_DODGE_CHANCE=0.4;
const BASE_EXP_NEXT=100, EXP_INCREASE_PER_LEVEL=70;
const DASH_DURATION=0.2, DASH_COOLDOWN=2.5, DASH_SPEED_MULT=3;
const BOSS_SPAWN_INTERVAL=180, BOSS_COUNTDOWN_TIME=5;
const HORDE_INTERVAL=120, HORDE_WARNING_TIME=3;
const CHEST_SPAWN_INTERVAL=30;
const JOY_R=60, JOY_KNOB=25, JOY_DEAD=8;
const MAX_SKILL_LEVEL=5;

const STATE_MENU='menu', STATE_PLAYING='playing', STATE_UPGRADE='upgrade', STATE_SHOP='shop';
const STATE_GAMEOVER='gameover', STATE_PAUSED='paused', STATE_SKILL_UP='skillup';

const SB_URL='https://ljlsruiydrsxetamtptm.supabase.co/rest/v1';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqbHNydWl5ZHJzeGV0YW10cHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMjkzMjgsImV4cCI6MjA4ODcwNTMyOH0.3jofw4NPGiKgoVq6WZNQsU9o8Xv1n_nd07ZKYX-O3dU';

module.exports = {
  ROLES, BOSS_TYPES, ENEMY_COLORS, PERM_UPGRADES, ACHIEVEMENTS, MUTATORS, SKILL_UPGRADES,
  PLAYER_RADIUS, BASE_SPEED, BASE_MAX_HP, BASE_DAMAGE, BASE_FIRE_INTERVAL,
  BASE_BULLET_SPEED, BASE_BULLET_COUNT, BASE_CRIT_CHANCE, BASE_CRIT_DAMAGE,
  BASE_PIERCING, BULLET_SIZE, INVINCIBLE_DURATION,
  DODGE_DIMINISH_FACTOR, SPEED_DIMINISH_FACTOR, MAX_DODGE_CHANCE,
  BASE_EXP_NEXT, EXP_INCREASE_PER_LEVEL,
  DASH_DURATION, DASH_COOLDOWN, DASH_SPEED_MULT,
  BOSS_SPAWN_INTERVAL, BOSS_COUNTDOWN_TIME,
  HORDE_INTERVAL, HORDE_WARNING_TIME, CHEST_SPAWN_INTERVAL,
  JOY_R, JOY_KNOB, JOY_DEAD, MAX_SKILL_LEVEL,
  STATE_MENU, STATE_PLAYING, STATE_UPGRADE, STATE_SHOP, STATE_GAMEOVER, STATE_PAUSED, STATE_SKILL_UP,
  SB_URL, SB_KEY,
};
