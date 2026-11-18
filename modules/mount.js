import { getSetting } from '../db.js';
import { levelState, owlStage } from './logic.js';
import { renderLevelCard } from './level.js';
import { renderOwlGrowth } from './owl-growth.js';
import { renderGrass, renderGrassDetail } from './grass.js';
import { maybeBackupDialog, readBackupPlan, renderBackupCard } from './auto-backup.js';
import { renderExamCountdown } from './exam-countdown.js';
import { loadAggregate, renderAnalytics, setAnalyticsDate, setAnalyticsRange } from './analytics.js';
import { maybeDailyReview, renderDailyReview, reviewDate, reviewHour } from './daily-review.js';
import { catchUpTimer, controlTimer, finishTimer, paintLive, readTimer, renderSubjectTimer, startTimer } from './subject-study-timer.js';
import { dailySnapshot, paintCollectionOwl, renderDailyPanel, renderTimerOwl } from './daily-owl.js';

let ctx = null;
let homeDate = null;

function dateOf(ms) {
  return ctx.todayISO(new Date(ms));
}

function reviewHelpers() {
  return {
    toast: ctx.toast,
    streakCurrent: 0,
    timerRunning: false,
    getStreak: ctx.getStreak
  };
}

export function createV190(context) {
  ctx = context;
  document.addEventListener('click', onClick, true);
  setInterval(() => { tick().catch(error => console.error(error)); }, 500);
  return {
    renderSubjectTimer: renderTimerView,
    renderAnalytics: renderAnalyticsView,
    renderDailyReview: renderReviewView,
    afterRender,
    onLaunch,
    onForeground
  };
}

async function renderTimerView(root) {
  await renderSubjectTimer(root, { today: ctx.todayISO(), dateOf });
}

async function renderAnalyticsView(root) {
  await renderAnalytics(root, ctx.todayISO(), dateOf);
}

async function renderReviewView(root) {
  const streak = await ctx.getStreak();
  const exam = await getSetting('activeTimer', null);
  const study = await readTimer();
  await renderDailyReview(root, reviewDate(), {
    toast: ctx.toast,
    streakCurrent: streak.current,
    timerRunning: !!(exam?.runningSince || study?.runningSince)
  });
}


async function decorateHome(root) {
  const today = ctx.todayISO();
  const [snap, streak] = await Promise.all([dailySnapshot(today, dateOf), ctx.getStreak()]);
  const stage = owlStage(snap.agg.totalMinutes);
  const level = levelState(snap.agg.totalMinutes);
  const host = document.createElement('div');
  host.className = 'v190-home';
  host.innerHTML = `${renderDailyPanel({ appearance: snap.appearance, pending: snap.pending, stage, level, saved: snap.saved })}
    <div class="grid grid-2">${renderLevelCard(snap.agg.totalMinutes)}${renderOwlGrowth(snap.agg.totalMinutes)}</div>
    <article class="card section-gap"><div class="card-head"><div><h3>공부 잔디</h3><p>최근 12주 · 날짜를 누르면 공부 기록을 확인합니다</p></div></div>${renderGrass(snap.agg, today, homeDate)}<div id="home-grass-detail">${renderGrassDetail(snap.agg, homeDate)}</div></article>`;
  const anchor = root.querySelector('.owl-daily-card');
  if (anchor) anchor.insertAdjacentElement('afterend', host);
  else root.prepend(host);
}

