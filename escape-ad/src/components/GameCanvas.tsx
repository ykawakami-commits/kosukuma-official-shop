import { useEffect, useRef } from 'react'
import { Engine } from '../game/engine'
import { useUIStore } from '../store'

// Canvas をマウントし Engine を生成/破棄するだけ。
// 描画は Engine 内の rAF が担当（React は再レンダリングしない）。
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const emit = useUIStore.getState().set
    const engine = new Engine(canvas, emit)
    engine.start()

    return () => engine.destroy()
  }, [])

  return <canvas ref={canvasRef} className="game-canvas" />
}
