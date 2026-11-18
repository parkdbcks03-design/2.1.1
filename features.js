/*
 * Add-on features for Exam Life 2028.
 * These screens use their own IndexedDB stores and do not alter existing records.
 */
import { getAll, getById, put, remove, getSetting, setSetting } from './db.js';

const DEFAULT_UNLOCK_DATE = '2027-12-10'; // 2028학년도 수능 성적 통지일(교육부 발표)
const VAULT_ROW_ID = 'main';
const VAULT_KEY_SETTING = 'wishVaultEncryptionKeyV1';
const $ = (selector, root = document) => root.querySelector(selector);

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function dateFromISO(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}
function addDays(iso, amount) {
  const date = dateFromISO(iso);
  date.setDate(date.getDate() + amount);
  return todayISO(date);
}
function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value;
}
function dateDiff(from, to) {
  const [fy, fm, fd] = String(from).split('-').map(Number);
  const [ty, tm, td] = String(to).split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
function fmtDate(iso) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }).format(dateFromISO(iso));
}
function pageHeading(title, subtitle) {
  return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div></div>`;
}
function emptyState(title, desc) {
  return `<div class="empty-state"><strong>${title}</strong>${desc}</div>`;
}
function notify(message, type = 'success') {
  const region = $('#toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : type === 'warning' ? 'warning' : ''}`;
  el.textContent = message;
  region.append(el);
  window.setTimeout(() => el.remove(), 3600);
}

