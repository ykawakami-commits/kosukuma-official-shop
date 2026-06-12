import { DESIGN_HEIGHT } from './tuning'
import type { AdType, Cookie, Course, GroundSpan, Obstacle } from './types'

// =============================================================================
// テストコース（30〜35秒）
// カジュアル＝避けてゴール / 上級＝✕踏み継ぎ・JUST・Cookie収集の深み。
// 各広告タイプの確認区間と、踏み継ぎの空中ルートを用意する。
// Cookie はジャンプ弧・踏み継ぎラインに沿わせてルートの道標を兼ねる。
// =============================================================================

const GROUND_Y = Math.round(DESIGN_HEIGHT * 0.78) // 562 付近

export function buildTestCourse(): Course {
  const spans: GroundSpan[] = []
  const obstacles: Obstacle[] = []
  const cookies: Cookie[] = []
  let obstacleId = 0
  let cookieId = 0
  let goldenTotal = 0

  let x = 0

  const flat = (len: number) => {
    spans.push({ x0: x, x1: x + len })
    x += len
  }
  const hole = (gap: number) => {
    x += gap
  }

  const ad = (
    type: AdType,
    cx: number,
    h: number,
    opts: { w?: number; label?: string; floating?: boolean; topY?: number } = {},
  ) => {
    const w = opts.w ?? (type === 'noclose' ? 74 : 70)
    const floating = opts.floating ?? false
    const y = opts.topY ?? GROUND_Y - h
    obstacles.push({
      id: obstacleId++,
      x: cx - w / 2,
      y,
      w,
      h,
      label: opts.label ?? 'AD',
      type,
      floating,
      hits: 0,
      closed: false,
      closeAnim: 0,
      muted: false,
      fleeTimer: 0,
    })
  }
  const banner = (cx: number, h: number) => ad('popup', cx, h)
  const floatBanner = (cx: number, topY: number) =>
    ad('popup', cx, 92, { floating: true, topY, w: 52 })

  const cookie = (cx: number, cy: number, golden = false) => {
    cookies.push({ id: cookieId++, x: cx, y: cy, golden, collected: false })
    if (golden) goldenTotal++
  }
  /** 水平なCookie列（道標）*/
  const cookieRow = (x0: number, y: number, n: number, gap = 64) => {
    for (let i = 0; i < n; i++) cookie(x0 + i * gap, y)
  }
  /** ジャンプ弧に沿ったCookie（穴越えのヒント）*/
  const cookieArc = (x0: number, span: number, n: number, height: number) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1)
      const cx = x0 + t * span
      const cy = GROUND_Y - 70 - Math.sin(t * Math.PI) * height
      cookie(cx, cy)
    }
  }

  // --- 導入：助走＋道標Cookie -------------------------------------------
  flat(1200)
  cookieRow(420, GROUND_Y - 70, 6)

  // --- 小さい穴：弧Cookieで「跳べ」を示唆 -------------------------------
  cookieArc(x - 60, 190 + 120, 5, 150)
  hole(190)
  flat(820)

  // === 広告タイプ確認区間 ==============================================
  // ① ポップアップ（基本：1踏みで閉じる）
  cookie(x - 360, GROUND_Y - 250, false)
  ad('popup', x - 360, 120, { label: 'AD' })
  flat(640)

  // ② 動画広告（1踏みミュート→2踏みで閉じる）
  ad('video', x - 360, 140, { label: '▶' })
  flat(680)

  // ③ リタゲ広告（追尾・踏むと逃走→2踏みで成仏）
  ad('retarget', x - 360, 120, { label: '👁', floating: true, topY: GROUND_Y - 220 })
  flat(720)

  // ④ ✕なし広告（踏めない・避けるのみ）
  ad('noclose', x - 380, 150, { label: '広告' })
  flat(820)

  // === 並走ルート：空中踏み継ぎ（Cookieライン＋頂点にゴールデン）======
  flat(120)
  {
    const top = GROUND_Y - 205
    const step = 340
    const base = x + 220
    for (let i = 0; i < 4; i++) {
      const ty = top - (i % 2 === 0 ? 0 : 26)
      floatBanner(base + i * step, ty)
      cookie(base + i * step, ty - 46) // 踏み継ぎラインの上にCookie
    }
    // 危険な空中ルートの最奥にゴールデン①
    cookie(base + 3 * step + 60, top - 90, true)
    flat(step * 4 + 380)
  }

  // --- 高いバナー2連 ---------------------------------------------------
  banner(x - 500, 170)
  banner(x + 200, 190)
  flat(1100)

  // --- 連続穴：広い穴の上にゴールデン② --------------------------------
  cookieArc(x - 40, 170 + 80, 4, 120)
  hole(170)
  flat(360)
  cookie(x + 85, GROUND_Y - 250, true) // ゴールデン②（穴の縁の高所）
  hole(170)
  flat(360)
  hole(200)
  flat(900)

  // --- 最後の山場：穴→高バナー→穴（最奥にゴールデン③）----------------
  banner(x - 600, 150)
  hole(240)
  cookie(x - 120, GROUND_Y - 260, true) // ゴールデン③
  flat(500)
  banner(x + 60, 160)
  flat(1200)
  cookieRow(x - 900, GROUND_Y - 70, 6)

  const length = x

  return { length, groundY: GROUND_Y, spans, obstacles, cookies, goldenTotal }
}

/** x に地面があるか（穴判定） */
export function isGroundAt(course: Course, x: number): boolean {
  for (const s of course.spans) {
    if (x >= s.x0 && x <= s.x1) return true
  }
  return false
}
