import { addIsoDays, grassLevel, fmtMin } from './logic.js';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];

function startOfWeekMonday(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const offset = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - offset);
  const p = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function recentGrassDays(today, weeks = 12) {
  const start = startOfWeekMonday(today);
  const first = addIsoDays(start, -(weeks - 1) * 7);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) days.push(addIsoDays(first, i));
  return { first, end: days[days.length - 1], days, weeks };
}

export function renderGrass(agg, today, selected) {
  const { days, weeks } = recentGrassDays(today, 12);
  const cells = days.map(date => {
    const minutes = agg.days.get(date)?.minutes || 0;
    const level = date > today ? 0 : grassLevel(minutes);
    const future = date > today;
    return `<button type="button" class="grass-cell lv-${level}${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}${future ? ' is-future' : ''}" data-v190="grass-day" data-date="${date}" ${future ? 'disabled' : ''} aria-label="${date} ${future ? '아직 오지 않은 날' : fmtMin(minutes)}"></button>`;
  }).join('');
  const columns = Array.from({ length: weeks }, (_, index) => `<span>${index === weeks - 1 ? '이번' : ''}</span>`).join('');
  return `<div class="grass-board" style="--grass-weeks:${weeks}">
    <div class="grass-scroll">
      <div class="grass-plot">
        <div class="grass-cols" aria-hidden="true">${columns}</div>
        <div class="grass-body">
          <div class="grass-dow" aria-hidden="true">${WEEKDAYS.map(day => `<span>${day}</span>`).join('')}</div>
          <div class="grass-grid">${cells}</div>
        </div>
      </div>
    </div>
    <div class="grass-legend" aria-hidden="true"><span>0분</span>${[0, 1, 2, 3, 4, 5].map(level => `<i class="grass-cell lv-${level}"></i>`).join('')}<span>360분+</span></div>
  </div>`;
}

export function renderGrassDetail(agg, date) {
  if (!date) return '';
  const row = agg.days.get(date);
  const entries = row?.entries || [];
  const sourceLabel = source => source === 'subject-timer' ? '공부 타이머' : source === 'timer' ? '실전 타이머' : '공부 기록';
  const list = entries.length
    ? entries.map(entry => `<div class="record-item"><div class="record-main"><strong>${escapeHtml(entry.subject || '과목')} · ${escapeHtml(entry.content || '내용 없음')}</strong><small>${sourceLabel(entry.source)} · ${fmtMin(entry.minutes || 0)}</small></div></div>`).join('')
    : '<div class="empty-state"><strong>이 날의 개별 공부 기록이 없습니다</strong>하루 공부 시간만 입력된 날일 수 있습니다.</div>';
  const extra = Math.max(0, (row?.manualMinutes || 0) - (row?.entryMinutes || 0));
  return `<div class="grass-detail"><div class="card-head"><div><h3>${date}</h3><p>하루 공부 시간 ${fmtMin(row?.minutes || 0)}</p></div><span class="pill">잔디 ${grassLevel(row?.minutes || 0)}단계</span></div>${extra ? `<p class="subtle">직접 입력한 하루 총량이 개별 기록보다 ${fmtMin(extra)} 많아, 그 차이만 한 번 더 반영했습니다.</p>` : ''}${list}</div>`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '\u0026amp;', '<': '\u0026lt;', '>': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[ch]));
}
