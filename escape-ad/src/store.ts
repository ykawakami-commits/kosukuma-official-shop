import { create } from 'zustand'
import type { GamePhase } from './game/types'

// オーバーレイUI用の最小状態。エンジンが state 遷移時に setState する。
// （毎フレームの描画値は Canvas 側が持つので、ここは UI に必要な分だけ）
interface UIState {
  phase: GamePhase
  progress: number
  grazeScore: number
  set: (s: { phase: GamePhase; progress: number; grazeScore: number }) => void
}

export const useUIStore = create<UIState>((set) => ({
  phase: 'ready',
  progress: 0,
  grazeScore: 0,
  set: (s) => set(s),
}))