async function afterRender(view, root) {
  if (view === 'home') await decorateHome(root);
  if (view === 'dday') {
    const html = await renderExamCountdown(ctx.todayISO());
    root.querySelector('.hero-card')?.insertAdjacentHTML('afterend', html);
  }
  if (view === 'backup') {
    const plan = await readBackupPlan(ctx.todayISO(), date => ctx.todayISO(date));
    root.querySelector('.page-heading')?.insertAdjacentHTML('afterend', renderBackupCard(plan));
  }
  if (view === 'timer' && await readTimer()) {
    root.querySelector('.page-heading')?.insertAdjacentHTML('afterend', '<div class="muted-box">과목별 공부 타이머가 남아 있습니다. 실전 타이머와 동시에 실행할 수 없습니다. <button type="button" class="btn btn-ghost btn-small" data-view="subjectTimer">공부 타이머로 이동</button></div>');
  }
  if (view === 'stats') {
    root.insertAdjacentHTML('beforeend', '<article class="card section-gap"><div class="card-head"><div><h3>기간별 공부 분석</h3><p>최근 7일·30일·90일·1년·전체 분석, 잔디, 목표 달성률은 공부 분석 메뉴에 있습니다. 이 화면의 최근 30일 통계는 그대로입니다.</p></div><button type="button" class="btn btn-secondary" data-view="analytics">공부 분석 열기</button></div></article>');
  }
  if (view === 'subjectTimer') {
    await paintLive(root, dateOf);
    const snap = await dailySnapshot(ctx.todayISO(), dateOf);
    const stage = owlStage(snap.agg.totalMinutes);
    root.insertAdjacentHTML('beforeend', renderTimerOwl({ appearance: snap.appearance, image: stage.image, name: stage.name }));
  }
}

async function onLaunch() {
  await maybeBackupDialog({
    today: ctx.todayISO(),
    isoDate: value => ctx.todayISO(value),
    toast: ctx.toast,
    exportBackup: ctx.exportBackup
  });
  await promptReview();
}

async function onForeground() {
  await catchUpTimer(dateOf);
  if (document.hidden) return;
  await promptReview();
}

async function promptReview() {
  const streak = await ctx.getStreak();
  const exam = await getSetting('activeTimer', null);
  const study = await readTimer();
  const choice = await maybeDailyReview({
    today: reviewDate(),
    hour: reviewHour(),
    streakCurrent: streak.current,
    timerRunning: !!(exam?.runningSince || study?.runningSince),
    toast: ctx.toast
  });
  if (choice === 'open') await ctx.navigate('dailyReview');
}

async function tick() {
  if (!ctx) return;
  const root = document.querySelector('#view-root');
  const result = await catchUpTimer(dateOf);
  if (result?.changed) {
    ctx.toast(result.phase === 'break'
      ? '50분 집중을 마쳤습니다. 10분 휴식은 공부 시간과 경험치에 포함되지 않습니다.'
      : '휴식이 끝났습니다. 다음 집중을 시작합니다.');
    if (ctx.getView() === 'subjectTimer') await ctx.rerender();
    return;
  }
  if (ctx.getView() === 'subjectTimer' && root) await paintLive(root, dateOf);
}

async function onClick(event) {
  const button = event.target.closest('[data-v190]');
  if (!button || !ctx) return;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.v190;
  try {
    if (action === 'grass-day') {
      const date = button.dataset.date;
      if (ctx.getView() === 'analytics') setAnalyticsDate(date);
      else homeDate = homeDate === date ? null : date;
      await ctx.rerender();
      return;
    }
    if (action === 'analytics-range') {
      setAnalyticsRange(button.dataset.range);
      await ctx.rerender();
      return;
    }
    if (action === 'backup-now') {
      await ctx.exportBackup();
      if (ctx.getView() === 'backup' || ctx.getView() === 'home') await ctx.rerender();
      return;
    }
    if (action === 'sst-start') {
      await startTimer({
        subject: document.querySelector('#sst-subject')?.value,
        mode: document.querySelector('#sst-mode')?.value,
        memo: document.querySelector('#sst-memo')?.value || '',
        today: ctx.todayISO(),
        dateOf,
        toast: ctx.toast
      });
      await ctx.rerender();
      return;
    }
    if (action === 'sst-pause' || action === 'sst-resume' || action === 'sst-skip') {
      const map = { 'sst-pause': 'pause', 'sst-resume': 'resume', 'sst-skip': 'skip' };
      await controlTimer(map[action], { dateOf, toast: ctx.toast });
      await ctx.rerender();
      return;
    }
    if (action === 'sst-end') {
      await finishTimer({ dateOf, toast: ctx.toast });
      await ctx.rerender();
    }
  } catch (error) {
    console.error(error);
    ctx.toast(error.message || '작업을 완료하지 못했습니다.', 'error');
  }
}

export async function homeAggregate() {
  return loadAggregate();
}
