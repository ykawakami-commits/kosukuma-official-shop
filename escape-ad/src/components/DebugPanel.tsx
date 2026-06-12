import { useEffect, useReducer, useState } from 'react'
import { SLIDERS, tuning } from '../game/tuning'
import { debugState } from '../game/debug'

// ?debug=1 のときだけ表示。SLIDERS を実機ライブ調整スライダーにして tuning を直接書き換える。
// tuning はミュータブルな単一オブジェクトなので、エンジンは次フレームから新値を読む。
export function DebugPanel() {
  const [, forceUpdate] = useReducer((n) => n + 1, 0)
  const [open, setOpen] = useState(true)
  const [fps, setFps] = useState(0)

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
        <div className="debug-sliders">
          {SLIDERS.map((s) => {
            const value = tuning[s.key] as number
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
      )}
    </div>
  )
}
