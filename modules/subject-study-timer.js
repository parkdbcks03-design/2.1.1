import { addAudit, getAll, getById, getSetting, put, setSetting } from '../db.js';
import { STUDY_SUBJECTS, aggregateStudy, fmtMin, segmentMinutes, sessionEntryId } from './logic.js';
import { FOCUS_MS, BREAK_MS, liveFocusMs, livePhaseMs, materializeTimer, pauseTimer, phaseLabel, phaseLimitMs, resumeTimer, skipPhase } from './focus-mode.js';

export const TIMER_KEY = 'subjectStudyTimer';

const SUBJECT_COLORS = {
  '국어': '#c17d64',
  '수학': '#658baf',
  '영어': '#8d82b2',
  '한국사': '#a87891',
  '사회탐구': '#b39a5e',
  '과학탐구': '#6d9c86',
  '제2외국어': '#7d8ca0',
  '기타': '#8d8d8d'
};

export function browserClock(dateOf) {
  return {
    dateOf,
    nextBoundary(ms) {
      const date = new Date(ms);
      return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    }
  };
}

export function toLogic(state) {
  if (!state) return null;
  return { ...state, runningSince: state.runningSince ? new Date(state.runningSince).getTime() : null, segments: { ...(state.segments || {}) } };
}

export function fromLogic(state) {
  return { ...state, runningSince: state.runningSince == null ? null : new Date(state.runningSince).toISOString() };
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function readTimer() {
  return getSetting(TIMER_KEY, null);
}

export async function writeTimer(state) {
  if (!state) return setSetting(TIMER_KEY, null);
  return setSetting(TIMER_KEY, state);
}

export async function hasExamTimer() {
  return !!(await getSetting('activeTimer', null));
}

async function subjectTotals(today) {
  const [entries, dailyRows] = await Promise.all([getAll('studyEntries'), getAll('dailyStudy')]);
  const agg = aggregateStudy(entries, dailyRows);
  const all = {};
  const day = {};
  for (const row of agg.days.values()) {
    for (const [subject, minutes] of Object.entries(row.subjects)) {
      if (subject === '기록 외 시간') continue;
      all[subject] = (all[subject] || 0) + minutes;
      if (row.date === today) day[subject] = (day[subject] || 0) + minutes;
    }
  }
  return { all, day, focusToday: agg.days.get(today)?.focusSessions || 0 };
}

export async function renderSubjectTimer(root, { today, dateOf }) {
  const [saved, blocked, totals] = await Promise.all([readTimer(), hasExamTimer(), subjectTotals(today)]);
  const state = toLogic(saved);
  const now = Date.now();
  const running = !!state?.runningSince;
  const focusMs = state ? liveFocusMs(state, now) : 0;
  const phaseMs = state ? livePhaseMs(state, now) : 0;
  const limit = state ? phaseLimitMs(state) : null;
  const remain = limit == null ? focusMs : Math.max(0, limit - phaseMs);
  const digits = state ? formatClock(state.mode === 'pomodoro' ? remain : focusMs) : '00:00:00';
  const subjectOptions = STUDY_SUBJECTS.map(subject => `<option value="${subject}" ${state?.subject === subject ? 'selected' : ''}>${subject}</option>`).join('');
  root.innerHTML = `${heading('과목별 공부 타이머', '실전 시험 타이머와 따로 움직입니다. 휴식 시간은 공부 시간, 잔디, 경험치에 넣지 않습니다.')}
    ${blocked && !state ? '<div class="muted-box">실전 타이머가 진행 중입니다. 실전 타이머를 종료한 뒤 공부 타이머를 시작할 수 있습니다. <button type="button" class="btn btn-ghost btn-small" data-view="timer">실전 타이머로 이동</button></div>' : ''}
    <div class="grid grid-2 section-gap">
      <article class="card sst-card">
        <div class="card-head"><div><h3 id="sst-phase">${state ? phaseLabel(state) : '시작 전'}</h3><p id="sst-caption">${state ? '화면을 벗어나도 실제 경과 시간으로 계산합니다.' : '과목과 모드를 고르고 공부를 시작하세요.'}</p></div><span class="pill ${running ? 'green' : state ? 'gold' : ''}">${running ? '진행 중' : state ? '일시정지' : '대기'}</span></div>
        <div class="timer-digits" id="sst-digits">${digits}</div>
        <form id="sst-form" class="form-grid section-gap">
          <div class="field"><label for="sst-subject">과목</label><select id="sst-subject" name="subject" ${state ? 'disabled' : ''}>${subjectOptions}</select></div>
          <div class="field"><label for="sst-mode">모드</label><select id="sst-mode" name="mode" ${state ? 'disabled' : ''}><option value="stopwatch" ${state?.mode !== 'pomodoro' ? 'selected' : ''}>일반 스톱워치</option><option value="pomodoro" ${state?.mode === 'pomodoro' ? 'selected' : ''}>50분 집중 / 10분 휴식</option></select></div>
          <div class="field full"><label for="sst-memo">공부 내용 메모</label><textarea id="sst-memo" name="memo" placeholder="예: 수학 확통 기출 오답">${escapeHtml(state?.memo || '')}</textarea></div>
        </form>
        <div class="timer-actions">
          ${!state ? '<button type="button" class="btn btn-primary" data-v190="sst-start" ' + (blocked ? 'disabled' : '') + '>공부 시작</button>' : ''}
          ${state && running ? '<button type="button" class="btn btn-secondary" data-v190="sst-pause">일시정지</button>' : ''}
          ${state && !running ? '<button type="button" class="btn btn-primary" data-v190="sst-resume">재시작</button>' : ''}
          ${state?.mode === 'pomodoro' ? '<button type="button" class="btn btn-ghost" data-v190="sst-skip">구간 건너뛰기</button>' : ''}
          ${state ? '<button type="button" class="btn btn-secondary" data-v190="sst-end">종료</button>' : ''}
        </div>
        ${state ? `<div class="grid grid-3 section-gap"><div class="mini-stat"><span>집중 시간</span><strong id="sst-focus">${fmtMin(focusMs / 60000)}</strong></div><div class="mini-stat"><span>휴식 시간</span><strong id="sst-break">${fmtMin((state.breakMs || 0) / 60000)}</strong></div><div class="mini-stat"><span>완료한 집중</span><strong id="sst-done">${state.focusCompleted || 0}회</strong></div></div>` : '<p class="subtle">실전 타이머와 동시에 실행되지 않습니다. 종료한 집중 시간만 공부 기록으로 한 번 저장됩니다.</p>'}
      </article>
      <article class="card">
        <div class="card-head"><div><h3>과목별 시간</h3><p>오늘 / 누적 · 공부 기록 기준</p></div></div>
        ${STUDY_SUBJECTS.map(subject => `<div class="status-row"><span><i class="subject-dot" style="background:${SUBJECT_COLORS[subject]}"></i>${subject}</span><strong>${fmtMin(totals.day[subject] || 0)} · ${fmtMin(totals.all[subject] || 0)}</strong></div>`).join('')}
        <p class="subtle">완료한 50분 집중은 오늘 ${totals.focusToday}회입니다. 휴식은 위 누적에 포함되지 않습니다.</p>
      </article>
    </div>`;
  const memo = root.querySelector('#sst-memo');
  memo?.addEventListener('input', async () => {
    const current = await readTimer();
    if (!current) return;
    current.memo = memo.value;
    await writeTimer(current);
  });
  root.dataset.clockDate = dateOf(Date.now());
}

export async function startTimer({ subject, mode, memo, today, dateOf, toast }) {
  if (await readTimer()) throw new Error('이미 진행 중인 공부 타이머가 있습니다.');
  if (await hasExamTimer()) throw new Error('실전 타이머가 진행 중입니다. 실전 타이머를 종료한 뒤 공부 타이머를 시작하세요.');
  const now = new Date().toISOString();
  await writeTimer({
    id: crypto.randomUUID(),
    mode: mode === 'pomodoro' ? 'pomodoro' : 'stopwatch',
    subject: STUDY_SUBJECTS.includes(subject) ? subject : '기타',
    memo: memo || '',
    phase: 'focus',
    runningSince: now,
    phaseElapsedMs: 0,
    focusMs: 0,
    breakMs: 0,
    focusCompleted: 0,
    segments: {},
    startedAt: now,
    date: today
  });
  toast(mode === 'pomodoro' ? '50분 집중을 시작했습니다. 휴식은 공부 시간에 포함되지 않습니다.' : '과목 공부 스톱워치를 시작했습니다.');
}

export async function controlTimer(action, { dateOf, toast }) {
  const saved = await readTimer();
  if (!saved) return null;
  const clock = browserClock(dateOf);
  const now = Date.now();
  let next = toLogic(saved);
  if (action === 'pause') next = pauseTimer(next, now, clock);
  else if (action === 'resume') {
    if (await hasExamTimer()) throw new Error('실전 타이머가 진행 중입니다. 실전 타이머를 종료한 뒤 다시 시작하세요.');
    next = resumeTimer(next, now);
  } else if (action === 'skip') {
    const before = next.phase;
    next = skipPhase(next, now, clock);
    toast(before === 'break' ? '휴식을 건너뛰고 다음 집중으로 이동합니다.' : '집중 구간을 건너뛰었습니다. 지금까지 집중한 시간만 남습니다.', 'warning');
  }
  next.memo = saved.memo;
  next.id = saved.id;
  next.subject = saved.subject;
  next.startedAt = saved.startedAt;
  await writeTimer(fromLogic(next));
  return next;
}

export async function catchUpTimer(dateOf) {
  const saved = await readTimer();
  if (!saved?.runningSince) return saved;
  const clock = browserClock(dateOf);
  const before = toLogic(saved);
  const now = Date.now();
  const limit = phaseLimitMs(before);
  if (before.mode === 'pomodoro' && limit != null && livePhaseMs(before, now) >= limit) {
    const next = materializeTimer(before, now, clock);
    next.memo = saved.memo;
    next.id = saved.id;
    next.subject = saved.subject;
    next.startedAt = saved.startedAt;
    const stored = fromLogic(next);
    await writeTimer(stored);
    return { saved: stored, changed: true, phase: next.phase };
  }
  return { saved, changed: false };
}

export async function finishTimer({ dateOf, toast }) {
  const saved = await readTimer();
  if (!saved) return null;
  const clock = browserClock(dateOf);
  const logic = pauseTimer(toLogic(saved), Date.now(), clock);
  logic.memo = saved.memo || '';
  logic.id = saved.id;
  logic.subject = saved.subject;
  logic.startedAt = saved.startedAt;
  const minutesByDay = segmentMinutes(logic.segments);
  const days = Object.keys(minutesByDay).sort();
  const now = new Date().toISOString();
  let savedCount = 0;
  for (let index = 0; index < days.length; index++) {
    const date = days[index];
    const id = sessionEntryId(saved.id, date);
    const existing = await getById('studyEntries', id);
    const row = {
      id,
      date,
      subject: saved.subject,
      content: (saved.memo || `${saved.subject} 공부`).trim(),
      result: '△',
      minutes: minutesByDay[date],
      source: 'subject-timer',
      subjectTimerSessionId: saved.id,
      timerSessionHead: index === 0,
      focusCompleted: index === 0 ? logic.focusCompleted : 0,
      breakMs: index === 0 ? logic.breakMs : 0,
      createdAt: existing?.createdAt || now,
      inputAt: existing?.inputAt || now,
      updatedAt: now
    };
    await put('studyEntries', row);
    if (!existing) savedCount += 1;
    await put('attendance', { date, recordedAt: now, restDay: false });
  }
  await writeTimer(null);
  await addAudit('subject-timer-save', { sessionId: saved.id, days: days.length, focusCompleted: logic.focusCompleted, minutes: Object.values(minutesByDay).reduce((sum, n) => sum + n, 0) });
  const total = Object.values(minutesByDay).reduce((sum, n) => sum + n, 0);
  if (!total) toast('집중 시간이 1분 미만이라 공부 기록은 만들지 않았습니다. 휴식 시간은 저장하지 않습니다.', 'warning');
  else toast(`공부 ${fmtMin(total)}을 기록했습니다.${logic.breakMs ? ' 휴식 시간은 제외했습니다.' : ''}${savedCount ? '' : ' 같은 세션은 다시 쌓지 않습니다.'}`);
  return { total, focusCompleted: logic.focusCompleted };
}

export function paintTimer(root) {
  const digits = root?.querySelector?.('#sst-digits');
  if (!digits) return;
}

export async function paintLive(root, dateOf) {
  const digits = root.querySelector('#sst-digits');
  if (!digits) return;
  const saved = await readTimer();
  if (!saved) return;
  const state = toLogic(saved);
  const now = Date.now();
  const limit = phaseLimitMs(state);
  const phaseMs = livePhaseMs(state, now);
  const focus = liveFocusMs(state, now);
  digits.textContent = formatClock(state.mode === 'pomodoro' && limit != null ? Math.max(0, limit - phaseMs) : focus);
  const phase = root.querySelector('#sst-phase');
  if (phase) phase.textContent = phaseLabel(state);
  const focusEl = root.querySelector('#sst-focus');
  if (focusEl) focusEl.textContent = fmtMin(focus / 60000);
  const breakEl = root.querySelector('#sst-break');
  if (breakEl) {
    const liveBreak = state.phase === 'break' && state.runningSince ? state.breakMs + Math.max(0, now - state.runningSince) : state.breakMs;
    breakEl.textContent = fmtMin(liveBreak / 60000);
  }
}

export const LIMITS = { FOCUS_MS, BREAK_MS };

function heading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[ch]));
}
