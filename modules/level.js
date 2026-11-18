import { EXP_PER_LEVEL, fmtMin, levelState } from './logic.js';

export function renderLevelCard(totalMinutes) {
  const state = levelState(totalMinutes);
  const width = Math.round(state.progress * 100);
  return `<article class="card v190-level-card">
    <div class="card-head"><div><h3>레벨 · 경험치</h3><p>1분 = 1 EXP · ${EXP_PER_LEVEL} EXP마다 레벨이 오릅니다</p></div><span class="pill">Lv.${state.level}</span></div>
    <div class="v190-level-title">${escapeHtml(state.title)}</div>
    <div class="progress-meta"><span>이번 레벨 ${state.into} / ${EXP_PER_LEVEL} EXP</span><strong>남은 ${state.remain} EXP</strong></div>
    <div class="progress-line" aria-valuemin="0" aria-valuemax="${EXP_PER_LEVEL}" aria-valuenow="${state.into}"><span style="width:${width}%"></span></div>
    <div class="grid grid-2 section-gap v190-level-stats">
      <div class="mini-stat"><span>누적 EXP</span><strong>${state.exp.toLocaleString('ko-KR')}</strong></div>
      <div class="mini-stat"><span>누적 공부 시간</span><strong>${fmtMin(totalMinutes)}</strong></div>
    </div>
  </article>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[ch]));
}
