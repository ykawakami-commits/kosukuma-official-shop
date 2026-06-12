// =============================================================================
// tuning.ts — 全調整パラメータの集約点
// -----------------------------------------------------------------------------
// 物理・操作感に関わる数値はすべてここに置く。エンジンは毎フレームこのオブジェクト
// を直接読むので、?debug=1 のスライダーから書き換えれば実機でライブ調整できる。
//
// 単位系：
//   - 距離は「デザイン座標」px（仮想高さ DESIGN_HEIGHT 基準。端末解像度に依らず一定）
//   - 速度は px/秒、加速度は px/秒^2
//   - 時間は ms（ミリ秒）で持ち、エンジン側で秒へ変換する
// =============================================================================

export const DESIGN_HEIGHT = 720

export interface SliderSpec {
  /** tuning 上のキー */
  key: keyof Tuning
  label: string
  min: number
  max: number
  step: number
}

export interface Tuning {
  // --- 走行 -------------------------------------------------------------
  /** 自動で右に進む速度 (px/s)。コース距離もこれ基準で決める */
  runSpeed: number

  // --- ジャンプ / 重力 --------------------------------------------------
  /** 上昇中の重力 (px/s^2) */
  gravityUp: number
  /** 下降中の重力倍率。1 より大きいほどキビキビ落ちる */
  fallMultiplier: number
  /** 1段ジャンプの初速 (px/s, 上向き) */
  jumpVelocity: number
  /** 2段ジャンプの初速倍率（1段目に対する比） */
  doubleJumpFactor: number
  /** 使えるジャンプ回数（2 = 2段ジャンプ） */
  maxJumps: number
  /** 落下中の最大速度クランプ (px/s)。0 で無効 */
  maxFallSpeed: number

  // --- 入力補助（このPhaseの本体）-------------------------------------
  /** 入力バッファ：着地直前のタップを着地時に発火 (ms) */
  jumpBufferMs: number
  /** コヨーテタイム：足場を離れた直後でもジャンプ可 (ms) */
  coyoteMs: number

  // --- スクワッシュ&ストレッチ -----------------------------------------
  /** ジャンプ時の伸び量（0.18 = 縦+18%/横-） */
  stretchAmount: number
  /** 着地時の潰れ量 */
  squashAmount: number
  /** 変形からの復帰時間 (s) */
  squashRecover: number

  // --- 当たり / かすり -------------------------------------------------
  /** 当たり判定サイズ比（見た目スプライトに対する割合） */
  hitboxScale: number
  /** グレイズ判定リングの外側マージン (px) */
  grazeMargin: number
  /** かすり1回のスコア */
  grazeScore: number

  // --- 死亡演出 --------------------------------------------------------
  /** ヒットストップ時間 (ms) */
  hitstopMs: number
  /** 画面シェイクの初期振幅 (px) */
  shakeMagnitude: number
  /** 画面シェイクの持続 (ms) */
  shakeDurationMs: number

  // --- カメラ ----------------------------------------------------------
  /** 画面左端からプレイヤーまでの距離（デザインpx）。小さいほど前が見える */
  cameraOffsetX: number
  /** 縦方向のカメラ追従の緩さ（0=固定, 大きいほど追う） */
  cameraFollowY: number
}

export const tuning: Tuning = {
  runSpeed: 330,

  gravityUp: 2300,
  fallMultiplier: 1.8,
  jumpVelocity: 880,
  doubleJumpFactor: 0.85,
  maxJumps: 2,
  maxFallSpeed: 1600,

  jumpBufferMs: 100,
  coyoteMs: 90,

  stretchAmount: 0.2,
  squashAmount: 0.28,
  squashRecover: 0.1,

  hitboxScale: 0.75,
  grazeMargin: 16,
  grazeScore: 50,

  hitstopMs: 100,
  shakeMagnitude: 18,
  shakeDurationMs: 320,

  cameraOffsetX: 240,
  cameraFollowY: 0,
}

// デバッグパネルに出すスライダー定義（順番＝表示順）
export const SLIDERS: SliderSpec[] = [
  { key: 'runSpeed', label: '走行速度', min: 120, max: 600, step: 10 },
  { key: 'jumpVelocity', label: 'ジャンプ初速', min: 400, max: 1400, step: 10 },
  { key: 'gravityUp', label: '重力(上昇)', min: 800, max: 4000, step: 50 },
  { key: 'fallMultiplier', label: '下降重力倍率', min: 1, max: 3, step: 0.05 },
  { key: 'doubleJumpFactor', label: '2段ジャンプ比', min: 0.4, max: 1.2, step: 0.05 },
  { key: 'jumpBufferMs', label: '入力バッファms', min: 0, max: 250, step: 5 },
  { key: 'coyoteMs', label: 'コヨーテms', min: 0, max: 250, step: 5 },
  { key: 'stretchAmount', label: 'ストレッチ量', min: 0, max: 0.5, step: 0.01 },
  { key: 'squashAmount', label: 'スクワッシュ量', min: 0, max: 0.5, step: 0.01 },
  { key: 'hitboxScale', label: '判定サイズ比', min: 0.4, max: 1, step: 0.01 },
  { key: 'grazeMargin', label: 'グレイズ幅', min: 0, max: 60, step: 1 },
  { key: 'hitstopMs', label: 'ヒットストップms', min: 0, max: 300, step: 10 },
  { key: 'shakeMagnitude', label: 'シェイク量', min: 0, max: 60, step: 1 },
  { key: 'cameraOffsetX', label: 'カメラ前距離', min: 80, max: 480, step: 10 },
]
