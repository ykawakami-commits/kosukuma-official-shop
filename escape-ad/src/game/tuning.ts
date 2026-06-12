// =============================================================================
// tuning.ts — 全調整パラメータの集約点（Phase 1.5）
// -----------------------------------------------------------------------------
// 物理・操作感・ジュース・SFX・✕踏み・AdBlock すべての数値をここに置く。
// エンジンは毎フレーム直接読むので ?debug=1 のスライダーでライブ調整できる。
//
// ★ジャンプは「高さH」と「頂点到達時間t」で指定する（もっさり解消の本丸）。
//   上昇重力 g_up = 2H / t² , 初速 v = √(2 · g_up · H) = 2H/t
//   下降重力 = g_up × fallMultiplier
//   → もっさりの原因は高さではなく t が長いこと。高さ維持で t を縮める。
// =============================================================================

export const DESIGN_HEIGHT = 720

export interface SliderSpec {
  key: keyof Tuning
  label: string
  min: number
  max: number
  step: number
}

export interface Tuning {
  // --- 走行 -------------------------------------------------------------
  runSpeed: number

  // --- ジャンプ（H/t 方式）---------------------------------------------
  /** 1段ジャンプの頂点高さ H (px)。初期=キャラ高さ72×2.2≈158 */
  jumpHeight1: number
  /** 1段ジャンプの頂点到達時間 t (s)。小さいほどキビキビ */
  jumpTime1: number
  /** 2段ジャンプの高さ比（1段目Hに対する割合） */
  doubleJumpFactor: number
  /** 下降重力の倍率（上昇重力に対して）。1.8でキビキビ */
  fallMultiplier: number
  /** 落下速度の上限 (px/s) */
  terminalVelocity: number
  /** 使えるジャンプ回数 */
  maxJumps: number

  // --- 入力補助 --------------------------------------------------------
  jumpBufferMs: number
  coyoteMs: number

  // --- スクワッシュ&ストレッチ（見た目のみ。物理に影響しない）---------
  /** ジャンプ時の伸び量 */
  stretchAmount: number
  /** 着地スクワッシュ：低速時の潰れ量 */
  squashMin: number
  /** 着地スクワッシュ：高速時の潰れ量（横1.25/縦0.75目安=0.25） */
  squashMax: number
  /** squashMax に達する落下速度 (px/s) */
  squashSpeedRef: number
  /** 変形からの復帰時間 (s)。着地は0.08想定 */
  squashRecover: number

  // --- 着地ジュース ----------------------------------------------------
  /** 土埃の基本数（低速） */
  dustBaseCount: number
  /** 土埃の最大数（高速） */
  dustMaxCount: number
  /** カメラ・マイクロディップの最大沈み込み (px) */
  cameraDipMax: number
  /** ディップの所要時間 (ms) */
  cameraDipMs: number
  /** 2段ジャンプ時の空気リング（1=出す/0=出さない） */
  airRingEnabled: number
  /** 高所着地のみの極小ヒットストップ (ms, 0〜40) */
  highFallHitstopMs: number
  /** ヒットストップが発生する落下速度のしきい値 (px/s) */
  highFallThreshold: number

  // --- 当たり / かすり -------------------------------------------------
  hitboxScale: number
  grazeMargin: number
  grazeScore: number

  // --- 死亡演出 --------------------------------------------------------
  hitstopMs: number
  shakeMagnitude: number
  shakeDurationMs: number

  // --- カメラ ----------------------------------------------------------
  cameraOffsetX: number

  // --- ✕踏み（広告クローズ）-------------------------------------------
  /** ✕判定ボックスの見た目に対する倍率（甘め＝1.5） */
  xHitboxScale: number
  /** 踏んだ時の小バウンド初速 (px/s, 上向き) */
  stompBounceVel: number
  /** ✕踏みスコア */
  stompScore: number

  // --- グレイズ→AdBlockゲージ -----------------------------------------
  /** グレイズ1回のゲージ増加量 */
  grazeGaugeGain: number
  /** ✕踏み1回のゲージ増加量 */
  stompGaugeGain: number
  /** ゲージ満タン値 */
  gaugeMax: number
  /** AdBlockモードの持続 (s) */
  adblockDurationSec: number
  /** 満タンで自動発動(1)か手動発動(0)か */
  adblockAuto: number

  // --- Phase2: コンボ --------------------------------------------------
  /** スコア倍率の上限（x1→x2→…→comboMax） */
  comboMax: number
  /** コンボ中（2以上）のゲージ増加倍率 */
  comboGaugeMult: number

