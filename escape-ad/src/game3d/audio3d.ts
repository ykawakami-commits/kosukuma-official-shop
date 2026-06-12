// =============================================================================
// audio3d.ts — WebAudio 合成 SFX（escape-ad-3d プロトタイプの beep/SFX を移植）
// 踏みコンボで半音ずつ上昇。ミュートは外部 getter から取得。
// =============================================================================

let AC: AudioContext | null = null
let isMuted: () => boolean = () => false

export function setMutedGetter(fn: () => boolean) {
  isMuted = fn
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!AC) {
    const C =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    AC = new C()
  }
  return AC
}

export function unlockAudio() {
  const a = ac()
  if (a && a.state === 'suspended') void a.resume()
}

function beep(freq: number, dur: number, type?: OscillatorType, vol?: number, slide?: number) {
  if (isMuted()) return
  try {
    const a = ac()
    if (!a) return
    const o = a.createOscillator(),
      g = a.createGain()
    o.type = type || 'square'
    o.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.06)
    if (slide)
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), a.currentTime + dur)
    g.gain.value = vol || 0.08
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur)
    o.connect(g)
    g.connect(a.destination)
    o.start()
    o.stop(a.currentTime + dur)
  } catch (e) {
    /* noop */
  }
}

export const SFX = {
  jump: () => beep(420, 0.1, 'square', 0.07, 1.6),
  djump: () => beep(560, 0.1, 'square', 0.07, 1.7),
  land: () => beep(150, 0.07, 'triangle', 0.09, 0.6),
  stomp: (c: number) => beep(520 * Math.pow(1.0595, Math.min(c, 12)), 0.12, 'square', 0.1, 1.5),
  graze: () => beep(1180, 0.06, 'sine', 0.05, 1.2),
  death: () => beep(300, 0.5, 'sawtooth', 0.12, 0.18),
  adblk: () => beep(880, 0.35, 'sine', 0.08, 2.0),
  clear: () => {
    beep(660, 0.12, 'square', 0.1, 1.2)
    setTimeout(() => beep(880, 0.2, 'square', 0.1, 1.3), 120)
  },
}
