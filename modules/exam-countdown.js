import { getAll, getSetting } from '../db.js';
import { CSAT_DATE, examCountdown } from './logic.js';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAY[dt.getDay()]})`;
}

export async function resolveExamDate() {
  const events = await getAll('events');
  const official = events.find(event => event.id === 'csat-2028' && event.date);
  const saved = await getSetting('csatDate', null);
  return official?.date || saved || CSAT_DATE;
}

export async function renderExamCountdown(today) {
  const examDate = await resolveExamDate();
  const model = examCountdown(examDate, today);
  const dayLabel = model.isToday ? 'D-Day' : model.passed ? `D+${Math.abs(model.days)}` : `D-${model.days}`;
  const monthLabel = model.passed ? '시험일이 지났습니다' : model.months >= 0 ? `${model.months}개월` : '0개월';
  const marks = model.marks.map(mark => `<li class="${mark.passed ? 'is-done' : ''}${mark.isToday ? ' is-today' : ''}"><strong>${mark.id}</strong><span>${longDate(mark.date)}</span><em>${mark.isToday ? '오늘' : mark.passed ? '지남' : `${mark.daysUntil}일 남음`}</em></li>`).join('');
  return `<article class="card v190-countdown">
    <div class="card-head"><div><h3>수능까지</h3><p>${longDate(examDate)} · 기존에 저장된 수능 날짜를 사용합니다</p></div><span class="pill">${dayLabel}</span></div>
    <div class="grid grid-4">
      <div class="mini-stat"><span>남은 일수</span><strong>${model.passed ? 0 : model.days}일</strong></div>
      <div class="mini-stat"><span>남은 주</span><strong>${model.passed ? 0 : model.weeks}주 ${model.weekRem}일</strong></div>
      <div class="mini-stat"><span>남은 개월</span><strong>${monthLabel}</strong></div>
      <div class="mini-stat"><span>2026.1.1 기준 진행률</span><strong>${Math.round(model.progress * 100)}%</strong></div>
    </div>
    <div class="progress-line v190-countdown-bar"><span style="width:${Math.round(model.progress * 100)}%"></span></div>
    <ol class="dday-marks">${marks}</ol>
  </article>`;
}