/* -------------------------------------------------------------------------- */
/* 기간별 할 일                                                               */
/* -------------------------------------------------------------------------- */
export async function renderPeriodTasks(root) {
  const tasks = (await getAll('periodTasks')).sort((a, b) =>
    String(a.startDate).localeCompare(String(b.startDate)) || String(b.createdAt).localeCompare(String(a.createdAt))
  );
  const today = todayISO();
  const editing = tasks.find(task => task.id === root.dataset.editingTask) || null;
  const active = tasks.filter(task => !task.completed && task.startDate <= today && task.endDate >= today);
  const upcoming = tasks.filter(task => !task.completed && task.startDate > today);
  const overdue = tasks.filter(task => !task.completed && task.endDate < today);
  const completed = tasks.filter(task => task.completed);

  const taskRows = (rows, kind) => rows.length ? rows.map(task => {
    const status = task.completed ? '완료' : task.startDate > today ? '예정' : task.endDate < today ? '기간 종료' : '진행 중';
    const days = Math.max(1, dateDiff(task.startDate, task.endDate) + 1);
    return `<article class="period-task-row ${task.completed ? 'is-complete' : ''}">
      <div class="period-task-check"><input type="checkbox" data-task-toggle="${esc(task.id)}" ${task.completed ? 'checked' : ''} aria-label="${esc(task.title)} 완료 여부"></div>
      <div class="period-task-main"><strong>${esc(task.title)}</strong><div class="period-task-meta"><span>${fmtDate(task.startDate)} – ${fmtDate(task.endDate)}</span><span>${days}일</span><span class="period-task-status">${status}</span></div></div>
      <div class="period-task-actions"><button class="btn btn-small btn-ghost" type="button" data-task-edit="${esc(task.id)}">수정</button><button class="btn btn-small btn-ghost" type="button" data-task-delete="${esc(task.id)}">삭제</button></div>
    </article>`;
  }).join('') : emptyState(kind === 'completed' ? '완료한 목표가 없습니다' : '등록된 목표가 없습니다', kind === 'completed' ? '완료 체크한 목표가 여기에 모입니다.' : '기간을 정해 꾸준히 할 일을 추가해 보세요.');

  root.innerHTML = `${pageHeading('기간별 할 일', '하루 일정과 별도로, 일정 기간 동안 이어갈 목표를 관리합니다.')}
    <div class="grid grid-3 period-task-summary">
      <div class="card metric-card"><div class="metric-label">진행 중</div><div class="metric-value">${active.length}</div><div class="metric-note">현재 기간 안의 목표</div></div>
      <div class="card metric-card"><div class="metric-label">예정</div><div class="metric-value">${upcoming.length}</div><div class="metric-note">시작일 전 목표</div></div>
      <div class="card metric-card"><div class="metric-label">완료</div><div class="metric-value">${completed.length}</div><div class="metric-note">완료 체크한 목표</div></div>
    </div>
    <div class="card period-task-editor">
      <div class="card-head"><div><h3>${editing ? '기간별 할 일 수정' : '새로운 기간별 할 일'}</h3><p>시작일과 종료일을 지정하면 해당 기간 동안 목록에 유지됩니다.</p></div></div>
      <form id="period-task-form">
        <input type="hidden" name="id" value="${esc(editing?.id || '')}">
        <div class="form-grid">
          <div class="field full"><label for="period-task-title">할 일 제목</label><input id="period-task-title" name="title" maxlength="120" required placeholder="예: 수학 기출 3회독 완료" value="${esc(editing?.title || '')}"></div>
          <div class="field"><label for="period-task-start">시작 날짜</label><input id="period-task-start" name="startDate" type="date" required value="${esc(editing?.startDate || today)}"></div>
          <div class="field"><label for="period-task-end">종료 날짜</label><input id="period-task-end" name="endDate" type="date" required value="${esc(editing?.endDate || addDays(today, 6))}"></div>
          <div class="field full"><label for="period-task-duration">기간 빠른 설정</label><select id="period-task-duration" ${editing ? 'data-custom="true"' : ''}><option value="custom">직접 설정</option><option value="7">7일</option><option value="14">14일</option><option value="30">30일</option></select><small class="subtle">기간은 시작일과 종료일을 모두 포함해 계산합니다.</small></div>
        </div>
        <div class="period-task-form-actions"><button class="btn btn-primary" type="submit">${editing ? '수정 저장' : '기간별 할 일 추가'}</button>${editing ? '<button class="btn btn-ghost" type="button" id="period-task-cancel">취소</button>' : ''}</div>
      </form>
    </div>
    <div class="card section-gap"><div class="card-head"><div><h3>진행 중</h3><p>오늘이 설정한 기간에 포함되는 목표</p></div><span class="pill">${active.length}개</span></div><div class="period-task-list">${taskRows(active, 'active')}</div></div>
    <div class="card section-gap"><div class="card-head"><div><h3>시작 예정</h3><p>시작 날짜가 아직 오지 않은 목표</p></div><span class="pill">${upcoming.length}개</span></div><div class="period-task-list">${taskRows(upcoming, 'upcoming')}</div></div>
    <div class="card section-gap"><div class="card-head"><div><h3>기간 종료 · 미완료</h3><p>종료 날짜가 지났지만 완료하지 않은 목표</p></div><span class="pill">${overdue.length}개</span></div><div class="period-task-list">${taskRows(overdue, 'overdue')}</div></div>
    <div class="card section-gap"><div class="card-head"><div><h3>완료한 목표</h3><p>완료 여부를 다시 변경할 수도 있습니다.</p></div><span class="pill">${completed.length}개</span></div><div class="period-task-list">${taskRows(completed, 'completed')}</div></div>`;

  const form = $('#period-task-form', root);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const title = String(data.title || '').trim();
    if (!title) { notify('할 일 제목을 입력해 주세요.', 'warning'); return; }
    if (!data.startDate || !data.endDate || data.endDate < data.startDate) {
      notify('종료 날짜는 시작 날짜와 같거나 이후여야 합니다.', 'error'); return;
    }
    const previous = data.id ? await getById('periodTasks', data.id) : null;
    const now = new Date().toISOString();
    await put('periodTasks', {
      id: previous?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      title, startDate: data.startDate, endDate: data.endDate,
      completed: previous?.completed || false,
      createdAt: previous?.createdAt || now, updatedAt: now
    });
    root.dataset.editingTask = '';
    notify(previous ? '기간별 할 일을 수정했습니다.' : '기간별 할 일을 추가했습니다.');
    await renderPeriodTasks(root);
  });

  $('#period-task-duration', root).addEventListener('change', event => {
    if (event.target.value === 'custom') return;
    const start = $('#period-task-start', root).value || todayISO();
    $('#period-task-start', root).value = start;
    $('#period-task-end', root).value = addDays(start, Number(event.target.value) - 1);
  });
  $('#period-task-start', root).addEventListener('change', () => {
    const duration = $('#period-task-duration', root).value;
    if (duration !== 'custom') {
      const start = $('#period-task-start', root).value || todayISO();
      $('#period-task-start', root).value = start;
      $('#period-task-end', root).value = addDays(start, Number(duration) - 1);
    }
  });
  root.querySelectorAll('[data-task-edit]').forEach(button => button.addEventListener('click', async () => {
    root.dataset.editingTask = button.dataset.taskEdit;
    await renderPeriodTasks(root);
    $('#period-task-title', root)?.focus();
  }));
  root.querySelectorAll('[data-task-toggle]').forEach(input => input.addEventListener('change', async () => {
    const task = await getById('periodTasks', input.dataset.taskToggle);
    if (!task) return;
    await put('periodTasks', { ...task, completed: input.checked, updatedAt: new Date().toISOString() });
    await renderPeriodTasks(root);
  }));
  root.querySelectorAll('[data-task-delete]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('이 기간별 할 일을 삭제할까요? 삭제한 항목은 휴지통에서 복구할 수 있습니다.')) return;
    await remove('periodTasks', button.dataset.taskDelete);
    notify('기간별 할 일을 삭제했습니다.');
    await renderPeriodTasks(root);
  }));
  $('#period-task-cancel', root)?.addEventListener('click', async () => {
    root.dataset.editingTask = '';
    await renderPeriodTasks(root);
  });
}

