// =============================================================================
// sim.ts — 検証済みロジック層（CFG / COURSE / createSim）
// -----------------------------------------------------------------------------
// ★この層の値・ロジックは Node 製ソルバーで「機械的にクリア可能（最小猶予5F=84ms）」
//   が証明済みの確定値。escape-ad-3d.html のプロトタイプから一字一句そのまま移植。
//   数値・式・規則は絶対に変更・最適化・調整しないこと（TS 型注釈のみ付与）。
//   Three.js / DOM / React 非依存。ゲーム本体と検証ソルバーが同一 import 可能。
// =============================================================================

// 型注釈用（値・ロジックには影響しない）
export interface Cfg {
  [k: string]: number
}
export interface RawObs {
  t: string
  d: number
  h?: number
  w?: number
  y?: number
  len?: number
  v?: number
}
export interface Course {
  goalD: number
  obs: RawObs[]
}

const CFG = {
  fps: 60,
  speed: 11.0,          // 前進速度 u/s
  charH: 0.95,          // こすくまくんの高さ
  halfD: 0.30,          // 進行方向の半幅（当たり判定）
  jumpH1: 2.30,         // 1段目ジャンプ高さ
  jumpT1: 0.30,         // 頂点到達時間
  jump2Ratio: 0.88,     // 2段目初速比
  fallMult: 1.85,       // 下降重力倍率
  terminalVy: -34,
  coyoteF: 6,           // コヨーテ（フレーム）
  bufferF: 7,           // 入力バッファ（フレーム）
  stompVRatio: 0.78,    // 踏みバウンド初速（v1比）
  stompTol: 0.38,       // 踏み判定の足元許容（上方向）
  stompPen: 0.22,       // 踏み判定の食い込み許容（下方向）
  grazeMargin: 0.30,    // かすり判定マージン
  popupWarnT: 0.38,     // ポップアップ予兆時間
  popupRiseT: 0.16,     // ポップアップせり上がり時間
  popupLeadD: 8.0,      // 何u手前で予兆開始するか
  pitDeathY: -1.6,
  gaugeMax: 10,         // かすり/踏みで満タンになる量
  adblockT: 4.0,        // AdBlock持続秒
} as Cfg
// 派生値
CFG.v1   = 2*CFG.jumpH1/CFG.jumpT1;
CFG.gUp  = 2*CFG.jumpH1/(CFG.jumpT1*CFG.jumpT1);
CFG.gDn  = CFG.gUp*CFG.fallMult;
CFG.v2   = CFG.v1*CFG.jump2Ratio;
CFG.vStomp = CFG.v1*CFG.stompVRatio;

// ---- コース定義 ----
// d:距離(u)  種類: bar(看板) popup(地面ポップアップ) float(空中ポップアップ:常時)
//            truck(広告トラック:対向) pit(工事穴)
// 全長 goalD。チャリ走級＝きついが必ず通る、をソルバーで保証する。
const COURSE: Course = {
  goalD: 760,
  obs: [
    // --- §1 イントロ：単発で教える (0-120) ---
    {t:'bar',   d: 42,  h:1.05, w:0.5},
    {t:'bar',   d: 66,  h:1.05, w:0.5},
    {t:'popup', d: 92,  h:2.0,  w:0.55},
    {t:'bar',   d: 112, h:1.5,  w:0.5},
    // --- §2 ポップアップ横丁：理不尽の入口 (120-240) ---
    {t:'popup', d: 138, h:2.0, w:0.55},
    {t:'popup', d: 150, h:2.0, w:0.55},
    {t:'bar',   d: 170, h:1.05, w:0.5},
    {t:'popup', d: 186, h:2.6, w:0.55},          // 高い：2段 or 踏み
    {t:'popup', d: 206, h:2.0, w:0.55},
    {t:'popup', d: 214, h:2.0, w:0.55},          // 連続
    {t:'bar',   d: 234, h:1.5, w:0.5},
    // --- §3 工事穴と✕踏み橋 (240-360) ---
    {t:'pit',   d: 258, w:5.5},
    {t:'pit',   d: 286, w:8.5},                  // 広い：floatを踏んで渡る
    {t:'float', d: 290.5, y:2.3, h:1.3, w:0.85},
    {t:'bar',   d: 314, h:1.05, w:0.5},
    {t:'pit',   d: 330, w:10.0},                 // さらに広い
    {t:'float', d: 334,   y:2.2, h:1.3, w:0.85},
    {t:'float', d: 338.5, y:2.45, h:1.3, w:0.85},
    // --- §4 広告トラック街道 (360-480) ---
    {t:'truck', d: 392, h:2.45, len:3.6, v:1.8},
    {t:'bar',   d: 414, h:1.05, w:0.5},
    {t:'truck', d: 446, h:2.45, len:3.6, v:1.8},
    {t:'popup', d: 466, h:2.0, w:0.55},
    // --- §5 全部盛り (480-620) ---
    {t:'popup', d: 492, h:2.0, w:0.55},
    {t:'pit',   d: 506, w:6.0},
    {t:'popup', d: 524, h:2.6, w:0.55},
    {t:'bar',   d: 540, h:1.5, w:0.5},
    {t:'popup', d: 552, h:2.0, w:0.55},
    {t:'popup', d: 560, h:2.0, w:0.55},
    {t:'truck', d: 596, h:2.45, len:3.6, v:1.8},
    {t:'pit',   d: 614, w:7.0},
    {t:'float', d: 617.5, y:2.3, h:1.3, w:0.85},
    // --- §6 ラスト：最難関 (620-745) ---
    {t:'popup', d: 648, h:2.0, w:0.55},
    {t:'popup', d: 656, h:2.6, w:0.55},
    {t:'popup', d: 664, h:2.0, w:0.55},
    {t:'bar',   d: 684, h:1.5, w:0.5},
    {t:'pit',   d: 698, w:9.0},
    {t:'float', d: 702,   y:2.2, h:1.3, w:0.85},
    {t:'float', d: 706.5, y:2.5, h:1.3, w:0.85},
    {t:'truck', d: 736, h:2.45, len:3.6, v:1.8},
  ]
}

