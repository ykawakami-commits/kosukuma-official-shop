import { useEffect, useReducer, useState } from 'react'
import { SLIDERS, tuning, applyPreset, PRESETS } from '../game/tuning'
import { debugState } from '../game/debug'
import { useUIStore } from '../store'

const PRESET_LABELS: Record<keyof typeof PRESETS, string> = {
  A: 'A キビキビ',
  B: 'B 標準',
  C: 'C 現状',
}

// ?debug=1 のときだけ表示。プリセット切替 + 全パラメータのライブ調整。
export function DebugPanel() {
  const [, forceUpdate] = useReducer((n) => n + 1, 0)
  const [open, setOpen] = useState(true)
  const [fps, setFps] = useState(0)
  const muted = useUIStore((s) => s.muted)
  const toggleMute = useUIStore((s) => s.toggleMute)

  useEffect(() => {
    const id = window.setInterval(() => setFps(debugState.fps), 250)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className={`debug-panel ${open ? '' : 'collapsed'}`}>
      <button className="debug-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾ debug' : '▸ debug'} · {fps.toFixed(0)}fps
      </button>
      {open && (
        <>
          <div className="debug-presets">
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
              <button
                key={k}
                className="preset-btn"
                onClick={() => {
                  applyPreset(k)
                  forceUpdate()
                }}
              >
                {PRESET_LABELS[k]}
              </button>
            ))}
            <button className="preset-btn mute" onClick={toggleMute}>
              {muted ? '🔇' : '🔊'}
            </button>
          </div>
          <div className="debug-sliders">
            {SLIDERS.map((s) => {
              const value = tuning[s.key]
              return (
                <label key={s.key} className="debug-row">
                  <span className="debug-name">{s.label}</span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={value}
                    onChange={(e) => {
                      tuning[s.key] = Number(e.target.value)
                      forceUpdate()
                    }}
                  />
                  <span className="debug-val">
                    {Number.isInteger(s.step) ? value : value.toFixed(2)}
                  </span>
                </label>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