  // --- Phase2: JUST CLOSE（精度判定）----------------------------------
  /** ✕判定ボックス中心の何割を JUST 扱いにするか（0.5=中心50%） */
  justCloseFraction: number
  /** JUST 時のバウンド倍率 */
  justBounceMult: number
  /** JUST 時のゲージボーナス */
  justGaugeBonus: number

  // --- Phase2: 広告タイプ ---------------------------------------------
  /** video を閉じるのに必要な踏み回数 */
  videoHits: number
  /** retarget を成仏させるのに必要な踏み回数 */
  retargetHits: number
  /** retarget の追尾速度 (px/s)。runSpeed 未満なら走り続ければ逃げ切れる */
  retargetSpeed: number

  // --- Phase2: 下スワイプ急降下 ---------------------------------------
  /** 急降下時の落下速度 (px/s) */
  diveSpeed: number
  /** 急降下中に踏んだ時のバウンド倍率 */
  diveBounceMult: number
  /** 下スワイプ判定の最小縦移動 (px) */
  swipeMinPx: number

  // --- 3Dプロト：耳のスプリング物理（model-test で使用）---------------
  /** 耳ばねの剛性（大きいほど速く追従） */
  earSpringK: number
  /** 耳ばねの減衰（大きいほど揺れが早く止まる） */
  earSpringDamp: number

  // --- オーディオ ------------------------------------------------------
  /** SFX 音量 (0〜1) */
  sfxVolume: number
}

// C＝現状値（Phase1で実機検証した“もっさり”を H/t に換算して保存：比較用）
//   旧: jumpVelocity 880 / gravityUp 2300 → t=v/g=0.38s, H=v²/2g≈168px
export const tuning: Tuning = {
  runSpeed: 330,

  jumpHeight1: 160,
  jumpTime1: 0.3,
  doubleJumpFactor: 0.85,
  fallMultiplier: 1.8,
  terminalVelocity: 1700,
  maxJumps: 2,

  jumpBufferMs: 100,
  coyoteMs: 90,

  stretchAmount: 0.2,
  squashMin: 0.12,
  squashMax: 0.25,
  squashSpeedRef: 1000,
  squashRecover: 0.08,

  dustBaseCount: 6,
  dustMaxCount: 18,
  cameraDipMax: 4,
  cameraDipMs: 70,
  airRingEnabled: 1,
  highFallHitstopMs: 20,
  highFallThreshold: 1100,

  hitboxScale: 0.75,
  grazeMargin: 16,
  grazeScore: 50,

  hitstopMs: 100,
  shakeMagnitude: 18,
  shakeDurationMs: 320,

  cameraOffsetX: 240,

  xHitboxScale: 1.5,
  stompBounceVel: 560,
  stompScore: 120,

  grazeGaugeGain: 12,
  stompGaugeGain: 8,
  gaugeMax: 100,
  adblockDurationSec: 4,
  adblockAuto: 1,

  comboMax: 8,
  comboGaugeMult: 1.5,

  justCloseFraction: 0.5,
  justBounceMult: 1.3,
  justGaugeBonus: 10,

  videoHits: 2,
  retargetHits: 2,
  retargetSpeed: 300,

  diveSpeed: 1700,
  diveBounceMult: 1.25,
  swipeMinPx: 40,

  earSpringK: 140,
  earSpringDamp: 11,

  sfxVolume: 0.5,
}

// =============================================================================
// プリセット（A/B/C を一括切替）。feel に効く部分だけを上書きする。
// =============================================================================
export type PresetName = 'A' | 'B' | 'C'

type FeelKeys =
  | 'jumpHeight1'
  | 'jumpTime1'
  | 'doubleJumpFactor'
  | 'fallMultiplier'
  | 'squashMax'
  | 'cameraDipMax'
  | 'airRingEnabled'
  | 'highFallHitstopMs'

export const PRESETS: Record<PresetName, Pick<Tuning, FeelKeys>> = {
  // A キビキビ（t=0.26s、ジュース強め）
  A: {
    jumpHeight1: 160,
    jumpTime1: 0.26,
    doubleJumpFactor: 0.85,
    fallMultiplier: 2.0,
    squashMax: 0.3,
    cameraDipMax: 5,
    airRingEnabled: 1,
    highFallHitstopMs: 26,
  },
  // B スタンダード（t=0.32s）
  B: {
    jumpHeight1: 160,
    jumpTime1: 0.32,
    doubleJumpFactor: 0.85,
    fallMultiplier: 1.8,
    squashMax: 0.25,
    cameraDipMax: 4,
    airRingEnabled: 1,
    highFallHitstopMs: 20,
  },
  // C 現状値（もっさり。比較用）
  C: {
    jumpHeight1: 168,
    jumpTime1: 0.38,
    doubleJumpFactor: 0.85,
    fallMultiplier: 1.8,
    squashMax: 0.2,
    cameraDipMax: 0,
    airRingEnabled: 0,
    highFallHitstopMs: 0,
  },
}

