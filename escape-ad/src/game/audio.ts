import { tuning } from './tuning'
import { useUIStore } from '../store'

// =============================================================================
// audio.ts — Web Audio API でその場合成する SFX（音声ファイル不要）
// 再生ごとにピッチ ±5% ランダム。ミュート/音量は store・tuning から読む。
// =============================================================================

let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!C) return null
    ctx = new C()
  }
  return ctx
}

const rndPitch = () => 1 + (Math.random() * 0.1 - 0.05) // ±5%

function gain(): number {
  if (useUIStore.getState().muted) return 0
  return tuning.sfxVolume
}

interface Tone {
  freq: number
  /** 終端周波数（スイープ）。未指定なら freq 一定 */
  to?: number
  dur: number
  type?: OscillatorType
  /** 音量倍率（SFXごとの相対バランス） */
  vol?: number
  /** 軽いノイズ感を足す（着地のトッ等） */
  attack?: number
}

function tone(t: Tone) {
  const c = ac()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  const g0 = gain() * (t.vol ?? 1)
  if (g0 <= 0) return

  const now = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = t.type ?? 'square'
  const p = rndPitch()
  osc.frequency.setValueAtTime(t.freq * p, now)
  if (t.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, t.to * p),
      now + t.dur,
    )
  }
  const atk = t.attack ?? 0.005
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(g0, now + atk)
  g.gain.exponentialRampToValueAtTime(0.0001, now + t.dur)
  osc.connect(g).connect(c.destination)
  osc.start(now)
  osc.stop(now + t.dur + 0.02)
}

export const audio = {
  /** 最初のユーザー操作で AudioContext を解放（自動再生ポリシー対策） */
  unlock() {
    const c = ac()
    if (c && c.state === 'suspended') void c.resume()
  },
  jump() {
    tone({ freq: 520, to: 720, dur: 0.12, type: 'square', vol: 0.5 })
  },
  doubleJump() {
    tone({ freq: 720, to: 980, dur: 0.12, type: 'square', vol: 0.5 })
  },
  land(speedFactor = 0.5) {
    tone({ freq: 180, to: 90, dur: 0.1 + speedFactor * 0.05, type: 'sine', vol: 0.6 })
  },
  graze() {
    tone({ freq: 1320, dur: 0.09, type: 'triangle', vol: 0.45 })
    tone({ freq: 1980, dur: 0.07, type: 'triangle', vol: 0.3 })
  },
  stomp() {
    tone({ freq: 880, to: 1500, dur: 0.1, type: 'square', vol: 0.55 })
  },
  death() {
    tone({ freq: 600, to: 90, dur: 0.5, type: 'sawtooth', vol: 0.55 })
  },
  adblock() {
    tone({ freq: 400, to: 1600, dur: 0.35, type: 'triangle', vol: 0.5 })
  },
}
