import { getDateRange, getSetting } from '../db.js';
import {
  addIsoDays, analysisSubject, applyPeriodToWindows, esc, fmtMin, levelState, monthBounds, owlStage,
  summarizeRange, subjectWindows, studyTimeline, weekBounds
} from './logic.js';
import { renderGrass, renderGrassDetail } from './grass.js';
import { dailySnapshot } from './daily-owl.js';

const RANGES = [
  { id: 'day', label: '일간' },
  { id: 'week', label: '주간' },
  { id: 'month', label: '월간' },
  { id: 'all', label: '전체' },
  { id: '7', label: '최근 7일' },
  { id: '30', label: '최근 30일' },
  { id: '90', label: '최근 90일' },
  { id: '365', label: '최근 1년' }
];

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
const COLORS = {
  '국어': '#c17d64', '수학': '#658baf', '영어': '#8d82b2', '한국사': '#a87891',
  '탐구': '#6d9c86', '통합사회': '#b39a5e', '통합과학': '#6d9c86', '사회탐구': '#b39a5e',
  '과학탐구': '#6d9c86', '제2외국어': '#7d8ca0', '기타': '#8d8d8d'
};
let rangeId = 'week';
let selectedDate = null;

export function analyticsBounds(today, id, firstDate) {
  if (id === 'day') return { from: today, to: today };
  if (id === 'week') return weekBounds(today);
  if (id === 'month') return monthBounds(today);
  if (id === 'all') return { from: firstDate || today, to: today };
  const days = { 7: 7, 30: 30, 90: 90, 365: 365 }[id] || 7;
  return { from: addIsoDays(today, -(days - 1)), to: today };
}

