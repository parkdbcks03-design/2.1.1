import { getAll, getSetting, setSetting } from '../db.js';
import { SETTING_KEYS, cohortCompare, esc, gradeItem, itemStats } from './logic.js';

let selectedKey = null;
let metric = 'score';

function emptyStore() {
  return { extras: {}, items: {}, cuts: {}, cohorts: {} };
}

async function loadStore() {
  const value = await getSetting(SETTING_KEYS.score, null);
  const store = value && typeof value === 'object' ? value : {};
  return { extras: store.extras || {}, items: store.items || {}, cuts: store.cuts || {}, cohorts: store.cohorts || {} };
}

function numOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function collect(exams, majors) {
  const rows = [];
  for (const exam of exams) {
    rows.push({
      key: `exam:${exam.id}`,
      origin: '실전',
      name: exam.name || '이름 없는 시험',
      date: exam.date || '',
      subject: exam.subject || '기타',
      score: exam.score,
      standard: null,
      percentile: null,
      grade: null,
      cut: exam.cut
    });
  }
  for (const major of majors) {
    for (const item of major.results || []) {
      rows.push({
        key: `major:${major.id}:${item.subject}`,
        origin: '주요',
        name: major.name || '주요 모의고사',
        date: major.date || '',
        subject: item.subject,
        score: item.score,
        standard: item.standard,
        percentile: item.percentile,
        grade: item.grade,
        cut: item.cut
      });
    }
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.subject).localeCompare(String(b.subject)));
}

function shownMetric(row, store, name) {
  if (name === 'score') return numOrNull(row.score);
  if (String(row.key).startsWith('major:')) return numOrNull(row[name]);
  return numOrNull(store.extras[row.key]?.[name]);
}

export async function renderScoreLab(root) {
  const [exams, majors, store] = await Promise.all([getAll('exams'), getAll('majorExams'), loadStore()]);
  const rows = collect(exams, majors);
  if (!selectedKey || !rows.some(row => row.key === selectedKey)) selectedKey = rows[0]?.key || null;
  const current = rows.find(row => row.key === selectedKey) || null;
  const subjects = [...new Set(rows.map(row => row.subject))];
  const list = rows.map(row => `<button type="button" class="score-pick ${row.key === selectedKey ? 'is-on' : ''}" data-v190="score-pick" data-key="${esc(row.key)}"><strong>${esc(row.name)}</strong><small>${esc(row.date)} · ${esc(row.origin)} · ${esc(row.subject)}</small></button>`).join('') || '<p class="subtle">실전 모의고사나 주요 모의고사 성적을 먼저 등록하면 여기서 분석할 수 있습니다. 이 화면은 기존 점수를 지우지 않습니다.</p>';
  root.innerHTML = `${heading('성적 분석', '기존 실전·주요 모의고사 점수를 읽고, 문항과 비교 기준만 따로 저장합니다.')}
    <div class="muted-box">공식 등급컷이나 응시자 평균은 출처와 기준 날짜가 있는 입력값만 표시합니다. 없는 숫자는 만들지 않습니다. 사진 인식은 하지 않습니다.</div>
    <div class="grid grid-2 section-gap">
      <article class="card score-list">${list}</article>
      <article class="card">${current ? detail(current, store) : '<p class="subtle">분석을 열 성적이 없습니다.</p>'}</article>
    </div>
    ${trend(rows, store, subjects)}`;
}

