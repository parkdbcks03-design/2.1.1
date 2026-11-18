/*
 * 부엉이 마스코트 시스템 (v1.7.0)
 * - 기존 IndexedDB 스키마는 변경하지 않는다. settings 저장소에 아래 키만 추가로 사용한다.
 *     owlCollection : { "01": "2026-11-17", ... }  (처음 만난 날짜, 도감 획득 여부)
 *     owlPinned     : 대표 부엉이 번호(숫자) 또는 null
 *     owlDailyGoalMinutes : 기존 키 재사용 (기본 360분)
 * - 공부 기록은 읽기만 한다(getAll). 기록을 생성/수정/삭제하지 않는다.
 * - 날짜는 한국 표준시(Asia/Seoul, DST 없음) 기준으로 계산한다.
 */
import { getAll, getSetting, setSetting } from './db.js';

/* ───────── 도감 카탈로그 ─────────
 * 새 이미지를 추가하려면 assets/owls/에 owl-XX.webp를 넣고 이 배열에 항목만 추가하면 된다.
 * kind: 'daily' = 날짜 순환 풀에 포함 / 'special' = 특별 조건으로만 등장
 */
export const OWL_CATALOG = [
  { n: 1,  name: '상자에서 빼꼼',   role: '상자 속에서 빼꼼 내다보는 중', kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 2,  name: '졸업 축하',       role: '졸업 모자와 졸업장',           kind: 'special', cond: '첫 공부 기록을 남긴 날' },
  { n: 3,  name: '열공 모드',       role: '머리띠 두르고 필기하는 열공 부엉이', kind: 'special', cond: '하루 2시간 이상 공부' },
  { n: 4,  name: '달콤한 휴식',     role: '별무늬 이불 속에서 잠자는 중', kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 5,  name: '별 관측',         role: '망원경으로 별을 보는 중',       kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 6,  name: '하트 충전',       role: '하트를 안고 위로해 주는 부엉이', kind: 'special', cond: '밤 9시 이후 목표 미달성인 날 (위로 부엉이)' },
  { n: 7,  name: '호기심 가득',     role: '물음표를 띄운 호기심 부엉이',   kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 8,  name: '음악 감상',       role: '헤드폰으로 음악 듣는 중',       kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 9,  name: '목표 달성!',      role: '응원봉을 든 응원 부엉이',       kind: 'special', cond: '오늘 공부 목표 달성' },
  { n: 10, name: '하루 돌아보기',   role: '밤하늘을 바라보며 회고하는 중', kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 11, name: '책 읽는 중',      role: '책 더미 속에서 독서하는 중 (앱 아이콘)', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 12, name: '차근차근 성장',   role: '머리 위에 새싹이 자라는 중',     kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 13, name: '든든한 기록',     role: '상자를 지키는 든든한 부엉이',   kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 14, name: '집중력 폭발',     role: '보라색 불꽃을 두른 집중 부엉이', kind: 'special', cond: '공부 타이머 작동 중' },
  { n: 15, name: '연속 기록 왕관',  role: '왕관을 쓴 부엉이',             kind: 'special', cond: '7일 연속 공부 기록' },
  { n: 16, name: '살짝 엿보기',     role: '벽 뒤에서 살짝 엿보는 중',     kind: 'daily',   cond: '매일 순환으로 등장' },
  { n: 17, name: '꼼꼼한 의사',     role: '청진기와 진료 기록을 든 의사 부엉이', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 18, name: '명탐정 부엉이',   role: '체크무늬 모자와 돋보기로 단서를 찾는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 19, name: '호기심 과학자',   role: '보호 안경을 쓰고 플라스크를 살피는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 20, name: '꼬마 화가',       role: '붓과 팔레트로 그림을 그리는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 21, name: '행복한 요리사',   role: '요리사 모자를 쓰고 요리하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 22, name: '우주 탐험가',     role: '우주복을 입고 별을 향해 출발하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 23, name: '꼬마 사서',       role: '책장 앞에서 책을 읽고 정리하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 24, name: '별빛 마법사',     role: '마법 지팡이로 반짝이는 마법을 부리는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 25, name: '열정 운동선수',   role: '농구공을 들고 힘차게 응원하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 26, name: '감성 음악가',     role: '헤드폰을 쓰고 기타를 연주하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 27, name: '초록 정원사',     role: '새싹에 물을 주며 식물을 돌보는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 28, name: '용감한 탐험가',   role: '나침반과 지도를 들고 모험하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 29, name: '필기하는 부엉이', role: '연필을 들고 책에 꼼꼼히 필기하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 30, name: '커피 한 잔',      role: '따뜻한 커피를 마시며 쉬는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 31, name: '수능 실전 모드',  role: '수능 시험지를 앞에 두고 집중하는 중', kind: 'daily', cond: '매일 순환으로 등장' },
  { n: 32, name: '왕관의 주인',     role: '황금 왕관을 쓴 특별한 희귀 부엉이', kind: 'daily', cond: '매일 순환으로 등장' }
];
const BY_NUM = new Map(OWL_CATALOG.map(o => [o.n, o]));
const DAILY_POOL = OWL_CATALOG.filter(o => o.kind === 'daily').map(o => o.n);
export const owlSrc = n => `./assets/owls/owl-${String(n).padStart(2, '0')}.webp`;
const key = n => String(n).padStart(2, '0');

/* ───────── 한국 시간(KST) 날짜 계산 ───────── */
const KST_OFFSET_MS = 9 * 3600 * 1000; // Asia/Seoul은 DST가 없어 고정 오프셋이 안전하다.
export function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + KST_OFFSET_MS); // UTC getter로 읽으면 KST 시각
  const p = v => String(v).padStart(2, '0');
  return {
    date: `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())}`,
    hour: k.getUTCHours(),
    dayNumber: Math.floor(k.getTime() / 86400000)
  };
}
export const kstToday = now => kstNow(now).date;
export function msUntilKstMidnight(now = new Date()) {
  const next = (Math.floor((now.getTime() + KST_OFFSET_MS) / 86400000) + 1) * 86400000 - KST_OFFSET_MS;
  return Math.max(1000, next - now.getTime() + 1000); // 자정 1초 뒤
}

