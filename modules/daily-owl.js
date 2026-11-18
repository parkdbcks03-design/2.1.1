import { getAll, getDateRange, getSetting } from '../db.js';
import {
  aggregateStudy, dailyOwlAppearance, esc, fmtMin, levelState, owlStage, pendingFocusMinutes
} from './logic.js';

export async function dailySnapshot(today, dateOf) {
  const [entries, dailyRows, subjectTimer, examTimer, schedules] = await Promise.all([
    getAll('studyEntries'),
    getAll('dailyStudy'),
    getSetting('subjectStudyTimer', null),
    getSetting('activeTimer', null),
    getDateRange('schedules', today, today)
  ]);
  const agg = aggregateStudy(entries, dailyRows);
  const saved = agg.days.get(today)?.minutes || 0;
  const pending = pendingFocusMinutes(subjectTimer, examTimer, today, Date.now(), dateOf);
  const timerRunning = !!(subjectTimer?.runningSince || examTimer?.runningSince);
  const hasPlan = schedules.some(item => item && !item.completed) || !!subjectTimer || !!examTimer;
  const appearance = dailyOwlAppearance(saved + pending, { hasPlan, timerRunning });
  return { agg, saved, pending, appearance, timerRunning, hasPlan, subjectTimer, examTimer, schedules };
}

export function wearClass(state) {
  return Object.values(state || {}).filter(Boolean).join(' ');
}

export function paintCollectionOwl(root, appearance) {
  const card = root.querySelector('.owl-daily-card');
  if (!card) return;
  card.dataset.daily = appearance?.id || 'before';
  const img = card.querySelector('img');
  if (!img) return;
  let frame = img.closest('.owl-wear');
  if (!frame) {
    frame = document.createElement('div');
    frame.className = 'owl-wear';
    img.replaceWith(frame);
    frame.append(img);
  }
  frame.className = 'owl-wear';
}

const STATES = [
  ['before', '학습 전'],
  ['ready', '학습 대기'],
  ['h2', '약 2시간'],
  ['h4', '약 4시간'],
  ['h6', '약 6시간'],
  ['h8', '약 8시간'],
  ['h10', '10시간+']
];

export function renderDailyPanel({ appearance, pending, stage, level, saved }) {
  const remain = appearance.remain
    ? `다음 상태까지 ${fmtMin(appearance.remain)}`
    : '오늘의 마지막 상태입니다';
  const steps = STATES.map(([id, label]) => `<li class="${id === appearance.id ? 'is-current' : ''}">${label}</li>`).join('');
  return `<article class="card daily-owl-panel" data-daily="${esc(appearance.id)}">
    <div class="card-head"><div><h3>오늘의 학습 상태</h3><p>하루가 바뀌면 이 상태만 처음부터 다시 시작합니다. 영구 성장 단계는 내려가지 않습니다.</p></div><span class="pill">${esc(appearance.label)}</span></div>
    <div class="grid grid-4">
      <div class="mini-stat"><span>오늘 공부</span><strong>${fmtMin(appearance.minutes)}</strong></div>
      <div class="mini-stat"><span>저장된 기록</span><strong>${fmtMin(saved)}</strong></div>
      <div class="mini-stat"><span>영구 성장</span><strong>${stage.stage}단계 · ${esc(stage.name)}</strong></div>
      <div class="mini-stat"><span>레벨 · EXP</span><strong>Lv.${level.level} · ${level.exp.toLocaleString('ko-KR')}</strong></div>
    </div>
    <p class="subtle">${esc(remain)}${pending ? ` · 저장 전 집중 ${fmtMin(pending)} 포함, 휴식은 제외` : ''}</p>
    <ol class="daily-owl-steps">${steps}</ol>
    <div class="v190-actions">
      <button type="button" class="btn btn-ghost btn-small" data-view="analytics">공부 분석</button>
    </div>
  </article>`;
}

export function renderTimerOwl({ appearance, image, name }) {
  const visual = image
    ? `<img src="${esc(image)}" alt="${esc(name || '성장 부엉이')}">`
    : '<div class="owl-egg" role="img" aria-label="알"><span></span></div>';
  return `<article class="card sst-owl" data-daily="${esc(appearance.id)}">
    <div class="card-head"><div><h3>오늘의 부엉이 상태</h3><p>공부 타이머의 집중 시간이 쌓이면 상태가 바뀝니다. 휴식은 포함하지 않습니다.</p></div><span class="pill">${esc(appearance.label)}</span></div>
    <div class="sst-owl-row"><div class="owl-wear">${visual}</div><div><strong>${fmtMin(appearance.minutes)}</strong><p class="subtle">${appearance.remain ? `다음 상태까지 ${fmtMin(appearance.remain)}` : '10시간 이상'}</p></div></div>
  </article>`;
}
