import { useEffect, useRef } from 'react'
import { Renderer3D } from './Renderer3D'
import { use3DStore } from './store'
import './game3d.css'

// 3Dモードの React シェル。Canvas をマウントして Renderer3D を起動し、
// HUD/オーバーレイは store の「表示用」値だけを購読する（物理は Renderer3D 内）。
export function Game3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const r = new Renderer3D(canvas)
    return () => r.dispose()
  }, [])

  const phase = use3DStore((s) => s.phase)
  const progressPct = use3DStore((s) => s.progressPct)
  const gaugePct = use3DStore((s) => s.gaugePct)
  const combo = use3DStore((s) => s.combo)
  const comboShow = use3DStore((s) => s.comboShow)
  const toast = use3DStore((s) => s.toast)
  const toastShow = use3DStore((s) => s.toastShow)
  const adblockFlash = use3DStore((s) => s.adblockFlash)
  const adTotal = use3DStore((s) => s.adTotal)
  const lpPct = use3DStore((s) => s.lpPct)
  const clear = use3DStore((s) => s.clear)
  const screenReady = use3DStore((s) => s.screenReady)
  const fpv = use3DStore((s) => s.fpv)
  const muted = use3DStore((s) => s.muted)
  const toggleFpv = use3DStore((s) => s.toggleFpv)
  const toggleMute = use3DStore((s) => s.toggleMute)

  const skipPct = Math.max(0, 100 - Math.floor(progressPct))

  return (
    <div className="g3-wrap">
      <canvas ref={canvasRef} className="g3-canvas" />

      {/* HUD（プレイ中）*/}
      {phase === 'play' && (
        <div className="g3-hud">
          <div className="g3-adcount">
            広告数 <b>{adTotal.toLocaleString()}</b> 件
          </div>
          <div className="g3-seek">
            <div className="g3-seeklabel">
              スキップ可能まであと <span>{skipPct}</span>%
            </div>
            <div className="g3-seekbar">
              <div className="g3-seekfill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="g3-gaugebox">
            <div className="g3-gaugelabel">AdBlock</div>
            <div className="g3-gaugebar">
              <div className="g3-gaugefill" style={{ width: `${gaugePct}%` }} />
            </div>
          </div>
          <div className="g3-combo" style={{ opacity: comboShow ? 1 : 0 }}>
            {combo} <small>CLOSE!</small>
          </div>
          <div className="g3-toast" style={{ opacity: toastShow ? 1 : 0 }}>
            {toast}
          </div>
        </div>
      )}

      {/* AdBlock フラッシュ */}
      <div className="g3-flash" style={{ opacity: adblockFlash ? 1 : 0 }} />

      {/* 操作ボタン（data-ui で Renderer のタップ判定から除外）*/}
      <button
        data-ui
        className="g3-btn g3-fpv"
        onPointerDown={(e) => {
          e.stopPropagation()
          toggleFpv()
        }}
      >
        {fpv ? '👁 三人称へ' : '👁 視点切替'}
      </button>
      <button
        data-ui
        className="g3-btn g3-mute"
        onPointerDown={(e) => {
          e.stopPropagation()
          toggleMute()
        }}
      >
        {muted ? '🔇 消音' : '🔊 音'}
      </button>

      {/* タイトル */}
      {phase === 'title' && (
        <div className="g3-ovl g3-title">
          <div className="g3-pr">PR</div>
          <h1>
            世界一<span>広告</span>の多い
            <br />
            ゲーム <span style={{ fontSize: '.6em' }}>3D</span>
          </h1>
          <div className="g3-sub">
            タップでジャンプ／空中でもう一回
            <br />
            広告の上の <b style={{ color: '#ff5d7e' }}>✕</b> は踏むと閉じられる
            <br />
            かすると AdBlock ゲージが溜まる
          </div>
          <div className="g3-start">タップしてスキップ不可の広告へ</div>
          <div className="g3-corp">© 株式会社こす.くま</div>
        </div>
      )}

      {/* 死亡＝うさんくさいLP */}
      {phase === 'dead' && screenReady && (
        <div className="g3-ovl g3-lp">
          <div className="g3-lpcard">
            <span className="g3-badge">広告</span>
            <h2>おめでとうございます！</h2>
            <div className="g3-pct">
              あなたは <b>{lpPct}</b>
              <b style={{ fontSize: '15px' }}>%</b> 地点で
              <br />
              広告に興味を持ちました
            </div>
            <div className="g3-fakebtn">▶ タップで広告から脱出（無料）</div>
            <div className="g3-note">※何度でも脱出できます ※広告は増え続けます</div>
          </div>
        </div>
      )}

      {/* クリア */}
      {phase === 'clear' && screenReady && (
        <div className="g3-ovl g3-clear">
          <h2>スキップしました</h2>
          <div className="g3-stats">
            タイム {clear.timeS.toFixed(2)}s ／ 死亡 {clear.deaths} 回
            <br />
            ✕踏み {clear.stomps} ／ かすり {clear.grazes}
            <br />
            視聴した広告：<b style={{ color: '#ffd400' }}>0 件</b>（偉業）
          </div>
          <div className="g3-again">もう一度走る</div>
        </div>
      )}
    </div>
  )
}
