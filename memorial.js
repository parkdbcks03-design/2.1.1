/*
 * 수험생활 회고 모듈
 * 성적표 발표일이 지나고, 사용자가 확인 절차를 마친 뒤에만 app.js가 이 파일을 불러옵니다.
 * 그 전에는 메뉴·버튼·문구 어디에도 나타나지 않습니다.
 */
const W = 1280, H = 720;
const FONT = '-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
const INK = '#171717', MID = '#6b6b6b', SOFT = '#a8a8a4', LINE = '#d9d9d4', BG = '#f5f5f1';
const SUBJECTS = ['국어', '수학', '영어', '통합사회', '통합과학', '한국사'];
const GRAYS = ['#171717', '#4a4a4a', '#707070', '#8f8f8f', '#adadad', '#c4c4c0'];
const DASH = [[], [12, 6], [3, 6], [14, 6, 3, 6], [], [8, 8]];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t), 3);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ymd = iso => { const [y, m, d] = String(iso).split('-').map(Number); return `${y}년 ${m}월 ${d}일`; };
const dur = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`; };
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

/* ---------- 그리기 도구 ---------- */
function T(c, s, x, y, o = {}) {
  const { size = 32, weight = 500, color = INK, align = 'left', alpha = 1, sp = 0 } = o;
  c.save(); c.globalAlpha *= clamp(alpha); c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color;
  c.textAlign = align; c.textBaseline = 'alphabetic';
  if (sp && 'letterSpacing' in c) c.letterSpacing = sp + 'px';
  c.fillText(String(s), x, y); c.restore();
}
function wrap(c, s, x, y, maxW, lh, o = {}) {
  const { size = 34, weight = 500, color = INK, align = 'center', maxLines = 5, alpha = 1 } = o;
  c.save(); c.font = `${weight} ${size}px ${FONT}`;
  const lines = []; let line = '';
  for (const ch of String(s)) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const t = line + ch;
    if (c.measureText(t).width > maxW && line) { lines.push(line); line = ch.trim() === '' ? '' : ch; } else line = t;
  }
  if (line) lines.push(line);
  c.restore();
  lines.slice(0, maxLines).forEach((l, i) => {
    const cut = i === maxLines - 1 && lines.length > maxLines;
    T(c, cut ? l.slice(0, -1) + '…' : l, x, y + i * lh, { size, weight, color, align, alpha });
  });
  return Math.min(lines.length, maxLines);
}
function rule(c, x1, y1, x2, y2, color = LINE, w = 1) {
  c.save(); c.strokeStyle = color; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
}
function head(c, eyebrow, title) {
  T(c, eyebrow, 100, 120, { size: 20, color: MID, sp: 4, weight: 600 });
  T(c, title, 100, 190, { size: 52, weight: 700 });
}

/* ---------- 장면 구성: 실제 기록에서만 만든다 ---------- */
export function buildScenes(raw) {
  const study = (raw.study || []).filter(e => e.date);
  const major = (raw.major || []).filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
  const books = raw.books || [];
  const diaries = (raw.diaries || []).filter(e => e.date);
  const exams = raw.exams || [];
  const streak = raw.streak || { current: 0, best: 0, days: new Set() };

  const allDates = [...study, ...diaries, ...major, ...exams].map(e => e.date).filter(Boolean).sort();
  if (!allDates.length) return [];
  const first = allDates[0], last = allDates[allDates.length - 1];
  const spanDays = Math.round((Date.parse(last + 'T00:00:00Z') - Date.parse(first + 'T00:00:00Z')) / 86400000) + 1;
  const total = study.reduce((s, e) => s + num(e.minutes), 0);
  const dayMap = {}; study.forEach(e => { dayMap[e.date] = (dayMap[e.date] || 0) + num(e.minutes); });
  const studyDays = Object.keys(dayMap).length;

  // 월별 합계 (기록 사이의 빈 달은 0으로 채움)
  const monthMap = {}; study.forEach(e => { const k = e.date.slice(0, 7); monthMap[k] = (monthMap[k] || 0) + num(e.minutes); });
  const keys = Object.keys(monthMap).sort(); const months = [];
  if (keys.length) {
    let [y, m] = keys[0].split('-').map(Number); const [ey, em] = keys[keys.length - 1].split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const k = `${y}-${String(m).padStart(2, '0')}`; months.push({ k, m, v: monthMap[k] || 0 });
      m++; if (m > 12) { m = 1; y++; }
    }
  }

  const S = [];

  S.push({ dur: 5.5, draw(c, p) {
    T(c, '2028 수험생활', W / 2, 290, { size: 26, color: MID, align: 'center', sp: 6, weight: 600 });
    T(c, '기록으로 돌아보는 1년', W / 2, 380, { size: 70, weight: 700, align: 'center', alpha: ease(p / .35) });
    rule(c, W / 2 - 60, 430, W / 2 + 60, 430, INK, 2);
    T(c, `${ymd(first)} – ${ymd(last)}`, W / 2, 490, { size: 26, color: MID, align: 'center', alpha: ease((p - .25) / .3) });
  } });

  const fe = study.slice().sort((a, b) => (a.date + (a.createdAt || '')).localeCompare(b.date + (b.createdAt || '')))[0];
  if (fe) S.push({ dur: 5.5, draw(c, p) {
    head(c, 'THE BEGINNING', '첫 공부 기록');
    T(c, ymd(fe.date), W / 2, 380, { size: 64, weight: 700, align: 'center', alpha: ease(p / .3) });
    const desc = [fe.subject, clean(fe.content)].filter(Boolean).join(' · ') || '첫 기록';
    wrap(c, desc, W / 2, 470, 900, 44, { size: 30, color: MID, maxLines: 2, alpha: ease((p - .2) / .3) });
    if (num(fe.minutes)) T(c, dur(num(fe.minutes)), W / 2, 580, { size: 28, color: SOFT, align: 'center', alpha: ease((p - .4) / .3) });
  } });

  if (total > 0) S.push({ dur: 6, draw(c, p) {
    head(c, 'TOTAL', '함께 쌓아 온 시간');
    const k = ease(p / .5);
    T(c, Math.round(total / 60 * k).toLocaleString('ko-KR'), 700, 440, { size: 150, weight: 800, align: 'right' });
    T(c, '시간', 725, 440, { size: 44, color: MID });
    const cols = [['공부한 날', `${studyDays}일`], ['공부한 날 기준 하루 평균', dur(total / Math.max(1, studyDays))], ['기록 기간', `${spanDays}일`]];
    cols.forEach(([l, v], i) => {
      const a = ease((p - .3 - i * .1) / .25), x = 240 + i * 400;
      T(c, l, x, 560, { size: 20, color: MID, align: 'center', alpha: a }); T(c, v, x, 612, { size: 38, weight: 700, align: 'center', alpha: a });
    });
  } });

  if (months.length) S.push({ dur: 7, draw(c, p) {
    head(c, 'MONTH BY MONTH', '월별 공부 시간');
    const n = months.length, gx = 120, gw = 1040, base = 620, top = 270, max = Math.max(...months.map(m => m.v), 1);
    const bw = Math.min(72, gw / n * .6), peak = months.reduce((a, b) => (b.v > a.v ? b : a));
    rule(c, gx, base, gx + gw, base, LINE, 2);
    months.forEach((m, i) => {
      const x = gx + gw * (i + .5) / n, k = ease((p - .08) / .5 - i * .015), h = (base - top) * m.v / max * k;
      c.save(); c.fillStyle = m === peak ? INK : '#9a9a96'; c.fillRect(x - bw / 2, base - h, bw, h); c.restore();
      T(c, `${m.m}월`, x, base + 34, { size: n > 14 ? 16 : 20, color: MID, align: 'center' });
      if (k > .9 && m.v > 0) T(c, `${Math.round(m.v / 60)}h`, x, base - h - 12, { size: n > 14 ? 15 : 20, weight: 700, align: 'center' });
    });
  } });

  if (months.length >= 2) {
    const deltas = months.slice(1).map((m, i) => ({ from: months[i], to: m, d: m.v - months[i].v }));
    const up = deltas.reduce((a, b) => (b.d > a.d ? b : a)), down = deltas.reduce((a, b) => (b.d < a.d ? b : a));
    let best = null, run = null;
    for (const x of deltas) {
      const flat = x.from.v > 0 && Math.abs(x.d) / x.from.v <= .08;
      if (flat) { run = run ? { ...run, e: x.to.m, n: run.n + 1 } : { s: x.from.m, e: x.to.m, n: 1 }; if (!best || run.n > best.n) best = run; } else run = null;
    }
    const rows = [];
    if (up.d > 0) rows.push(['가장 크게 늘어난 달', `${up.from.m}월 → ${up.to.m}월`, `+${dur(up.d)}`]);
    if (down.d < 0) rows.push(['가장 크게 줄어든 달', `${down.from.m}월 → ${down.to.m}월`, `−${dur(-down.d)}`]);
    if (best) rows.push(['큰 변화 없이 이어진 시기', `${best.s}월 – ${best.e}월`, '']);
    if (rows.length) S.push({ dur: 6.5, draw(c, p) {
      head(c, 'UPS AND DOWNS', '오르내린 시간들');
      rows.forEach(([l, v, d], i) => {
        const a = ease((p - .1 - i * .18) / .25), y = 330 + i * 130;
        rule(c, 100, y - 50, 1180, y - 50, LINE, 1);
        T(c, l, 100, y - 12, { size: 22, color: MID, alpha: a }); T(c, v, 100, y + 38, { size: 46, weight: 700, alpha: a });
        if (d) T(c, d, 1180, y + 38, { size: 40, weight: 700, align: 'right', alpha: a });
      });
    } });
  }

  // 주요 모의고사 성적
  const usable = major.filter(e => (e.results || []).some(r => r.score != null && r.score !== ''));
  if (usable.length >= 2) {
    const series = SUBJECTS.map(s => usable.map(e => { const r = (e.results || []).find(x => x.subject === s); return r && r.score != null && r.score !== '' ? num(r.score) : null; }));
    const vals = series.flat().filter(v => v !== null);
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10), hi = Math.ceil((Math.max(...vals) + 5) / 10) * 10;
    S.push({ dur: 8, draw(c, p) {
      head(c, 'SCORES', '주요 모의고사 성적 변화');
      const x0 = 140, x1 = 960, y0 = 600, y1 = 270, n = usable.length;
      const X = i => x0 + (x1 - x0) * i / (n - 1), Y = v => y0 - (y0 - y1) * (v - lo) / Math.max(1, hi - lo);
      for (let g = 0; g <= 4; g++) { const y = y0 - (y0 - y1) * g / 4; rule(c, x0, y, x1, y, LINE, 1); T(c, Math.round(lo + (hi - lo) * g / 4), x0 - 14, y + 6, { size: 16, color: MID, align: 'right' }); }
      usable.forEach((e, i) => T(c, e.date.slice(5).replace('-', '/'), X(i), y0 + 32, { size: 16, color: MID, align: 'center' }));
      c.save(); c.beginPath(); c.rect(0, 0, x0 - 20 + (x1 - x0 + 60) * ease((p - .08) / .6), H); c.clip();
      series.forEach((ser, si) => {
        c.strokeStyle = GRAYS[si]; c.fillStyle = GRAYS[si]; c.lineWidth = 3; c.setLineDash(DASH[si]); c.beginPath(); let pen = false;
        ser.forEach((v, i) => { if (v === null) { pen = false; return; } if (!pen) { c.moveTo(X(i), Y(v)); pen = true; } else c.lineTo(X(i), Y(v)); });
        c.stroke(); c.setLineDash([]);
        ser.forEach((v, i) => { if (v !== null) { c.beginPath(); c.arc(X(i), Y(v), 5, 0, Math.PI * 2); c.fill(); } });
      });
      c.restore();
      SUBJECTS.forEach((s, i) => {
        const y = 300 + i * 46, a = ease((p - .4 - i * .04) / .2);
        c.save(); c.globalAlpha *= clamp(a); c.strokeStyle = GRAYS[i]; c.lineWidth = 3; c.setLineDash(DASH[i]); c.beginPath(); c.moveTo(1010, y - 7); c.lineTo(1060, y - 7); c.stroke(); c.restore();
        T(c, s, 1076, y, { size: 22, alpha: a });
      });
    } });

    const changes = SUBJECTS.map((s, i) => { const v = series[i].filter(x => x !== null); return v.length >= 2 ? { s, a: v[0], b: v[v.length - 1] } : null; }).filter(Boolean);
    if (changes.length) S.push({ dur: 6.5, draw(c, p) {
      head(c, 'BY SUBJECT', '과목별 첫 성적에서 지금까지');
      changes.forEach((x, i) => {
        const a = ease((p - .1 - i * .1) / .25), y = 300 + i * 78, d = x.b - x.a;
        rule(c, 100, y + 26, 1180, y + 26, LINE, 1);
        T(c, x.s, 100, y, { size: 36, weight: 700, alpha: a }); T(c, `${x.a} → ${x.b}`, 700, y, { size: 36, align: 'center', color: MID, alpha: a });
        T(c, `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(Math.round(d * 10) / 10)}`, 1180, y, { size: 40, weight: 800, align: 'right', alpha: a });
      });
    } });
  }

  // 기억할 만한 일기
  const text = d => { const b = clean(d.body); if (b.length >= 15 && b !== '오늘 하루는...') return b; const s = clean(d.best); return s.length >= 8 ? s : ''; };
  const cand = diaries.map(d => ({ d, t: text(d) })).filter(x => x.t).sort((a, b) => a.d.date.localeCompare(b.d.date));
  if (cand.length) {
    const longest = cand.reduce((a, b) => (b.t.length > a.t.length ? b : a));
    const picks = [...new Set([cand[0], longest, cand[cand.length - 1]])];
    picks.forEach(q => S.push({ dur: 7, draw(c, p) {
      T(c, '그날의 기록', W / 2, 130, { size: 20, color: MID, align: 'center', sp: 4, weight: 600 });
      T(c, '“', W / 2, 270, { size: 120, color: LINE, align: 'center', alpha: ease(p / .2) });
      wrap(c, q.t.length > 120 ? q.t.slice(0, 120) + '…' : q.t, W / 2, 350, 940, 58, { size: 38, maxLines: 5, alpha: ease((p - .1) / .3) });
      T(c, `${ymd(q.d.date)}${q.d.mood ? ` · ${q.d.mood}` : ''}`, W / 2, 640, { size: 24, color: MID, align: 'center', alpha: ease((p - .4) / .3) });
    } }));
  }

  if (books.length) {
    const done = books.filter(b => b.status === '완료').length, reads = books.reduce((s, b) => s + ((b.readings || []).length), 0);
    const list = books.slice().sort((a, b) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject)).slice(0, 8);
    S.push({ dur: 6.5, draw(c, p) {
      head(c, 'BOOKSHELF', '함께한 교재들');
      T(c, `${books.length}권`, 100, 330, { size: 72, weight: 800, alpha: ease(p / .3) });
      T(c, `완료 ${done}권${reads ? ` · 회독 기록 ${reads}회` : ''}`, 280, 330, { size: 28, color: MID, alpha: ease(p / .3) });
      list.forEach((b, i) => {
        const col = i % 2, row = Math.floor(i / 2), a = ease((p - .2 - i * .06) / .2);
        T(c, `${b.subject || ''}`, 100 + col * 540, 430 + row * 62, { size: 20, color: MID, alpha: a });
        T(c, clean(b.name).slice(0, 18), 200 + col * 540, 430 + row * 62, { size: 28, weight: 600, alpha: a });
      });
    } });
  }

  if (streak.best > 0) S.push({ dur: 5.5, draw(c, p) {
    head(c, 'STREAK', '이어 온 기록');
    T(c, `${Math.round(streak.best * ease(p / .5))}`, 640, 440, { size: 170, weight: 800, align: 'right' });
    T(c, '일 연속', 670, 440, { size: 44, color: MID });
    T(c, `가장 길게 이어진 기록 · 기록한 날 ${streak.days ? streak.days.size : studyDays}일`, W / 2, 560, { size: 26, color: MID, align: 'center', alpha: ease((p - .3) / .3) });
  } });

  S.push({ dur: 9, dark: true, hold: true, draw(c, p) {
    T(c, `${spanDays}일의 기록`, W / 2, 300, { size: 64, weight: 700, color: BG, align: 'center', alpha: ease(p / .25) });
    wrap(c, '숫자로 다 담기지 않는 날들까지,\n모두 여기에 남아 있습니다.', W / 2, 400, 900, 52, { size: 32, color: '#bdbdb8', alpha: ease((p - .25) / .25), maxLines: 2 });
    T(c, '수고했어요.', W / 2, 590, { size: 54, weight: 700, color: BG, align: 'center', alpha: ease((p - .55) / .25) });
  } });
  return S;
}

export function drawFrame(c, scene, p) {
  c.globalAlpha = 1; c.fillStyle = scene.dark ? INK : BG; c.fillRect(0, 0, W, H);
  c.globalAlpha = clamp(Math.min(p / .1, scene.hold ? 1 : (1 - p) / .1)); scene.draw(c, clamp(p)); c.globalAlpha = 1;
}

async function collect(api) {
  const [study, major, books, diaries, exams] = await Promise.all(['studyEntries', 'majorExams', 'books', 'diaries', 'exams'].map(n => api.getAll(n)));
  let streak = null; try { streak = await api.getStreak(); } catch { /* optional */ }
  return buildScenes({ study, major, books, diaries, exams, streak });
}

/* ---------- 재생기 + 영상 저장 ---------- */
export async function openMemorial(api) {
  if (document.getElementById('memorial-player')) return;
  const scenes = await collect(api);
  const el = document.createElement('div'); el.id = 'memorial-player';
  el.style.cssText = `position:fixed;inset:0;z-index:10000;background:${BG};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:12px;font-family:${FONT}`;
  if (!scenes.length) {
    el.innerHTML = '<div style="text-align:center"><p>회고를 만들 기록이 아직 충분하지 않습니다.</p><button class="btn btn-secondary" id="mp-close">닫기</button></div>';
    document.body.appendChild(el); el.querySelector('#mp-close').onclick = () => el.remove(); return;
  }
  el.innerHTML = `<canvas width="${W}" height="${H}" style="width:min(100%,calc((100dvh - 110px) * 16 / 9));aspect-ratio:16/9;background:${BG};border:1px solid ${LINE};border-radius:12px"></canvas>
    <div id="mp-status" style="min-height:20px;font-size:13px;color:${MID}"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button class="btn btn-secondary" id="mp-prev">◀ 이전</button><button class="btn btn-secondary" id="mp-play">일시정지</button>
      <button class="btn btn-secondary" id="mp-next">다음 ▶</button><button class="btn btn-primary" id="mp-save">영상으로 저장</button>
      <button class="btn btn-ghost" id="mp-close">닫기</button></div>`;
  document.body.appendChild(el);
  const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d'), status = el.querySelector('#mp-status'), playBtn = el.querySelector('#mp-play');
  const starts = []; let acc = 0; scenes.forEach(s => { starts.push(acc); acc += s.dur * 1000; }); const total = acc;
  const drawAt = (c, ms) => {
    let i = scenes.length - 1; for (let k = 0; k < scenes.length; k++) if (ms < starts[k] + scenes[k].dur * 1000) { i = k; break; }
    drawFrame(c, scenes[i], (ms - starts[i]) / (scenes[i].dur * 1000));
  };
  let ms = 0, playing = true, recording = false, last = performance.now(), raf = 0;
  const loop = now => {
    const dt = Math.min(100, now - last); last = now;
    if (playing && !recording) { ms = Math.min(total, ms + dt); if (ms >= total) { playing = false; playBtn.textContent = '처음부터'; } }
    if (!recording) drawAt(ctx, ms);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const close = () => { cancelAnimationFrame(raf); el.remove(); };
  const sceneIndex = () => { let i = 0; starts.forEach((s, k) => { if (ms >= s) i = k; }); return i; };
  el.querySelector('#mp-close').onclick = () => { if (!recording || confirm('영상 저장을 중단하고 닫을까요?')) { recording = false; close(); } };
  playBtn.onclick = () => { if (recording) return; if (ms >= total) { ms = 0; playing = true; } else playing = !playing; playBtn.textContent = playing ? '일시정지' : '재생'; };
  canvas.onclick = () => playBtn.click();
  el.querySelector('#mp-next').onclick = () => { if (recording) return; const i = sceneIndex(); ms = i + 1 < scenes.length ? starts[i + 1] : total - 1; };
  el.querySelector('#mp-prev').onclick = () => { if (recording) return; const i = sceneIndex(); ms = ms - starts[i] > 1500 || i === 0 ? starts[i] : starts[i - 1]; };

  el.querySelector('#mp-save').onclick = async () => {
    if (recording) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { api.toast('이 브라우저에서는 영상 저장을 지원하지 않습니다. 슬라이드로 감상해 주세요.', 'warning'); return; }
    const mime = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
    if (!mime) { api.toast('영상 형식을 만들 수 없는 환경입니다. 슬라이드로 감상해 주세요.', 'warning'); return; }
    if (!confirm(`영상을 만드는 데 약 ${Math.ceil(total / 1000)}초가 걸립니다. 그동안 화면을 켜 둔 채 이 화면에 머물러 주세요. 시작할까요?`)) return;
    recording = true;
    let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
    try {
      const rc = document.createElement('canvas'); rc.width = W; rc.height = H; const rctx = rc.getContext('2d');
      const rec = new MediaRecorder(rc.captureStream(30), { mimeType: mime, videoBitsPerSecond: 5000000 });
      const chunks = []; rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { rec.onstop = res; });
      drawAt(rctx, 0); rec.start(1000);
      const t0 = performance.now(), end = total + 1500;
      await new Promise(resolve => {
        const step = now => {
          if (!recording) return resolve();
          const el2 = now - t0; const t = Math.min(el2, total - 1);
          drawAt(rctx, t); drawAt(ctx, t); status.textContent = `영상 만드는 중… ${Math.round(Math.min(el2 / end, 1) * 100)}%`;
          if (el2 >= end) resolve(); else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
      const finished = recording; rec.stop(); await stopped;
      if (finished) {
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        api.saveBlob(blob, `수험생활-회고-${api.todayISO()}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
        status.textContent = '영상을 저장했습니다. 파일 앱의 다운로드 폴더를 확인해 주세요.';
      }
    } catch (err) {
      console.error(err); status.textContent = ''; api.toast('영상 저장에 실패했습니다. 슬라이드로는 계속 볼 수 있습니다.', 'error');
    } finally { recording = false; try { lock?.release?.(); } catch { /* ignore */ } last = performance.now(); }
  };
}

