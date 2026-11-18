import { getSetting, setSetting } from '../db.js';
import { backupPlan, fmtMin } from './logic.js';

const SNOOZE_KEY = 'backupReminderSnoozeDate';
let backupPrompting = false;

export async function readBackupPlan(today, isoDate) {
  const last = await getSetting('lastBackupAt', null);
  const lastDate = last ? isoDate(new Date(last)) : null;
  return { ...backupPlan(lastDate, today), lastAt: last };
}

export function renderBackupCard(plan) {
  const status = !plan.lastDate ? '아직 백업 기록이 없습니다' : plan.due ? '백업 기한이 지났습니다' : '백업 기한 안입니다';
  return `<article class="card v190-backup-card">
    <div class="card-head"><div><h3>7일 백업 알림</h3><p>파일은 자동으로 클라우드에 올라가지 않습니다. 이 화면에서 직접 저장하세요.</p></div><span class="pill ${plan.due ? 'gold' : 'green'}">${status}</span></div>
    <div class="status-row"><span>마지막 백업</span><strong>${plan.lastDate || '없음'}</strong></div>
    <div class="status-row"><span>다음 백업 예정일</span><strong>${plan.nextDate}</strong></div>
    <div class="status-row"><span>지난 일수</span><strong>${plan.daysSince == null ? '—' : `${plan.daysSince}일`}</strong></div>
    <div class="v190-actions"><button type="button" class="btn btn-primary" data-v190="backup-now">지금 백업 파일 저장</button><button type="button" class="btn btn-ghost" data-view="backup">백업 화면</button></div>
  </article>`;
}

export async function maybeBackupDialog({ today, isoDate, toast, exportBackup }) {
  if (backupPrompting) return 'busy';
  const plan = await readBackupPlan(today, isoDate);
  if (!plan.due) return 'ok';
  const snooze = await getSetting(SNOOZE_KEY, null);
  if (snooze === today) return 'snoozed';
  backupPrompting = true;
  try {
    const choice = await openNotice({
      eyebrow: 'BACKUP',
      title: '7일 백업 시점입니다',
      body: `<p>마지막 백업: <strong>${plan.lastDate || '아직 없음'}</strong></p><p>다음 예정일: <strong>${plan.nextDate}</strong></p><p class="subtle">JSON 파일을 파일 앱이나 iCloud Drive에 직접 저장해 주세요. 앱이 꺼져 있는 동안 임의로 클라우드에 저장하지는 않습니다.</p>`,
      primary: '백업 파일 저장',
      later: '오늘은 나중에'
    });
    if (choice === 'primary') {
      await exportBackup();
      return 'exported';
    }
    await setSetting(SNOOZE_KEY, today);
    toast('오늘 자정까지 백업 알림을 숨깁니다. 백업 화면에서 언제든 저장할 수 있습니다.', 'warning');
    return 'later';
  } finally {
    backupPrompting = false;
  }
}

export function openNotice({ eyebrow, title, body, primary, later }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'v190-dialog';
    dialog.innerHTML = `<form method="dialog" class="modal-card"><div class="modal-head"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><button type="button" class="icon-btn" data-act="close" aria-label="닫기">×</button></div><div class="modal-content">${body}</div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-act="later">${later}</button><button type="button" class="btn btn-primary" data-act="primary">${primary}</button></div></form>`;
    document.body.append(dialog);
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.querySelector('[data-act="primary"]').addEventListener('click', () => finish('primary'));
    dialog.querySelector('[data-act="later"]').addEventListener('click', () => finish('later'));
    dialog.querySelector('[data-act="close"]').addEventListener('click', () => finish('later'));
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      finish('later');
    });
    dialog.showModal();
  });
}

export function fmtBackupAge(plan) {
  return plan.daysSince == null ? '백업 전' : `${fmtMin(plan.daysSince * 24 * 60)} 경과`;
}
