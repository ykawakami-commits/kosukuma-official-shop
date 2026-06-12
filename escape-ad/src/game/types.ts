// 共有の型定義

export type GamePhase = 'ready' | 'playing' | 'dead' | 'clear'

/** ground が存在する x 区間（この外＝穴） */
export interface GroundSpan {
  x0: number
  x1: number
}

/** 静的バナー障害物（地面の上に立つ矩形） */
export interface Obstacle {
  id: number
  x: number // 左端 (world px)
  y: number // 上端 (world px, デザイン座標)
  w: number
  h: number
  label: string
}

export interface Course {
  /** ゴールまでの距離（進捗%算出に使用） */
  length: number
  /** 地面の高さ（上端 y, デザイン座標） */
  groundY: number
  spans: GroundSpan[]
  obstacles: Obstacle[]
}

/** 補間レンダリング用に prev/curr 2 状態を持つ値 */
export interface Interpolated {
  prev: number
  curr: number
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