/* -------------------------------------------------------------------------- */
/* 암호화 보물상자                                                            */
/* -------------------------------------------------------------------------- */
let vaultRoot = null;
let vaultMidnightTimer = null;
let vaultVisibilityBound = false;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function requireCrypto() {
  if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
    throw new Error('이 브라우저에서는 Web Crypto API를 사용할 수 없습니다. HTTPS로 접속한 Safari 또는 최신 브라우저에서 이용해 주세요.');
  }
}
async function getVaultCryptoKey() {
  requireCrypto();
  let storedKey = await getSetting(VAULT_KEY_SETTING, null);
  if (!storedKey) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    storedKey = bytesToBase64(raw);
    await setSetting(VAULT_KEY_SETTING, storedKey);
  }
  const rawKey = base64ToBytes(storedKey);
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptWishes(wishes) {
  const key = await getVaultCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(wishes));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  await put('wishVault', {
    id: VAULT_ROW_ID,
    algorithm: 'AES-GCM',
    iv: bytesToBase64(iv),
    cipherText: bytesToBase64(new Uint8Array(cipher)),
    updatedAt: new Date().toISOString()
  });
}
async function decryptWishes() {
  const row = await getById('wishVault', VAULT_ROW_ID);
  if (!row) return [];
  if (!row.iv || !row.cipherText) throw new Error('보물상자 암호화 데이터 형식이 올바르지 않습니다.');
  const key = await getVaultCryptoKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(row.iv) }, key, base64ToBytes(row.cipherText));
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(parsed)) throw new Error('보관된 소원 데이터를 읽을 수 없습니다.');
  return parsed;
}
export async function getPublicWishesIfUnlocked() {
  const unlockDate = await getSetting('wishVaultUnlockDate', DEFAULT_UNLOCK_DATE);
  if (todayISO() < unlockDate) return { unlocked: false, unlockDate, wishes: [] };
  return { unlocked: true, unlockDate, wishes: await decryptWishes() };
}

function armVaultUnlockCheck(root, unlockDate) {
  if (vaultMidnightTimer) clearTimeout(vaultMidnightTimer);
  vaultRoot = root;
  if (unlockDate <= todayISO()) return;
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 50);
  vaultMidnightTimer = window.setTimeout(() => {
    if (vaultRoot?.querySelector('[data-vault-screen]')) renderWishVault(vaultRoot);
  }, Math.max(1000, nextMidnight.getTime() - Date.now()));
  if (!vaultVisibilityBound) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && vaultRoot?.querySelector('[data-vault-screen]')) renderWishVault(vaultRoot);
    });
    vaultVisibilityBound = true;
  }
}
function renderVaultDateForm(unlockDate) {
  return `<form id="vault-date-form" class="vault-date-form"><label for="vault-unlock-date">잠금 해제 날짜</label><div class="vault-date-controls"><input id="vault-unlock-date" name="unlockDate" type="date" required value="${esc(unlockDate)}"><button class="btn btn-secondary" type="submit">날짜 변경</button></div></form>`;
}
function renderLockedChest(daysLeft, unlockDate) {
  const countdown = daysLeft === 0 ? '오늘 잠금 해제' : `D-${daysLeft}`;
  return `<div class="vault-lock-screen">
    <div class="vault-chest-scene" aria-label="잠긴 보물상자"><div class="vault-chest"><div class="vault-chest-lid"></div><div class="vault-chest-body"><span class="vault-chest-band"></span><span class="vault-chest-lock"></span></div></div></div>
    <div class="vault-countdown">${countdown}</div>
    <p class="vault-release-date">성적 발표일 · ${fmtDate(unlockDate)}</p>
    ${renderVaultDateForm(unlockDate)}
  </div>`;
}
function renderUnlockedChest(unlockDate) {
  return `<div class="vault-unlocked-banner"><div class="vault-chest-scene" aria-label="열린 보물상자"><div class="vault-chest is-open"><div class="vault-chest-lid"></div><div class="vault-chest-body"><span class="vault-chest-band"></span><span class="vault-chest-lock"></span></div></div></div><div><p class="eyebrow">THE DAY HAS COME</p><h2>보물상자가 열렸습니다.</h2><p>그동안 미뤄 둔 작은 행복을 하나씩 꺼내 보세요.</p></div></div>${renderVaultDateForm(unlockDate)}`;
}