function detail(row, store) {
  const extra = store.extras[row.key] || {};
  const items = store.items[row.key] || [];
  const stats = itemStats(items);
  const cut = store.cuts[row.key] || {};
  const cohort = store.cohorts[row.key] || {};
  const compare = cohortCompare(row.score, cohort);
  const userCutReady = String(cut.source || '').trim() && String(cut.asOf || '').trim();
  const standard = shownMetric(row, store, 'standard');
  const percentile = shownMetric(row, store, 'percentile');
  const grade = shownMetric(row, store, 'grade');
  return `<div class="card-head"><div><h3>${esc(row.name)}</h3><p>${esc(row.date)} · ${esc(row.origin)} · ${esc(row.subject)}</p></div></div>
    <div class="grid grid-4">
      <div class="mini-stat"><span>원점수</span><strong>${row.score ?? '—'}</strong></div>
      <div class="mini-stat"><span>표준점수</span><strong>${standard ?? '—'}</strong></div>
      <div class="mini-stat"><span>백분위</span><strong>${percentile ?? '—'}</strong></div>
      <div class="mini-stat"><span>등급</span><strong>${grade ?? '—'}</strong></div>
    </div>
    <p class="subtle">기록에 입력된 등급 컷: ${row.cut ?? '—'}. 이것은 사용자가 시험 기록에 남긴 값이며 공식 예상 등급컷이 아닙니다.</p>
    ${String(row.key).startsWith('exam:') ? `<form class="form-grid section-gap" id="score-extra-form">
      <div class="field"><label>표준점수</label><input name="standard" inputmode="decimal" value="${esc(extra.standard ?? '')}"></div>
      <div class="field"><label>백분위</label><input name="percentile" inputmode="decimal" value="${esc(extra.percentile ?? '')}"></div>
      <div class="field"><label>등급</label><input name="grade" inputmode="decimal" value="${esc(extra.grade ?? '')}"></div>
      <div class="field full"><button type="button" class="btn btn-secondary" data-v190="score-save-extra">분석용 점수만 저장</button></div>
    </form>` : '<p class="subtle">주요 모의고사의 표준점수·백분위·등급은 성적표 원본을 그대로 보여 줍니다.</p>'}
    <h3 class="section-gap">문항별 정오</h3>
    <form id="score-item-form">
      <textarea name="items" rows="6" placeholder="문항,배점,정답,내답&#10;1,2,3,3">${esc(items.map(item => [item.no, item.points ?? '', item.answer, item.mine].join(',')).join('\n'))}</textarea>
      <div class="v190-actions"><button type="button" class="btn btn-primary" data-v190="score-save-items">문항 저장</button><button type="button" class="btn btn-ghost" data-v190="score-clear-items">문항 삭제</button></div>
    </form>
    <p class="subtle">${stats.count ? `채점 ${stats.graded}문항 · 맞음 ${stats.correct} · 틀림 ${stats.wrong} · 정오 미입력 ${stats.pending} · 맞은 배점 ${stats.earned}` : '문항을 입력하기 전에는 문항 통계를 만들지 않습니다.'}</p>
    <h3 class="section-gap">직접 입력한 등급컷</h3>
    <form class="form-grid" id="score-cut-form">
      <div class="field"><label>출처</label><input name="source" value="${esc(cut.source || '')}" placeholder="예: 내가 정리한 학원 자료"></div>
      <div class="field"><label>기준 날짜</label><input name="asOf" type="date" value="${esc(cut.asOf || '')}"></div>
      <div class="field"><label>기준 점수</label><input name="value" inputmode="decimal" value="${esc(cut.value ?? '')}"></div>
      <div class="field"><label>메모</label><input name="note" value="${esc(cut.note || '')}"></div>
      <div class="field full"><button type="button" class="btn btn-secondary" data-v190="score-save-cut">등급컷 저장</button></div>
    </form>
    <p class="subtle">${userCutReady ? `입력 등급컷 ${esc(cut.value ?? '—')} · 출처 ${esc(cut.source)} · 기준 ${esc(cut.asOf)}` : '출처와 기준 날짜가 없으면 등급컷을 표시하지 않습니다.'}</p>
    <h3 class="section-gap">평균 비교</h3>
    <form class="form-grid" id="score-cohort-form">
      <div class="field"><label>비교 회차</label><input name="roundId" value="${esc(cohort.roundId || '')}" placeholder="이 시험과 같은 회차"></div>
      <div class="field"><label>평균 출처</label><input name="source" value="${esc(cohort.source || '')}"></div>
      <div class="field"><label>평균</label><input name="average" inputmode="decimal" value="${esc(cohort.average ?? '')}"></div>
      <div class="field"><label>기준 날짜</label><input name="asOf" type="date" value="${esc(cohort.asOf || '')}"></div>
      <div class="field full"><button type="button" class="btn btn-secondary" data-v190="score-save-cohort">비교 자료 저장</button></div>
    </form>
    <p class="subtle">${compare.available ? `내 원점수와 입력 평균의 차이 ${compare.delta > 0 ? '+' : ''}${compare.delta} · 출처 ${esc(compare.source)} · 회차 ${esc(compare.roundId)}` : '비교 데이터 없음'}</p>`;
}

