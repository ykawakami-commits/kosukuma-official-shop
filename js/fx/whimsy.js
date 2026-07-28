// js/fx/whimsy.js — 軽い遊び（時間帯の背景/一言/姿、ごく稀な昼寝）
// 遊びは装飾領域（ヒーロー端・フッター・背景帯）のみ。商品カード・価格・ボタンには一切触れない。
const LINES = {
  morning: 'おはよう。ぼくはまだ半分ねてるよ',
  day: '昼だよ。ぼくは金平糖の食べる順番を考えてるよ',
  evening: '夕方って、なんとなく人を褒めたくなるよ。今日も生きてたよ。えらいよ',
  night: '夜だよ。焚き火の前だと本音がぽろりって出るよ。……ぼくはまあまあ楽しかったよ',
};

export function getBand() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'evening';
  return 'night';
}

export function initWhimsy() {
  const band = getBand();
  // 背景用の data-time は <head> の先行スクリプトが設定済み。未設定時の保険
  document.documentElement.dataset.time ||= band === 'morning' ? 'day' : band;

  // フッター一言
  const line = document.getElementById('whimsy-line');
  if (line) line.textContent = LINES[band];

  // フッターの姿（夜は main.js が utouto アニメを #whimsy-kuma-anim にマウントする）
  const img = document.getElementById('whimsy-kuma-img');
  const animSlot = document.getElementById('whimsy-kuma-anim');
  if (band === 'evening' && img) img.src = '/assets/pose/campfire.webp';
  if (band === 'night') {
    if (img) img.hidden = true;
    if (animSlot) animSlot.hidden = false;
  }

  // ごく稀にヒーローが昼寝（1割以下・装飾のみ）
  if (Math.random() < 0.1) {
    const hero = document.getElementById('hero-kuma');
    if (hero) {
      hero.src = '/assets/pose/sleeping.webp';
      hero.alt = '昼寝しているこすくまくん';
    }
  }
  return band;
}