/* ───────── 순수 선택 로직 (테스트 가능) ─────────
 * 우선순위: 타이머 > 7일 연속 > 목표 달성 > 첫 기록 > 2시간 이상 > 위로(21시 이후 미달성) > 대표/오늘의 부엉이
 */
export function selectOwl({ dayNumber, hour, todayMinutes, goalMinutes, streakCurrent, timerRunning, isFirstRecordDay, pinned }) {
  const fmt = m => `${Math.floor(m / 60)}시간 ${m % 60}분`;
  if (timerRunning) return mk(14, 'timer', '집중 모드 ON', '타이머가 작동 중이에요. 부엉이가 곁에서 함께 집중하고 있어요.');
  if (streakCurrent >= 7) return mk(15, 'streak', '7일 연속 기록 달성!', `${streakCurrent}일 연속 공부 기록으로 왕관 부엉이가 등장했어요.`);
  if (todayMinutes >= goalMinutes) return mk(9, 'goal', '오늘의 공부 목표 달성!', `오늘 ${fmt(todayMinutes)} 공부했어요. 정말 잘했어요!`);
  if (isFirstRecordDay) return mk(2, 'first', '첫 공부 기록 축하해요!', '첫 기록을 남긴 오늘, 졸업 부엉이가 축하하러 왔어요.');
  if (todayMinutes >= 120) return mk(3, 'twohours', '열공 모드', `오늘 ${fmt(todayMinutes)} 공부했어요. 흐름이 좋아요!`);
  if (hour >= 21 && todayMinutes < goalMinutes) return mk(6, 'comfort', '오늘도 수고했어요', '목표에는 조금 못 미쳤지만 괜찮아요. 내일 다시 같이 해봐요.');
  if (pinned && BY_NUM.has(pinned)) return mk(pinned, 'pinned', '내가 고른 대표 부엉이', '도감에서 대표 부엉이로 설정했어요. 특별 조건이 생기면 잠깐 자리를 비켜 줘요.');
  const n = DAILY_POOL[((dayNumber % DAILY_POOL.length) + DAILY_POOL.length) % DAILY_POOL.length];
  return mk(n, 'daily', BY_NUM.get(n).name, '오늘의 날짜에 맞춰 부엉이가 바뀌었어요. 내일 자정에 새로운 부엉이가 찾아와요.');
  function mk(number, reason, title, detail) {
    const o = BY_NUM.get(number);
    return { number, reason, title, detail, name: o.name, special: o.kind === 'special' };
  }
}

/* ───────── 설정 저장소 접근 (모두 settings 키만 사용) ───────── */
async function loadCollection() { try { return (await getSetting('owlCollection', {})) || {}; } catch { return {}; } }
async function markSeen(number, date) {
  const col = await loadCollection();
  if (col[key(number)]) return col;
  col[key(number)] = date;
  try { await setSetting('owlCollection', col); } catch (e) { console.warn('owl collection save failed', e); }
  return col;
}