function trend(rows, store, subjects) {
  const active = subjects[0] ? rows.filter(row => row.subject === (trend.subject || subjects[0])) : [];
  const subject = trend.subject && subjects.includes(trend.subject) ? trend.subject : (subjects[0] || '');
  const series = rows.filter(row => row.subject === subject).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const values = series.map(row => ({ row, value: shownMetric(row, store, metric) })).filter(item => item.value != null);
  const max = Math.max(1, ...values.map(item => metric === 'grade' ? 9 : item.value));
  const bars = values.map(item => {
    const height = metric === 'grade' ? Math.max(8, (10 - item.value) / 9 * 100) : Math.max(4, item.value / max * 100);
    return `<div class="v190-trend-col" title="${esc(item.row.name)}"><i style="height:${height}%"></i><span>${esc(String(item.row.date).slice(5))}</span></div>`;
  }).join('');
  const table = series.map(row => `<tr><td>${esc(row.name)}</td><td>${esc(row.date)}</td><td>${row.score ?? '—'}</td><td>${shownMetric(row, store, 'standard') ?? '—'}</td><td>${shownMetric(row, store, 'percentile') ?? '—'}</td><td>${shownMetric(row, store, 'grade') ?? '—'}</td></tr>`).join('');
  return `<article class="card section-gap"><div class="card-head"><div><h3>회차별 성적 추이</h3><p>같은 과목의 저장된 점수만 잇습니다. 평균이 없는 칸은 비워 둡니다.</p></div></div>
    <div class="tag-row">${subjects.map(name => `<button type="button" class="subject-tab ${name === subject ? 'active' : ''}" data-v190="score-subject" data-subject="${esc(name)}">${esc(name)}</button>`).join('')}</div>
    <div class="tag-row section-gap">${[['score', '원점수'], ['standard', '표준점수'], ['percentile', '백분위'], ['grade', '등급']].map(([id, label]) => `<button type="button" class="subject-tab ${metric === id ? 'active' : ''}" data-v190="score-metric" data-metric="${id}">${label}</button>`).join('')}</div>
    <div class="v190-trend">${bars || '<p class="subtle">이 지표로 그릴 점수가 없습니다.</p>'}</div>
    ${series.length ? `<div class="table-wrap section-gap"><table class="data-table"><thead><tr><th>시험</th><th>날짜</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th></tr></thead><tbody>${table}</tbody></table></div>` : ''}
    <p class="subtle">응시자 평균은 출처와 회차가 입력된 시험만 위 상세 화면에 표시합니다.</p>
  </article>`;
}

function formValue(id) {
  const form = document.querySelector(id);
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

export async function handleScore(action, button, { toast }) {
  if (!action.startsWith('score-')) return false;
  if (action === 'score-pick') {
    selectedKey = button.dataset.key || null;
    return true;
  }
  if (action === 'score-subject') {
    trend.subject = button.dataset.subject || '';
    return true;
  }
  if (action === 'score-metric') {
    metric = button.dataset.metric || 'score';
    return true;
  }
  if (!selectedKey) throw new Error('성적을 먼저 선택해 주세요.');
  const store = await loadStore();
  if (action === 'score-save-extra') {
    const data = formValue('#score-extra-form');
    store.extras[selectedKey] = { standard: data.standard ?? '', percentile: data.percentile ?? '', grade: data.grade ?? '' };
    await setSetting(SETTING_KEYS.score, store);
    toast('분석용 점수를 저장했습니다. 기존 시험 원본은 그대로입니다.');
    return true;
  }
  if (action === 'score-save-items') {
    const data = formValue('#score-item-form');
    const items = String(data.items || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [no, points, answer, mine] = line.split(',').map(part => (part || '').trim());
      if (!no) return null;
      return gradeItem({ no, points, answer, mine });
    }).filter(Boolean);
    store.items[selectedKey] = items;
    await setSetting(SETTING_KEYS.score, store);
    toast(items.length ? '문항 분석을 저장했습니다.' : '비어 있는 문항 목록을 저장했습니다.');
    return true;
  }
  if (action === 'score-clear-items') {
    delete store.items[selectedKey];
    await setSetting(SETTING_KEYS.score, store);
    toast('이 시험의 문항 분석만 지웠습니다.');
    return true;
  }
  if (action === 'score-save-cut') {
    store.cuts[selectedKey] = formValue('#score-cut-form');
    await setSetting(SETTING_KEYS.score, store);
    toast('등급컷 입력을 저장했습니다. 출처와 날짜가 없으면 화면에는 나오지 않습니다.');
    return true;
  }
  if (action === 'score-save-cohort') {
    store.cohorts[selectedKey] = formValue('#score-cohort-form');
    await setSetting(SETTING_KEYS.score, store);
    toast('비교 자료를 저장했습니다.');
    return true;
  }
  return false;
}

function heading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}
