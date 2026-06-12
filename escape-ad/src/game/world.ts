import { DESIGN_HEIGHT, tuning } from './tuning'
import { buildTestCourse, isGroundAt } from './course'
import { Particles } from './particles'
import { audio } from './audio'
import type { EmitState } from '../store'
import type { Course, GamePhase, Obstacle } from './types'

// プレイヤー見た目サイズ（デザインpx）。当たり判定は hitboxScale を掛けたもの。
export const SPRITE_W = 64
export const SPRITE_H = 72

const DEATH_Y = DESIGN_HEIGHT + 160

export interface PlayerView {
  x: number
  y: number
  prevX: number
  prevY: number
  stretch: number // +で縦伸び / -で潰れ
  vy: number
  grounded: boolean
}

export interface CameraView {
  x: number
  prevX: number
  y: number // マイクロディップ（着地で沈む, design px）
  shakeTimer: number
}

export type Emit = (s: EmitState) => void

export class World {
  course: Course = buildTestCourse()
  particles = new Particles()

  phase: GamePhase = 'ready'

  player: PlayerView = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    stretch: 0,
    vy: 0,
    grounded: true,
  }

  camera: CameraView = { x: 0, prevX: 0, y: 0, shakeTimer: 0 }

  // 入力・ジャンプ状態
  private bufferTimer = 0
  private coyoteTimer = 0
  private jumpsUsed = 0

  // かすり / スコア
  private grazedIds = new Set<number>()
  grazeScore = 0
  score = 0

  // 死亡演出
  private hitstopTimer = 0
  private deathFxDone = false

  // 着地ジュース
  private freezeTimer = 0 // 高所着地の極小ヒットストップ
  private dipTimer = 0
  private dipAmount = 0

  // AdBlock
  gauge = 0
  adblockActive = false
  adblockTimer = 0

  // テロップ（canvas 描画）
  telopText = ''
  telopTimer = 0

  progress = 0

  // emit 差分検出用
  private last: EmitState | null = null

  constructor(private emit: Emit) {
    this.reset()
  }

  // --- ジャンプ物理（H/t 方式）----------------------------------------
  private gUp() {
    const t = tuning.jumpTime1
    return (2 * tuning.jumpHeight1) / (t * t)
  }
  /** 目標高さ H に必要な初速（固定の g_up 前提）= √(2·g_up·H) */
  private vForHeight(h: number) {
    return Math.sqrt(2 * this.gUp() * h)
  }

  // --- ライフサイクル ---------------------------------------------------
  reset() {
    this.course = buildTestCourse() // ✕踏みで閉じた状態などを初期化
    const c = this.course
    const p = this.player
    p.x = 120
    p.y = c.groundY - SPRITE_H / 2
    p.prevX = p.x
    p.prevY = p.y
    p.vy = 0
    p.stretch = 0
    p.grounded = true
    this.bufferTimer = 0
    this.coyoteTimer = 0
    this.jumpsUsed = 0
    this.grazedIds.clear()
    this.grazeScore = 0
    this.score = 0
    this.hitstopTimer = 0
    this.deathFxDone = false
    this.freezeTimer = 0
    this.dipTimer = 0
    this.dipAmount = 0
    this.gauge = 0
    this.adblockActive = false
    this.adblockTimer = 0
    this.telopText = ''
    this.telopTimer = 0
    this.progress = 0
    this.camera.x = Math.max(0, p.x - tuning.cameraOffsetX)
    this.camera.prevX = this.camera.x
    this.camera.y = 0
    this.camera.shakeTimer = 0
    this.particles.clear()
    this.phase = 'ready'
    this.pushState(true)
  }

  start() {
    if (this.phase === 'ready') {
      this.phase = 'playing'
      this.pushState(true)
    }
  }

  /** タップ。状態に応じて開始 / ジャンプ / リスタート */
  press() {
    if (this.phase === 'ready') {
      this.start()
      this.bufferTimer = tuning.jumpBufferMs / 1000
    } else if (this.phase === 'playing') {
      this.bufferTimer = tuning.jumpBufferMs / 1000
    } else if (this.phase === 'dead' || this.phase === 'clear') {
      if (this.deathFxDone || this.phase === 'clear') {
        this.reset()
        this.start()
        this.bufferTimer = tuning.jumpBufferMs / 1000
      }
    }
  }

  /** 手動 AdBlock 発動（debug: adblockAuto=0 のとき UI ボタンから） */
  tryActivateAdblock() {
    if (this.phase === 'playing' && !this.adblockActive && this.gauge >= tuning.gaugeMax) {
      this.activateAdblock()
    }
  }

  // --- 固定タイムステップ更新 ------------------------------------------
  step(dt: number) {
    this.player.prevX = this.player.x
    this.player.prevY = this.player.y
    this.camera.prevX = this.camera.x

    if (this.camera.shakeTimer > 0) this.camera.shakeTimer -= dt
    if (this.telopTimer > 0) this.telopTimer -= dt
    this.animateClosing(dt)

    if (this.phase === 'dead') {
      this.stepDeath(dt)
      this.particles.update(dt)
      return
    }
    if (this.phase !== 'playing') return

    // 高所着地の極小ヒットストップ：シーン全体を一瞬止める
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt
      return
    }

    const p = this.player

    // 1) 入力バッファ
    if (this.bufferTimer > 0) this.bufferTimer -= dt

    // 2) バッファ済みの空中/地上ジャンプ（入力と同フレームで物理適用）
    this.tryJump()

    // 3) 水平移動
    p.x += tuning.runSpeed * dt

    // 4) AdBlock タイマー
    if (this.adblockActive) {
      this.adblockTimer -= dt
      if (this.adblockTimer <= 0) {
        this.adblockActive = false
        this.adblockTimer = 0
      }
    }

    // 5) 重力（非対称）＋終端速度
    const g = this.gUp() * (p.vy < 0 ? 1 : tuning.fallMultiplier)
    p.vy += g * dt
    if (p.vy > tuning.terminalVelocity) p.vy = tuning.terminalVelocity
    p.y += p.vy * dt

    // 6) 着地
    const wasGrounded = p.grounded
    const impactVy = p.vy
    this.resolveGround()
    if (!wasGrounded && p.grounded) this.onLand(impactVy)

    // 7) 着地同フレームのバッファ発火
    this.tryJump()

    // 8) コヨーテ
    if (p.grounded) {
      this.coyoteTimer = 0
    } else {
      this.coyoteTimer += dt
      if (this.jumpsUsed === 0 && this.coyoteTimer > tuning.coyoteMs / 1000) {
        this.jumpsUsed = 1
      }
    }

    // 9) スクワッシュ復帰（見た目のみ）
    const recover = Math.max(0, 1 - dt / tuning.squashRecover)
    p.stretch *= recover

    // 10) カメラ・マイクロディップ
    this.updateDip(dt)

    // 11) 障害物（✕踏み / 当たり / かすり）。AdBlock中は判定なし
    if (!this.adblockActive) this.checkObstacles()

    // 12) ゲージ満タン処理
    if (this.gauge >= tuning.gaugeMax) {
      if (tuning.adblockAuto >= 1 && !this.adblockActive) this.activateAdblock()
    }

    // 13) 穴落ち（AdBlock中も死ぬ）
    if (p.y > DEATH_Y) this.die()

    // 14) ゴール
    if (p.x >= this.course.length) {
      this.phase = 'clear'
      this.progress = 100
      this.pushState(true)
    }

    // 15) カメラ追従
    this.camera.x = Math.max(0, p.x - tuning.cameraOffsetX)

    // 16) パーティクル
    this.particles.update(dt)

    // 進捗
    this.progress = Math.min(100, (p.x / this.course.length) * 100)
    this.pushState()
  }

  private stepDeath(dt: number) {
    if (this.deathFxDone) return
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt
      return
    }
    this.camera.shakeTimer = tuning.shakeDurationMs / 1000
    this.particles.explode(this.player.x, this.player.y)
    this.deathFxDone = true
  }

  // --- ジャンプ ---------------------------------------------------------
  private tryJump() {
    if (this.bufferTimer <= 0) return
    const p = this.player
    const coyoteOk = p.grounded || this.coyoteTimer <= tuning.coyoteMs / 1000

    if (this.jumpsUsed === 0 && coyoteOk) {
      p.vy = -this.vForHeight(tuning.jumpHeight1)
      p.grounded = false
      this.jumpsUsed = 1
      p.stretch = tuning.stretchAmount
      this.bufferTimer = 0
      audio.jump()
    } else if (this.jumpsUsed >= 1 && this.jumpsUsed < tuning.maxJumps) {
      p.vy = -this.vForHeight(tuning.jumpHeight1 * tuning.doubleJumpFactor)
      this.jumpsUsed += 1
      p.stretch = tuning.stretchAmount * 0.8
      this.bufferTimer = 0
      if (tuning.airRingEnabled >= 1) {
        this.particles.ring(p.x, p.y + SPRITE_H / 2, 64, 'rgba(180,220,255,0.85)', 3)
      }
      audio.doubleJump()
    }
  }

  private resolveGround() {
    const p = this.player
    const groundTop = this.course.groundY
    const feet = p.y + SPRITE_H / 2
    const overGround = isGroundAt(this.course, p.x)

    if (overGround && p.vy >= 0 && feet >= groundTop) {
      p.y = groundTop - SPRITE_H / 2
      p.vy = 0
      p.grounded = true
      this.jumpsUsed = 0
    } else {
      p.grounded = false
    }
  }

  private onLand(impactVy: number) {
    const factor = Math.max(0, Math.min(1, impactVy / tuning.squashSpeedRef))
    // 着地スクワッシュ：速いほど潰れる（見た目のみ）
    this.player.stretch = -(tuning.squashMin + (tuning.squashMax - tuning.squashMin) * factor)
    // 土埃：量・サイズを落下速度でスケール
    const count = Math.round(tuning.dustBaseCount + (tuning.dustMaxCount - tuning.dustBaseCount) * factor)
    this.particles.dust(this.player.x, this.course.groundY, count, factor)
    // カメラ・マイクロディップ
    this.dipAmount = tuning.cameraDipMax * (0.4 + factor * 0.6)
    this.dipTimer = tuning.cameraDipMs / 1000
    // 高所着地のみ極小ヒットストップ
    if (impactVy > tuning.highFallThreshold && tuning.highFallHitstopMs > 0) {
      this.freezeTimer = tuning.highFallHitstopMs / 1000
    }
    audio.land(factor)
  }

  private updateDip(dt: number) {
    const total = tuning.cameraDipMs / 1000
    if (this.dipTimer > 0 && total > 0) {
      this.dipTimer -= dt
      const prog = Math.max(0, Math.min(1, 1 - this.dipTimer / total))
      this.camera.y = Math.sin(prog * Math.PI) * this.dipAmount
    } else {
      this.camera.y = 0
    }
  }

  // --- 障害物 -----------------------------------------------------------
  private xBox(o: Obstacle) {
    const bw = 28
    const bh = 28
    const x0 = o.x + o.w - 24
    const y0 = o.y - 22
    return { x0, y0, bw, bh, cx: x0 + bw / 2, cy: y0 + bh / 2 }
  }

  private checkObstacles() {
    const p = this.player
    const hw = (SPRITE_W / 2) * tuning.hitboxScale
    const hh = (SPRITE_H / 2) * tuning.hitboxScale
    const feet = p.y + hh
    const prevFeet = p.prevY + hh
    const m = tuning.grazeMargin

    for (const o of this.course.obstacles) {
      if (o.closed) continue
      if (o.x + o.w < p.x - 220 || o.x > p.x + 220) continue

      // --- ✕踏み（甘めの Mario 式判定）---
      const b = this.xBox(o)
      const exHw = (b.bw / 2) * tuning.xHitboxScale
      const exHh = (b.bh / 2) * tuning.xHitboxScale
      const overX = p.x + hw > b.cx - exHw && p.x - hw < b.cx + exHw
      const stomp =
        p.vy > 0 && overX && prevFeet <= b.y0 + 6 && feet >= b.y0 - exHh
      if (stomp) {
        this.stomp(o, b.cx, b.y0)
        continue
      }

      // --- 本体接触＝死亡 ---
      const hit =
        p.x + hw > o.x && p.x - hw < o.x + o.w && p.y + hh > o.y && p.y - hh < o.y + o.h
      if (hit) {
        this.die()
        return
      }

      // --- かすり ---
      if (!this.grazedIds.has(o.id)) {
        const graze =
          p.x + hw + m > o.x &&
          p.x - hw - m < o.x + o.w &&
          p.y + hh + m > o.y &&
          p.y - hh - m < o.y + o.h
        if (graze) {
          this.grazedIds.add(o.id)
          this.grazeScore += tuning.grazeScore
          this.gauge = Math.min(tuning.gaugeMax, this.gauge + tuning.grazeGaugeGain)
          const gx = p.x < o.x ? o.x : o.x + o.w
          this.particles.graze(gx, Math.max(o.y, p.y))
          audio.graze()
        }
      }
    }
  }

  private stomp(o: Obstacle, cx: number, topY: number) {
    o.closed = true
    o.closeAnim = 0
    const p = this.player
    p.vy = -tuning.stompBounceVel
    p.grounded = false
    this.jumpsUsed = 0 // ✕を踏み継いで空中を渡れる
    p.stretch = tuning.stretchAmount * 0.6
    this.score += tuning.stompScore
    this.gauge = Math.min(tuning.gaugeMax, this.gauge + tuning.stompGaugeGain)
    this.particles.pop(cx, topY)
    this.telop('広告を閉じた！')
    audio.stomp()
  }

  private animateClosing(dt: number) {
    for (const o of this.course.obstacles) {
      if (o.closed && o.closeAnim < 1) {
        o.closeAnim = Math.min(1, o.closeAnim + dt / 0.18)
      }
    }
  }

  private activateAdblock() {
    this.adblockActive = true
    this.adblockTimer = tuning.adblockDurationSec
    this.gauge = 0
    this.telop('AdBlock!')
    audio.adblock()
    this.pushState(true)
  }

  private die() {
    if (this.phase === 'dead') return
    this.phase = 'dead'
    this.hitstopTimer = tuning.hitstopMs / 1000
    this.deathFxDone = false
    audio.death()
    this.pushState(true)
  }

  private telop(text: string) {
    this.telopText = text
    this.telopTimer = 1.0
  }

  // --- emit（差分があるときだけ React へ）-----------------------------
  private snapshot(): EmitState {
    return {
      phase: this.phase,
      progress: this.progress,
      grazeScore: this.grazeScore,
      score: this.score,
      gauge: this.gauge,
      gaugeReady: this.gauge >= tuning.gaugeMax && !this.adblockActive,
      adblockActive: this.adblockActive,
      adblockRemaining: this.adblockTimer,
    }
  }

  private pushState(force = false) {
    const s = this.snapshot()
    const l = this.last
    const changed =
      force ||
      !l ||
      l.phase !== s.phase ||
      Math.abs(l.progress - s.progress) > 0.6 ||
      l.grazeScore !== s.grazeScore ||
      l.score !== s.score ||
      Math.abs(l.gauge - s.gauge) >= 2 ||
      l.gaugeReady !== s.gaugeReady ||
      l.adblockActive !== s.adblockActive ||
      Math.round(l.adblockRemaining) !== Math.round(s.adblockRemaining)
    if (changed) {
      this.last = s
      this.emit(s)
    }
  }
}
