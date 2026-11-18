import { getSetting, setSetting } from '../db.js';
import { SETTING_KEYS, convertUniversity, esc } from './logic.js';

const AREAS = ['국어', '수학', '영어', '한국사', '탐구', '제2외국어'];

function emptyConfig() {
  return { year: '2028', targets: [] };
}

async function loadConfig() {
  const value = await getSetting(SETTING_KEYS.university, null);
  if (!value || typeof value !== 'object') return emptyConfig();
  return { year: '2028', targets: Array.isArray(value.targets) ? value.targets : [] };
}

function blankTarget() {
  return {
    id: crypto.randomUUID(),
    year: '2028',
    university: '',
    unit: '',
    source: '',
    sourceDate: '',
    method: 'none',
    manualScore: '',
    targetScore: '',
    note: '',
    areas: AREAS.map(name => ({ name, weight: '', score: '' }))
  };
}

export async function renderUniversity(root) {
  const config = await loadConfig();
  const cards = config.targets.map(target => card(target)).join('') || '<article class="card"><p class="subtle">아직 입력한 목표 대학이 없습니다. 공식 환산표가 확인되지 않으면 점수와 합격 가능성은 계산하지 않습니다.</p></article>';
  root.innerHTML = `${heading('대학 환산 메모', '2028학년도 자료만 다룹니다. 확인되지 않은 합격 가능성과 환산점수는 만들지 않습니다.')}
    <div class="muted-box">대학별 반영 비율과 점수는 사용자가 출처와 함께 직접 넣습니다. 계산이 되어도 참고용 추정치이며, 합격 예측이 아닙니다.</div>
    <article class="card section-gap"><div class="card-head"><div><h3>목표 대학 추가</h3><p>모집단위, 반영 영역, 출처, 기준 날짜를 같이 남깁니다.</p></div></div>${form(blankTarget(), 'uni-add')}</article>
    <div class="uni-list section-gap">${cards}</div>`;
}

function form(target, action) {
  const areas = AREAS.map(name => {
    const area = (target.areas || []).find(item => item.name === name) || { weight: '', score: '' };
    return `<div class="uni-area"><strong>${name}</strong><input name="weight_${name}" inputmode="decimal" placeholder="가중치" value="${esc(area.weight ?? '')}"><input name="score_${name}" inputmode="decimal" placeholder="내 영역 점수" value="${esc(area.score ?? '')}"></div>`;
  }).join('');
  return `<form class="form-grid" data-uni="${esc(target.id)}">
    <div class="field"><label>대학</label><input name="university" value="${esc(target.university || '')}"></div>
    <div class="field"><label>모집단위</label><input name="unit" value="${esc(target.unit || '')}"></div>
    <div class="field"><label>학년도</label><input name="year" value="2028" readonly></div>
    <div class="field"><label>자료 출처</label><input name="source" value="${esc(target.source || '')}" placeholder="모집요강, 대학 안내 등"></div>
    <div class="field"><label>기준 날짜</label><input name="sourceDate" type="date" value="${esc(target.sourceDate || '')}"></div>
    <div class="field"><label>환산 방식</label><select name="method">
      <option value="none" ${target.method === 'none' ? 'selected' : ''}>계산하지 않음</option>
      <option value="sum" ${target.method === 'sum' ? 'selected' : ''}>가중 합</option>
      <option value="average" ${target.method === 'average' ? 'selected' : ''}>가중 평균</option>
      <option value="manual" ${target.method === 'manual' ? 'selected' : ''}>환산점수 직접 입력</option>
    </select></div>
    <div class="field"><label>직접 입력 환산점수</label><input name="manualScore" inputmode="decimal" value="${esc(target.manualScore ?? '')}"></div>
    <div class="field"><label>목표 환산점수</label><input name="targetScore" inputmode="decimal" value="${esc(target.targetScore ?? '')}"></div>
    <div class="field full"><label>메모</label><textarea name="note">${esc(target.note || '')}</textarea></div>
    <div class="field full uni-areas">${areas}</div>
    <div class="field full v190-actions"><button type="button" class="btn btn-primary" data-v190="${action}" data-id="${esc(target.id)}">저장</button>${action === 'uni-save' ? `<button type="button" class="btn btn-ghost" data-v190="uni-delete" data-id="${esc(target.id)}">삭제</button>` : ''}</div>
  </form>`;
}

function card(target) {
  const result = target.method === 'none' ? { ok: false, reason: '환산 방식을 넣지 않아 점수를 계산하지 않습니다.' } : convertUniversity(target);
  const goal = Number(target.targetScore);
  const gap = result.ok && Number.isFinite(goal) ? result.score - goal : null;
  const areas = (target.areas || []).filter(area => area.weight !== '' && area.weight != null).map(area => `${esc(area.name)} 가중치 ${esc(area.weight)}`).join(' · ');
  return `<article class="card uni-card"><div class="card-head"><div><h3>${esc(target.university || '대학 미입력')} · ${esc(target.unit || '모집단위 미입력')}</h3><p>2028학년도 · 출처 ${esc(target.source || '없음')} · 기준 ${esc(target.sourceDate || '없음')}</p></div></div>
    <p class="subtle">${areas || '반영 영역 가중치 없음'}</p>
    <div class="grid grid-3"><div class="mini-stat"><span>환산</span><strong>${result.ok ? Number(result.score).toFixed(2) : '계산 안 함'}</strong></div><div class="mini-stat"><span>목표와 차이</span><strong>${gap == null ? '—' : `${gap > 0 ? '+' : ''}${gap.toFixed(2)}`}</strong></div><div class="mini-stat"><span>표시</span><strong>${result.ok ? '참고용 추정치' : '없음'}</strong></div></div>
    <p class="subtle">${result.ok ? '이 값은 입력한 식의 참고용 추정치입니다. 합격 가능성이 아닙니다.' : esc(result.reason)}</p>
    ${target.note ? `<p>${esc(target.note)}</p>` : ''}
    ${form(target, 'uni-save')}</article>`;
}

function readTarget(form, id) {
  const data = Object.fromEntries(new FormData(form).entries());
  return {
    id,
    year: '2028',
    university: String(data.university || '').trim(),
    unit: String(data.unit || '').trim(),
    source: String(data.source || '').trim(),
    sourceDate: data.sourceDate || '',
    method: ['none', 'sum', 'average', 'manual'].includes(data.method) ? data.method : 'none',
    manualScore: data.manualScore ?? '',
    targetScore: data.targetScore ?? '',
    note: data.note || '',
    areas: AREAS.map(name => ({ name, weight: data[`weight_${name}`] ?? '', score: data[`score_${name}`] ?? '' }))
  };
}

export async function handleUniversity(action, button, { toast }) {
  if (!action.startsWith('uni-')) return false;
  const config = await loadConfig();
  const id = button.dataset.id;
  if (action === 'uni-delete') {
    config.targets = config.targets.filter(target => target.id !== id);
    await setSetting(SETTING_KEYS.university, config);
    toast('목표 대학을 삭제했습니다.');
    return true;
  }
  const form = button.closest('form');
  if (!form) return false;
  const target = readTarget(form, action === 'uni-add' ? crypto.randomUUID() : id);
  if (!target.university || !target.unit) throw new Error('대학과 모집단위를 입력해 주세요.');
  if (action === 'uni-add') config.targets.unshift(target);
  else config.targets = config.targets.map(item => item.id === id ? target : item);
  await setSetting(SETTING_KEYS.university, config);
  toast('2028학년도 목표 대학을 저장했습니다. 조건이 없으면 환산점수는 계산하지 않습니다.');
  return true;
}

function heading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}
