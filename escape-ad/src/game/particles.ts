import type { Particle, Ring } from './types'

// シンプルなパーティクル/リングのプール。固定ステップで update、描画側は読むだけ。
export class Particles {
  list: Particle[] = []
  rings: Ring[] = []

  private spawn(p: Particle) {
    this.list.push(p)
  }

  /** 着地の土埃。speedFactor(0..1) で量・サイズをスケール */
  dust(x: number, y: number, count = 8, speedFactor = 0.5) {
    for (let i = 0; i < count; i++) {
      const dir = (i / count) * Math.PI - Math.PI / 2
      const spd = (60 + Math.random() * 90) * (0.7 + speedFactor)
      this.spawn({
        x,
        y,
        vx: Math.cos(dir) * spd * (Math.random() < 0.5 ? -1 : 1),
        vy: -Math.random() * 120 - 20,
        life: 0.32 + Math.random() * 0.15,
        maxLife: 0.45,
        size: (4 + Math.random() * 5) * (0.8 + speedFactor * 0.7),
        color: Math.random() < 0.5 ? '#d9c7a8' : '#fff7e6',
        gravity: 900,
      })
    }
  }

  /** 死亡の爆発 */
  explode(x: number, y: number) {
    const n = 26
    const palette = ['#ff5d5d', '#ffd23f', '#4fc3f7', '#ffffff', '#ff8a3d']
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3
      const spd = 180 + Math.random() * 320
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 120,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        size: 5 + Math.random() * 7,
        color: palette[i % palette.length],
        gravity: 1100,
      })
    }
  }

  /** かすりの小さな火花 */
  graze(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2
      const spd = 120 + Math.random() * 160
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.22 + Math.random() * 0.12,
        maxLife: 0.34,
        size: 3 + Math.random() * 3,
        color: '#9bffd6',
        gravity: 200,
      })
    }
  }

  /** ✕踏みで広告が弾ける（ポンッ） */
  pop(x: number, y: number) {
    const palette = ['#ffffff', '#ffd23f', '#ff8a3d']
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2
      const spd = 140 + Math.random() * 220
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 80,
        life: 0.3 + Math.random() * 0.25,
        maxLife: 0.55,
        size: 4 + Math.random() * 5,
        color: palette[i % palette.length],
        gravity: 700,
      })
    }
    this.ring(x, y, 60, '#ffffff', 4)
  }

  /** JUST CLOSE の金パーティクル */
  gold(x: number, y: number) {
    const palette = ['#ffd700', '#fff3b0', '#ffb800']
    for (let i = 0; i < 16; i++) {
      const ang = Math.random() * Math.PI * 2
      const spd = 160 + Math.random() * 260
      this.spawn({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 120,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        size: 4 + Math.random() * 5,
        color: palette[i % palette.length],
        gravity: 600,
      })
    }
    this.ring(x, y, 70, 'rgba(255,215,0,0.9)', 4)
  }

  /** 広がって消えるリング */
  ring(x: number, y: number, maxR = 54, color = 'rgba(255,255,255,0.9)', width = 3) {
    this.rings.push({ x, y, r: 8, maxR, life: 0.32, maxLife: 0.32, color, width })
  }

  update(dt: number) {
    const list = this.list
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.life -= dt
      if (p.life <= 0) {
        list[i] = list[list.length - 1]
        list.pop()
        continue
      }
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
    }
    const rings = this.rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]
      r.life -= dt
      if (r.life <= 0) {
        rings[i] = rings[rings.length - 1]
        rings.pop()
        continue
      }
      const t = 1 - r.life / r.maxLife
      r.r = 8 + (r.maxR - 8) * t
    }
  }

  clear() {
    this.list.length = 0
    this.rings.length = 0
  }
}
