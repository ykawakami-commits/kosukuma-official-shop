import { create } from 'zustand'

// =============================================================================
// store.ts — 3Dモードの「表示用」状態のみ（Zustand）。
// 物理状態 sim は store に入れず Renderer3D が ref で保持する。
// Renderer3D がイベント/節目で setter を呼び、React の HUD/オーバーレイが購読する。
// =============================================================================

export type Phase3D = 'title' | 'play' | 'dead' | 'clear'

export interface ClearStats {
  timeS: number
  deaths: number
  stomps: number
  grazes: number
}

interface Store3D {
  phase: Phase3D
  progressPct: number // state.d / goalD * 100
  gaugePct: number // gauge / gaugeMax * 100
  combo: number
  comboShow: boolean
  toast: string
  toastShow: boolean
  adblockFlash: boolean
  adTotal: number
  lpPct: number
  clear: ClearStats
  screenReady: boolean // 死亡/クリア画面の遅延表示
  fpv: boolean
  muted: boolean

  setPhase: (p: Phase3D) => void
  setScreenReady: (b: boolean) => void
  setBars: (progressPct: number, gaugePct: number) => void
  showCombo: (n: number) => void
  hideCombo: () => void
  showToast: (t: string) => void
  hideToast: () => void
  setAdblockFlash: (b: boolean) => void
  setAdTotal: (n: number) => void
  setLpPct: (n: number) => void
  setClear: (c: ClearStats) => void
  toggleFpv: () => void
  toggleMute: () => void
}

export const use3DStore = create<Store3D>((set) => ({
  phase: 'title',
  progressPct: 0,
  gaugePct: 0,
  combo: 0,
  comboShow: false,
  toast: '',
  toastShow: false,
  adblockFlash: false,
  adTotal: 0,
  lpPct: 0,
  clear: { timeS: 0, deaths: 0, stomps: 0, grazes: 0 },
  screenReady: false,
  fpv: false,
  muted: false,

  setPhase: (phase) => set({ phase, screenReady: false }),
  setScreenReady: (screenReady) => set({ screenReady }),
  setBars: (progressPct, gaugePct) => set({ progressPct, gaugePct }),
  showCombo: (combo) => set({ combo, comboShow: true }),
  hideCombo: () => set({ comboShow: false }),
  showToast: (toast) => set({ toast, toastShow: true }),
  hideToast: () => set({ toastShow: false }),
  setAdblockFlash: (adblockFlash) => set({ adblockFlash }),
  setAdTotal: (adTotal) => set({ adTotal }),
  setLpPct: (lpPct) => set({ lpPct }),
  setClear: (clear) => set({ clear }),
  toggleFpv: () => set((s) => ({ fpv: !s.fpv })),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
}))
