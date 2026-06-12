import { useUIStore } from '../store'
import { tuning } from '../game/tuning'
import { gameRef } from '../game/gameRef'

// スタート / 死亡 / クリア + 進捗バー + AdBlockゲージ + ミュート。
// 入力（ジャンプ/リスタート）は Canvas が拾うので、操作要素のみ pointer-events:auto。
export function Overlay() {
  const phase = useUIStore((s) => s.phase)
  const progress = useUIStore((s) => s.progress)
  const grazeScore = useUIStore((s) => s.grazeScore)
  const score = useUIStore((s) => s.score)
  const gauge = useUIStore((s) => s.gauge)
  const gaugeReady = useUIStore((s) => s.gaugeReady)
  const adblockActive = useUIStore((s) => s.adblockActive)
  const cookies = useUIStore((s) => s.cookies)
  const golden = useUIStore((s) => s.golden)
  const goldenTotal = useUIStore((s) => s.goldenTotal)
  const muted = useUIStore((s) => s.muted)
  const toggleMute = useUIStore((s) => s.toggleMute)

  const gaugePct = Math.min(100, (gauge / tuning.gaugeMax) * 100)
  const playing = phase === 'playing' || phase === 'clear'
  const manualReady = gaugeReady && tuning.adblockAuto < 1 && phase === 'playing'

  return (
    <div className="overlay">
      {/* ミュート（本体UI・常時）*/}
      <button
        className="mute-btn"
        onClick={toggleMute}
        aria-label={muted ? 'unmute' : 'mute'}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {/* AdBlock ゲージ（画面左端の細い縦バー）*/}
      {playing && (
        <div className="gauge" aria-hidden>
          <div
            className={`gauge-fill ${adblockActive ? 'active' : gaugeReady ? 'ready' : ''}`}
            style={{ height: `${gaugePct}%` }}
          />
          <span className="gauge-tag">AD<br />BLOCK</span>
        </div>
      )}

      {/* 手動発動ボタン（adblockAuto=0 かつ満タン時）*/}
      {manualReady && (
        <button
          className="adblock-btn blink"
          onClick={() => gameRef.world?.tryActivateAdblock()}
        >
          AdBlock 発動
        </button>
      )}

      {/* 進捗バー */}
      {playing && (
        <div className="progress-wrap">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-label">{Math.floor(progress)}%</div>
          {(grazeScore > 0 || score > 0) && (
            <div className="graze-label">{score + grazeScore}</div>
          )}
        </div>
      )}

      {phase === 'ready' && (
        <div className="panel">
          <h1>escape AD</h1>
          <p className="lead">タップでジャンプ / 空中でもう一度＝2段ジャンプ</p>
          <p className="lead">広告の ✕ を上から踏むと閉じられる！ 下スワイプで急降下</p>
          <p className="golden-line">🍪 ゴールデン 0/{goldenTotal}</p>
          <p className="cta blink">タップでスタート</p>
        </div>
      )}

      {phase === 'dead' && (
        <div className="panel dead">
          <p className="result">{Math.floor(progress)}% で広告に興味を持ちました</p>
          <p className="sub">SCORE {score + grazeScore}</p>
          <p className="sub">Cookieを{cookies}枚収集しました（同意した覚えはない）</p>
          <p className="golden-line">🍪 ゴールデン {golden}/{goldenTotal}</p>
          <p className="cta blink">タップでリトライ</p>
        </div>
      )}

      {phase === 'clear' && (
        <div className="panel clear">
          <h1>ゴール！</h1>
          <p className="result">完走 / SCORE {score + grazeScore}</p>
          <p className="sub">Cookieを{cookies}枚収集しました（同意した覚えはない）</p>
          <p className="golden-line">🍪 ゴールデン {golden}/{goldenTotal}</p>
          <p className="cta blink">タップでもう一回</p>
        </div>
      )}
    </div>
  )
}
