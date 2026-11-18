import { getAll, getSetting, setSetting } from '../db.js';
import { resolveOwl, owlSrc, kstNow } from '../owls.js';
import { aggregateStudy, fmtMin, upsertReview, DAILY_REVIEW_HOUR } from './logic.js';
import { openNotice } from './auto-backup.js';

export const REVIEW_KEY = 'dailyReviewsV190';
let snoozedSession = false;
let reviewPrompting = false;

export async function loadReviews() {
  const value = await getSetting(REVIEW_KEY, {});
  return value && typeof value === 'object' ? value : {};
}

export async function buildReviewFacts(date, { goalMinutes, streakCurrent = 0, timerRunning = false } = {}) {
  const [entries, dailyRows, goal] = await Promise.all([
    getAll('studyEntries'),
    getAll('dailyStudy'),
    getSetting('owlDailyGoalMinutes', goalMinutes || 360)
  ]);
  const agg = aggregateStudy(entries, dailyRows);
  const row = agg.days.get(date);
  const total = row?.minutes || 0;
  const resolvedGoal = Math.max(60, Number(goal) || 360);
  const subjects = Object.entries(row?.subjects || {}).sort((a, b) => b[1] - a[1]);
  let owl = null;
  try {
    owl = await resolveOwl({ todayMinutes: total, goalMinutes: resolvedGoal, streakCurrent, timerRunning });
  } catch { /* owl snapshot is optional */ }
  return { total, subjects, goalMinutes: resolvedGoal, goalMet: total >= resolvedGoal, owl };
}

export async function saveReview(date, fields, facts) {
  const now = new Date().toISOString();
  const reviews = await loadReviews();
  const review = {
    date,
    totalMinutes: facts.total,
    bySubject: Object.fromEntries(facts.subjects),
    goalMet: facts.goalMet,
    goalMinutes: facts.goalMinutes,
    good: fields.good.trim(),
    regret: fields.regret.trim(),
    tomorrow: fields.tomorrow.trim(),
    note: fields.note.trim(),
    owlNumber: facts.owl?.number || null,
    owlName: facts.owl?.name || '',
    createdAt: now,
    updatedAt: now
  };
  const next = upsertReview(reviews, review);
  await setSetting(REVIEW_KEY, next);
  return next[date];
}