export function applyPreset(name: PresetName) {
  Object.assign(tuning, PRESETS[name])
}

// デバッグパネルのスライダー（順＝表示順）
export const SLIDERS: SliderSpec[] = [
  { key: 'runSpeed', label: '走行速度', min: 120, max: 600, step: 10 },
  { key: 'jumpHeight1', label: 'ジャンプ高さH', min: 60, max: 320, step: 4 },
  { key: 'jumpTime1', label: '頂点到達t(s)', min: 0.18, max: 0.5, step: 0.01 },
  { key: 'doubleJumpFactor', label: '2段高さ比', min: 0.4, max: 1.2, step: 0.05 },
  { key: 'fallMultiplier', label: '下降重力倍率', min: 1, max: 3, step: 0.05 },
  { key: 'terminalVelocity', label: '落下上限', min: 800, max: 3000, step: 50 },
  { key: 'jumpBufferMs', label: '入力バッファms', min: 0, max: 250, step: 5 },
  { key: 'coyoteMs', label: 'コヨーテms', min: 0, max: 250, step: 5 },
  { key: 'squashMax', label: '着地潰れ量', min: 0, max: 0.5, step: 0.01 },
  { key: 'squashRecover', label: '潰れ復帰s', min: 0.04, max: 0.2, step: 0.01 },
  { key: 'cameraDipMax', label: 'カメラ沈み', min: 0, max: 12, step: 1 },
  { key: 'airRingEnabled', label: '空気リング', min: 0, max: 1, step: 1 },
  { key: 'highFallHitstopMs', label: '着地HS ms', min: 0, max: 40, step: 2 },
  { key: 'hitboxScale', label: '判定サイズ比', min: 0.4, max: 1, step: 0.01 },
  { key: 'grazeMargin', label: 'グレイズ幅', min: 0, max: 60, step: 1 },
  { key: 'xHitboxScale', label: '✕判定倍率', min: 1, max: 2.5, step: 0.1 },
  { key: 'stompBounceVel', label: '踏みバウンド', min: 200, max: 1000, step: 20 },
  { key: 'grazeGaugeGain', label: 'ゲージ/グレイズ', min: 0, max: 40, step: 1 },
  { key: 'stompGaugeGain', label: 'ゲージ/踏み', min: 0, max: 40, step: 1 },
  { key: 'adblockDurationSec', label: 'AdBlock秒', min: 1, max: 8, step: 0.5 },
  { key: 'adblockAuto', label: 'AdBlock自動', min: 0, max: 1, step: 1 },
  { key: 'comboMax', label: 'コンボ倍率上限', min: 2, max: 16, step: 1 },
  { key: 'comboGaugeMult', label: 'コンボゲージ倍', min: 1, max: 3, step: 0.1 },
  { key: 'justCloseFraction', label: 'JUST判定幅', min: 0.2, max: 1, step: 0.05 },
  { key: 'justBounceMult', label: 'JUSTバウンド倍', min: 1, max: 2, step: 0.05 },
  { key: 'videoHits', label: '動画 必要踏み', min: 1, max: 4, step: 1 },
  { key: 'retargetHits', label: 'リタゲ 必要踏み', min: 1, max: 4, step: 1 },
  { key: 'retargetSpeed', label: 'リタゲ追尾速度', min: 0, max: 500, step: 10 },
  { key: 'diveSpeed', label: '急降下速度', min: 800, max: 3000, step: 50 },
  { key: 'diveBounceMult', label: '急降下バウンド倍', min: 1, max: 2, step: 0.05 },
  { key: 'swipeMinPx', label: 'スワイプ最小px', min: 20, max: 80, step: 5 },
  { key: 'shakeMagnitude', label: 'シェイク量', min: 0, max: 60, step: 1 },
  { key: 'cameraOffsetX', label: 'カメラ前距離', min: 80, max: 480, step: 10 },
  { key: 'sfxVolume', label: 'SFX音量', min: 0, max: 1, step: 0.05 },
]