// ---- 純粋シミュレーション ----
// 1フレーム進める step(state, tap) を提供。three/DOM 非依存。
function createSim(CFG: Cfg, COURSE: Course){
  const DT = 1/CFG.fps;
  // 障害物を前計算
  const obs = COURSE.obs.map((o: RawObs, i: number)=>{
    const e: any = Object.assign({id:i}, o);
    if(e.t==='bar'||e.t==='popup'){ e.z0=e.d-e.w/2; e.z1=e.d+e.w/2; e.y0=0; e.y1=e.h; }
    if(e.t==='float'){ e.z0=e.d-e.w/2; e.z1=e.d+e.w/2; e.y0=e.y; e.y1=e.y+e.h; }
    if(e.t==='pit'){ e.z0=e.d; e.z1=e.d+e.w; }
    if(e.t==='truck'){ e.h=e.h; }
    if(e.t==='popup'){
      // 予兆開始距離と完全せり上がり距離（全て距離基準＝決定的）
      e.appearD = e.d - CFG.popupLeadD;
      e.solidD  = e.appearD + (CFG.popupWarnT+CFG.popupRiseT)*CFG.speed;
    }
    return e;
  });
  // 種別ごとの前抽出（d昇順を保つ）。トラックは移動体なので別枠で常時判定する。
  const pits = obs.filter((o: any)=>o.t==='pit');
  const trucks = obs.filter((o: any)=>o.t==='truck');
  const stompables = obs.filter((o: any)=>o.t==='popup'||o.t==='float');
  const statics = obs.filter((o: any)=>o.t==='bar'||o.t==='popup'||o.t==='float');
  function newState(){
    return { f:0, d:0, y:0, vy:0, jumps:0, onGround:true,
      coyote:0, buffer:0, closed:0, grazed:0, // closed/grazed はビットマスク(id<32想定→2語)
      closedHi:0, grazedHi:0,
      combo:0, alive:true, cleared:false };
  }
  const bitGet=(s: any,i: number)=> i<30 ? (s.closed>>i)&1 : (s.closedHi>>(i-30))&1;
  const bitSet=(s: any,i: number)=>{ if(i<30) s.closed|=(1<<i); else s.closedHi|=(1<<(i-30)); };
  const gbGet=(s: any,i: number)=> i<30 ? (s.grazed>>i)&1 : (s.grazedHi>>(i-30))&1;
  const gbSet=(s: any,i: number)=>{ if(i<30) s.grazed|=(1<<i); else s.grazedHi|=(1<<(i-30)); };

  function truckBox(o: any, f: number){
    // プレイヤー(速度CFG.speed)が o.d に到達する瞬間に、トラック中心が o.d に来る。
    // 遠方から対向で走ってくる絵になり、かつ完全に決定的。
    const zc = o.d*(1+o.v/CFG.speed) - o.v*(f/CFG.fps);
    return { z0: zc-o.len/2, z1: zc+o.len/2, y0:0, y1:o.h, id:o.id };
  }
  function popupSolid(o: any, d: number){ return d >= o.solidD; }
  function popupVisibleH(o: any, d: number){
    if(d < o.appearD) return 0;
    const warnD = CFG.popupWarnT*CFG.speed;
    const riseD = CFG.popupRiseT*CFG.speed;
    const dd = d - o.appearD;
    if(dd < warnD) return 0;
    return Math.min(1,(dd-warnD)/riseD)*o.h;
  }

  // メモ化用：今後に影響しうる近傍の「閉じられる広告」のclosedマスク
  // （閉じ状態を持つのは popup/float のみ。トラック・バーは状態を持たない）
  function localMask(s: any){
    let m=0,k=0;
    for(const o of stompables){
      if(o.z1 < s.d-1) continue;
      if(o.z0 > s.d+14) break;
      m |= (bitGet(s,o.id)<<k); k++;
      if(k>=10) break;
    }
    return m;
  }

  function step(s: any, tap: boolean){
    const ev: string[] = [];
    if(!s.alive || s.cleared) return ev;
    // --- 入力 ---
    if(tap) s.buffer = CFG.bufferF;
    const wantJump = s.buffer>0;
    if(wantJump){
      if(s.onGround || s.coyote>0){
        s.vy = CFG.v1; s.jumps=1; s.onGround=false; s.coyote=0; s.buffer=0;
        ev.push('jump');
      } else if(s.jumps<2){
        s.vy = CFG.v2; s.jumps=2; s.buffer=0;
        ev.push('djump');
      }
    }
    // --- 物理 ---
    const g = s.vy>0 ? CFG.gUp : CFG.gDn;
    s.vy = Math.max(CFG.terminalVy, s.vy - g*DT);
    let ny = s.y + s.vy*DT;
    const nd = s.d + CFG.speed*DT;

    // 足場（穴の上では床なし）
    let floorY = 0;
    for(const o of pits){
      if(o.z0 > nd) break;
      if(nd > o.z0+0.05 && nd < o.z1-0.05){ floorY=-999; break; }
    }

    // --- 踏み（落下中のみ）---
    if(s.vy<0){
      for(const o of stompables){
        if(o.z0 > nd+1.2) break; // 以降は遠い（d昇順）
        if(o.z1 < nd-1.2) continue;
        if(bitGet(s,o.id)) continue;
        if(o.t==='popup' && !popupSolid(o, nd)) continue;
        const top = o.y1;
        if(nd+CFG.halfD > o.z0 && nd-CFG.halfD < o.z1 &&
           s.y >= top - CFG.stompPen && ny <= top + CFG.stompTol){
          // 踏んだ
          bitSet(s,o.id);
          s.vy = CFG.vStomp; ny = top + 0.02;
          s.jumps = 1;            // 2段目を回復
          s.combo++;
          ev.push('stomp');
          break;
        }
      }
    }

    // --- 接地 ---
    if(ny<=floorY && s.vy<=0){
      ny=floorY; s.vy=0;
      if(!s.onGround){ ev.push('land'); }
      s.onGround=true; s.coyote=CFG.coyoteF; s.jumps=0;
      if(s.combo>0){ ev.push('comboend'); s.combo=0; }
    } else {
      if(s.onGround){ s.onGround=false; } // 落下開始
      if(s.coyote>0) s.coyote--;
    }
    if(s.buffer>0) s.buffer--;
    s.y=ny; s.d=nd; s.f++;

    // --- 死亡判定 ---
    if(s.y < CFG.pitDeathY){ s.alive=false; ev.push('death'); return ev; }
    const py0=s.y, py1=s.y+CFG.charH, pz0=s.d-CFG.halfD, pz1=s.d+CFG.halfD;
    const checkBox=(b: any,oid: number)=>{
      const hit = pz1>b.z0 && pz0<b.z1 && py1>b.y0 && py0<b.y1;
      if(hit){ s.alive=false; ev.push('death'); ev.push('hit:'+oid); return true; }
      // かすり
      if(!gbGet(s,oid)){
        const dz = Math.max(b.z0-pz1, pz0-b.z1, 0);
        const dy = Math.max(b.y0-py1, py0-b.y1, 0);
        if(dz<CFG.grazeMargin && dy<CFG.grazeMargin && (dz>0||dy>0)){
          gbSet(s,oid); ev.push('graze');
        }
      }
      return false;
    };
    // 移動体（トラック）は常時チェック
    for(const o of trucks){
      const b=truckBox(o,s.f);
      if(b.z1 < pz0-0.5 || b.z0 > pz1+0.5) continue;
      if(checkBox(b,o.id)) return ev;
    }
    // 静的障害物はd昇順なのでbreakできる
    for(const o of statics){
      if(o.z0 > s.d+1.5) break;
      if(o.z1 < s.d-1.5) continue;
      let b=null;
      if(o.t==='bar') b=o;
      else if(!bitGet(s,o.id) && (o.t==='float' || popupSolid(o,s.d))) b=o;
      if(!b) continue;
      if(checkBox(b,o.id)) return ev;
    }
    if(s.d>=COURSE.goalD){ s.cleared=true; ev.push('clear'); }
    return ev;
  }
  return { newState, step, obs, popupVisibleH, popupSolid, truckBox, localMask, DT };
}

export { CFG, COURSE, createSim }