/* ---------- 공개 절차 ---------- */
function addNav(api) {
  if (document.getElementById('memorial-nav')) return;
  const nav = document.getElementById('main-nav'); if (!nav) return;
  const b = document.createElement('button'); b.className = 'nav-item'; b.id = 'memorial-nav';
  b.innerHTML = '<span class="nav-icon">★</span>수험생활 회고';
  b.addEventListener('click', () => { document.getElementById('sidebar')?.classList.remove('open'); openMemorial(api); });
  nav.appendChild(b);
}

function showGate(api) {
  if (document.getElementById('memorial-gate')) return;
  const el = document.createElement('div'); el.id = 'memorial-gate';
  el.style.cssText = `position:fixed;inset:0;z-index:10000;background:${BG};display:flex;align-items:center;justify-content:center;padding:24px;font-family:${FONT}`;
  el.innerHTML = `<div style="max-width:520px;width:100%;text-align:center"><p style="color:${MID};letter-spacing:3px;font-size:12px;margin:0">SCORE REPORT DAY</p>
    <h2 style="font-size:28px;margin:14px 0">수능 성적표 발표일이 되었어요.</h2>
    <p id="g-sub" style="color:${MID};line-height:1.7;margin:0">실제 성적표를 확인하셨나요?</p>
    <div id="g-btns" style="display:flex;gap:10px;justify-content:center;margin-top:28px"></div></div>`;
  document.body.appendChild(el);
  const sub = el.querySelector('#g-sub'), btns = el.querySelector('#g-btns');
  const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.onclick = fn; btns.appendChild(b); };
  const stage1 = () => {
    sub.textContent = '실제 성적표를 확인하셨나요?'; btns.innerHTML = '';
    mk('아직이에요', 'btn-secondary', () => el.remove());
    mk('확인했어요', 'btn-primary', stage2);
  };
  const stage2 = () => {
    sub.textContent = '지난 1년의 기록으로 만든 회고를 지금 열어볼까요?'; btns.innerHTML = '';
    mk('나중에', 'btn-secondary', () => el.remove());
    mk('열어보기', 'btn-primary', async () => {
      const now = new Date().toISOString();
      try { await api.setSetting('memorialState', { unlocked: true, checkedAt: now, confirmedAt: now }); }
      catch (e) { api.toast('저장에 실패했습니다. 다시 시도해 주세요.', 'error'); return; }
      el.remove(); addNav(api); openMemorial(api);
    });
  };
  stage1();
}

export async function initMemorial(api) {
  const state = await api.getSetting('memorialState', null);
  if (state && state.unlocked) { addNav(api); return; }
  const events = await api.getAll('events');
  const released = events.some(e => e.type === '성적표 발표일' && e.date && e.date <= api.todayISO());
  if (released) showGate(api);
}