export async function renderWishVault(root) {
  const configuredUnlockDate = await getSetting('wishVaultUnlockDate', DEFAULT_UNLOCK_DATE);
  const unlockDate = isISODate(configuredUnlockDate) ? configuredUnlockDate : DEFAULT_UNLOCK_DATE;
  const today = todayISO();
  const daysLeft = Math.max(0, dateDiff(today, unlockDate));
  const unlocked = unlockDate <= today;
  root.dataset.vaultUnlocked = unlocked ? 'true' : 'false';
  if (!unlocked) {
    armVaultUnlockCheck(root, unlockDate);
    root.innerHTML = `${pageHeading('보물상자', '수능 성적 발표일까지 하고 싶은 일을 안전하게 보관합니다.')}
      <section class="card vault-card" data-vault-screen>
        ${renderLockedChest(daysLeft, unlockDate)}
        <div class="vault-entry-divider"></div>
        <form id="vault-wish-form" class="vault-entry-form">
          <label for="vault-wish-input">보물상자에 맡길 소원</label>
          <textarea id="vault-wish-input" name="wish" maxlength="500" rows="3" placeholder="성적 발표일 이후에 하고 싶은 일을 적어 보세요." required></textarea>
          <button class="btn btn-primary" type="submit">보관하기</button>
        </form>
        <p class="vault-privacy-note">잠금 기간에는 저장된 소원 내용을 화면에 표시하지 않습니다. 백업 파일에는 암호화 키도 포함되므로 파일을 안전하게 보관하세요.</p>
      </section>`;
  } else {
    if (vaultMidnightTimer) clearTimeout(vaultMidnightTimer);
    root.innerHTML = `${pageHeading('보물상자', '잠금이 해제되었습니다. 보관했던 소원을 확인해 보세요.')}
      <section class="card vault-card is-unlocked" data-vault-screen>
        ${renderUnlockedChest(unlockDate)}
        <div id="vault-wish-list" class="vault-wish-list">불러오는 중…</div>
      </section>`;
    try {
      const wishes = await decryptWishes();
      const list = $('#vault-wish-list', root);
      if (!list) return;
      list.innerHTML = wishes.length ? `<div class="card-head"><div><h3>보관한 소원</h3><p>총 ${wishes.length}개 · 완료한 항목은 체크해 두세요.</p></div></div>${wishes.map(wish => `<label class="vault-wish-row ${wish.completed ? 'is-complete' : ''}"><input type="checkbox" data-vault-wish="${esc(wish.id)}" ${wish.completed ? 'checked' : ''}><span>${esc(wish.text)}</span><small>${wish.completed ? '완료' : '미완료'}</small></label>`).join('')}` : emptyState('아직 보관한 소원이 없습니다', '잠금 기간에 보관한 소원이 이곳에 표시됩니다.');
      list.querySelectorAll('[data-vault-wish]').forEach(input => input.addEventListener('change', async () => {
        const current = await decryptWishes();
        const item = current.find(wish => wish.id === input.dataset.vaultWish);
        if (!item) return;
        item.completed = input.checked;
        await encryptWishes(current);
        await renderWishVault(root);
      }));
    } catch (error) {
      console.error(error);
      const list = $('#vault-wish-list', root);
      if (list) list.innerHTML = `<div class="muted-box">${esc(error.message || '보관한 소원을 복호화하지 못했습니다.')}</div>`;
    }
  }

  $('#vault-date-form', root)?.addEventListener('submit', async event => {
    event.preventDefault();
    const value = $('#vault-unlock-date', root).value;
    if (!value) { notify('잠금 해제 날짜를 선택해 주세요.', 'warning'); return; }
    await setSetting('wishVaultUnlockDate', value);
    notify(value <= todayISO() ? '잠금이 해제되었습니다.' : '잠금 해제 날짜를 변경했습니다.');
    await renderWishVault(root);
  });
  $('#vault-wish-form', root)?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = $('#vault-wish-input', root);
    const text = String(input?.value || '').trim();
    if (!text) { notify('보관할 소원을 입력해 주세요.', 'warning'); return; }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      // 저장소에는 AES-GCM 암호문만 기록하고, 평문은 보관하지 않습니다.
      const wishes = await decryptWishes();
      wishes.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        text, completed: false, createdAt: new Date().toISOString()
      });
      await encryptWishes(wishes);
      input.value = '';
      $('.vault-chest', root)?.classList.add('is-absorbing');
      notify('소원을 보물상자에 보관했습니다.');
      window.setTimeout(() => {
        if (root.querySelector('#vault-wish-form')) renderWishVault(root);
      }, 720);
    } catch (error) {
      console.error(error);
      notify(error.message || '소원을 보관하지 못했습니다.', 'error');
      button.disabled = false;
    }
  });
}