/* 홈 화면용: 데이터 읽기 → 선택 → 도감에 기록 */
export async function resolveOwl({ todayMinutes, goalMinutes, streakCurrent, timerRunning }) {
  const k = kstNow();
  let isFirstRecordDay = false;
  try {
    const dates = (await getAll('studyEntries')).map(e => e.date).filter(Boolean).sort();
    isFirstRecordDay = dates.length > 0 && dates[0] === k.date;
  } catch { /* 읽기 실패 시 조건만 건너뜀 */ }
  let pinned = null;
  try { pinned = await getSetting('owlPinned', null); } catch { /* ignore */ }
  const owl = selectOwl({ dayNumber: k.dayNumber, hour: k.hour, todayMinutes, goalMinutes, streakCurrent, timerRunning, isFirstRecordDay, pinned });
  await markSeen(owl.number, k.date);
  return owl;
}

/* ───────── 도감 UI ───────── */
let dialog = null;
function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'owl-dex-dialog';
  dialog.setAttribute('aria-label', '부엉이 도감');
  document.body.appendChild(dialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  return dialog;
}

export async function openOwlDex({ currentNumber, onChange }) {
  const dlg = ensureDialog();
  let view = 'grid', selected = null;

  async function draw() {
    const col = await loadCollection();
    const pinned = await getSetting('owlPinned', null);
    const owned = OWL_CATALOG.filter(o => col[key(o.n)]).length;
    if (view === 'grid') {
      dlg.innerHTML = `<div class="owl-dex-head"><div><span class="owl-eyebrow">OWL DEX</span><h2>부엉이 도감</h2><p>${owned} / ${OWL_CATALOG.length}마리 만났어요</p></div><button type="button" class="icon-btn" data-dex="close" aria-label="닫기">×</button></div>
      <div class="owl-dex-grid">${OWL_CATALOG.map(o => {
        const has = !!col[key(o.n)];
        return `<button type="button" class="owl-dex-tile${has ? '' : ' locked'}" data-dex="open" data-n="${o.n}" aria-label="${has ? o.name : '아직 만나지 못한 부엉이'}">
          <img src="${owlSrc(o.n)}" alt="" loading="lazy">
          ${has ? '' : '<b class="owl-lock" aria-hidden="true">🔒</b>'}
          <span class="owl-dex-name">${has ? o.name : '???'}</span>
          <span class="owl-dex-badges">${o.kind === 'special' ? '<i class="b-special">특별</i>' : ''}${o.n === currentNumber ? '<i class="b-today">오늘</i>' : ''}${o.n === pinned ? '<i class="b-pin">대표</i>' : ''}</span>
        </button>`;
      }).join('')}</div>
      <p class="owl-dex-foot">잠긴 부엉이는 만나기 전까지 실루엣으로 보여요. 대표 부엉이를 정해도 특별 조건이 생기면 그 부엉이가 먼저 나와요.</p>`;
    } else {
      const o = BY_NUM.get(selected), has = !!col[key(o.n)], isPinned = pinned === o.n;
      dlg.innerHTML = `<div class="owl-dex-head"><button type="button" class="btn btn-ghost" data-dex="back">← 도감</button><button type="button" class="icon-btn" data-dex="close" aria-label="닫기">×</button></div>
      <div class="owl-dex-detail${has ? '' : ' locked'}"><img src="${owlSrc(o.n)}" alt="${has ? o.name : '잠긴 부엉이'}">
        <h3>${has ? o.name : '???'}${o.kind === 'special' ? ' <i class="b-special">특별</i>' : ''}</h3>
        <p>${has ? o.role : '아직 만나지 못했어요.'}</p>
        <dl><dt>등장 조건</dt><dd>${o.cond}</dd><dt>획득 여부</dt><dd>${has ? `획득 · ${col[key(o.n)]}에 처음 만남` : '미획득'}</dd></dl>
        ${has ? `<button type="button" class="btn ${isPinned ? 'btn-secondary' : 'btn-primary'}" data-dex="${isPinned ? 'unpin' : 'pin'}" data-n="${o.n}">${isPinned ? '대표 부엉이 해제' : '대표 부엉이로 설정'}</button>` : ''}
      </div>`;
    }
  }

  dlg.onclick = async e => {
    if (e.target === dlg) { dlg.close(); return; }
    const b = e.target.closest('[data-dex]'); if (!b) return;
    const a = b.dataset.dex, n = Number(b.dataset.n);
    if (a === 'close') dlg.close();
    else if (a === 'open') { view = 'detail'; selected = n; await draw(); }
    else if (a === 'back') { view = 'grid'; await draw(); }
    else if (a === 'pin' || a === 'unpin') {
      await setSetting('owlPinned', a === 'pin' ? n : null);
      await draw();
      if (onChange) await onChange();
    }
  };
  await draw();
  if (!dlg.open) dlg.showModal();
}
