import type { Particle } from './types'

// シンプルなパーティクルプール。固定タイムステップ側で update、描画側で読むだけ。
export class Particles {
  list: Particle[] = []

  private spawn(p: Particle) {
    this.list.push(p)
  }

  /** 着地の土埃 */
  dust(x: number, y: number) {
    const n = 8
    for (let i = 0; i < n; i++) {
      const dir = (i / n) * Math.PI - Math.PI / 2 // 左右に広がる
      const spd = 60 + Math.random() * 90
      this.spawn({
        x,
        y,
        vx: Math.cos(dir) * spd * (Math.random() < 0.5 ? -1 : 1),
        vy: -Math.random() * 120 - 20,
        life: 0.32 + Math.random() * 0.15,
        maxLife: 0.45,
        size: 4 + Math.random() * 5,
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
    const n = 5
    for (let i = 0; i < n; i++) {
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
  }

  clear() {
    this.list.length = 0
  }
}
