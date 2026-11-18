import { getSetting, setSetting } from '../db.js';
import { ANALYSIS_SUBJECTS, SETTING_KEYS, contentKey, contentProgress, esc } from './logic.js';

const TYPES = ['교재', '문제집', '모의고사', '주간 과제', '강의', '복습 자료', '기타'];
const STATUSES = ['예정', '진행 중', '완료', '보류'];
let span = 'week';
let editingId = null;

function emptyDrawer() {
  return { items: [] };
}

async function loadDrawer() {
  const value = await getSetting(SETTING_KEYS.content, null);
  const items = Array.isArray(value?.items) ? value.items : [];
  return { items };
}

function parseWeeks(text) {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [label, target, done] = line.split(',').map(part => (part || '').trim());
    if (!label) return null;
    return { label, target: target === '' ? null : Number(target), done: done === '' ? 0 : Number(done) };
  }).filter(item => item && Number.isFinite(item.done) && (item.target == null || Number.isFinite(item.target)));
}

export async function renderContent(root) {
  const drawer = await loadDrawer();
  const editing = drawer.items.find(item => item.id === editingId) || null;
  const subjects = ANALYSIS_SUBJECTS;
  root.innerHTML = `${heading('학습 콘텐츠 서랍', '교재 책장, 기간별 할 일, 공부 시간과 따로 보관하는 진도 서랍입니다.')}
    <div class="muted-box">같은 과목·유형·이름·출처는 한 번만 등록됩니다. 공부 시간에 더해지지 않고, 기존 교재와 할 일 기록을 바꾸지 않습니다.</div>
    <div class="tag-row section-gap">
      <button type="button" class="subject-tab ${span === 'week' ? 'active' : ''}" data-v190="content-span" data-span="week">주간</button>
      <button type="button" class="subject-tab ${span === 'month' ? 'active' : ''}" data-v190="content-span" data-span="month">월간</button>
    </div>
    <article class="card section-gap"><div class="card-head"><div><h3>${editing ? '콘텐츠 수정' : '콘텐츠 추가'}</h3><p>전체 분량과 현재 진도를 직접 입력합니다.</p></div></div>${editor(editing)}</article>
    ${span === 'week' ? weekView(drawer.items) : monthView(drawer.items)}
    ${span === 'week' ? `<div class="content-subjects section-gap">${subjects.map(subject => `<section><h3>${esc(subject)}</h3>${cards(drawer.items.filter(item => subject === '전체' ? true : item.subject === subject))}</section>`).join('')}</div>` : ''}`;
}