export async function renderAnalytics(root, today, dateOf) {
  const [snap, goal] = await Promise.all([
    dailySnapshot(today, dateOf || fallbackDate),
    getSetting('owlDailyGoalMinutes', 360)
  ]);
  const agg = snap.agg;
  const dates = [...agg.days.keys()].sort();
  const bounds = analyticsBounds(today, rangeId, dates[0]);
  const summary = summarizeRange(agg, bounds.from, bounds.to, Math.max(60, Number(goal) || 360));
  const windows = applyPeriodToWindows(subjectWindows(agg, today), summary);
  const periodTotal = Object.values(windows).reduce((sum, row) => sum + row.period, 0) || 1;
  const stage = owlStage(agg.totalMinutes);
  const level = levelState(agg.totalMinutes);
  const focusDate = pickDate(bounds, today);
  const dayEntries = agg.days.get(focusDate)?.entries || [];
  const timeline = studyTimeline(dayEntries, focusDate);
  const schedules = await getDateRange('schedules', focusDate, focusDate);
  const subjectRows = Object.entries(windows).map(([subject, row]) => `<tr><td><i class="subject-dot" style="background:${COLORS[subject]}"></i>${esc(subject)}</td><td>${fmtMin(row.period)}</td><td>${Math.round(row.period / periodTotal * 100)}%</td><td>${fmtMin(row.today)}</td><td>${fmtMin(row.d7)}</td><td>${fmtMin(row.d30)}</td><td>${fmtMin(row.all)}</td></tr>`).join('');
  const maxDay = Math.max(1, ...summary.weekdays);
  const weekdayRows = summary.weekdays.map((minutes, index) => `<div class="v190-bar-row"><span>${WEEKDAYS[index]}</span><div class="progress-line"><span style="width:${Math.round(minutes / maxDay * 100)}%"></span></div><strong>${fmtMin(minutes)}</strong></div>`).join('');
  const trend = bucketTrend(summary.trend, rangeId);
  const maxTrend = Math.max(1, ...trend.map(item => item.minutes));
  const trendBars = trend.map(item => `<div class="v190-trend-col" title="${esc(item.label)} ${fmtMin(item.minutes)}"><i style="height:${Math.max(4, Math.round(item.minutes / maxTrend * 100))}%"></i><span>${esc(item.label)}</span></div>`).join('');
  const blocks = timeline.map(block => `<div class="timeline-row"><i style="background:${COLORS[block.subject] || COLORS[analysisSubject(block.subject)]}"></i><div><strong>${esc(block.subject)} · ${fmtMin(block.minutes)}</strong><small>${block.estimated ? `${clock(block.start)} – ${clock(block.end)} · 입력 시각으로 추정` : '시작·종료 시각 없음'}</small><small>${esc(block.content || '')}</small></div></div>`).join('') || '<p class="subtle">이 날짜의 공부 기록이 없습니다.</p>';
  const plans = schedules.slice().sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || ''))).map(item => `<div class="timeline-row is-plan"><i style="background:${COLORS[item.subject] || '#8d8d8d'}"></i><div><strong>${esc(item.title || '일정')}</strong><small>${esc(item.startTime || '시간 미정')}–${esc(item.endTime || '')} · ${esc(item.subject || item.type || '계획')}</small></div></div>`).join('') || '<p class="subtle">이 날짜의 계획 일정이 없습니다.</p>';
  const portrait = stage.image ? `<img src="${esc(stage.image)}" alt="${esc(stage.name)}">` : '<div class="owl-egg" role="img" aria-label="알"><span></span></div>';
  root.innerHTML = `${heading('공부 분석', '일간·주간·월간·전체는 같은 공부 기록을 기간만 바꿔 읽습니다.')}
    <div class="tag-row v190-ranges">${RANGES.map(item => `<button type="button" class="subject-tab ${item.id === rangeId ? 'active' : ''}" data-v190="analytics-range" data-range="${item.id}">${item.label}</button>`).join('')}</div>
    <p class="subtle">하루 총시간은 공부 기록 합계와 직접 입력한 하루 공부 시간 중 더 큰 값만 씁니다. 같은 기록은 다시 더하지 않습니다. 휴식은 제외합니다.${snap.pending ? ` 오늘 저장 전 집중 ${fmtMin(snap.pending)}은 부엉이 상태에만 반영되고, 아래 통계에는 저장 후 들어갑니다.` : ''}</p>
    <article class="card analysis-profile section-gap">
      <div class="owl-wear">${portrait}</div>
      <div>
        <span class="pill">${esc(snap.appearance.label)} · ${esc(stage.name)}</span>
        <div class="grid grid-4 section-gap">
          <div class="mini-stat"><span>오늘</span><strong>${fmtMin(snap.appearance.minutes)}</strong></div>
          <div class="mini-stat"><span>누적</span><strong>${fmtMin(agg.totalMinutes)}</strong></div>
          <div class="mini-stat"><span>레벨</span><strong>Lv.${level.level}</strong></div>
          <div class="mini-stat"><span>EXP</span><strong>${level.exp.toLocaleString('ko-KR')}</strong></div>
        </div>
      </div>
    </article>
    <div class="grid grid-4 section-gap">
      <div class="card metric-card"><div class="metric-label">이 기간 공부</div><div class="metric-value">${fmtMin(summary.total)}</div></div>
      <div class="card metric-card"><div class="metric-label">일평균</div><div class="metric-value">${fmtMin(summary.average)}</div><div class="metric-note">${summary.dayCount}일</div></div>
      <div class="card metric-card"><div class="metric-label">가장 많은 과목</div><div class="metric-value v190-subject-value">${esc(summary.topSubject || '—')}</div><div class="metric-note">${summary.topSubject ? fmtMin(summary.topSubjectMinutes) : '기록 없음'}</div></div>
      <div class="card metric-card"><div class="metric-label">목표 달성률</div><div class="metric-value">${Math.round(summary.goalRate * 100)}%</div><div class="metric-note">${summary.goalHits}/${summary.dayCount}일</div></div>
    </div>
    <article class="card section-gap"><div class="card-head"><div><h3>과목별 공부</h3><p>이 기간 열만 위 리포트 기간을 따릅니다. 오늘·7일·30일·전체는 고정 구간입니다.</p></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>과목</th><th>이 기간</th><th>비중</th><th>오늘</th><th>최근 7일</th><th>최근 30일</th><th>전체</th></tr></thead><tbody>${subjectRows}</tbody></table></div>
      ${summary.subjects['기록 외 시간'] ? `<p class="subtle">기록 외 시간 ${fmtMin(summary.subjects['기록 외 시간'])}은 과목 표에 넣지 않습니다. 하루 총시간에만 한 번 포함됩니다.</p>` : ''}
    </article>
    <div class="grid grid-2 section-gap">
      <article class="card"><div class="card-head"><div><h3>실시간 공부 시간표</h3><p>${esc(focusDate)} · 집중 시간만. 시각이 없는 기록은 추정이라고 적습니다.</p></div></div>${blocks}</article>
      <article class="card"><div class="card-head"><div><h3>같은 날의 계획</h3><p>주간 시간표에 있는 일정입니다. 공부 시간과 섞지 않습니다.</p></div></div>${plans}</article>
    </div>
    <div class="grid grid-2 section-gap">
      <article class="card"><div class="card-head"><div><h3>요일별</h3><p>선택한 기간 · 월요일 시작</p></div></div>${weekdayRows}</article>
      <article class="card"><div class="card-head"><div><h3>공부 시간 추이</h3><p>${rangeId === '90' ? '주차별' : rangeId === '365' || rangeId === 'all' ? '월별' : '날짜별'}</p></div></div><div class="v190-trend">${trendBars || '<p class="subtle">표시할 추이가 없습니다.</p>'}</div></article>
    </div>
    <article class="card section-gap"><div class="card-head"><div><h3>공부 잔디</h3><p>최근 12주</p></div></div>${renderGrass(agg, today, selectedDate)}<div id="analytics-grass-detail">${renderGrassDetail(agg, selectedDate)}</div></article>`;
}

function pickDate(bounds, today) {
  if (selectedDate && selectedDate >= bounds.from && selectedDate <= bounds.to) return selectedDate;
  if (today >= bounds.from && today <= bounds.to) return today;
  return bounds.to < today ? bounds.to : bounds.from;
}

function bucketTrend(trendRows, id) {
  if (id === 'day' || id === 'week' || id === 'month' || id === '7' || id === '30') {
    return trendRows.map(item => ({ label: item.date.slice(5), minutes: item.minutes }));
  }
  if (id === '90') {
    const buckets = [];
    for (let i = 0; i < trendRows.length; i += 7) {
      const slice = trendRows.slice(i, i + 7);
      buckets.push({ label: slice[0].date.slice(5), minutes: slice.reduce((sum, item) => sum + item.minutes, 0) });
    }
    return buckets;
  }
  const months = new Map();
  for (const item of trendRows) months.set(item.date.slice(0, 7), (months.get(item.date.slice(0, 7)) || 0) + item.minutes);
  return [...months.entries()].map(([key, minutes]) => ({ label: key.slice(2), minutes }));
}

function clock(ms) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function fallbackDate(ms) {
  const date = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function heading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}

export function setAnalyticsRange(id) {
  rangeId = id;
}

export function setAnalyticsDate(date) {
  selectedDate = selectedDate === date ? null : date;
}

export async function loadAggregate() {
  const snap = await dailySnapshot('1970-01-01', fallbackDate);
  return snap.agg;
}
