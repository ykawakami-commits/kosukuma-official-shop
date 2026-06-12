import { useUIStore } from '../store'

// スタート / 死亡 / クリア のオーバーレイ + 進捗バー。
// 実際のリスタート入力は Canvas の pointerdown → world.press() が拾うので、
// ここは表示専用（pointer-events: none）。
export function Overlay() {
  const phase = useUIStore((s) => s.phase)
  const progress = useUIStore((s) => s.progress)
  const grazeScore = useUIStore((s) => s.grazeScore)

  return (
    <div className="overlay">
      {/* 進捗バー（プレイ中・クリア時に表示）*/}
      {(phase === 'playing' || phase === 'clear') && (
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-label">{Math.floor(progress)}%</div>
          {grazeScore > 0 && <div className="graze-label">GRAZE {grazeScore}</div>}
        </div>
      )}

      {phase === 'ready' && (
        <div className="panel">
          <h1>escape AD</h1>
          <p className="lead">タップでジャンプ / 空中でもう一度＝2段ジャンプ</p>
          <p className="cta blink">タップでスタート</p>
        </div>
      )}

      {phase === 'dead' && (
        <div className="panel dead">
          <p className="result">{Math.floor(progress)}% で広告に興味を持ちました</p>
          <p className="cta blink">タップでリトライ</p>
        </div>
      )}

      {phase === 'clear' && (
        <div className="panel clear">
          <h1>ゴール！</h1>
          <p className="result">完走 / GRAZE {grazeScore}</p>
          <p className="cta blink">タップでもう一回</p>
        </div>
      )}
    </div>
  )
}
