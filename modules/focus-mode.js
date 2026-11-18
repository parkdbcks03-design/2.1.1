/*
 * 50분 집중 / 10분 휴식 상태 기계.
 * 휴식 구간은 focusMs·segments에 넣지 않는다.
 */

export const FOCUS_MS = 50 * 60 * 1000;
export const BREAK_MS = 10 * 60 * 1000;

function cloneState(state) {
  return {
    mode: 'stopwatch',
    phase: 'focus',
    runningSince: null,
    phaseElapsedMs: 0,
    focusMs: 0,
    breakMs: 0,
    focusCompleted: 0,
    segments: {},
    ...state,
    segments: { ...(state?.segments || {}) }
  };
}

function completePhase(state) {
  if (state.mode !== 'pomodoro') return;
  if (state.phase !== 'break') {
    state.focusCompleted += 1;
    state.phase = 'break';
  } else {
    state.phase = 'focus';
  }
  state.phaseElapsedMs = 0;
}

export function materializeTimer(state, nowMs, clock) {
  const next = cloneState(state);
  if (next.runningSince == null) return next;
  let cursor = Number(next.runningSince);
  if (!Number.isFinite(cursor)) {
    next.runningSince = null;
    return next;
  }
  const end = Math.max(cursor, Number(nowMs) || cursor);
  let guard = 0;
  while (cursor < end && guard++ < 64) {
    const limit = next.mode === 'pomodoro' ? (next.phase === 'break' ? BREAK_MS : FOCUS_MS) : null;
    let slice = end;
    const boundary = clock.nextBoundary(cursor);
    if (boundary > cursor && boundary < slice) slice = boundary;
    if (limit != null) {
      const remain = limit - next.phaseElapsedMs;
      if (remain <= 0) {
        completePhase(next);
        continue;
      }
      if (cursor + remain < slice) slice = cursor + remain;
    }
    const delta = slice - cursor;
    if (delta <= 0) break;
    if (next.phase !== 'break') {
      const day = clock.dateOf(cursor);
      next.segments[day] = (next.segments[day] || 0) + delta;
      next.focusMs += delta;
    } else {
      next.breakMs += delta;
    }
    next.phaseElapsedMs += delta;
    cursor = slice;
    if (limit != null && next.phaseElapsedMs >= limit - 1) completePhase(next);
  }
  next.runningSince = cursor;
  return next;
}

export function liveFocusMs(state, nowMs) {
  if (!state || state.phase === 'break' || state.runningSince == null) return state?.focusMs || 0;
  return state.focusMs + Math.max(0, nowMs - Number(state.runningSince));
}

export function livePhaseMs(state, nowMs) {
  if (!state) return 0;
  const extra = state.runningSince == null ? 0 : Math.max(0, nowMs - Number(state.runningSince));
  return (state.phaseElapsedMs || 0) + extra;
}

export function pauseTimer(state, nowMs, clock) {
  const next = materializeTimer(state, nowMs, clock);
  next.runningSince = null;
  return next;
}

export function resumeTimer(state, nowMs) {
  const next = cloneState(state);
  if (next.runningSince != null) return next;
  next.runningSince = nowMs;
  return next;
}

export function skipPhase(state, nowMs, clock) {
  const next = materializeTimer(state, nowMs, clock);
  if (next.mode !== 'pomodoro') return next;
  next.phase = next.phase === 'break' ? 'focus' : 'break';
  next.phaseElapsedMs = 0;
  next.runningSince = nowMs;
  return next;
}

export function phaseLimitMs(state) {
  if (!state || state.mode !== 'pomodoro') return null;
  return state.phase === 'break' ? BREAK_MS : FOCUS_MS;
}

export function phaseLabel(state) {
  if (!state) return '시작 전';
  if (state.mode !== 'pomodoro') return state.runningSince ? '스톱워치 진행' : '스톱워치 일시정지';
  if (state.phase === 'break') return state.runningSince ? '휴식 10분' : '휴식 일시정지';
  return state.runningSince ? '집중 50분' : '집중 일시정지';
}