export async function renderDailyReview(root, today, helpers) {
  const reviews = await loadReviews();
  const facts = await buildReviewFacts(today, helpers);
  const current = reviews[today] || null;
  const history = Object.values(reviews).filter(item => item?.date).sort((a, b) => b.date.localeCompare(a.date));
  root.innerHTML = `${heading('하루 공부 결산', '매일 밤 10시 이후 오늘의 공부를 돌아봅니다. 일기와 따로 저장되며 공개 아카이브에는 들어가지 않습니다.')}
    <div class="grid grid-2">
      <article class="card">
        <div class="card-head"><div><h3>${current ? '오늘 결산 수정' : '오늘 결산'}</h3><p>${today} · 같은 날짜는 하나의 결산만 저장됩니다</p></div><span class="pill ${facts.goalMet ? 'green' : 'gold'}">${facts.goalMet ? '목표 달성' : '목표 미달'}</span></div>
        <div class="grid grid-2">
          <div class="mini-stat"><span>하루 총 공부</span><strong>${fmtMin(facts.total)}</strong></div>
          <div class="mini-stat"><span>목표</span><strong>${fmtMin(facts.goalMinutes)}</strong></div>
        </div>
        <div class="section-gap">${facts.subjects.length ? facts.subjects.map(([subject, minutes]) => `<div class="status-row"><span>${escapeHtml(subject)}</span><strong>${fmtMin(minutes)}</strong></div>`).join('') : '<p class="subtle">오늘 집계된 공부 시간이 없습니다.</p>'}</div>
        <form id="daily-review-form" class="form-grid section-gap">
          <div class="field full"><label for="review-good">오늘 잘한 점</label><textarea id="review-good" name="good">${escapeHtml(current?.good || '')}</textarea></div>
          <div class="field full"><label for="review-regret">아쉬웠던 점</label><textarea id="review-regret" name="regret">${escapeHtml(current?.regret || '')}</textarea></div>
          <div class="field full"><label for="review-tomorrow">내일 목표</label><textarea id="review-tomorrow" name="tomorrow">${escapeHtml(current?.tomorrow || '')}</textarea></div>
          <div class="field full"><label for="review-note">오늘의 한마디</label><textarea id="review-note" name="note">${escapeHtml(current?.note || '')}</textarea></div>
          <div class="field full"><button class="btn btn-primary" type="submit">${current ? '오늘 결산 수정' : '오늘 결산 저장'}</button></div>
        </form>
      </article>
      <article class="card v190-review-owl">
        <div class="card-head"><div><h3>오늘의 부엉이</h3><p>결산을 저장하면 이 부엉이가 함께 남습니다</p></div></div>
        ${facts.owl ? `<img src="${owlSrc(facts.owl.number)}" alt="${escapeHtml(facts.owl.name)}"><strong>${escapeHtml(facts.owl.title || facts.owl.name)}</strong><p class="subtle">${escapeHtml(facts.owl.detail || '')}</p>` : '<p class="subtle">부엉이 정보를 불러오지 못했습니다.</p>'}
      </article>
    </div>
    <article class="card section-gap"><div class="card-head"><div><h3>지난 결산</h3><p>일기장과 섞이지 않습니다</p></div><span class="pill">${history.length}개</span></div>
      ${history.length ? history.map(item => `<details class="v190-review-item"><summary><strong>${item.date}</strong><span>${fmtMin(item.totalMinutes || 0)} · ${item.goalMet ? '목표 달성' : '목표 미달'}</span></summary><p>${escapeHtml(item.good || '잘한 점 없음')}</p><p class="subtle">아쉬움 · ${escapeHtml(item.regret || '없음')}</p><p class="subtle">내일 · ${escapeHtml(item.tomorrow || '없음')}</p><p>${escapeHtml(item.note || '')}</p></details>`).join('') : '<div class="empty-state"><strong>아직 결산이 없습니다</strong>밤 10시 이후 알림으로도 작성할 수 있습니다.</div>'}
    </article>`;
  root.querySelector('#daily-review-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await saveReview(today, { good: data.good || '', regret: data.regret || '', tomorrow: data.tomorrow || '', note: data.note || '' }, facts);
    helpers.toast('하루 결산을 저장했습니다. 같은 날짜의 결산은 덮어써서 중복으로 쌓이지 않습니다.');
    await renderDailyReview(root, today, helpers);
  });
}

export async function maybeDailyReview({ today, hour, streakCurrent, timerRunning, toast }) {
  if (hour < DAILY_REVIEW_HOUR || snoozedSession || reviewPrompting) return 'skip';
  const reviews = await loadReviews();
  if (reviews[today]) return 'exists';
  const facts = await buildReviewFacts(today, { streakCurrent, timerRunning });
  reviewPrompting = true;
  try {
    const choice = await openNotice({
      eyebrow: 'DAILY REVIEW',
      title: '하루 공부 결산',
      body: `<p>오늘 공부 시간 <strong>${fmtMin(facts.total)}</strong> · ${facts.goalMet ? '목표를 채웠습니다.' : '목표에는 아직 못 미쳤습니다.'}</p><p class="subtle">결산은 일기와 따로 저장되고, 공개 학습 아카이브에는 포함되지 않습니다.</p>`,
      primary: '결산 작성',
      later: '나중에'
    });
    if (choice !== 'primary') {
      snoozedSession = true;
      toast('이번 실행에서는 결산 알림을 숨깁니다. 메뉴의 하루 공부 결산에서 작성할 수 있습니다.', 'warning');
      return 'later';
    }
    return 'open';
  } finally {
    reviewPrompting = false;
  }
}

export function reviewHour(now = new Date()) {
  return kstNow(now).hour;
}

export function reviewDate(now = new Date()) {
  return kstNow(now).date;
}

function heading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[ch]));
}
