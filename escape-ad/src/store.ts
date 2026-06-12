import { create } from 'zustand'
import type { GamePhase } from './game/types'

// オーバーレイUI用の状態。エンジンが state 遷移/節目で setState する。
export interface EmitState {
  phase: GamePhase
  progress: number
  grazeScore: number
  score: number // ✕踏み等の加算スコア
  gauge: number // 0..gaugeMax
  gaugeReady: boolean // 満タン（手動発動待ち）
  adblockActive: boolean
  adblockRemaining: number // s
}

interface UIState extends EmitState {
  muted: boolean
  set: (s: EmitState) => void
  toggleMute: () => void
}

export const useUIStore = create<UIState>((set) => ({
  phase: 'ready',
  progress: 0,
  grazeScore: 0,
  score: 0,
  gauge: 0,
  gaugeReady: false,
  adblockActive: false,
  adblockRemaining: 0,
  muted: false,
  set: (s) => set(s),
  toggleMute: () => set((st) => ({ muted: !st.muted })),
}))