function editor(item) {
  const weeks = (item?.weeks || []).map(week => [week.label, week.target ?? '', week.done ?? 0].join(',')).join('\n');
  return `<form class="form-grid" id="content-form">
    <div class="field"><label>콘텐츠명</label><input name="name" value="${esc(item?.name || '')}" required></div>
    <div class="field"><label>과목</label><select name="subject">${ANALYSIS_SUBJECTS.map(subject => `<option ${item?.subject === subject ? 'selected' : ''}>${subject}</option>`).join('')}</select></div>
    <div class="field"><label>출처 · 제공자</label><input name="provider" value="${esc(item?.provider || '')}"></div>
    <div class="field"><label>유형</label><select name="type">${TYPES.map(type => `<option ${item?.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></div>
    <div class="field"><label>전체 분량</label><input name="totalAmount" inputmode="numeric" value="${esc(item?.totalAmount ?? '')}"></div>
    <div class="field"><label>현재 진도</label><input name="progress" inputmode="numeric" value="${esc(item?.progress ?? 0)}"></div>
    <div class="field"><label>단위</label><input name="unit" value="${esc(item?.unit || '회')}" placeholder="회, 쪽, 강"></div>
    <div class="field"><label>상태</label><select name="status">${STATUSES.map(status => `<option ${(item?.status || '예정') === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>
    <div class="field"><label>시작일</label><input name="startDate" type="date" value="${esc(item?.startDate || '')}"></div>
    <div class="field"><label>완료 예정일</label><input name="dueDate" type="date" value="${esc(item?.dueDate || '')}"></div>
    <div class="field full"><label>메모</label><textarea name="memo">${esc(item?.memo || '')}</textarea></div>
    <div class="field full"><label>주차별 배정</label><textarea name="weeks" rows="4" placeholder="1주,20,10">${esc(weeks)}</textarea><small>주차,목표,완료 를 한 줄에 하나. 비워 두면 진도만 표시합니다.</small></div>
    <div class="field full v190-actions"><button type="button" class="btn btn-primary" data-v190="content-save">${item ? '수정 저장' : '추가'}</button>${item ? '<button type="button" class="btn btn-ghost" data-v190="content-cancel">새로 입력</button>' : ''}</div>
  </form>`;
}

function weekView(items) {
  const labels = [...new Set(items.flatMap(item => (item.weeks || []).map(week => week.label)))];
  if (!labels.length) return '<article class="card"><p class="subtle">주차별 배정이 있는 콘텐츠가 없습니다.</p></article>';
  const body = items.filter(item => item.weeks?.length).map(item => `<tr><td><i class="subject-dot" style="background:${color(item.subject)}"></i>${esc(item.subject)} · ${esc(item.name)}</td>${labels.map(label => {
    const week = item.weeks.find(entry => entry.label === label);
    if (!week) return '<td>—</td>';
    const width = week.target ? Math.min(100, Math.round((Number(week.done) || 0) / Number(week.target) * 100)) : 0;
    return `<td><div class="content-mini"><span style="width:${width}%;background:${color(item.subject)}"></span></div><small>${week.done ?? 0}/${week.target ?? '—'}</small></td>`;
  }).join('')}</tr>`).join('');
  return `<article class="card"><div class="table-wrap"><table class="data-table content-table"><thead><tr><th>콘텐츠</th>${labels.map(label => `<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></article>`;
}

function monthView(items) {
  const groups = new Map();
  for (const item of items) {
    const key = (item.dueDate || item.startDate || '날짜 없음').slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, list]) => `<article class="card section-gap"><h3>${esc(key)}</h3>${cards(list)}</article>`).join('') || '<article class="card"><p class="subtle">월간으로 묶을 콘텐츠가 없습니다.</p></article>';
}

function cards(items) {
  if (!items.length) return '<p class="subtle">없음</p>';
  return items.map(item => {
    const progress = contentProgress(item);
    const pct = progress.ratio == null ? null : Math.round(progress.ratio * 100);
    return `<article class="content-card" style="--content:${color(item.subject)}"><header><strong>${esc(item.name)}</strong><span class="pill">${esc(item.status || '예정')}</span></header><p>${esc(item.subject)} · ${esc(item.type || '기타')} · ${esc(item.provider || '출처 없음')}</p><p class="subtle">${item.totalAmount ? `${item.progress || 0}/${item.totalAmount}${esc(item.unit || '')} · ${pct}%` : '전체 분량 없음'} · 남은 ${progress.remain ?? '—'}</p><div class="progress-line"><span style="width:${pct || 0}%;background:var(--content)"></span></div><div class="v190-actions"><button type="button" class="btn btn-ghost btn-small" data-v190="content-edit" data-id="${esc(item.id)}">수정</button><button type="button" class="btn btn-ghost btn-small" data-v190="content-bump" data-id="${esc(item.id)}">진도 +1</button><button type="button" class="btn btn-ghost btn-small" data-v190="content-done" data-id="${esc(item.id)}">완료</button><button type="button" class="btn btn-ghost btn-small" data-v190="content-delete" data-id="${esc(item.id)}">삭제</button></div></article>`;
  }).join('');
}

function color(subject) {
  return {
    '국어': '#c17d64',
    '수학': '#658baf',
    '영어': '#8d82b2',
    '한국사': '#a87891',
    '탐구': '#6d9c86',
    '제2외국어': '#7d8ca0',
    '기타': '#8d8d8d'
  }[subject] || '#8d8d8d';
}

export async function handleContent(action, button, { toast }) {
  if (!action.startsWith('content-')) return false;
  if (action === 'content-span') {
    span = button.dataset.span === 'month' ? 'month' : 'week';
    return true;
  }
  if (action === 'content-cancel') {
    editingId = null;
    return true;
  }
  if (action === 'content-edit') {
    editingId = button.dataset.id || null;
    return true;
  }
  const drawer = await loadDrawer();
  if (action === 'content-delete') {
    drawer.items = drawer.items.filter(item => item.id !== button.dataset.id);
    if (editingId === button.dataset.id) editingId = null;
    await setSetting(SETTING_KEYS.content, drawer);
    toast('콘텐츠 서랍에서만 삭제했습니다.');
    return true;
  }
  if (action === 'content-bump' || action === 'content-done') {
    drawer.items = drawer.items.map(item => {
      if (item.id !== button.dataset.id) return item;
      if (action === 'content-done') return { ...item, status: '완료', progress: item.totalAmount || item.progress || 0, updatedAt: new Date().toISOString() };
      const next = Math.max(0, Number(item.progress) || 0) + 1;
      const progress = item.totalAmount ? Math.min(Number(item.totalAmount), next) : next;
      const status = item.totalAmount && progress >= Number(item.totalAmount) ? '완료' : '진행 중';
      return { ...item, progress, status, updatedAt: new Date().toISOString() };
    });
    await setSetting(SETTING_KEYS.content, drawer);
    toast(action === 'content-done' ? '완료로 표시했습니다.' : '진도를 1 올렸습니다.');
    return true;
  }
  if (action === 'content-save') {
    const form = document.querySelector('#content-form');
    const data = Object.fromEntries(new FormData(form).entries());
    if (!String(data.name || '').trim()) throw new Error('콘텐츠명을 입력해 주세요.');
    const item = {
      id: editingId || crypto.randomUUID(),
      name: String(data.name).trim(),
      subject: data.subject,
      provider: String(data.provider || '').trim(),
      type: data.type,
      totalAmount: data.totalAmount === '' ? null : Math.max(0, Number(data.totalAmount) || 0),
      progress: Math.max(0, Number(data.progress) || 0),
      unit: data.unit || '회',
      status: STATUSES.includes(data.status) ? data.status : '예정',
      startDate: data.startDate || '',
      dueDate: data.dueDate || '',
      memo: data.memo || '',
      weeks: parseWeeks(data.weeks),
      updatedAt: new Date().toISOString()
    };
    const key = contentKey(item);
    if (drawer.items.some(other => other.id !== item.id && contentKey(other) === key)) {
      throw new Error('같은 과목, 유형, 이름, 출처의 콘텐츠가 이미 있습니다.');
    }
    if (editingId) drawer.items = drawer.items.map(other => other.id === item.id ? { ...other, ...item } : other);
    else drawer.items.unshift({ ...item, createdAt: item.updatedAt });
    await setSetting(SETTING_KEYS.content, drawer);
    editingId = null;
    toast('학습 콘텐츠를 저장했습니다.');
    return true;
  }
  return false;
}

function heading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}
