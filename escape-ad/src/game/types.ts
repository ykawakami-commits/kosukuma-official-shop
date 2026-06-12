// 共有の型定義

export type GamePhase = 'ready' | 'playing' | 'dead' | 'clear'

/** ground が存在する x 区間（この外＝穴） */
export interface GroundSpan {
  x0: number
  x1: number
}

/** 広告タイプ。踏み挙動が変わる。
 *  popup=1踏みで閉じる / video=1踏みミュート→2踏みで閉じる /
 *  retarget=追尾・踏むと逃走→2踏みで成仏 / noclose=✕なし（踏めない・避けるのみ） */
export type AdType = 'popup' | 'video' | 'retarget' | 'noclose'

/** 広告バナー障害物。地面の上 or 空中（floating）に立つ矩形。
 *  右上に「✕ボタン」を持ち、上から踏むと閉じられる（noclose を除く）。 */
export interface Obstacle {
  id: number
  x: number // 左端 (world px)。retarget は毎フレーム動く
  y: number // 上端 (world px, デザイン座標)
  w: number
  h: number
  label: string
  type: AdType
  /** 空中広告（地面から生えていない＝下に支柱を描かない） */
  floating: boolean
  // --- ランタイム状態（コースは reset 毎に再生成）---
  /** 受けた踏み回数 */
  hits: number
  /** ✕踏みで閉じられた */
  closed: boolean
  /** 閉じる演出の進行 0→1 */
  closeAnim: number
  /** video: 1踏み目でミュート状態 */
  muted: boolean
  /** retarget: 逃走中タイマー (s) */
  fleeTimer: number
}

/** Cookie。通常＝道標、ゴールデン＝危険地帯のレア（1コース3枚） */
export interface Cookie {
  id: number
  x: number
  y: number
  golden: boolean
  collected: boolean
}

export interface Course {
  /** ゴールまでの距離（進捗%算出に使用） */
  length: number
  /** 地面の高さ（上端 y, デザイン座標） */
  groundY: number
  spans: GroundSpan[]
  obstacles: Obstacle[]
  cookies: Cookie[]
  /** ゴールデンCookieの総数（通常3） */
  goldenTotal: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number // 残り (s)
  maxLife: number
  size: number
  color: string
  gravity: number
}

/** 広がって消えるリング（2段ジャンプの空気リング等） */
export interface Ring {
  x: number
  y: number
  r: number
  maxR: number
  life: number
  maxLife: number
  color: string
  width: number
}
