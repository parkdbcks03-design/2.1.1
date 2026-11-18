import {
  openDB, getAll, getById, getDateRange, put, remove, getSetting, setSetting,
  addAudit, storageStatus, createBackupPayload, restoreDatabase, DB_NAME, DB_VERSION,
  restoreFromTrash, purgeTrash
} from './db.js';
import { renderPeriodTasks, renderWishVault } from './features.js';
import { resolveOwl, openOwlDex, owlSrc, kstToday, msUntilKstMidnight } from './owls.js';
import { createV190 } from './modules/mount.js';

const SUBJECTS = ['국어', '수학', '영어', '통합사회', '통합과학', '한국사'];

const MOCK_TIMES = {
  '국어': 80,
  '수학': 100,
  '영어': 70,
  '한국사': 30,
  '통합사회': 40,
  '통합과학': 40
};

const FULL_EXAM_STEPS = [
  { label: '국어', subject: '국어', kind: 'subject', minutes: 80 },
  { label: '휴식 시간', kind: 'break', minutes: 20 },
  { label: '수학', subject: '수학', kind: 'subject', minutes: 100 },
  { label: '점심시간', kind: 'break', minutes: 60 },
  { label: '영어', subject: '영어', kind: 'subject', minutes: 70 },
  { label: '한국사', subject: '한국사', kind: 'subject', minutes: 30 },
  { label: '휴식 시간', kind: 'break', minutes: 15 },
  { label: '통합사회', subject: '통합사회', kind: 'subject', minutes: 40 },
  { label: '휴식 시간', kind: 'break', minutes: 2 },
  { label: '통합과학', subject: '통합과학', kind: 'subject', minutes: 40 }
].map(step => ({
  ...step,
  durationMs: step.minutes * 60000
}));

const SUBJECT_COLORS = { '국어':'#c17d64', '수학':'#658baf', '영어':'#8d82b2', '통합사회':'#b39a5e', '통합과학':'#6d9c86', '한국사':'#a87891', '사회탐구':'#b39a5e', '과학탐구':'#6d9c86', '제2외국어':'#7d8ca0', '기타':'#8d8d8d' };
const SUBJECT_SHORT = { '국어':'국어', '수학':'수학', '영어':'영어', '통합사회':'통사', '통합과학':'통과', '한국사':'한국사' };
const VIEW_TITLES = { home:'홈', planner:'기록 달력 · 시간표', periodTasks:'기간별 할 일', vault:'보물상자', study:'공부 기록', timer:'실전 타이머', subjectTimer:'과목별 공부 타이머', stats:'공부 통계', analytics:'공부 분석', exams:'실전 모의고사', major:'주요 모의고사 성적', books:'교재 책장', life:'식사 · 운동', diary:'일기', dailyReview:'하루 공부 결산', dday:'시험 D-Day', backup:'백업 · 복원', publicArchive:'공개 학습 아카이브', settings:'설정', trash:'휴지통' };
const $ = (selector, root=document) => root.querySelector(selector);
const root = $('#view-root');
const modal = $('#app-modal');
const modalForm = $('#modal-form');
let activeView = 'home';
let v190 = null;
let plannerDate = todayISO();
let plannerMode = 'month';
let activeBookSubject = '전체';
let currentTimer = null;
let timerTick = null;
let bookObjectURLs = [];
let transientObjectURLs = [];
let owlMidnightTimer = null;
function temporaryImageURL(blob){const url=URL.createObjectURL(blob);transientObjectURLs.push(url);return url;}
function clearTemporaryImageURLs(){transientObjectURLs.forEach(url=>URL.revokeObjectURL(url));transientObjectURLs=[];}

function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,'0');
  const d = String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function dateFromISO(value) { const [y,m,d] = String(value).split('-').map(Number); return new Date(y, (m||1)-1, d||1); }
function addDays(iso, amount) { const d = dateFromISO(iso); d.setDate(d.getDate()+amount); return todayISO(d); }
function startOfWeek(iso) { const d = dateFromISO(iso); const day = (d.getDay()+6)%7; d.setDate(d.getDate()-day); return todayISO(d); }
function endOfWeek(iso) { return addDays(startOfWeek(iso),6); }
function monthStart(iso) { const d = dateFromISO(iso); d.setDate(1); return todayISO(d); }
function monthEnd(iso) { const d = dateFromISO(iso); d.setMonth(d.getMonth()+1,0); return todayISO(d); }
function fmtDate(iso, opts={month:'long',day:'numeric',weekday:'short'}) { if(!iso)return '-'; return new Intl.DateTimeFormat('ko-KR',opts).format(dateFromISO(iso)); }
function fmtLongDate(iso) { if(!iso)return '-'; return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(dateFromISO(iso)); }
function fmtMin(minutes=0) { const n=Math.max(0,Math.round(Number(minutes)||0)); const h=Math.floor(n/60), m=n%60; return h ? `${h}시간${m?` ${m}분`:''}` : `${m}분`; }
function fmtClock(date = new Date()) { return new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date); }
function fmtInputAt(value) { if(!value)return '입력 시각 정보 없음'; const d=new Date(value); if(Number.isNaN(d.getTime()))return '입력 시각 정보 없음'; return `입력 ${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)}`; }
function shortMinutes(value) { const n=Math.max(0,Math.round(num(value))); return n>=60?`${Math.floor(n/60)}h${n%60?` ${n%60}m`:''}`:`${n}m`; }
function hexRgb(hex) { const m=String(hex||'#4da879').match(/^#?([a-f0-9]{6})$/i); if(!m)return [77,168,121]; return [parseInt(m[1].slice(0,2),16),parseInt(m[1].slice(2,4),16),parseInt(m[1].slice(4,6),16)]; }
function rgbaHex(hex, alpha) { const [r,g,b]=hexRgb(hex); return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,alpha))})`; }
function num(v) { const n=Number(v); return Number.isFinite(n)?n:0; }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function esc(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function subjectColor(subject) { return getSubjectColors()[subject] || SUBJECT_COLORS[subject] || '#8b9b90'; }
let cachedColors = {...SUBJECT_COLORS};
function getSubjectColors(){return cachedColors;}
function hexToHsl(hex){const [r0,g0,b0]=hexRgb(hex).map(v=>v/255);const max=Math.max(r0,g0,b0),min=Math.min(r0,g0,b0),d=max-min;let h=0,s=0,l=(max+min)/2;if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r0:h=((g0-b0)/d)%6;break;case g0:h=(b0-r0)/d+2;break;default:h=(r0-g0)/d+4;}h*=60;if(h<0)h+=360;}return [h,s,l];}
function hslHex(h,s,l){h=((h%360)+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;let rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');}
function themePalette(bg){
  const [h,s,l]=hexToHsl(bg);
  const dark=l<.48;
  const mix=(a,b,t)=>Math.round(a*(1-t)+b*t);
  const rgb=hexRgb(bg);
  const hexOf=arr=>'#'+arr.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const surface=hexOf(rgb.map(v=>dark?mix(v,255,.075):mix(v,0,.055)));
  const surface2=hexOf(rgb.map(v=>dark?mix(v,255,.12):mix(v,0,.09)));
  const ink=dark?'#f7f7f7':'#171717';
  const muted=dark?'#c8c8c8':'#3e3e3e';
  const line=dark?'#4a4a4a':'#d0d0d0';
  const accent=hslHex(h+155,.46,dark?.66:.34);
  const accentText=dark?'#101010':'#ffffff';
  const sidebar=hexOf(rgb.map(v=>dark?mix(v,0,.22):mix(v,0,.07)));
  const sidebarText=dark?'#f6f6f6':'#171717';
  const sidebarMuted=dark?'#d2d2d2':'#3a3a3a';
  const sidebarHover=dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.06)';
  const subjects={};
  SUBJECTS.forEach((sub,i)=>subjects[sub]=hslHex(h+25+i*49,.52,dark?.69:.39));
  subjects['사회탐구']=subjects['통합사회'];
  subjects['과학탐구']=subjects['통합과학'];
  subjects['제2외국어']=hslHex(h+210,.42,dark?.7:.4);
  subjects['기타']=dark?'#b5b5b5':'#666666';
  return {bg,surface,surface2,ink,muted,line,accent,accentText,sidebar,sidebarText,sidebarMuted,sidebarHover,subjects,dark};
}
function applyTheme(theme){
  const t=themePalette(theme?.background||'#000000');
  const vars={
    '--theme-bg':t.bg,'--theme-surface':t.surface,'--theme-surface-2':t.surface2,'--theme-ink':t.ink,'--theme-muted':t.muted,'--theme-line':t.line,'--theme-accent':t.accent,'--theme-accent-text':t.accentText,'--theme-sidebar':t.sidebar,'--theme-sidebar-text':t.sidebarText,'--theme-sidebar-muted':t.sidebarMuted,'--theme-sidebar-hover':t.sidebarHover,
    '--bg':t.bg,'--surface':t.surface,'--surface-2':t.surface2,'--surface-secondary':t.surface2,'--ink':t.ink,'--text':t.ink,'--muted':t.muted,'--text-secondary':t.muted,'--line':t.line,'--border':t.line,'--accent':t.accent,'--sidebar-bg':t.sidebar,'--sidebar-text':t.sidebarText,'--input-bg':t.surface2,'--calendar-bg':t.surface
  };
  const r=document.documentElement.style;
  Object.entries(vars).forEach(([k,v])=>r.setProperty(k,v));
  document.documentElement.dataset.theme=t.dark?'dark':'light';
  document.documentElement.style.colorScheme=t.dark?'dark':'light';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t.sidebar);
  cachedColors=t.subjects;
  return t;
}
function subjectOptions(selected='국어') { return SUBJECTS.map(s=>`<option value="${s}" ${s===selected?'selected':''}>${s}</option>`).join(''); }
function field(label,name,value='',type='text',extra='') { return `<div class="field"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function textareaField(label,name,value='',placeholder='') { return `<div class="field full"><label for="f-${name}">${label}</label><textarea id="f-${name}" name="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`; }
function selectField(label,name,options,selected='') { return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(o=>`<option value="${esc(o.value)}" ${o.value===selected?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>`; }
function pageHeading(title, subtitle, actions='') { return `<div class="page-heading"><div><p class="eyebrow">2028 STUDY ARCHIVE</p><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`; }
function emptyState(title='아직 기록이 없습니다', desc='첫 기록을 추가해 보세요.') { return `<div class="empty-state"><strong>${title}</strong>${desc}</div>`; }
function toast(message, type='success') { const el=document.createElement('div'); el.className=`toast ${type==='error'?'error':type==='warning'?'warning':''}`; el.textContent=message; $('#toast-region').append(el); setTimeout(()=>el.remove(),3600); }
function saveBlob(blob, filename) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); }
function getFormData(form) { return Object.fromEntries(new FormData(form).entries()); }
function openModal(title, content, onSave, eyebrow='RECORD', saveLabel='저장하기') {
  $('#modal-title').textContent=title; $('#modal-eyebrow').textContent=eyebrow; $('#modal-content').innerHTML=content; $('#modal-save').textContent=saveLabel; modal.showModal();
  modalForm.onsubmit=async (event)=>{event.preventDefault(); const button=$('#modal-save'); button.disabled=true; try{await onSave(getFormData(modalForm),modalForm); modal.close();}catch(error){console.error(error);toast(error.message||'저장 중 오류가 발생했습니다.','error');}finally{button.disabled=false;}};
}
function closeModal(){modal.close();}
function setNav(view) { activeView=view; document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); $('#page-title').textContent=VIEW_TITLES[view]||'기록'; }
async function navigate(view) { setNav(view); if(innerWidth<760) $('#sidebar').classList.remove('open'); await render(view); window.scrollTo({top:0,behavior:'smooth'}); }

function scheduleOwlMidnightRefresh(){
  if(owlMidnightTimer) clearTimeout(owlMidnightTimer);
  owlMidnightTimer=setTimeout(async()=>{
    $('#top-date').textContent=fmtLongDate(todayISO());
    if(activeView==='home') await render('home');
    scheduleOwlMidnightRefresh();
  },msUntilKstMidnight());
}

async function init() {
  $('#top-date').textContent=fmtLongDate(todayISO());
  try { await openDB(); }
  catch(error) { root.innerHTML=`<div class="card"><h2>저장 공간에 연결할 수 없습니다.</h2><p>${esc(error.message)}</p></div>`; return; }
  try { if(navigator.storage?.persist) await navigator.storage.persist(); } catch { /* best effort */ }
  const savedTheme=await getSetting('appTheme',{background:'#000000'});const generatedTheme=applyTheme(savedTheme);cachedColors={...generatedTheme.subjects,...(await getSetting('subjectColors',{}))};
  v190=createV190({toast,navigate,exportBackup,getStreak,todayISO,esc,getView:()=>activeView,rerender:()=>render(activeView)});
  const events=await getAll('events');
  if(!events.some(e=>e.id==='csat-2028')) {
    await put('events',{id:'csat-2028',name:'2028학년도 대학수학능력시험',date:'2027-11-18',type:'수능',memo:'교육부 발표 일정',official:true,createdAt:new Date().toISOString()});
  }
  const timer=await getSetting('activeTimer',null); if(timer) currentTimer=timer;
  updateConnection();
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      reg.addEventListener('updatefound',()=>{const w=reg.installing; if(w) w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)toast('새 버전이 준비되었습니다. 새로고침하면 적용됩니다.','warning');});});
    }).catch(err=>console.warn('Service worker registration failed',err));
  }
  await render('home');
  scheduleOwlMidnightRefresh();
  if(currentTimer?.runningSince) startTimerTicker();
  await maybeBackupReminder();
  await checkMemorialGate();
}
function updateConnection(){const online=navigator.onLine; $('#connection-label').textContent=online?'온라인 · 저장 준비됨':'오프라인 · 기기 내 기록 사용'; $('.offline-indicator i').style.background=online?'#8cb99c':'#d4ae73';}
async function maybeBackupReminder(){
  if(v190) await v190.onLaunch();
}

async function render(view=activeView) {
  clearTemporaryImageURLs();
  const renderers={home:renderHome,planner:renderPlanner,periodTasks:()=>renderPeriodTasks(root),vault:()=>renderWishVault(root),study:renderStudy,timer:renderTimer,subjectTimer:()=>v190?.renderSubjectTimer(root),stats:renderStats,analytics:()=>v190?.renderAnalytics(root),exams:renderExams,major:renderMajor,books:renderBooks,life:renderLife,diary:renderDiary,dailyReview:()=>v190?.renderDailyReview(root),dday:renderDday,backup:renderBackup,publicArchive:renderPublicArchive,settings:renderSettings,trash:renderTrash};
  try {
    await (renderers[view]||renderHome)();
    if(v190) await v190.afterRender(view, root);
  }
  catch(error){console.error(error);root.innerHTML=`<div class="card"><h3>화면을 불러오지 못했습니다.</h3><p class="subtle">${esc(error.message||'알 수 없는 오류')}</p><button class="btn btn-secondary" data-action="retry">다시 시도</button></div>`;}
}

async function markAttendance(date) {
  await put('attendance',{date,recordedAt:new Date().toISOString(),restDay:false});
}
async function refreshAttendanceForDate(date) {
  const entries=await getDateRange('studyEntries',date,date);
  const row=await getById('attendance',date);
  if(entries.length){await markAttendance(date);} else if(row&&!row.restDay){await remove('attendance',date);}
}
async function getStreak() {
  const rows=await getAll('attendance'); const dateSet=new Set(rows.map(r=>r.date));
  const restDays=await getSetting('restDays',[]);
  const rests=new Set(rows.filter(r=>r.restDay).map(r=>r.date));
  const isRest=(date)=>rests.has(date)||restDays.includes(dateFromISO(date).getDay());
  let cursor=todayISO(); if(!dateSet.has(cursor)&&!isRest(cursor)) cursor=addDays(cursor,-1);
  let count=0;
  for(let i=0;i<1500;i++) { if(isRest(cursor)){cursor=addDays(cursor,-1);continue;} if(dateSet.has(cursor)){count++;cursor=addDays(cursor,-1);continue;} break; }
  let best=0,run=0; const all=[...dateSet].sort();
  if(all.length){let cursorDate=all[0],last=all[all.length-1];for(let i=0;i<1500&&cursorDate<=last;i++,cursorDate=addDays(cursorDate,1)){if(isRest(cursorDate))continue;if(dateSet.has(cursorDate)){run++;best=Math.max(best,run);}else run=0;}}
  return {current:count,best,days:dateSet,rests};
}
function totalMinutes(rows) { return rows.reduce((s,r)=>s+num(r.minutes),0); }
function sumBySubject(rows) { const m={}; for(const r of rows){m[r.subject]=(m[r.subject]||0)+num(r.minutes);} return m; }
function nearestEvent(events) { const now=todayISO(); return events.filter(e=>e.date>=now).sort((a,b)=>a.date.localeCompare(b.date))[0]||null; }
function dday(date) { const delta=Math.round((dateFromISO(date)-dateFromISO(todayISO()))/86400000); return delta===0?'D-DAY':delta>0?`D-${delta}`:`D+${Math.abs(delta)}`; }

async function renderHome(){
  const today=todayISO();
  const [entries,schedules,meals,exercises,events,exams,diaries,streak,hiddenWidgets,widgetOrder]=await Promise.all([
    getDateRange('studyEntries',today,today),getDateRange('schedules',today,today),getDateRange('meals',today,today),getDateRange('exercises',today,today),getAll('events'),getAll('exams'),getAll('diaries'),getStreak(),getSetting('hiddenWidgets',[]),getSetting('widgetOrder',['todaySchedule','subjectTime','life','recentExam','weeklyTrend','recentDiary'])
  ]);
  const weekEntries=await getDateRange('studyEntries',startOfWeek(today),endOfWeek(today));
  const weekMinutes=totalMinutes(weekEntries), todayMinutes=totalMinutes(entries), bySubject=sumBySubject(entries);
  const owlGoalMinutes=Math.max(60,num(await getSetting('owlDailyGoalMinutes',360))||360);
  const owl=await resolveOwl({todayMinutes,goalMinutes:owlGoalMinutes,streakCurrent:streak.current,timerRunning:!!currentTimer?.runningSince});
  const event=nearestEvent(events);
  const completed=schedules.filter(s=>s.completed).length;
  const lastExam=exams.sort((a,b)=>b.date.localeCompare(a.date))[0];
  const recentDiary=diaries.sort((a,b)=>b.date.localeCompare(a.date))[0];
  const widgets={
    todaySchedule:`<div class="card"><div class="card-head"><div><h3>오늘의 시간표</h3><p>${fmtLongDate(today)}</p></div><button class="inline-link" data-view="planner">전체 일정 →</button></div>${schedules.length?`<div class="schedule-list">${schedules.sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||'')).slice(0,6).map(s=>`<div class="schedule-item"><span class="time-pill">${esc(s.startTime||'시간 미정')}</span><i class="schedule-marker" style="background:${subjectColor(s.subject)}"></i><div class="schedule-main"><strong>${esc(s.title)}</strong><small>${esc(s.subject||s.type||'일정')} · ${s.completed?'완료':'예정'}</small></div><button class="inline-link" data-action="toggle-schedule" data-id="${s.id}">${s.completed?'취소':'완료'}</button></div>`).join('')}</div>`:emptyState('오늘 등록된 일정이 없습니다','플래너에서 공부 계획이나 일정을 추가하세요.')}</div>`,
    subjectTime:`<div class="card"><div class="card-head"><div><h3>오늘의 과목별 공부</h3><p>기록된 시간 기준</p></div><button class="inline-link" data-view="study">기록 관리 →</button></div>${SUBJECTS.map(s=>{const m=bySubject[s]||0;return `<div class="subject-row"><span><i class="subject-dot" style="background:${subjectColor(s)}"></i>${s}</span><div class="progress-line"><span style="width:${todayMinutes?Math.min(100,m/todayMinutes*100):0}%;background:${subjectColor(s)}"></span></div><strong>${m?fmtMin(m):'—'}</strong></div>`}).join('')}<div class="divider"></div><div class="progress-meta"><span>오늘 총 공부 시간</span><strong>${fmtMin(todayMinutes)}</strong></div></div>`,
    life:`<div class="card"><div class="card-head"><div><h3>오늘의 생활 기록</h3><p>식사 ${meals.length}회 · 운동 ${exercises.length}회</p></div><button class="inline-link" data-view="life">기록 추가 →</button></div><div class="grid grid-2"><div class="mini-stat"><span>식사 기록</span><strong>${meals.length}건</strong></div><div class="mini-stat"><span>운동 시간</span><strong>${fmtMin(exercises.reduce((a,x)=>a+num(x.minutes),0))}</strong></div></div>${meals.length?`<div class="subtle" style="margin-top:12px">${meals.map(m=>`${esc(m.mealType)} · ${esc(m.food)}`).join(' / ')}</div>`:''}</div>`,
    recentExam:`<div class="card"><div class="card-head"><div><h3>최근 실전 모의고사</h3><p>최근 입력한 시험 기록</p></div><button class="inline-link" data-view="exams">전체 보기 →</button></div>${lastExam?`<div class="record-item"><div class="record-main"><strong>${esc(lastExam.name)} · ${esc(lastExam.subject)}</strong><small>${fmtLongDate(lastExam.date)} · ${fmtMin(lastExam.minutes||0)}</small></div><strong>${esc(lastExam.score??'-')}점</strong></div>`:emptyState('아직 시험 기록이 없습니다','실전 모의고사 결과를 등록해 보세요.')}</div>`,
    weeklyTrend:`<div class="card"><div class="card-head"><div><h3>이번 주 공부 흐름</h3><p>월요일부터 일요일까지</p></div><strong>${fmtMin(weekMinutes)}</strong></div><div class="chart-wrap"><canvas id="home-week-chart"></canvas></div></div>`,
    recentDiary:`<div class="card"><div class="card-head"><div><h3>최근 일기</h3><p>오늘의 생각을 남겨 보세요</p></div><button class="inline-link" data-view="diary">일기장 →</button></div>${recentDiary?`<strong style="font-size:12px">${esc(recentDiary.title||'제목 없는 일기')}</strong><p class="subtle">${fmtLongDate(recentDiary.date)}</p><p style="font-size:11px;color:#7e8982">${esc((recentDiary.body||'').slice(0,110))}${(recentDiary.body||'').length>110?'…':''}</p>`:emptyState('아직 작성한 일기가 없습니다','하루를 돌아보며 짧게 기록해 보세요.')}</div>`
  };
  const visibleOrder=widgetOrder.filter(k=>widgets[k]&&!hiddenWidgets.includes(k));
  const renderedWidgets=visibleOrder.map(k=>`<div>${widgets[k]}</div>`).join('');
  root.innerHTML=`${pageHeading('오늘의 기록','공부와 생활의 흐름을 한눈에 확인하세요.',`<button class="btn btn-secondary" data-view="study">＋ 공부 기록</button><button class="btn btn-primary" data-view="timer">타이머 시작</button>`)}
    <section class="owl-daily-card" aria-label="오늘의 부엉이"><img src="${owlSrc(owl.number)}" alt="${esc(owl.name)} 부엉이"><div class="owl-daily-copy"><span class="owl-eyebrow">TODAY'S OWL · ${kstToday()}${owl.special?' · 특별':''}</span><h2>${esc(owl.title)}</h2><p>${esc(owl.detail)}</p><div class="owl-goal-row"><span>하루 목표 ${fmtMin(owlGoalMinutes)}</span><button class="inline-link" data-action="owl-set-goal">목표 변경</button></div><div class="owl-goal-track"><i style="width:${Math.min(100,todayMinutes/owlGoalMinutes*100)}%"></i></div><small>${fmtMin(todayMinutes)} / ${fmtMin(owlGoalMinutes)}</small><button class="btn btn-secondary owl-dex-open" data-action="owl-dex" data-current="${owl.number}">부엉이 도감 열기</button></div></section>
    <div class="card hero-card"><div class="hero-top"><div><div class="hero-label">2028 COLLEGE SCHOLASTIC ABILITY TEST</div><div class="hero-dday">${dday('2027-11-18')}</div><div class="hero-date">2027년 11월 18일 목요일 · 2028학년도 대학수학능력시험</div></div><div class="hero-side"><strong>${streak.current}일</strong><span>현재 연속 기록</span></div></div><div class="hero-bottom"><div class="hero-stat"><span>오늘 공부</span><strong>${fmtMin(todayMinutes)}</strong></div><div class="hero-stat"><span>이번 주 누적</span><strong>${fmtMin(weekMinutes)}</strong></div><div class="hero-stat"><span>최장 연속</span><strong>${streak.best}일</strong></div><div class="hero-stat"><span>오늘 일정 완료</span><strong>${completed}/${schedules.length}</strong></div><div class="hero-stat"><span>다음 시험</span><strong>${event?`${esc(event.name)} ${dday(event.date)}`:'등록된 시험 없음'}</strong></div></div></div>
    <div class="grid grid-4 section-gap"><div class="card metric-card"><span class="metric-icon">◷</span><div class="metric-label">오늘 총 공부 시간</div><div class="metric-value">${fmtMin(todayMinutes)}</div><div class="metric-note">오늘 기록 기준</div></div><div class="card metric-card"><span class="metric-icon">▦</span><div class="metric-label">이번 주 누적</div><div class="metric-value">${fmtMin(weekMinutes)}</div><div class="metric-note">월요일부터 오늘까지</div></div><div class="card metric-card"><span class="metric-icon">✦</span><div class="metric-label">출석 연속 기록</div><div class="metric-value">${streak.current}일</div><div class="metric-note">최장 ${streak.best}일</div></div><div class="card metric-card"><span class="metric-icon">◎</span><div class="metric-label">오늘의 완료 일정</div><div class="metric-value">${completed}/${schedules.length}</div><div class="metric-note">계획 완료 현황</div></div></div>
    <div class="grid grid-2 section-gap">${renderedWidgets||`<div class="card">표시 중인 위젯이 없습니다. 설정에서 다시 켤 수 있습니다.</div>`}</div>`;
  const chartRows=[]; for(let i=0;i<7;i++){const d=addDays(startOfWeek(today),i);chartRows.push({label:['월','화','수','목','금','토','일'][i],value:totalMinutes(weekEntries.filter(e=>e.date===d))});}
  drawBarChart($('#home-week-chart'),chartRows);
}

async function renderPlanner(){
  let gridStart, gridDates, rangeTitle;
  if(plannerMode==='month'){
    const first=dateFromISO(monthStart(plannerDate)); const day=(first.getDay()+6)%7; first.setDate(first.getDate()-day);
    gridStart=todayISO(first); gridDates=Array.from({length:42},(_,i)=>addDays(gridStart,i)); rangeTitle=fmtDate(plannerDate,{year:'numeric',month:'long'});
  }else if(plannerMode==='week'){
    gridStart=startOfWeek(plannerDate); gridDates=Array.from({length:7},(_,i)=>addDays(gridStart,i)); rangeTitle=`${fmtDate(gridStart,{month:'numeric',day:'numeric'})} – ${fmtDate(addDays(gridStart,6),{month:'numeric',day:'numeric'})}`;
  }else{
    gridStart=plannerDate; gridDates=[plannerDate]; rangeTitle=fmtLongDate(plannerDate);
  }
  const gridEnd=gridDates[gridDates.length-1];
  const [rows,events,allEntries,dailyRows,heat]=await Promise.all([
    getDateRange('schedules',gridStart,gridEnd),getDateRange('events',gridStart,gridEnd),
    getDateRange('studyEntries',gridStart,gridEnd),getDateRange('dailyStudy',gridStart,gridEnd),
    getSetting('calendarHeat',{color:'#4da879',maxHours:10})
  ]);
  const selected=rows.filter(r=>r.date===plannerDate).sort((a,b)=>(a.startTime||'').localeCompare(b.startTime||''));
  const selectedEntries=allEntries.filter(e=>e.date===plannerDate).sort((a,b)=>(a.inputAt||a.createdAt||'').localeCompare(b.inputAt||b.createdAt||''));
  const totalForDay=(date)=>{const summary=dailyRows.find(r=>r.date===date);return summary?num(summary.minutes):totalMinutes(allEntries.filter(e=>e.date===date));};
  const dayActual=totalForDay(plannerDate);
  const color=heat?.color||'#4da879',maxHours=Math.max(1,num(heat?.maxHours)||10);
  const dayCells=gridDates.map(d=>{
    const inside=plannerMode!=='month'||d.slice(0,7)===plannerDate.slice(0,7);const dayRows=rows.filter(r=>r.date===d);const eventRows=events.filter(e=>e.date===d);const minutes=totalForDay(d);const alpha=minutes?0.08+Math.min(1,minutes/(maxHours*60))*0.68:0;
    const dayLogs=allEntries.filter(e=>e.date===d);
    return `<button class="calendar-day ${inside?'':'outside'} ${d===todayISO()?'today':''} ${d===plannerDate?'selected':''} ${minutes?'has-study':''}" data-action="select-date" data-date="${d}" style="${minutes?`background-color:${rgbaHex(color,alpha)} !important;`:''}">
      <span class="day-num">${dateFromISO(d).getDate()}</span>
      <span class="day-dots">${dayRows.slice(0,3).map(r=>`<i style="background:${subjectColor(r.subject)}"></i>`).join('')}${eventRows.length?'<i style="background:#b99b66"></i>':''}</span>
      <span class="calendar-day-study">${minutes?shortMinutes(minutes):''}</span>
      ${dayLogs.length?`<span class="calendar-day-logcount">기록 ${dayLogs.length}</span>`:''}
    </button>`;
  }).join('');
  const dows=plannerMode==='month'?['월','화','수','목','금','토','일']:plannerMode==='day'?[]:[];

  let calendarView='';
  if(plannerMode==='week'){
    const hours=Array.from({length:24},(_,i)=>i);
    const axis=hours.map(h=>`<div class="week-hour-label">${String(h).padStart(2,'0')}:00</div>`).join('');
    const cols=gridDates.map(d=>{
      const dayRows=rows.filter(r=>r.date===d);
      const timed=dayRows.filter(r=>r.startTime).map(r=>{
        const [sh,sm]=r.startTime.split(':').map(Number);const start=sh*60+(sm||0);const [eh,em]=String(r.endTime||'').split(':').map(Number);const end=r.endTime?eh*60+(em||0):start+60;
        const clippedStart=Math.max(0,start),clippedEnd=Math.min(1440,Math.max(start+15,end));if(clippedEnd<=clippedStart)return '';
        const scale=30/60;const top=clippedStart*scale,height=Math.max(14,(clippedEnd-clippedStart)*scale);
        const sub=r.subject||r.type||'일정';
        return `<button class="week-event ${r.type==='개인 공부'||r.type==='시험'?'is-study':'is-plan'} ${r.completed?'is-done':''}" data-action="edit-schedule" data-id="${esc(r.id)}" style="top:${top}px;height:${height}px;background:${rgbaHex(subjectColor(r.subject),.28)};border-left-color:${subjectColor(r.subject)}" title="${esc(r.title)} · ${esc(r.startTime)}–${esc(r.endTime||'종료 미정')}"><strong>${esc(r.title)}</strong><span>${esc(r.startTime)}${r.endTime?`–${esc(r.endTime)}`:''}</span><small>${esc(sub)}</small></button>`;
      }).join('');
      const untimed=dayRows.filter(r=>!r.startTime);
      const dayEvents=events.filter(e=>e.date===d);
      const untimedMarkup=`${untimed.map(r=>`<button data-action="edit-schedule" data-id="${esc(r.id)}">${esc(r.title)}</button>`).join('')}${dayEvents.map(e=>`<button class="week-event-important" data-action="edit-event" data-id="${esc(e.id)}">${esc(e.name)} · ${esc(e.type||'시험')}</button>`).join('')}`;
      const now=new Date(),nowTop=(now.getHours()*60+now.getMinutes())*(30/60);
      const nowLine=d===todayISO()&&nowTop>=0&&nowTop<=1440?`<i class="week-now-line" style="top:${nowTop}px"></i>`:'';
      return `<div class="week-day-column"><div class="week-day-head"><button data-action="select-date" data-date="${d}">${dateFromISO(d).getDate()}일 <small>${['일','월','화','수','목','금','토'][dateFromISO(d).getDay()]}</small></button></div>
        ${(untimed.length||dayEvents.length)?`<div class="week-untimed">${untimedMarkup}</div>`:''}
        <div class="week-day-track"><div class="week-hour-lines">${hours.map(()=>'<i></i>').join('')}</div>${nowLine}${timed}</div>
      </div>`;
    }).join('');
    calendarView=`<div class="week-calendar-scroll"><div class="week-calendar"><div class="week-calendar-head"><div></div>${gridDates.map(d=>{const studied=totalMinutes(allEntries.filter(e=>e.date===d));return `<div class="week-column-title ${d===todayISO()?'is-today':''}">${fmtDate(d,{month:'numeric',day:'numeric'})} <small>${['일','월','화','수','목','금','토'][dateFromISO(d).getDay()]}</small>${studied?`<em class="week-study-chip">공부 ${shortMinutes(studied)}</em>`:''}</div>`;}).join('')}</div><div class="week-calendar-body"><div class="week-time-axis">${axis}</div>${cols}</div></div></div>`;
  } else {
    calendarView=`<div class="calendar-grid ${plannerMode==='day'?'day-mode':''}">${dows.map(x=>`<div class="calendar-dow">${x}</div>`).join('')}${dayCells}</div>`;
  }

  const heatSettings=plannerMode==='month'?`<div class="calendar-heat-settings"><span>공부 시간 색상</span><label>색상 <input id="calendar-heat-color" type="color" value="${esc(color)}"></label><label>최대 진하기 기준 <input id="calendar-heat-hours" type="number" min="1" max="24" step="0.5" value="${maxHours}">시간</label><button class="btn btn-small btn-secondary" data-action="save-calendar-heat">색상 설정 저장</button></div>`:'';
  const studyRows=selectedEntries.length?`<div class="calendar-study-entries">${selectedEntries.map(e=>`<div class="calendar-study-row"><div class="calendar-study-symbol result-${e.result==='O'?'o':e.result==='X'?'x':'tri'}">${esc(e.result||'·')}</div><div class="calendar-study-main"><strong>${esc(e.subject||'과목 미지정')} · ${esc(e.content||'내용 없음')}</strong><small>${e.minutes?fmtMin(e.minutes)+' · ':''}${fmtInputAt(e.inputAt||e.createdAt)}</small></div><button class="btn btn-small btn-ghost" data-action="edit-study" data-id="${esc(e.id)}">수정</button></div>`).join('')}</div>`:emptyState('이 날짜의 공부 기록이 없습니다','하루를 마무리할 때 과목과 공부 내용을 간단히 남겨 보세요.');
  root.innerHTML=`${pageHeading('기록 달력 · 주간 시간표','월별 달력에서 공부 기록과 하루 공부 시간을 돌아보고, 주간 시간표에서 학원과 일정을 확인합니다.',`<button class="btn btn-primary" data-action="add-study">＋ 공부 기록</button><button class="btn btn-secondary" data-action="add-schedule">＋ 일정 추가</button>`)}
  <div class="card planner-calendar-card"><div class="calendar-toolbar"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button class="icon-btn" data-action="calendar-prev">‹</button><strong>${rangeTitle}</strong><button class="icon-btn" data-action="calendar-next">›</button><button class="btn btn-ghost btn-small" data-action="calendar-today">오늘</button></div><div class="tag-row"><button class="subject-tab ${plannerMode==='month'?'active':''}" data-action="planner-mode" data-mode="month">월간</button><button class="subject-tab ${plannerMode==='week'?'active':''}" data-action="planner-mode" data-mode="week">주간 시간표</button><button class="subject-tab ${plannerMode==='day'?'active':''}" data-action="planner-mode" data-mode="day">일</button></div></div>
    ${heatSettings}${calendarView}<p class="subtle calendar-help">월간 칸의 색 농도는 하루 공부 시간에 비례합니다. 날짜를 누르면 그날의 공부 기록이 아래에 표시됩니다. 주간 시간표의 일정 블록을 누르면 수정할 수 있습니다.</p></div>
  <div class="card section-gap"><div class="card-head"><div><h3>${fmtLongDate(plannerDate)} · 공부 기록</h3><p>선택한 날짜의 공부 내역과 입력 시각</p></div><span class="pill">${selectedEntries.length}건</span></div>
    <div class="calendar-day-total"><div><small>하루 공부 시간</small><strong>${fmtMin(dayActual)}</strong></div><button class="btn btn-secondary" data-action="set-day-study">하루 공부 시간 입력</button></div>
    ${studyRows}
    <div class="divider"></div><div class="card-head"><div><h3>일정</h3><p>학교 · 학원 · 개인 일정</p></div><span class="pill">${selected.length}개</span></div>
    ${selected.length?`<div class="schedule-list">${selected.map(s=>{const past=s.date<todayISO();return `<div class="schedule-item"><span class="time-pill">${esc(s.startTime||'시간 미정')}</span><i class="schedule-marker" style="background:${subjectColor(s.subject)}"></i><div class="schedule-main"><strong>${esc(s.title)}</strong><small>${esc(s.type||'일정')} ${s.endTime?'· '+esc(s.endTime):''} ${s.subject?'· '+esc(s.subject):''} ${fmtInputAt(s.inputAt||s.createdAt)}</small>${s.memo?`<small>${esc(s.memo)}</small>`:''}</div><div class="table-actions"><button class="btn btn-small btn-ghost" data-action="edit-schedule" data-id="${esc(s.id)}" ${past?'disabled title="과거 일정은 보호됩니다."':''}>수정</button><button class="btn btn-small btn-ghost" data-action="delete-schedule" data-id="${esc(s.id)}" ${past?'disabled title="과거 일정은 보호됩니다."':''}>삭제</button></div></div>`;}).join('')}`:emptyState('선택한 날짜의 일정이 없습니다','주간 시간표에서 학원·학교·개인 일정을 확인할 수 있습니다.')}
  </div>`;
}

async function addScheduleRecord(data){
  const date=data.date||plannerDate; const repeat=data.repeat||'none'; const recurrenceId=repeat==='none'?null:uid();
  const start=new Date(`${date}T12:00:00`); const until=data.until||addDays(date,repeat==='none'?0:90); const rows=[];
  for(let d=new Date(start);todayISO(d)<=until;d.setDate(d.getDate()+1)){
    const iso=todayISO(d); if(repeat==='weekly'&&d.getDay()!==start.getDay())continue;
    if(repeat==='none'&&iso!==date)continue;
    rows.push({id:uid(),date:iso,title:data.title,type:data.type||'개인',subject:data.subject||'',startTime:data.startTime||'',endTime:data.endTime||'',memo:data.memo||'',completed:false,recurrenceId,repeat,createdAt:new Date().toISOString(),inputAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    if(repeat==='none')break;
  }
  const db=await openDB(); await new Promise((resolve,reject)=>{const tx=db.transaction('schedules','readwrite');const store=tx.objectStore('schedules');rows.forEach(r=>store.put(r));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('일정 저장 실패'));});
  await addAudit('schedule-create',{count:rows.length,recurrenceId});
  toast(`${rows.length}개의 일정이 저장되었습니다.`); await render('planner');
}
async function renderStudy(){
  const today=todayISO(), from=addDays(today,-13); const [entries]=await Promise.all([getDateRange('studyEntries',from,today)]);
  const total=totalMinutes(entries), bySubject=sumBySubject(entries);
  const ordered=entries.slice().sort((a,b)=>(b.inputAt||b.createdAt||'').localeCompare(a.inputAt||a.createdAt||''));
  root.innerHTML=`${pageHeading('공부 기록','실물 플래너를 대신하지 않고, 하루를 마친 뒤 과목·공부 내용·O/X/△ 결과만 남기는 기록장입니다.',`<button class="btn btn-primary" data-action="add-study">＋ 공부 기록 추가</button>`)}
  <div class="grid grid-3"><div class="card metric-card"><div class="metric-label">최근 14일 누적 공부 시간</div><div class="metric-value">${fmtMin(total)}</div></div><div class="card metric-card"><div class="metric-label">최근 기록 일수</div><div class="metric-value">${new Set(entries.map(e=>e.date)).size}일</div></div><div class="card metric-card"><div class="metric-label">기록한 공부 내용</div><div class="metric-value">${entries.length}건</div></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>과목별 누적 시간</h3><p>시간이 입력된 기록 기준 · 최근 14일</p></div></div>${SUBJECTS.map(s=>`<div class="subject-row"><span><i class="subject-dot" style="background:${subjectColor(s)}"></i>${s}</span><div class="progress-line"><span style="background:${subjectColor(s)};width:${total?Math.min(100,(bySubject[s]||0)/total*100):0}%"></span></div><strong>${fmtMin(bySubject[s]||0)}</strong></div>`).join('')}</div>
  <div class="card"><div class="card-head"><div><h3>기록 상태</h3><p>O · X · △ 로 공부 결과를 표시합니다.</p></div></div><div class="result-legend"><span class="result-o">O</span> 익힘 / 이해함 <span class="result-x">X</span> 미흡 / 다시 보기 <span class="result-tri">△</span> 일부 이해 / 보완</div><p class="subtle">공부 시간은 선택 입력입니다. 월간 달력에서는 하루 전체 공부 시간을 따로 입력해 색 농도로 표시할 수 있습니다.</p></div></div>
  <div class="card section-gap"><div class="card-head"><div><h3>최근 공부 기록</h3><p>입력한 시각과 함께 보관합니다.</p></div><span class="pill">${entries.length}건</span></div>${ordered.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>입력 시각</th><th>공부 날짜</th><th>과목</th><th>공부 내용</th><th>결과</th><th>시간</th><th></th></tr></thead><tbody>${ordered.map(e=>`<tr><td>${fmtInputAt(e.inputAt||e.createdAt)}</td><td>${fmtDate(e.date,{month:'numeric',day:'numeric'})}</td><td><span class="subject-chip" style="--subject:${subjectColor(e.subject)}">${esc(e.subject)}</span></td><td>${esc(e.content||'—')}</td><td><span class="result-badge result-${e.result==='O'?'o':e.result==='X'?'x':'tri'}">${esc(e.result||'—')}</span></td><td><strong>${e.minutes?fmtMin(e.minutes):'—'}</strong></td><td><button class="btn btn-small btn-ghost" data-action="edit-study" data-id="${esc(e.id)}">수정</button><button class="btn btn-small btn-ghost" data-action="delete-study" data-id="${esc(e.id)}">삭제</button></td></tr>`).join('')}</tbody></table></div>`:emptyState('아직 공부 기록이 없습니다','하루를 마무리할 때 첫 기록을 추가해 보세요.')}</div>`;
}

async function addStudy(data,source='manual',existing=null){
  const minutes=data.minutes===''||data.minutes==null?0:num(data.minutes);
  if(minutes<0||minutes>1440)throw new Error('공부 시간은 0~1,440분으로 입력해 주세요.');
  if(!String(data.content||'').trim())throw new Error('공부 내용을 입력해 주세요.');
  const now=new Date().toISOString();
  const row={id:existing?.id||uid(),date:data.date||todayISO(),subject:data.subject,content:String(data.content||'').trim(),result:data.result||'△',minutes,source,createdAt:existing?.createdAt||now,inputAt:existing?.inputAt||now,updatedAt:now};
  await put('studyEntries',row);await markAttendance(row.date);await addAudit(existing?'study-edit':'study-create',{id:row.id,source,minutes});toast(existing?'공부 기록을 수정했습니다.':'공부 기록을 저장했습니다.');await render(activeView==='home'?'home':activeView==='planner'?'planner':'study');
}

async function loadTimer(){currentTimer=await getSetting('activeTimer',null);}
function timerElapsed(t=currentTimer){if(!t)return 0;return num(t.elapsedMs)+(t.runningSince?Math.max(0,Date.now()-new Date(t.runningSince).getTime()):0);}
function startTimerTicker(){if(timerTick)clearInterval(timerTick);timerTick=setInterval(()=>{if(activeView==='timer')updateTimerDisplay();},250);}
function stopTimerTicker(){if(timerTick)clearInterval(timerTick);timerTick=null;}
function updateTimerDisplay(){const el=$('#timer-digits');if(!el||!currentTimer)return;const elapsed=timerElapsed();let remain=null;if(currentTimer.mode==='exam')remain=Math.max(0,num(currentTimer.durationMs)-elapsed);const ms=remain===null?elapsed:remain;const secs=Math.floor(ms/1000);el.textContent=`${String(Math.floor(secs/3600)).padStart(2,'0')}:${String(Math.floor(secs%3600/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;const cap=$('#timer-caption');if(cap)cap.textContent=currentTimer.runningSince?'실행 중 · 화면을 벗어나도 실제 경과 시간을 기준으로 계산합니다.':'일시정지 상태';if(remain!==null&&remain<=300000&&remain>0&&!currentTimer.warnedFiveMin){currentTimer.warnedFiveMin=true;setSetting('activeTimer',currentTimer).catch(console.error);toast('설정한 시험 종료까지 5분 이내입니다.','warning');}if(remain===0&&currentTimer.runningSince){finishTimer(true).catch(console.error);}}
async function renderTimer(){
  await loadTimer();

  const t = currentTimer;
  const running = !!t?.runningSince;

  const actions = !t
    ? `<button class="btn btn-primary" data-action="timer-config">시작</button>`
    : running
      ? `<button class="btn btn-secondary" data-action="timer-pause">일시정지</button>
         <button class="btn btn-primary" data-action="timer-finish">시험 종료 및 저장</button>`
      : `<button class="btn btn-primary" data-action="timer-resume">재개</button>
         <button class="btn btn-secondary" data-action="timer-finish">종료 및 저장</button>`;

  root.innerHTML = `
    ${pageHeading(
      '실전 모의고사 타이머',
      '실제 시험처럼 시간을 측정하고 풀이 기록을 저장합니다.',
      `<button class="btn btn-ghost" data-action="timer-reset">초기화</button>`
    )}

    <div class="study-timer-shell">
      <div class="study-timer-card">

        <div class="study-timer-header">
          <span class="study-timer-label">MOCK EXAM TIMER</span>
          <span class="pill ${running ? 'green' : t ? 'gold' : ''}">
            ${running ? '진행 중' : t ? '일시정지' : '시작 전'}
          </span>
        </div>

        <div class="study-timer-digits" id="timer-digits">
          00:00:00
        </div>

        <p class="study-timer-caption" id="timer-caption">
          ${t ? '시험 시간이 표시됩니다.' : '시험 설정 후 시작 버튼을 눌러주세요.'}
        </p>

        <div class="study-timer-controls">
          ${actions}
        </div>
      </div>

      ${t ? `
        <div class="study-timer-info">
          <div>
            <span>시험 이름</span>
            <strong>${esc(t.name)}</strong>
          </div>
          <div>
            <span>과목</span>
            <strong>${esc(t.subject)}</strong>
          </div>
          <div>
            <span>설정 시간</span>
            <strong>${fmtMin(t.durationMs / 60000)}</strong>
          </div>
        </div>
      ` : `
        <div class="muted-box study-timer-notice">
          시험 이름과 과목, 제한 시간을 설정하면 타이머가 시작됩니다.
          종료하면 실제 풀이 시간이 공부 기록과 모의고사 기록에 저장됩니다.
        </div>
      `}

      <div class="card study-timer-reference">
        <h3>수능 시간표 참고</h3>
        <div class="status-row"><span>국어</span><strong>80분</strong></div>
        <div class="status-row"><span>수학</span><strong>100분</strong></div>
        <div class="status-row"><span>영어</span><strong>70분</strong></div>
        <div class="status-row"><span>한국사</span><strong>30분</strong></div>
        <div class="status-row"><span>탐구 영역</span><strong>각 40분</strong></div>
      </div>
    </div>
  `;

  if(t){
    updateTimerDisplay();

    if(running) startTimerTicker();
    else stopTimerTicker();
  }
}
async function timerStart(data){if(currentTimer)throw new Error('이미 실행 중인 타이머가 있습니다.');if(await getSetting('subjectStudyTimer',null))throw new Error('과목별 공부 타이머가 진행 중입니다. 공부 타이머를 종료한 뒤 실전 타이머를 시작하세요.');currentTimer={id:uid(),mode:'exam',name:data.name||'실전 모의고사',subject:data.subject,durationMs:num(data.duration)*60000,elapsedMs:0,runningSince:new Date().toISOString(),startedAt:new Date().toISOString(),date:todayISO()};await setSetting('activeTimer',currentTimer);startTimerTicker();toast('타이머를 시작했습니다.');await render('timer');}
async function timerPause(){if(!currentTimer?.runningSince)return;currentTimer.elapsedMs=timerElapsed();currentTimer.runningSince=null;await setSetting('activeTimer',currentTimer);stopTimerTicker();await render('timer');}
async function timerResume(){if(!currentTimer||currentTimer.runningSince)return;if(await getSetting('subjectStudyTimer',null)){toast('과목별 공부 타이머가 진행 중입니다. 공부 타이머를 종료한 뒤 실전 타이머를 다시 시작하세요.','warning');return;}currentTimer.runningSince=new Date().toISOString();await setSetting('activeTimer',currentTimer);startTimerTicker();await render('timer');}
async function finishTimer(auto=false){if(!currentTimer)return;const t=currentTimer;const ms=timerElapsed();const minutes=Math.max(1,Math.round(ms/60000));const endedAt=new Date().toISOString();
  const study={id:uid(),date:t.date||todayISO(),subject:t.subject,content:`${t.name} 실전 풀이`,minutes,source:'timer',createdAt:endedAt,inputAt:endedAt,updatedAt:endedAt};
  const exam={id:uid(),name:t.name,subject:t.subject,date:t.date||todayISO(),minutes,score:null,cut:null,memo:'타이머로 측정한 풀이 시간',createdAt:endedAt,inputAt:endedAt,updatedAt:endedAt};
  const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(['studyEntries','exams','settings','attendance'],'readwrite');tx.objectStore('studyEntries').put(study);tx.objectStore('exams').put(exam);tx.objectStore('settings').delete('activeTimer');tx.objectStore('attendance').put({date:study.date,recordedAt:endedAt,restDay:false});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  currentTimer=null;stopTimerTicker();toast(auto?'설정 시간이 끝났습니다. 시험 기록을 저장했습니다.':'타이머 기록을 저장했습니다.');await render(activeView==='timer'?'timer':'home');
}

async function renderStats(){const today=todayISO(),from=addDays(today,-29);const entries=await getDateRange('studyEntries',from,today);const total=totalMinutes(entries),days=new Set(entries.map(e=>e.date)).size;const calAverage=total/30,studyAverage=days?total/days:0;const bySubject=sumBySubject(entries);const daily=Array.from({length:30},(_,i)=>{const d=addDays(from,i);return {label:String(dateFromISO(d).getDate()),value:totalMinutes(entries.filter(e=>e.date===d))};});
  const weekly=[];for(let i=3;i>=0;i--){const end=addDays(today,-i*7),start=addDays(end,-6);weekly.push({label:`${dateFromISO(start).getMonth()+1}/${dateFromISO(start).getDate()}`,value:totalMinutes(entries.filter(e=>e.date>=start&&e.date<=end))});}
  const firstDay=dateFromISO(from);const monthly=[...new Set(entries.map(e=>e.date.slice(0,7)))].sort().map(m=>({label:m.slice(5)+'월',value:totalMinutes(entries.filter(e=>e.date.startsWith(m)))}));
  root.innerHTML=`${pageHeading('공부 통계','30일 기록을 바탕으로 공부량과 과목별 흐름을 확인합니다.','')}
  <div class="grid grid-4"><div class="card metric-card"><div class="metric-label">최근 30일 누적</div><div class="metric-value">${fmtMin(total)}</div></div><div class="card metric-card"><div class="metric-label">달력 날짜 기준 평균</div><div class="metric-value">${fmtMin(calAverage)}</div><div class="metric-note">최근 30일 전체 날짜</div></div><div class="card metric-card"><div class="metric-label">공부한 날 평균</div><div class="metric-value">${fmtMin(studyAverage)}</div><div class="metric-note">기록이 있는 날짜만</div></div><div class="card metric-card"><div class="metric-label">공부 기록 일수</div><div class="metric-value">${days}일</div></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>일별 공부 시간</h3><p>최근 30일 · 분 단위</p></div></div><div class="chart-wrap"><canvas id="daily-chart"></canvas></div></div><div class="card"><div class="card-head"><div><h3>과목별 공부 시간 비율</h3><p>최근 30일 · 과목별 누적</p></div></div><div class="chart-wrap"><canvas id="subject-chart"></canvas></div><div class="chart-legend">${SUBJECTS.map(s=>`<span><i class="dot-legend" style="background:${subjectColor(s)}"></i>${s} ${fmtMin(bySubject[s]||0)}</span>`).join('')}</div></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>주간 공부 시간 추이</h3><p>최근 4주, 주간 합계</p></div></div><div class="chart-wrap"><canvas id="weekly-chart"></canvas></div></div><div class="card"><div class="card-head"><div><h3>과목별 누적 시간</h3><p>최근 30일</p></div></div>${SUBJECTS.map(s=>`<div class="subject-row"><span><i class="subject-dot" style="background:${subjectColor(s)}"></i>${s}</span><div class="progress-line"><span style="background:${subjectColor(s)};width:${total?Math.min(100,(bySubject[s]||0)/total*100):0}%"></span></div><strong>${fmtMin(bySubject[s]||0)}</strong></div>`).join('')}</div></div>
  <div class="card section-gap"><div class="card-head"><div><h3>기록 집계 기준</h3><p>타이머와 직접 입력 기록은 모두 같은 공부 기록에 합산합니다.</p></div></div><p class="subtle">주간은 월요일부터 일요일까지 집계합니다. 월평균과 누적·히트맵은 장기 기록이 쌓일수록 정확해집니다. 현재 첫 화면에서는 최근 30일을 조회합니다.</p></div>`;
  drawBarChart($('#daily-chart'),daily,{compact:true});drawPieChart($('#subject-chart'),SUBJECTS.map(s=>({label:s,value:bySubject[s]||0,color:subjectColor(s)})));drawBarChart($('#weekly-chart'),weekly);
  await appendLongTerm();
}

async function renderExams(){const exams=(await getAll('exams')).sort((a,b)=>b.date.localeCompare(a.date));const avg=exams.filter(e=>e.score!==null&&e.score!==undefined&&e.score!=='');const mean=avg.length?avg.reduce((s,e)=>s+num(e.score),0)/avg.length:0;
  root.innerHTML=`${pageHeading('실전 모의고사','사설·개인 실전 풀이 기록을 주요 모의고사 성적과 분리해 관리합니다.',`<button class="btn btn-primary" data-action="add-exam">＋ 모의고사 등록</button>`)}
  <div class="grid grid-3"><div class="card metric-card"><div class="metric-label">누적 시험 기록</div><div class="metric-value">${exams.length}회</div></div><div class="card metric-card"><div class="metric-label">점수 입력 건 평균</div><div class="metric-value">${avg.length?mean.toFixed(1):'—'}</div></div><div class="card metric-card"><div class="metric-label">최고 점수</div><div class="metric-value">${avg.length?Math.max(...avg.map(e=>num(e.score))):'—'}</div></div></div>
  <div class="card section-gap"><div class="card-head"><div><h3>모의고사 이력</h3><p>점수, 시간, 등급 컷과 개인 메모를 함께 저장합니다.</p></div></div>${exams.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>시험 날짜</th><th>시험명</th><th>과목</th><th>내 점수</th><th>1등급 컷</th><th>차이</th><th>풀이 시간</th><th>난이도</th><th></th></tr></thead><tbody>${exams.map(e=>`<tr><td>${fmtDate(e.date,{month:'numeric',day:'numeric',year:'numeric'})}<small class="subtle">${fmtInputAt(e.inputAt||e.createdAt)}</small></td><td><strong>${esc(e.name)}</strong><small class="subtle">${esc(e.publisher||'')}</small></td><td>${esc(e.subject)}</td><td>${e.score??'—'}</td><td>${e.cut??'—'}</td><td>${e.score!=null&&e.cut!=null?`${num(e.score)-num(e.cut)>0?'+':''}${num(e.score)-num(e.cut)}`:'—'}</td><td>${e.minutes?fmtMin(e.minutes):'—'}</td><td>${esc(e.difficulty||'—')}</td><td><button class="btn btn-small btn-ghost" data-action="delete-exam" data-id="${e.id}">삭제</button></td></tr>`).join('')}</tbody></table></div>`:emptyState('아직 등록된 실전 모의고사가 없습니다','시험을 본 뒤 과목별 결과를 저장하세요.')}</div>
  <div class="card section-gap"><div class="card-head"><div><h3>과목별 점수 변화</h3><p>각 과목의 점수 입력 기록을 날짜순으로 표시합니다.</p></div></div><div class="subject-tabs">${SUBJECTS.map(s=>`<button class="subject-tab ${s==='국어'?'active':''}" data-action="exam-subject" data-subject="${s}">${s}</button>`).join('')}</div><div class="chart-wrap"><canvas id="exam-chart"></canvas></div></div>`;
  drawBarChart($('#exam-chart'),exams.filter(e=>e.subject==='국어'&&e.score!=null).slice().reverse().map(e=>({label:e.date.slice(5),value:num(e.score)})));
}

async function renderMajor(){
  const rows=(await getAll('majorExams')).sort((a,b)=>a.date.localeCompare(b.date));
  const subject=root.dataset.majorSubject||'국어';
  const metric=root.dataset.majorMetric||'score';
  const metricLabels={score:'원점수',standard:'표준점수',percentile:'백분위',grade:'등급'};
  const points=rows.map(r=>{const item=(r.results||[]).find(x=>x.subject===subject);const v=item?.[metric];return {label:r.name,date:r.date,value:v==null?null:num(v),grade:metric==='grade'};}).filter(x=>x.value!==null);
  root.innerHTML=`${pageHeading('주요 모의고사 성적','기존 성적표를 보존하고, 과목별 성적 변화를 그래프로 확인합니다.',`<button class="btn btn-primary" data-action="add-major">＋ 주요 모의고사 등록</button>`)}
  <div class="card"><div class="card-head"><div><h3>과목별 성적 추이</h3><p>백업에서 가져온 고2 3·6·9·10월 성적도 날짜순으로 표시됩니다.</p></div><span class="pill">${rows.length}회</span></div>
    <div class="subject-tabs">${SUBJECTS.map(s=>`<button class="subject-tab ${s===subject?'active':''}" data-action="major-subject" data-subject="${s}">${s}</button>`).join('')}</div>
    <div class="major-chart-toolbar"><label for="major-metric">그래프 기준</label><select id="major-metric">${Object.entries(metricLabels).map(([k,v])=>`<option value="${k}" ${k===metric?'selected':''}>${v}</option>`).join('')}</select></div>
    <div class="chart-wrap"><canvas id="major-trend-chart"></canvas></div>
    ${points.length?`<div class="major-chart-points">${points.map(p=>`<span>${esc(p.label)} · ${fmtDate(p.date,{year:'numeric',month:'numeric',day:'numeric'})}: <strong>${p.value}${metric==='grade'?'등급':metric==='percentile'?'%':'점'}</strong></span>`).join('')}</div>`:emptyState('해당 지표로 표시할 성적이 없습니다','성적표에 입력된 원점수·표준점수·백분위·등급이 그래프에 반영됩니다.')}
  </div>
  <div class="card section-gap"><div class="card-head"><div><h3>주요 모의고사 성적표</h3><p>회차별 전체 과목 결과와 입력 시각을 보존합니다.</p></div></div>${rows.length?rows.slice().reverse().map(r=>`<div class="card major-exam-card"><div class="card-head"><div><h3>${esc(r.name)}</h3><p>${fmtLongDate(r.date)} · ${esc(r.type||'모의고사')} · ${fmtInputAt(r.inputAt||r.createdAt)}</p></div><button class="btn btn-small btn-ghost" data-action="delete-major" data-id="${esc(r.id)}">삭제</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>과목</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th><th>등급 컷</th></tr></thead><tbody>${(r.results||[]).map(x=>`<tr><td>${esc(x.subject)}</td><td>${x.score??'—'}</td><td>${x.standard??'—'}</td><td>${x.percentile??'—'}</td><td>${x.grade??'—'}</td><td>${x.cut??'—'}</td></tr>`).join('')}</tbody></table></div>${r.memo?`<p class="subtle">${esc(r.memo)}</p>`:''}</div>`).join(''):emptyState('아직 주요 모의고사 성적이 없습니다','회차별 성적표를 등록하면 과목별 추이를 비교할 수 있습니다.')}</div>
  <div class="muted-box section-gap">기존 백업의 성적 데이터는 원본 점수를 그대로 유지합니다. 그래프는 날짜순으로 연결하며, 새 시험 성적을 등록하면 자동 반영됩니다.</div>`;
  drawLineChart($('#major-trend-chart'),points,metric==='grade');
  $('#major-metric')?.addEventListener('change',event=>{root.dataset.majorMetric=event.target.value;render('major');});
}

async function renderBooks(){bookObjectURLs.forEach(url=>URL.revokeObjectURL(url));bookObjectURLs=[];const books=(await getAll('books')).sort((a,b)=>(a.subject+a.name).localeCompare(b.subject+b.name));const filtered=activeBookSubject==='전체'?books:books.filter(b=>b.subject===activeBookSubject);const counts=Object.fromEntries(SUBJECTS.map(s=>[s,books.filter(b=>b.subject===s).length]));
  const covers=filtered.map(b=>{const url=b.coverBlob?URL.createObjectURL(b.coverBlob):null;if(url)bookObjectURLs.push(url);const pct=Math.min(100,num(b.totalPages)?num(b.currentPage)/num(b.totalPages)*100:0);return `<div class="book-cover" data-action="book-detail" data-id="${b.id}" style="background:${esc(b.coverColor||'#dce6dd')}">${url?`<img src="${url}" alt="${esc(b.name)} 표지">`:''}<div class="cover-tint"></div><strong>${esc(b.name)}</strong><small>${esc(b.publisher||b.subject)}</small><div class="book-status"><span style="width:${pct}%"></span></div></div>`;}).join('');
  root.innerHTML=`${pageHeading('과목별 교재 책장','직접 사용한 교재를 표지와 진행률로 모아 봅니다.',`<button class="btn btn-primary" data-action="add-book">＋ 교재 추가</button>`)}
  <div class="subject-tabs"><button class="subject-tab ${activeBookSubject==='전체'?'active':''}" data-action="book-subject" data-subject="전체">전체 ${books.length}</button>${SUBJECTS.map(s=>`<button class="subject-tab ${activeBookSubject===s?'active':''}" data-action="book-subject" data-subject="${s}">${s} ${counts[s]}</button>`).join('')}</div>
  ${filtered.length?`<div class="book-shelf">${covers}</div>`:emptyState('책장이 비어 있습니다','교재를 등록하면 과목별 책장에 꽂힙니다.')}
  <div class="grid grid-3 section-gap"><div class="mini-stat"><span>전체 교재</span><strong>${books.length}권</strong></div><div class="mini-stat"><span>진행 중</span><strong>${books.filter(b=>b.status==='진행 중').length}권</strong></div><div class="mini-stat"><span>완료</span><strong>${books.filter(b=>b.status==='완료').length}권</strong></div></div>`;
}

async function renderLife(){const today=todayISO(),from=addDays(today,-6);const [meals,exercises]=await Promise.all([getDateRange('meals',from,today),getDateRange('exercises',from,today)]);const exerciseTotal=exercises.reduce((a,e)=>a+num(e.minutes),0);
  root.innerHTML=`${pageHeading('식사 · 운동 기록','식사와 움직임을 평가하거나 칼로리로 관리하지 않고 생활 회고용으로 기록합니다.',`<button class="btn btn-secondary" data-action="add-meal">＋ 식사</button><button class="btn btn-primary" data-action="add-exercise">＋ 운동</button>`)}
  <div class="grid grid-3"><div class="card metric-card"><div class="metric-label">최근 7일 식사 기록</div><div class="metric-value">${meals.length}회</div></div><div class="card metric-card"><div class="metric-label">최근 7일 운동 기록</div><div class="metric-value">${exercises.length}회</div></div><div class="card metric-card"><div class="metric-label">운동 기록 시간</div><div class="metric-value">${fmtMin(exerciseTotal)}</div></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>식사 기록</h3><p>최근 7일</p></div></div>${meals.length?meals.sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).map(m=>`<div class="record-item"><span class="pill gold">${esc(m.mealType)}${m.photoBlob?' · 사진':''}</span><div class="record-main"><strong>${esc(m.food)}</strong><small>${fmtDate(m.date,{month:'numeric',day:'numeric'})} ${esc(m.time||'')} · ${fmtInputAt(m.inputAt||m.createdAt)} ${m.memo?'· '+esc(m.memo):''}</small></div><button class="inline-link" data-action="delete-meal" data-id="${m.id}">삭제</button></div>`).join(''):emptyState('식사 기록이 없습니다','하루의 식사를 간단히 남겨 보세요.')}</div>
  <div class="card"><div class="card-head"><div><h3>운동 기록</h3><p>최근 7일</p></div></div>${exercises.length?exercises.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<div class="record-item"><span class="pill green">${fmtMin(e.minutes)}</span><div class="record-main"><strong>${esc(e.type)}</strong><small>${fmtDate(e.date,{month:'numeric',day:'numeric'})} · ${esc(e.intensity||'강도 미입력')} · ${fmtInputAt(e.inputAt||e.createdAt)} ${e.memo?'· '+esc(e.memo):''}</small></div><button class="inline-link" data-action="delete-exercise" data-id="${e.id}">삭제</button></div>`).join(''):emptyState('운동 기록이 없습니다','가벼운 활동도 편하게 기록하세요.')}</div></div>`;
}

async function renderDiary(){const diaries=(await getAll('diaries')).sort((a,b)=>b.date.localeCompare(a.date));
  root.innerHTML=`${pageHeading('일기','공부 결과뿐 아니라 하루의 생각과 감정을 기록합니다.',`<button class="btn btn-primary" data-action="add-diary">＋ 오늘의 일기</button>`)}
  <div class="grid grid-2"><div class="card"><div class="card-head"><div><h3>기록한 하루</h3><p>날짜순으로 모아 보는 일기</p></div><input id="diary-search" placeholder="일기 검색" style="max-width:170px;border:1px solid #e2e9e2;border-radius:9px;padding:7px 9px;font-size:10px"></div><div id="diary-list">${diaries.length?diaries.map(d=>`<button class="record-item" style="width:100%;text-align:left;background:none;border:0;cursor:pointer" data-action="diary-detail" data-id="${d.id}"><span class="time-pill">${d.date.slice(5).replace('-','.')}</span><div class="record-main"><strong>${esc(d.title||'제목 없는 일기')}</strong><small>${esc(d.mood||'기분 미입력')} · ${fmtInputAt(d.inputAt||d.createdAt)} · ${(d.body||'').slice(0,48).replace(/</g,'&lt;')}</small></div></button>`).join(''):emptyState('아직 작성한 일기가 없습니다','첫 번째 하루를 기록해 보세요.')}</div></div>
  <div class="card"><div class="card-head"><div><h3>하루 돌아보기</h3><p>일기를 선택하면 해당 날짜의 학습·생활 기록을 함께 확인합니다.</p></div></div><div id="diary-detail-pane">${emptyState('일기를 선택해 주세요','왼쪽 목록에서 날짜를 선택하세요.')}</div></div></div>`;
  $('#diary-search').addEventListener('input',()=>{const q=$('#diary-search').value.toLowerCase();$('#diary-list').querySelectorAll('[data-id]').forEach(el=>el.classList.toggle('hidden',!el.textContent.toLowerCase().includes(q)));});
}
async function showDiaryDetail(id){const d=await getById('diaries',id);if(!d)return;const [entries,meals,exercises]=await Promise.all([getDateRange('studyEntries',d.date,d.date),getDateRange('meals',d.date,d.date),getDateRange('exercises',d.date,d.date)]);$('#diary-detail-pane').innerHTML=`<p class="eyebrow">${fmtLongDate(d.date)} · ${fmtInputAt(d.inputAt||d.createdAt)}</p><h3 style="font-size:17px">${esc(d.title||'제목 없는 일기')}</h3><span class="pill">${esc(d.mood||'기분 미입력')}</span>${d.photoBlob?`<img src="${temporaryImageURL(d.photoBlob)}" alt="일기 첨부 사진" style="width:100%;max-height:200px;object-fit:contain;margin-top:12px;border-radius:10px">`:''}<div class="note-paper" style="margin-top:13px">${esc(d.body||'')}</div><div class="divider"></div><div class="grid grid-3"><div class="mini-stat"><span>공부 시간</span><strong>${fmtMin(totalMinutes(entries))}</strong></div><div class="mini-stat"><span>식사 기록</span><strong>${meals.length}건</strong></div><div class="mini-stat"><span>운동 기록</span><strong>${exercises.length}건</strong></div></div><p class="subtle">${entries.map(e=>`${e.subject} ${fmtMin(e.minutes)}`).join(' · ')||'공부 기록 없음'}</p><button class="btn btn-secondary" data-action="edit-diary" data-id="${d.id}">일기 수정</button>`;}

async function renderDday(){const events=(await getAll('events')).sort((a,b)=>a.date.localeCompare(b.date));
  root.innerHTML=`${pageHeading('시험 D-Day','공식적으로 확인한 일정과 개인 중요 일정을 함께 관리합니다.',`<button class="btn btn-primary" data-action="add-event">＋ 시험·일정 등록</button>`)}
  <div class="card hero-card"><div class="hero-top"><div><div class="hero-label">OFFICIAL EXAM DATE</div><div class="hero-dday">${dday('2027-11-18')}</div><div class="hero-date">2028학년도 대학수학능력시험 · 2027년 11월 18일(목)</div></div><div class="hero-side"><strong>2027.11.18</strong><span>교육부 발표 일정</span></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><h3>등록한 시험 및 중요 일정</h3><p>날짜와 유형을 직접 변경할 수 있습니다.</p></div></div>${events.length?events.map(e=>`<div class="record-item"><span class="pill ${e.official?'green':'gold'}">${esc(e.type||'개인 일정')}</span><div class="record-main"><strong>${esc(e.name)}</strong><small>${fmtLongDate(e.date)} · ${dday(e.date)} · ${fmtInputAt(e.inputAt||e.createdAt)} ${e.official?'· 공식 확인':''}</small></div><div class="table-actions"><button class="btn btn-small btn-ghost" data-action="edit-event" data-id="${e.id}">수정</button>${e.id!=='csat-2028'?`<button class="btn btn-small btn-ghost" data-action="delete-event" data-id="${e.id}">삭제</button>`:''}</div></div>`).join(''):emptyState()}</div>
  <div class="muted-box" style="margin-top:14px">기본 등록된 2028 수능 날짜는 교육부의 2025년 6월 1일 발표 내용입니다. 교육청·평가원 모의고사 일정은 공식 공고 확인 후 직접 추가해 주세요.</div>`;
}

async function renderBackup(){const [status,last]=await Promise.all([storageStatus(),getSetting('lastBackupAt',null)]);const used=status.usage?`${(status.usage/1024/1024).toFixed(1)} MB`:'확인 불가';const quota=status.quota?`${(status.quota/1024/1024).toFixed(0)} MB`:'확인 불가';
  root.innerHTML=`${pageHeading('데이터 백업 · 복원','기록은 이 기기에 저장됩니다. 정기적으로 파일 앱이나 iCloud Drive에 백업 파일을 보관하세요.',`<button class="btn btn-primary" data-action="backup-export">전체 데이터 백업</button>`)}
  <div class="grid grid-2"><div class="card"><div class="card-head"><div><h3>저장 공간 상태</h3><p>브라우저가 제공하는 저장 공간 정보를 표시합니다.</p></div><span class="pill ${status.persisted?'green':'gold'}">${status.persisted?'영구 저장 승인':'영구 저장 미승인'}</span></div><div class="status-row"><span>저장 공간 사용량</span><strong>${used}</strong></div><div class="status-row"><span>추정 할당량</span><strong>${quota}</strong></div><div class="status-row"><span>영구 저장 요청</span><strong>${status.persisted?'승인됨':'지원 여부 또는 승인 상태 확인 필요'}</strong></div><button class="btn btn-secondary" style="margin-top:13px" data-action="request-persist">영구 저장 다시 요청</button><p class="subtle" style="margin-top:10px">영구 저장은 브라우저의 저장 공간 정리 대상이 될 가능성을 줄이지만, 기기 고장·사용자 삭제·브라우저 데이터 초기화까지 막아주지는 않습니다.</p></div>
  <div class="card"><div class="card-head"><div><h3>백업 기록</h3><p>일요일마다 직접 백업 파일을 내보내는 것을 권장합니다.</p></div></div><div class="status-row"><span>마지막 백업</span><strong>${last?fmtLongDate(todayISO(new Date(last)))+' '+fmtClock(new Date(last)):'아직 없음'}</strong></div><div class="status-row"><span>백업 형식</span><strong>JSON · 이미지 포함</strong></div><div class="status-row"><span>데이터베이스</span><strong>${DB_NAME} / v${DB_VERSION}</strong></div><button class="btn btn-primary" style="width:100%;margin-top:14px" data-action="backup-export">지금 전체 백업하기</button></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>백업 파일 복원</h3><p>복원 전에 최신 데이터 백업을 먼저 권장합니다.</p></div></div><div class="file-drop"><strong>백업 JSON 파일 선택</strong><p class="subtle">이 앱에서 내보낸 exam-life-backup.json 또는 첨부한 2026-11-17 백업 파일</p><input id="restore-file" type="file" accept=".json,application/json"></div><div id="restore-preview" class="subtle" style="margin-top:12px">선택한 파일의 구조를 검사한 뒤 미리보기를 표시합니다.</div></div>
  <div class="card"><div class="card-head"><div><h3>복원 방식</h3><p>기존 데이터와 충돌할 때의 처리 방식입니다.</p></div></div><div class="muted-box">병합: 같은 ID의 기존 데이터는 유지하고 없는 항목만 추가합니다. 기존 값을 덮어쓰지 않습니다.<br><br>전체 복원: 현재 모든 저장소를 백업 내용으로 교체합니다. 복원 전에 반드시 별도 백업 파일을 내려받으세요.</div><div class="tag-row" style="margin-top:13px"><button class="btn btn-secondary" data-action="restore-merge" disabled id="restore-merge">병합 복원</button><button class="btn btn-danger" data-action="restore-replace" disabled id="restore-replace">전체 복원</button></div></div></div>
  <div class="muted-box section-gap">백업 파일은 이미지 Blob을 포함해 하나의 JSON으로 저장합니다. 이미지가 많으면 파일이 커질 수 있습니다. 내보낸 파일을 iPad 파일 앱의 ‘나의 iPad’ 또는 iCloud Drive에 직접 저장해 주세요. 앱이 꺼져 있을 때 임의로 파일을 저장하지 않습니다.</div>`;
  $('#restore-file').addEventListener('change',inspectRestoreFile);
}
let restorePayload=null;
async function inspectRestoreFile(e){const file=e.target.files?.[0];restorePayload=null;$('#restore-merge').disabled=true;$('#restore-replace').disabled=true;if(!file)return;try{if(file.size>250*1024*1024)throw new Error('250MB보다 큰 백업은 브라우저에서 처리하지 못할 수 있습니다.');const text=await file.text();const data=JSON.parse(text);if(data.format!=='exam-life-backup'||!data.stores)throw new Error('지원하지 않는 백업 파일입니다.');restorePayload=data;const counts=Object.entries(data.stores).map(([k,v])=>`${k}: ${Array.isArray(v)?v.length:0}`).join(' · ');$('#restore-preview').innerHTML=`<div class="pill green">유효한 백업 파일</div><p>내보낸 시각: ${esc(data.exportedAt||'정보 없음')}</p><p>DB 버전: ${esc(data.schemaVersion)}</p><p>${esc(counts)}</p>`;$('#restore-merge').disabled=false;$('#restore-replace').disabled=false;}catch(err){$('#restore-preview').textContent=err.message;toast(err.message,'error');}}
async function exportBackup(){toast('백업 파일을 만드는 중입니다.','warning');const payload=await createBackupPayload();const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});saveBlob(blob,`exam-life-backup-${todayISO()}.json`);await setSetting('lastBackupAt',new Date().toISOString());toast('백업 파일을 내보냈습니다. 파일 앱에 저장해 주세요.');if(activeView==='backup')await renderBackup();}
async function importBackup(mode){if(!restorePayload)throw new Error('먼저 백업 파일을 선택해 주세요.');const confirmText=mode==='replace'?'현재 앱의 모든 기록이 선택한 백업 내용으로 교체됩니다. 이미 별도 백업을 만들었나요?':'기존 기록은 유지하고 중복 ID가 아닌 항목만 추가합니다. 첨부된 2026-11-17 백업은 이 병합 방식으로 가져오세요.';if(!confirm(confirmText+'\n복원을 진행할까요?'))return;const result=await restoreDatabase(restorePayload,mode);restorePayload=null;toast(`복원 완료 · 추가 ${result.inserted}건 / 중복 보존 ${result.skipped}건`);await render(activeView);}

const PUBLIC_ARCHIVE_GROUPS=[
  {id:'study',label:'공부 기록',stores:['studyEntries','dailyStudy'],description:'날짜·과목·공부 시간·공부 메모'},
  {id:'schedule',label:'시간표·일정',stores:['schedules','events','attendance'],description:'공개해도 괜찮은 일정과 출석 기록'},
  {id:'tasks',label:'기간별 목표',stores:['periodTasks'],description:'목표·할 일 및 진행 상태'},
  {id:'exams',label:'모의고사·성적',stores:['exams','majorExams'],description:'시험명·날짜·과목별 결과'},
  {id:'books',label:'교재 기록',stores:['books'],description:'교재명·학습 진행 상황'},
  {id:'life',label:'식사·운동',stores:['meals','exercises'],description:'식사 및 운동 기록'},
  {id:'diary',label:'일기·회고',stores:['diaries'],description:'개인 메모가 포함될 수 있어 신중하게 선택하세요'}
];

async function renderPublicArchive(){
  const counts={};
  for(const group of PUBLIC_ARCHIVE_GROUPS) for(const store of group.stores) counts[store]=(await getAll(store)).length;
  root.innerHTML=`${pageHeading('공개 학습 아카이브','공개하고 싶은 기록 영역만 직접 선택해 별도의 HTML 파일로 내보냅니다. 아무 항목도 자동 선택되지 않습니다.')}
  <div class="card"><div class="card-head"><div><h3>① 공유할 기록 선택</h3><p>선택한 영역만 내보냅니다. 체크하지 않은 영역은 파일에 포함하지 않습니다.</p></div><span class="pill">기본 전체 비공개</span></div>
  <div class="grid grid-2">${PUBLIC_ARCHIVE_GROUPS.map(g=>`<label class="status-row" style="display:flex;align-items:center;gap:12px;cursor:pointer"><input type="checkbox" data-public-group="${g.id}" style="width:20px;height:20px;flex:0 0 auto"><span style="flex:1"><strong>${esc(g.label)}</strong><small class="subtle" style="display:block">${esc(g.description)}</small></span><strong>${g.stores.reduce((n,k)=>n+(counts[k]||0),0)}건</strong></label>`).join('')}</div>
  <div class="divider"></div><h3>② 공개 페이지 정보</h3><div class="form-grid">${field('페이지 제목','pub-title','나의 수험생활 기록')}${field('표시할 이름 (선택)','pub-name','','text','placeholder="비워 두면 이름을 표시하지 않습니다"')}</div>
  <div class="muted-box" style="margin-top:12px"><strong>개인정보 보호</strong><br>내부 ID, 계정·연락처·비밀번호 관련 필드, 입력 시각, 첨부 파일 등은 제외합니다. 다만 자유 입력 문장 속 실명·학교·학원·주소·생활 패턴은 자동으로 완벽히 가릴 수 없습니다. 특히 일기와 일정은 공개 전에 내용을 직접 확인하세요.</div>
  <div class="muted-box" style="margin-top:10px"><strong>보물상자</strong><br>보물상자의 소원과 암호화 데이터는 공개 아카이브에 포함하지 않습니다. 하루 공부 결산도 공개 아카이브에 포함하지 않습니다.</div>
  <div class="divider"></div><button class="btn btn-secondary" data-action="public-select-all">모든 영역 선택</button><button class="btn btn-ghost" data-action="public-clear-selection">선택 해제</button><button class="btn btn-secondary" data-action="preview-public-archive">선택 내용 미리보기</button><button class="btn btn-primary" data-action="export-public-archive">선택한 기록 HTML 만들기</button><div id="public-archive-preview" class="section-gap"></div></div>
  <div class="muted-box section-gap">HTML 파일은 이 기기에서만 생성되며 자동 게시되지 않습니다. GitHub 등에 업로드하면 누구나 열람·복사할 수 있으므로 생성 파일을 열어 공개할 내용인지 확인하세요.</div>`;
}

function getSelectedPublicGroups(){
  const ids=[...root.querySelectorAll('[data-public-group]:checked')].map(el=>el.dataset.publicGroup);
  return PUBLIC_ARCHIVE_GROUPS.filter(g=>ids.includes(g.id));
}
function sanitizePublicRecord(value,key=''){
  const blockedKey=/(^|_)(id|key|inputat|createdat|updatedat|deletedat|timestamp|email|phone|telephone|mobile|address|postal|zipcode|latitude|longitude|lat|lng|password|passwd|token|secret|privatekey|photo(blob)?|image(blob)?|attachment|ownerid|userid|account|auth)(_|$)/i;
  if(blockedKey.test(String(key).replace(/[A-Z]/g,m=>'_'+m.toLowerCase())))return undefined;
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string'){
    return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[이메일 가림]')
      .replace(/(?<!\d)(?:\+?82[- .]?)?0?1[016789][- .]?\d{3,4}[- .]?\d{4}(?!\d)/g,'[전화번호 가림]')
      .replace(/\b\d{6}[- ]?[1-4]\d{6}\b/g,'[식별번호 가림]');
  }
  if(Array.isArray(value))return value.map(v=>sanitizePublicRecord(v)).filter(v=>v!==undefined);
  if(typeof value==='object'){
    if(typeof Blob!=='undefined'&&value instanceof Blob)return undefined;
    const out={};
    for(const [k,v] of Object.entries(value)){const safe=sanitizePublicRecord(v,k);if(safe!==undefined)out[k]=safe;}
    return out;
  }
  return undefined;
}
async function collectSelectedPublicArchive(){
  const groups=getSelectedPublicGroups();
  if(!groups.length)throw new Error('공유할 기록 영역을 하나 이상 선택해 주세요.');
  const title=($('#pub-title')?.value||'나의 수험생활 기록').trim().slice(0,80)||'나의 수험생활 기록';
  const displayName=($('#pub-name')?.value||'').trim().slice(0,40);
  const sections=[];
  for(const group of groups){
    const records=[];
    for(const store of group.stores){
      for(const row of await getAll(store)){
        const safe=sanitizePublicRecord(row);
        if(safe&&typeof safe==='object')records.push({...safe,_recordType:store});
      }
    }
    records.sort((a,b)=>String(a.date||a.startDate||'').localeCompare(String(b.date||b.startDate||'')));
    sections.push({label:group.label,records});
  }
  return {title,displayName,generatedAt:new Date().toISOString(),sections,excluded:['보물상자·소원 및 암호화 데이터','설정·암호화 키','감사 로그','휴지통','사진·첨부 파일','내부 ID·입력 시각']};
}
async function previewPublicArchive(){
  const d=await collectSelectedPublicArchive();const el=$('#public-archive-preview');if(!el)return;
  const rows=d.sections.map(x=>`<div class="status-row"><span>${esc(x.label)}</span><strong>${x.records.length}건</strong></div>`).join('');
  const samples=d.sections.map(section=>`<details style="margin-top:10px"><summary>${esc(section.label)} · 내용 미리보기</summary>${section.records.slice(0,3).map(record=>`<pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto">${esc(JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k])=>k!=='_recordType')),null,2))}</pre>`).join('')||'<p class="subtle">포함할 기록이 없습니다.</p>'}${section.records.length>3?`<p class="subtle">외 ${section.records.length-3}건은 내보내기 파일에서 확인할 수 있습니다.</p>`:''}</details>`).join('');
  const total=d.sections.reduce((n,x)=>n+x.records.length,0);
  el.innerHTML=`<div class="card"><h3>선택한 내용 미리보기</h3>${rows}<div class="divider"></div><p><strong>총 ${total}건</strong>을 HTML에 포함합니다.</p>${samples}<p class="subtle">각 영역을 펼쳐 실제 공개 내용을 확인하세요. 미리보기는 영역별 최대 3건만 표시합니다. 자동 필터는 자유 입력 속 개인정보를 완벽히 찾아내지 못합니다.</p></div>`;
}
async function exportPublicArchive(){
  const d=await collectSelectedPublicArchive();
  const recordCount=d.sections.reduce((n,x)=>n+x.records.length,0);
  if(!confirm(`선택한 ${d.sections.length}개 영역의 기록 ${recordCount}건을 공개용 HTML 파일로 만들까요? 생성 파일을 다른 사람에게 공유하기 전에 개인정보를 직접 확인해야 합니다.`))return;
  const escHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sections=d.sections.map(section=>`<section class="panel"><h2>${escHTML(section.label)} <small>${section.records.length}건</small></h2>${section.records.length?section.records.map(record=>`<article class="record"><div class="meta">${escHTML(record.date||record.startDate||record.endDate||'날짜 미기록')} · ${escHTML(record._recordType)}</div><pre>${escHTML(JSON.stringify(Object.fromEntries(Object.entries(record).filter(([k])=>k!=='_recordType')),null,2))}</pre></article>`).join(''):'<p class="muted">선택한 영역에 공개할 기록이 없습니다.</p>'}</section>`).join('');
  const total=d.sections.reduce((n,x)=>n+x.records.length,0);
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escHTML(d.title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#101114;color:#f3f4f6;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}.wrap{max-width:1000px;margin:auto;padding:30px 18px 70px}.hero{padding:35px 0;border-bottom:1px solid #383a42}.eyebrow,.meta,.muted,small{color:#a1a1aa}.hero h1{font-size:clamp(30px,6vw,52px);margin:8px 0}.panel{background:#1b1d22;border:1px solid #30323a;border-radius:16px;padding:18px;margin:18px 0}.record{padding:13px 0;border-top:1px solid #34363d}.record pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.65 ui-monospace,monospace;color:#e4e4e7;background:#111216;padding:12px;border-radius:9px}.notice{padding:13px;background:#29251b;border:1px solid #65552d;border-radius:10px;color:#f4df9a}@media(max-width:600px){.wrap{padding:20px 12px 50px}.panel{padding:13px}}</style></head><body><main class="wrap"><header class="hero"><div class="eyebrow">SELECTED STUDY ARCHIVE</div><h1>${escHTML(d.title)}</h1><p>${d.displayName?escHTML(d.displayName)+' · ':''}선택한 수험생활 기록</p><p class="muted">총 ${total}건 · 생성 ${escHTML(d.generatedAt.slice(0,10))}</p></header><p class="notice">사용자가 선택한 기록 영역만 포함한 사본입니다. 자유 입력 문장에 포함된 실명·장소·생활 패턴은 자동으로 완벽히 가려지지 않을 수 있습니다.</p>${sections}<footer class="muted">개인이 직접 선택해 내보낸 수험생활 아카이브입니다.</footer></main></body></html>`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='my-selected-study-archive.html';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  await addAudit('public-archive-export-selected',{records:total,sections:d.sections.map(x=>x.label)});
  toast(`선택한 기록 ${total}건의 공개 HTML을 만들었습니다. 게시 전에 파일을 직접 확인하세요.`);
}

async function renderSettings(){const colors=await getSetting('subjectColors',SUBJECT_COLORS);cachedColors={...SUBJECT_COLORS,...colors};const restDays=await getSetting('restDays',[]);const hidden=await getSetting('hiddenWidgets',[]);const widgetLabels={todaySchedule:'오늘의 시간표',subjectTime:'과목별 공부',life:'식사 · 운동',recentExam:'최근 모의고사',weeklyTrend:'주간 공부 흐름',recentDiary:'최근 일기'};
  const theme=await getSetting('appTheme',{background:'#000000'});const palette=themePalette(theme.background||'#000000');
  root.innerHTML=`${pageHeading('앱 설정','배경 테마와 과목 색상, 기록 보존 및 화면 구성을 관리합니다.')}
  <div class="card theme-settings-card"><div class="card-head"><div><h3>화면 테마</h3><p>배경색을 고르면 글자·카드·버튼과 과목별 색상을 자동으로 조화롭게 맞춥니다.</p></div></div><div class="theme-picker-row"><label for="theme-background">배경 색상</label><input id="theme-background" type="color" value="${esc(theme.background||'#000000')}"><span id="theme-hex">${esc(theme.background||'#000000')}</span></div><div class="theme-presets">${[['#000000','블랙'],['#171923','미드나잇'],['#263238','슬레이트'],['#263b35','포레스트'],['#f2f0eb','웜 아이보리'],['#e8eef5','쿨 블루']].map(([c,n])=>`<button type="button" class="theme-preset" data-theme-preset="${c}"><i style="background:${c}"></i>${n}</button>`).join('')}</div><div class="theme-preview" id="theme-preview" style="--preview-bg:${palette.bg};--preview-surface:${palette.surface};--preview-ink:${palette.ink};--preview-accent:${palette.accent}"><strong>테마 미리보기</strong><span>오늘의 공부 기록 · 수학</span><button type="button">저장된 기록</button><div class="theme-subject-swatches">${Object.entries(palette.subjects).map(([n,c])=>`<i title="${n}" style="background:${c}"></i>`).join('')}</div></div><button class="btn btn-primary" style="margin-top:13px" data-action="save-theme">테마 적용 및 과목 색상 자동 조정</button></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>데이터 보존</h3><p>앱 업데이트와 기록 데이터는 분리되어 있습니다.</p></div><span class="pill green">IndexedDB</span></div><div class="status-row"><span>데이터베이스 이름</span><strong>${DB_NAME}</strong></div><div class="status-row"><span>현재 스키마 버전</span><strong>${DB_VERSION}</strong></div><div class="status-row"><span>앱 데이터 초기화</span><strong>제공하지 않음</strong></div><div class="muted-box" style="margin-top:12px">앱 파일을 새 버전으로 바꾸더라도 이 데이터베이스 이름을 유지합니다. 브라우저 데이터 삭제 전에는 반드시 백업하세요.</div><button class="btn btn-secondary" style="margin-top:12px" data-view="backup">백업 설정 열기</button></div>
  <div class="card"><div class="card-head"><div><h3>휴식일 설정</h3><p>휴식일은 출석 연속 계산에서 건너뜁니다.</p></div></div><div class="tag-row">${['일','월','화','수','목','금','토'].map((d,i)=>`<label class="pill"><input type="checkbox" data-rest-day="${i}" ${restDays.includes(i)?'checked':''}> ${d}요일</label>`).join('')}</div><button class="btn btn-primary" style="margin-top:15px" data-action="save-rest-days">휴식일 저장</button></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>과목별 색상</h3><p>모든 기록과 그래프에 같은 색상이 사용됩니다.</p></div></div>${SUBJECTS.map(s=>`<div class="status-row"><span>${s}</span><input type="color" data-subject-color="${s}" value="${cachedColors[s]}" style="width:45px;height:30px;border:0;background:none"></div>`).join('')}<button class="btn btn-primary" style="margin-top:13px" data-action="save-colors">색상 저장</button></div>
  <div class="card"><div class="card-head"><div><h3>대시보드 위젯</h3><p>표시할 항목을 선택하고 순서를 조정할 수 있습니다.</p></div></div>${Object.entries(widgetLabels).map(([k,label])=>`<label class="toggle-row"><span>${label}</span><input type="checkbox" data-widget="${k}" ${hidden.includes(k)?'':'checked'}></label>`).join('')}<div class="field" style="margin-top:12px"><label for="widget-order-target">순서를 이동할 위젯</label><select id="widget-order-target">${Object.entries(widgetLabels).map(([k,label])=>`<option value="${k}">${label}</option>`).join('')}</select></div><div class="tag-row" style="margin-top:9px"><button class="btn btn-secondary" data-action="move-widget-up">선택 항목 순서 위로</button><button class="btn btn-secondary" data-action="move-widget-down">선택 항목 순서 아래로</button></div><p class="subtle">위젯 표시 여부와 순서는 별도로 저장됩니다.</p><button class="btn btn-primary" data-action="save-widgets">표시 설정 저장</button></div></div>
  <div class="card section-gap"><div class="card-head"><div><h3>ChatGPT 시간표 수정 워크플로</h3><p>직접 연결하지 않고 JSON 내보내기·가져오기로 적용합니다.</p></div></div><p class="subtle">현재 일정을 JSON으로 내보내고, ChatGPT에서 변경한 JSON을 다시 가져와 미리보기 후 미래 일정에 적용할 수 있습니다.</p><button class="btn btn-secondary" data-action="export-schedule-json">현재 시간표 JSON 복사</button><button class="btn btn-ghost" data-action="import-schedule-json">수정된 시간표 JSON 붙여넣기</button></div>`;
}

// ---------- Canvas charts ----------
function themeInk(){const s=getComputedStyle(document.documentElement);const pick=(name,fallback)=>s.getPropertyValue(name).trim()||fallback;return {ink:pick('--theme-ink','#f2f2f2'),muted:pick('--theme-muted','#a0a0a0'),line:pick('--theme-line','#303030'),surface:pick('--theme-surface','#111'),accent:pick('--theme-accent','#d0d0d0')};}
function setupCanvas(canvas){if(!canvas)return null;const rect=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);return {ctx,w:rect.width,h:rect.height};}
function drawBarChart(canvas,rows,{compact=false}={}){const setup=setupCanvas(canvas);if(!setup)return;const {ctx,w,h}=setup;const tc=themeInk();ctx.clearRect(0,0,w,h);const pad={l:34,r:10,t:14,b:26};const chartW=w-pad.l-pad.r,chartH=h-pad.t-pad.b;const max=Math.max(1,...rows.map(r=>r.value));ctx.font='9px sans-serif';ctx.strokeStyle=tc.line;ctx.fillStyle=tc.muted;for(let i=0;i<=4;i++){const y=pad.t+chartH*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();if(!compact){ctx.textAlign='right';ctx.fillText(String(Math.round(max*(1-i/4))),pad.l-7,y+3);}}
  const gap=rows.length>20?3:8;const bw=Math.max(2,(chartW-gap*(rows.length-1))/rows.length);rows.forEach((r,i)=>{const value=num(r.value),bh=value/max*chartH,x=pad.l+i*(bw+gap),y=pad.t+chartH-bh;ctx.fillStyle=tc.accent;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,bw,Math.max(2,bh),[4,4,0,0]);else ctx.rect(x,y,bw,bh);ctx.fill();if(rows.length<=10||i%5===0||i===rows.length-1){ctx.fillStyle=tc.muted;ctx.textAlign='center';ctx.fillText(r.label,x+bw/2,h-8);}});
}
function drawLineChart(canvas,rows,invertGrade=false){
  const setup=setupCanvas(canvas);if(!setup)return;const {ctx,w,h}=setup;ctx.clearRect(0,0,w,h);
  const pad={l:40,r:18,t:18,b:38},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  const tc=themeInk();if(!rows.length){ctx.fillStyle=tc.muted;ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('성적을 입력하면 추이가 표시됩니다.',w/2,h/2);return;}
  const values=rows.map(r=>invertGrade?10-r.value:r.value),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  ctx.font='10px sans-serif';ctx.strokeStyle=tc.line;ctx.fillStyle=tc.muted;ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const y=pad.t+ch*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const tick=max-span*i/4;const label=invertGrade?String(Math.round(10-tick)):String(Math.round(tick*10)/10);ctx.textAlign='right';ctx.fillText(label,pad.l-7,y+3);}
  const xAt=i=>rows.length===1?pad.l+cw/2:pad.l+i*cw/(rows.length-1);
  const yAt=v=>pad.t+(max-v)/span*ch;
  ctx.beginPath();values.forEach((v,i)=>{const x=xAt(i),y=yAt(v);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.strokeStyle=tc.ink;ctx.lineWidth=2.4;ctx.lineJoin='round';ctx.stroke();
  values.forEach((v,i)=>{const x=xAt(i),y=yAt(v);ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fillStyle=tc.ink;ctx.fill();ctx.strokeStyle=tc.surface;ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle=tc.ink;ctx.textAlign='center';ctx.font='700 10px sans-serif';ctx.fillText(rows[i].value+(invertGrade?'등급':'점'),x,y-10);ctx.fillStyle=tc.muted;ctx.font='9px sans-serif';ctx.fillText(rows[i].label.length>7?rows[i].label.slice(0,7)+'…':rows[i].label,x,h-20);});
}

function drawPieChart(canvas,rows){const setup=setupCanvas(canvas);if(!setup)return;const {ctx,w,h}=setup;ctx.clearRect(0,0,w,h);const total=rows.reduce((s,r)=>s+r.value,0);const tc=themeInk();if(!total){ctx.fillStyle=tc.muted;ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('기록이 쌓이면 그래프가 표시됩니다.',w/2,h/2);return;}let angle=-Math.PI/2;const r=Math.min(h*.39,w*.22);const cx=w/2,cy=h/2;for(const row of rows){if(!row.value)continue;const next=angle+row.value/total*Math.PI*2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,next);ctx.closePath();ctx.fillStyle=row.color;ctx.fill();angle=next;}ctx.beginPath();ctx.arc(cx,cy,r*.57,0,Math.PI*2);ctx.fillStyle=tc.surface;ctx.fill();ctx.fillStyle=tc.ink;ctx.textAlign='center';ctx.font='700 13px sans-serif';ctx.fillText(fmtMin(total),cx,cy+4);}

// ---------- Modal form builders ----------
function openStudyModal(date=todayISO(),existing=null){openModal(existing?'공부 기록 수정':'공부 기록 추가',`<div class="form-grid">${field('공부한 날짜','date',existing?.date||date,'date')}${selectField('과목','subject',SUBJECTS.map(s=>({value:s,label:s})),existing?.subject||'국어')}${field('공부 내용','content',existing?.content||'','text','placeholder="예: 수학 미적분 기출 20문제"')}${selectField('공부 결과','result',[{value:'O',label:'O · 익힘 / 이해함'},{value:'X',label:'X · 미흡 / 다시 보기'},{value:'△',label:'△ · 일부 이해 / 보완'}],existing?.result||'△')}${field('공부 시간 (분 · 선택)','minutes',existing?.minutes?String(existing.minutes):'','number','min="0" max="1440" placeholder="시간은 생략해도 됩니다"')}</div><p class="subtle">이 기록을 입력한 날짜와 시각은 자동으로 저장됩니다. 시간은 선택 사항이며, 월간 달력의 하루 총 시간은 별도로 입력할 수 있습니다.</p>`,async d=>addStudy(d,existing?.source||'manual',existing));}
async function openDailyStudyModal(date=plannerDate){
  const existing=await getById('dailyStudy',date);
  const entries=await getDateRange('studyEntries',date,date);
  const current=existing?num(existing.minutes):totalMinutes(entries);
  openModal('하루 공부 시간 입력',`<div class="form-grid">${field('날짜','date',date,'date')}${field('하루 총 공부 시간 (분)','minutes',String(current),'number','min="0" max="1440" required')}</div><p class="subtle">입력한 총 시간은 월간 달력의 색 농도에 사용됩니다. 공부 기록별 시간과 별도로 관리되며, 입력한 값을 우선 표시합니다.</p>`,async d=>{
    const minutes=num(d.minutes);if(minutes<0||minutes>1440)throw new Error('0~1,440분 사이로 입력해 주세요.');
    const now=new Date().toISOString();await put('dailyStudy',{date:d.date||date,minutes,createdAt:existing?.createdAt||now,inputAt:existing?.inputAt||now,updatedAt:now});
    toast('하루 공부 시간을 저장했습니다.');await render('planner');
  },'DAILY STUDY');
}

function openScheduleModal(date=plannerDate,existing=null){
  const isEdit=!!existing;
  const recurrenceSection = !isEdit ? `<div class="recurrence-section muted-box" style="margin-top:12px"><h4 style="margin:0 0 8px">반복 일정 설정</h4><div class="form-grid">${selectField('반복','repeat',[{value:'none',label:'반복 없음'},{value:'daily',label:'매일 반복'},{value:'weekly',label:'매주 반복'}],'none')}${field('반복 종료 날짜','until',addDays(date,90),'date')}</div></div>` : '';
  const seriesNote = isEdit && existing.recurrenceId ? `<div class="muted-box" style="margin-top:12px">반복 일정 중 이 날짜만 수정합니다. 전체 또는 이후 일정을 변경하려면 아래 버튼을 사용하세요.</div><button type="button" class="btn btn-secondary" id="edit-series" style="margin-top:10px">이 날짜 이후 반복 일정 변경</button>` : '';
  openModal(isEdit?'일정 수정':'일정 추가',`<div class="form-grid schedule-form">${field('일정 이름','title',existing?.title||'')}${selectField('일정 유형','type',['학교','학원','개인 공부','시험','개인'].map(x=>({value:x,label:x})),existing?.type||'개인 공부')}${field('날짜','date',existing?.date||date,'date')}${selectField('과목 (선택)','subject',[{value:'',label:'과목 미지정'},...SUBJECTS.map(s=>({value:s,label:s}))],existing?.subject||'')}${field('시작 시각','startTime',existing?.startTime||'','time')}${field('종료 시각','endTime',existing?.endTime||'','time')}${textareaField('메모','memo',existing?.memo||'')}</div>${recurrenceSection}${seriesNote}`,async d=>{if(isEdit){await put('schedules',{...existing,...d,updatedAt:new Date().toISOString()});await addAudit('schedule-edit',{id:existing.id,date:existing.date});toast('일정을 수정했습니다.');await render('planner');}else await addScheduleRecord(d);});
  if(isEdit){
    const actions = document.querySelector('.modal-actions');
    if(actions && !actions.querySelector('.btn-delete')){
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-ghost btn-delete';
      delBtn.textContent = '삭제하기';
      delBtn.style.marginRight = 'auto';
      delBtn.onclick = () => handleScheduleDelete(existing);
      actions.insertBefore(delBtn, actions.firstChild);
    }
  }
  if(isEdit&&existing.recurrenceId){$('#edit-series').onclick=()=>{modal.close();openSeriesEdit(existing);};}
}
async function handleScheduleDelete(existing){
  if(existing.date < todayISO()){ toast('과거 일정은 삭제하지 않습니다.','warning'); return; }
  if(existing.recurrenceId){
    const choice = prompt('삭제 범위를 선택하세요:\n1. 이 일정만 삭제\n2. 이 날짜 이후의 반복 일정 삭제\n3. 반복 일정 전체 삭제\n번호를 입력하세요 (1/2/3):');
    if(!choice) return;
    const c = choice.trim();
    if(c==='1'){
      if(confirm('이 일정만 삭제하시겠습니까?')){ await remove('schedules', existing.id); await addAudit('schedule-delete',{id:existing.id}); toast('일정을 삭제했습니다.'); modal.close(); await render('planner'); }
    } else if(c==='2'){
      if(confirm('이 날짜 이후의 반복 일정을 삭제하시겠습니까?')){
        const rows = (await getAll('schedules')).filter(r=>r.recurrenceId===existing.recurrenceId && r.date>=existing.date && r.date>=todayISO());
        for(const r of rows) await remove('schedules', r.id);
        await addAudit('schedule-series-delete',{recurrenceId:existing.recurrenceId,from:existing.date,count:rows.length});
        toast(`${rows.length}개의 일정을 삭제했습니다.`); modal.close(); await render('planner');
      }
    } else if(c==='3'){
      if(confirm('반복 일정 전체를 삭제하시겠습니까? (과거 일정은 보호됩니다)')){
        const rows = (await getAll('schedules')).filter(r=>r.recurrenceId===existing.recurrenceId && r.date>=todayISO());
        for(const r of rows) await remove('schedules', r.id);
        await addAudit('schedule-series-delete',{recurrenceId:existing.recurrenceId,count:rows.length});
        toast(`${rows.length}개의 일정을 삭제했습니다.`); modal.close(); await render('planner');
      }
    } else toast('잘못된 선택입니다.','warning');
  } else {
    if(confirm('이 일정을 삭제하시겠습니까?')){ await remove('schedules', existing.id); await addAudit('schedule-delete',{id:existing.id}); toast('일정을 삭제했습니다.'); modal.close(); await render('planner'); }
  }
}
function openSeriesEdit(existing){openModal('이 날짜 이후 반복 일정 변경',`<div class="form-grid">${field('일정 이름','title',existing.title)}${field('시작 시각','startTime',existing.startTime||'','time')}${field('종료 시각','endTime',existing.endTime||'','time')}${field('적용 기준일','fromDate',existing.date,'date',`min="${todayISO()}"`)}${textareaField('메모','memo',existing.memo||'')}</div><div class="muted-box">기준일보다 이전인 일정과 이미 기록된 공부 시간은 수정하지 않습니다. 완료 표시도 각 일정의 상태를 유지합니다.</div>`,async d=>{if(d.fromDate<todayISO())throw new Error('미래 일정만 변경할 수 있습니다.');const rows=(await getAll('schedules')).filter(r=>r.recurrenceId===existing.recurrenceId&&r.date>=d.fromDate);for(const r of rows)await put('schedules',{...r,title:d.title,startTime:d.startTime,endTime:d.endTime,memo:d.memo,updatedAt:new Date().toISOString()});await addAudit('schedule-series-edit',{recurrenceId:existing.recurrenceId,from:d.fromDate,count:rows.length});toast(`${rows.length}개의 미래 일정만 변경했습니다.`);await render('planner');});}


function openTimerModal(){
  openModal(
    '실전 타이머 설정',
    `<div class="form-grid">
      ${field('시험 이름','name','실전 모의고사')}
      ${selectField(
        '과목',
        'subject',
        SUBJECTS.map(s=>({value:s,label:s})),
        '국어'
      )}
      ${field('시험 시간 (분)','duration','80','number','min="1" max="600"')}
    </div>
    <div class="muted-box">
      과목을 선택하면 기본 시험 시간이 자동으로 변경됩니다.
      시험 시간은 직접 수정할 수도 있습니다.
    </div>`,
    timerStart,
    'TIMER',
    '시작하기'
  );

  const subjectInput = $('#f-subject');
  const durationInput = $('#f-duration');

  const subjectTimes = {
    '국어': 80,
    '수학': 100,
    '영어': 70,
    '통합사회': 40,
    '통합과학': 40,
    '한국사': 30
  };

  subjectInput.addEventListener('change', () => {
    durationInput.value = subjectTimes[subjectInput.value] || 80;
  });
}

function openExamModal(){openModal('실전 모의고사 등록',`<div class="form-grid">${field('시험 이름','name','')}${field('출판사 / 제작 기관','publisher','')}${field('회차','round','')}${selectField('과목','subject',SUBJECTS.map(s=>({value:s,label:s})),'국어')}${field('응시 날짜','date',todayISO(),'date')}${field('내 점수','score','','number','min="0" max="100"')}${field('1등급 컷','cut','','number','min="0" max="100"')}${field('풀이 시간 (분)','minutes','','number','min="0"')}${selectField('난이도','difficulty',['매우 쉬움','쉬움','보통','어려움','매우 어려움'].map(x=>({value:x,label:x})),'보통')}${textareaField('시험 소감 · 어려웠던 부분','memo')}</div>`,async d=>{if(!d.name)throw new Error('시험 이름을 입력해 주세요.');const row={id:uid(),...d,score:d.score===''?null:num(d.score),cut:d.cut===''?null:num(d.cut),minutes:num(d.minutes),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put('exams',row);await addAudit('exam-create',{id:row.id});toast('실전 모의고사 기록을 저장했습니다.');await render('exams');});}
function openMajorModal(){const resultFields=SUBJECTS.map(s=>`<div class="card" style="padding:12px;box-shadow:none;background:#fafbf8"><strong style="font-size:11px">${s}</strong><div class="form-grid" style="margin-top:8px">${['score','standard','percentile','grade','cut'].map((k,i)=>`<div class="field"><label>${['원점수','표준점수','백분위','등급','등급 컷'][i]}</label><input name="${k}_${s}" type="number" min="0" step="any"></div>`).join('')}</div></div>`).join('');openModal('주요 모의고사 성적 등록',`<div class="form-grid">${field('시험 이름','name','')}${selectField('시험 유형','type',['교육청 전국연합','평가원 모의평가','기타 주요 시험'].map(x=>({value:x,label:x})),'교육청 전국연합')}${field('시험 날짜','date',todayISO(),'date')}${textareaField('시험 메모','memo')}</div><div class="divider"></div><div style="display:grid;gap:10px">${resultFields}</div>`,async(d)=>{if(!d.name)throw new Error('시험 이름을 입력해 주세요.');const results=SUBJECTS.map(s=>({subject:s,score:d[`score_${s}`]===''?null:num(d[`score_${s}`]),standard:d[`standard_${s}`]===''?null:num(d[`standard_${s}`]),percentile:d[`percentile_${s}`]===''?null:num(d[`percentile_${s}`]),grade:d[`grade_${s}`]===''?null:num(d[`grade_${s}`]),cut:d[`cut_${s}`]===''?null:num(d[`cut_${s}`])}));const row={id:uid(),name:d.name,type:d.type,date:d.date,results,memo:d.memo||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put('majorExams',row);toast('주요 모의고사 성적을 저장했습니다.');await render('major');});}
function compressImage(file,maxWidth=850,quality=.78){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const scale=Math.min(1,maxWidth/img.width);const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);if(blob)resolve(blob);else reject(new Error('이미지 압축에 실패했습니다.'));},'image/webp',quality);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('이미지를 읽을 수 없습니다.'));};img.src=url;});}
function openBookModal(){openModal('교재 등록',`<div class="form-grid">${field('교재 이름','name','')}${selectField('과목','subject',SUBJECTS.map(s=>({value:s,label:s})),'국어')}${field('출판사','publisher','')}${field('시작 날짜','startDate',todayISO(),'date')}${field('완료 날짜','endDate','','date')}${selectField('진행 상태','status',['시작 전','진행 중','완료','보류'].map(x=>({value:x,label:x})),'진행 중')}${field('총 페이지','totalPages','','number','min="0"')}${field('현재 페이지','currentPage','0','number','min="0"')}${textareaField('메모','memo')}<div class="field full"><label>교재 표지 사진</label><input type="file" name="cover" accept="image/*"></div></div>`,async(d,form)=>{if(!d.name)throw new Error('교재 이름을 입력해 주세요.');let coverBlob=null;const f=form.querySelector('[name="cover"]').files[0];if(f)coverBlob=await compressImage(f);const row={id:uid(),name:d.name,subject:d.subject,publisher:d.publisher,startDate:d.startDate,endDate:d.endDate,status:d.status,totalPages:num(d.totalPages),currentPage:num(d.currentPage),memo:d.memo,coverBlob,coverColor:['#e8d9c5','#d7e3dc','#d9e1ee','#ead9da','#ece7cc'][Math.floor(Math.random()*5)],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put('books',row);toast('교재를 책장에 추가했습니다.');await render('books');});}
async function showBookDetail(id){const b=await getById('books',id);if(!b)return;const pct=b.totalPages?Math.min(100,b.currentPage/b.totalPages*100):0;openModal('교재 상세',`<div class="grid grid-2"><div>${b.coverBlob?`<img src="${temporaryImageURL(b.coverBlob)}" style="width:100%;max-height:230px;object-fit:contain;border-radius:12px">`:`<div class="book-cover" style="height:190px;background:${esc(b.coverColor)}"><strong>${esc(b.name)}</strong><small>${esc(b.publisher||b.subject)}</small></div>`}</div><div><h3>${esc(b.name)}</h3><p class="subtle">${esc(b.subject)} · ${esc(b.publisher||'출판사 미입력')}</p><span class="pill">${esc(b.status)}</span><div class="progress-meta"><span>진행률</span><strong>${Math.round(pct)}%</strong></div><div class="progress-line"><span style="width:${pct}%"></span></div><p class="subtle">${b.currentPage}/${b.totalPages||'—'} 페이지</p><button type="button" class="btn btn-secondary" id="book-edit">교재 정보 수정</button><button type="button" class="btn btn-ghost" id="book-delete">교재 삭제</button></div></div><p class="subtle">시작: ${esc(b.startDate||'미입력')} · 완료: ${esc(b.endDate||'미완료')}</p><div class="divider"></div><div class="card-head"><div><h3>회독 기록</h3><p>${(b.readings||[]).length}회독 기록됨</p></div><button type="button" class="btn btn-secondary" id="book-reading-add">＋ 회독 추가</button></div>${(b.readings||[]).map((r,i)=>`<div class="record-item"><div class="record-main"><strong>${esc(r.n)}회독</strong><small>${esc(r.start||'시작일 미입력')} → ${esc(r.end||'진행 중')}${r.memo?' · '+esc(r.memo):''}</small></div><button type="button" class="inline-link" data-reading-del="${i}">삭제</button></div>`).join('')}<div class="muted-box">${esc(b.memo||'메모 없음')}</div>`,async()=>{},'BOOK','닫기');$('#modal-save').classList.add('hidden');$('#book-edit').onclick=()=>{modal.close();openBookEdit(b);};$('#book-reading-add').onclick=()=>{modal.close();openReadingModal(b);};document.querySelectorAll('[data-reading-del]').forEach(btn=>{btn.onclick=async()=>{if(!confirm('이 회독 기록을 삭제할까요? 교재와 다른 기록은 유지됩니다.'))return;const cur=await getById('books',id);const readings=(cur.readings||[]).filter((_,k)=>k!==Number(btn.dataset.readingDel));await put('books',{...cur,readings,updatedAt:new Date().toISOString()});modal.close();setTimeout(()=>showBookDetail(id),60);};});$('#book-delete').onclick=async()=>{if(confirm('이 교재를 책장에서 삭제할까요?')){await remove('books',id);await addAudit('book-delete',{id});modal.close();toast('교재를 삭제했습니다.');await render('books');}};}
function openBookEdit(b){openModal('교재 정보 수정',`<div class="form-grid">${field('교재 이름','name',b.name)}${selectField('과목','subject',SUBJECTS.map(s=>({value:s,label:s})),b.subject)}${field('출판사','publisher',b.publisher||'')}${field('시작 날짜','startDate',b.startDate||'','date')}${field('완료 날짜','endDate',b.endDate||'','date')}${selectField('진행 상태','status',['시작 전','진행 중','완료','보류'].map(x=>({value:x,label:x})),b.status)}${field('총 페이지','totalPages',b.totalPages,'number')}${field('현재 페이지','currentPage',b.currentPage,'number')}${textareaField('메모','memo',b.memo||'')}<div class="field full"><label>표지 사진 변경</label><input type="file" name="cover" accept="image/*"></div></div>`,async(d,form)=>{let coverBlob=b.coverBlob;const f=form.querySelector('[name="cover"]').files[0];if(f)coverBlob=await compressImage(f);await put('books',{...b,...d,totalPages:num(d.totalPages),currentPage:num(d.currentPage),coverBlob,updatedAt:new Date().toISOString()});toast('교재 정보를 수정했습니다.');await render('books');});}
function openMealModal(){openModal('식사 기록',`<div class="form-grid">${field('날짜','date',todayISO(),'date')}${selectField('식사 구분','mealType',['아침','점심','저녁','간식'].map(x=>({value:x,label:x})),'점심')}${field('식사 시각','time',fmtClock(),'time')}${field('먹은 음식','food','')}${textareaField('메모','memo')}<div class="field full"><label>식사 사진 (선택)</label><input type="file" name="photo" accept="image/*"></div></div>`,async(d,form)=>{if(!d.food)throw new Error('먹은 음식을 입력해 주세요.');const f=form.querySelector('[name="photo"]').files[0];const photoBlob=f?await compressImage(f,900,.76):null;await put('meals',{id:uid(),...d,photoBlob,createdAt:new Date().toISOString()});toast('식사 기록을 저장했습니다.');await render('life');});}
function openExerciseModal(){openModal('운동 기록',`<div class="form-grid">${field('날짜','date',todayISO(),'date')}${field('운동 종류','type','걷기')}${field('운동 시간 (분)','minutes','30','number','min="0"')}${selectField('운동 강도','intensity',['가벼움','보통','강함'].map(x=>({value:x,label:x})),'보통')}${textareaField('운동 후 느낌 · 메모','memo')}</div>`,async d=>{if(!d.type)throw new Error('운동 종류를 입력해 주세요.');await put('exercises',{id:uid(),...d,minutes:num(d.minutes),createdAt:new Date().toISOString()});toast('운동 기록을 저장했습니다.');await render('life');});}
function openDiaryModal(existing=null){openModal(existing?'일기 수정':'오늘의 일기',`<div class="form-grid">${field('날짜','date',existing?.date||todayISO(),'date')}${field('제목','title',existing?.title||'')}${selectField('오늘의 기분','mood',['평온함','뿌듯함','즐거움','보통','아쉬움','답답함','피곤함'].map(x=>({value:x,label:x})),existing?.mood||'보통')}${textareaField('오늘 가장 잘한 일','best',existing?.best||'')}${textareaField('아쉬웠던 점','regret',existing?.regret||'')}${textareaField('내일의 다짐','tomorrow',existing?.tomorrow||'')}${textareaField('일기 본문','body',existing?.body||'오늘 하루는...')}<div class="field full"><label>사진 첨부 (선택)</label><input type="file" name="photo" accept="image/*">${existing?.photoBlob?'<small>기존 사진이 있습니다. 새 사진을 선택하면 교체됩니다.</small>':''}</div></div>`,async(d,form)=>{const f=form.querySelector('[name="photo"]').files[0];const photoBlob=f?await compressImage(f,1100,.78):(existing?.photoBlob||null);const row={id:existing?.id||uid(),...d,photoBlob,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await put('diaries',row);toast('일기를 저장했습니다.');await render('diary');});}
function openEventModal(existing=null){openModal(existing?'시험 일정 수정':'시험·중요 일정 등록',`<div class="form-grid">${field('일정 이름','name',existing?.name||'')}${selectField('유형','type',['교육청 모의고사','평가원 모의평가','개인 시험','수능','성적표 발표일','기타'].map(x=>({value:x,label:x})),existing?.type||'개인 시험')}${field('날짜','date',existing?.date||todayISO(),'date')}${textareaField('메모','memo',existing?.memo||'')}</div>`,async d=>{const row={id:existing?.id||uid(),...d,official:false,createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await put('events',row);toast('시험 일정을 저장했습니다.');await render('dday');});}

async function saveRestDays(){const days=[...document.querySelectorAll('[data-rest-day]:checked')].map(x=>num(x.dataset.restDay));await setSetting('restDays',days);const attendance=await getAll('attendance');const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction('attendance','readwrite');for(const d of attendance){const day=dateFromISO(d.date).getDay();if(days.includes(day))tx.objectStore('attendance').put({...d,restDay:true});else if(d.restDay)tx.objectStore('attendance').put({...d,restDay:false});}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});toast('휴식일 설정을 저장했습니다.');await render('settings');}
async function saveColors(){const colors={...cachedColors};document.querySelectorAll('[data-subject-color]').forEach(el=>colors[el.dataset.subjectColor]=el.value);await setSetting('subjectColors',colors);cachedColors=colors;toast('과목 색상을 저장했습니다.');await render(activeView);}
async function saveWidgets(){const hidden=[...document.querySelectorAll('[data-widget]')].filter(el=>!el.checked).map(el=>el.dataset.widget);await setSetting('hiddenWidgets',hidden);toast('대시보드 위젯 표시 설정을 저장했습니다.');await render('home');}
async function moveWidget(direction){const order=await getSetting('widgetOrder',['todaySchedule','subjectTime','life','recentExam','weeklyTrend','recentDiary']);const selected=$('#widget-order-target')?.value;if(!selected){toast('먼저 위젯 하나를 체크해 주세요.','warning');return;}const i=order.indexOf(selected),j=i+direction;if(i<0||j<0||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];await setSetting('widgetOrder',order);toast('위젯 순서를 변경했습니다.');await render('settings');}

async function exportScheduleJSON(){const rows=await getAll('schedules');const payload={format:'exam-life-schedule',exportedAt:new Date().toISOString(),schedules:rows.map(r=>({date:r.date,title:r.title,type:r.type,subject:r.subject,startTime:r.startTime,endTime:r.endTime,memo:r.memo,repeat:r.repeat,recurrenceId:r.recurrenceId,completed:r.completed}))};await navigator.clipboard?.writeText(JSON.stringify(payload,null,2));toast('현재 시간표 JSON을 클립보드에 복사했습니다.');}
async function importScheduleJSON(){const text=prompt('ChatGPT에서 수정한 시간표 JSON을 붙여넣으세요.\n형식: {"format":"exam-life-schedule","schedules":[...]}');if(!text)return;let payload;try{payload=JSON.parse(text);}catch{throw new Error('JSON 문법이 올바르지 않습니다.');}if(payload.format!=='exam-life-schedule'||!Array.isArray(payload.schedules))throw new Error('시간표 JSON 형식이 올바르지 않습니다.');const future=payload.schedules.filter(s=>s.date>=todayISO());const preview=future.slice(0,8).map(s=>`${s.date} ${s.startTime||''} ${s.title}`).join('\n');if(!confirm(`미래 일정 ${future.length}개를 추가 또는 갱신합니다. 과거 일정은 무시합니다.\n\n${preview}\n\n기존 반복 시리즈와 다른 ID로 새 일정으로 추가할 수 있습니다. 계속할까요?`))return;for(const r of future){await put('schedules',{id:uid(),...r,completed:false,recurrenceId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});}toast(`${future.length}개의 미래 일정을 추가했습니다.`);await render('planner');}

// ---------- delegated UI actions ----------
document.addEventListener('input',event=>{if(event.target?.id==='theme-background'){const bg=event.target.value,p=themePalette(bg),preview=$('#theme-preview');if(preview){preview.style.setProperty('--preview-bg',p.bg);preview.style.setProperty('--preview-surface',p.surface);preview.style.setProperty('--preview-ink',p.ink);preview.style.setProperty('--preview-accent',p.accent);preview.querySelector('.theme-subject-swatches').innerHTML=Object.entries(p.subjects).map(([n,c])=>`<i title="${n}" style="background:${c}"></i>`).join('');}const label=$('#theme-hex');if(label)label.textContent=bg;}});
document.addEventListener('click',async(event)=>{
  const preset=event.target.closest('[data-theme-preset]');if(preset){const picker=$('#theme-background');if(picker){picker.value=preset.dataset.themePreset;picker.dispatchEvent(new Event('input',{bubbles:true}));}return;}
  const nav=event.target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
  const btn=event.target.closest('[data-action]');if(!btn)return;const a=btn.dataset.action,id=btn.dataset.id;
  try{
    switch(a){
      case 'trash-restore':{const rec=await restoreFromTrash(id);if(rec.store==='studyEntries'&&rec.record&&rec.record.date)await refreshAttendanceForDate(rec.record.date);toast('기록을 복구했습니다.','success');render('trash');break;}
      case 'trash-purge':if(confirm('영구 삭제하면 다시 복구할 수 없습니다. 삭제할까요?')){await purgeTrash(id);toast('영구 삭제했습니다.');render('trash');}break;
      case 'retry':render(activeView);break;
      case 'add-study':openStudyModal(activeView==='planner'?plannerDate:todayISO());break;
      case 'edit-study':{const r=await getById('studyEntries',id);if(r)openStudyModal(r.date,r);break;}
      case 'set-day-study':await openDailyStudyModal(plannerDate);break;
      case 'save-calendar-heat':{const color=$('#calendar-heat-color')?.value||'#4da879',maxHours=num($('#calendar-heat-hours')?.value)||10;if(maxHours<1||maxHours>24)throw new Error('진하기 기준은 1~24시간 사이로 입력해 주세요.');await setSetting('calendarHeat',{color,maxHours});toast('달력 색상 설정을 저장했습니다.');await render('planner');break;}
      case 'add-schedule':openScheduleModal(plannerDate);break;
      case 'add-plan':openModal('과목별 공부 계획',`<div class="form-grid">${field('날짜','date',plannerDate,'date')}${selectField('과목','subject',SUBJECTS.map(s=>({value:s,label:s})),'국어')}${field('공부 계획','title','')}${field('계획 시간 (분)','minutes','60','number','min="1"')}${field('교재 이름 (선택)','book','')}${selectField('우선순위','priority',['높음','보통','낮음'].map(x=>({value:x,label:x})),'보통')}</div>`,async d=>{const schedule={id:uid(),date:d.date,title:d.title,type:'개인 공부',subject:d.subject,startTime:'',endTime:'',memo:`계획 ${d.minutes}분 · ${d.book||''} · 우선순위 ${d.priority}`,plannedMinutes:num(d.minutes),completed:false,createdAt:new Date().toISOString()};await put('schedules',schedule);toast('공부 계획을 추가했습니다.');await render('planner');});break;
      case 'select-date':plannerDate=btn.dataset.date;render('planner');break;
      case 'major-subject':root.dataset.majorSubject=btn.dataset.subject;render('major');break;
      case 'calendar-prev':if(plannerMode==='month'){const d=dateFromISO(plannerDate);d.setMonth(d.getMonth()-1);plannerDate=todayISO(d);}else plannerDate=addDays(plannerDate,plannerMode==='week'?-7:-1);render('planner');break;
      case 'calendar-next':if(plannerMode==='month'){const d=dateFromISO(plannerDate);d.setMonth(d.getMonth()+1);plannerDate=todayISO(d);}else plannerDate=addDays(plannerDate,plannerMode==='week'?7:1);render('planner');break;
      case 'calendar-today':plannerDate=todayISO();render('planner');break;
      case 'planner-mode':plannerMode=btn.dataset.mode;render('planner');break;
      case 'toggle-schedule':{const r=await getById('schedules',id);if(r&&r.date<todayISO()){toast('과거 일정은 변경하지 않습니다.','warning');break;}if(r){await put('schedules',{...r,completed:!r.completed,updatedAt:new Date().toISOString()});await addAudit('schedule-complete',{id,completed:!r.completed});render(activeView);}break;}
      case 'edit-schedule':{const r=await getById('schedules',id);if(r&&r.date<todayISO()){toast('과거 일정은 변경하지 않습니다.','warning');break;}if(r)openScheduleModal(r.date,r);break;}
      case 'delete-schedule':{const r=await getById('schedules',id);if(r&&r.date<todayISO()){toast('과거 일정은 삭제하지 않습니다.','warning');break;}if(confirm('이 일정 하나만 삭제할까요? 반복 일정의 다른 날짜와 실제 공부 기록은 유지됩니다.')){await remove('schedules',id);await addAudit('schedule-delete',{id});toast('일정을 삭제했습니다.');render('planner');}break;}
      case 'delete-study':if(confirm('이 공부 기록을 삭제할까요?')){const r=await getById('studyEntries',id);await remove('studyEntries',id);if(r)await refreshAttendanceForDate(r.date);toast('공부 기록을 삭제했습니다.');render('study');}break;
      case 'timer-config':openTimerModal();break;
      case 'timer-pause':await timerPause();break;
      case 'timer-resume':await timerResume();break;
      case 'timer-finish':if(confirm('타이머를 종료하고 실제 소요 시간을 기록할까요?'))await finishTimer(false);break;
      case 'timer-reset':if(currentTimer&&confirm('현재 타이머를 기록하지 않고 초기화할까요?')){currentTimer=null;stopTimerTicker();await setSetting('activeTimer',null);toast('타이머를 초기화했습니다.');render('timer');}else if(!currentTimer)openTimerModal();break;
      case 'add-exam':openExamModal();break;
      case 'delete-exam':if(confirm('이 실전 모의고사 기록을 삭제할까요?')){await remove('exams',id);toast('시험 기록을 삭제했습니다.');render('exams');}break;
      case 'exam-subject':document.querySelectorAll('[data-action="exam-subject"]').forEach(x=>x.classList.toggle('active',x===btn));{const exams=await getAll('exams');drawBarChart($('#exam-chart'),exams.filter(e=>e.subject===btn.dataset.subject&&e.score!=null).sort((a,b)=>a.date.localeCompare(b.date)).map(e=>({label:e.date.slice(5),value:num(e.score)})));}break;
      case 'add-major':openMajorModal();break;
      case 'delete-major':if(confirm('이 주요 모의고사 회차 전체를 삭제할까요?')){await remove('majorExams',id);toast('주요 모의고사 기록을 삭제했습니다.');render('major');}break;
      case 'book-subject':activeBookSubject=btn.dataset.subject;render('books');break;
      case 'add-book':openBookModal();break;
      case 'book-detail':showBookDetail(id);break;
      case 'add-meal':openMealModal();break;
      case 'add-exercise':openExerciseModal();break;
      case 'delete-meal':if(confirm('식사 기록을 삭제할까요?')){await remove('meals',id);render('life');}break;
      case 'delete-exercise':if(confirm('운동 기록을 삭제할까요?')){await remove('exercises',id);render('life');}break;
      case 'add-diary':openDiaryModal();break;
      case 'diary-detail':await showDiaryDetail(id);break;
      case 'edit-diary':{const d=await getById('diaries',id);if(d)openDiaryModal(d);break;}
      case 'add-event':openEventModal();break;
      case 'edit-event':{const e=await getById('events',id);if(e)openEventModal(e);break;}
      case 'delete-event':if(confirm('이 일정을 삭제할까요?')){await remove('events',id);render('dday');}break;
      case 'backup-export':await exportBackup();break;
      case 'preview-public-archive':await previewPublicArchive();break;
      case 'export-public-archive':await exportPublicArchive();break;
      case 'public-select-all':root.querySelectorAll('[data-public-group]').forEach(el=>el.checked=true);break;
      case 'public-clear-selection':root.querySelectorAll('[data-public-group]').forEach(el=>el.checked=false);$('#public-archive-preview').innerHTML='';break;
      case 'request-persist':if(navigator.storage?.persist){const granted=await navigator.storage.persist();toast(granted?'영구 저장이 승인되었습니다.':'영구 저장이 승인되지 않았습니다. 브라우저 설정과 사용 상태에 따라 달라질 수 있습니다.',granted?'success':'warning');render('backup');}else toast('이 브라우저에서는 영구 저장 요청을 지원하지 않습니다.','warning');break;
      case 'restore-merge':await importBackup('merge');break;
      case 'restore-replace':await importBackup('replace');break;
      case 'owl-dex':await openOwlDex({currentNumber:Number(btn.dataset.current)||0,onChange:()=>render('home')});break;
      case 'owl-set-goal':{const current=Math.max(60,num(await getSetting('owlDailyGoalMinutes',360))||360);openModal('부엉이 등장 목표','<p class="subtle">하루 공부 목표를 달성하면 응원봉을 든 부엉이가 등장해요.</p>'+field('하루 공부 목표 (분)','minutes',String(current),'number','min="60" max="1440" step="30"'),async d=>{const value=num(d.minutes);if(value<60||value>1440)throw new Error('목표는 60~1440분 사이로 설정해 주세요.');await setSetting('owlDailyGoalMinutes',value);toast('부엉이 등장 목표를 저장했어요.');await render('home');},"TODAY'S OWL");break;}
      case 'save-theme':{const background=$('#theme-background')?.value||'#000000';const palette=themePalette(background);await setSetting('appTheme',{background});await setSetting('subjectColors',palette.subjects);applyTheme({background});cachedColors=palette.subjects;toast('테마와 과목별 색상을 적용했습니다.');await render('settings');break;}
      case 'save-rest-days':await saveRestDays();break;
      case 'save-colors':await saveColors();break;
      case 'save-widgets':await saveWidgets();break;
      case 'move-widget-up':await moveWidget(-1);break;
      case 'move-widget-down':await moveWidget(1);break;
      case 'export-schedule-json':await exportScheduleJSON();break;
      case 'import-schedule-json':await importScheduleJSON();break;
    }
  }catch(error){console.error(error);toast(error.message||'작업 중 오류가 발생했습니다.','error');}
});

$('#modal-close').addEventListener('click',closeModal);$('#modal-cancel').addEventListener('click',closeModal);
$('#mobile-menu').addEventListener('click',()=>{$('#sidebar').classList.toggle('open');});
$('#global-overlay').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
$('#quick-backup').addEventListener('click',()=>navigate('backup'));
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const label=fmtLongDate(todayISO());if($('#top-date').textContent!==label){$('#top-date').textContent=label;if(activeView==='home')render('home');scheduleOwlMidnightRefresh();}v190?.onForeground?.();}});
window.addEventListener('resize',()=>{if(activeView==='stats'||activeView==='home')render(activeView);});
window.addEventListener('beforeunload',()=>{clearTemporaryImageURLs();bookObjectURLs.forEach(url=>URL.revokeObjectURL(url));});
window.addEventListener('db-version-change',()=>toast('다른 탭에서 데이터베이스 버전이 변경되었습니다. 이 탭을 새로고침해 주세요.','warning'));

/* ===== 추가 기능 ===== */
function openReadingModal(b){
  const list=b.readings||[];const next=list.length?Math.max(...list.map(r=>num(r.n)))+1:1;
  openModal(`${esc(b.name)} · 회독 추가`,`<div class="form-grid">${field('회독 차수','n',String(next),'number','min="1"')}${field('시작일','start',todayISO(),'date')}${field('종료일 (진행 중이면 비움)','end','','date')}${textareaField('회독 메모','memo','')}</div>`,async d=>{
    if(!num(d.n))throw new Error('회독 차수를 입력해 주세요.');
    const cur=await getById('books',b.id);
    const readings=[...(cur.readings||[]),{n:num(d.n),start:d.start||'',end:d.end||'',memo:d.memo||'',createdAt:new Date().toISOString()}].sort((x,y)=>x.n-y.n);
    await put('books',{...cur,readings,updatedAt:new Date().toISOString()});
    toast('회독 기록을 저장했습니다.');await render('books');setTimeout(()=>showBookDetail(b.id),60);
  },'READING');
}

const TRASH_LABELS={studyEntries:'공부 기록',dailyStudy:'하루 공부 시간',schedules:'일정',exams:'실전 모의고사',majorExams:'주요 모의고사',books:'교재',meals:'식사',exercises:'운동',diaries:'일기',events:'시험 일정',periodTasks:'기간별 할 일'};
async function renderTrash(){
  const rows=(await getAll('trash')).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
  root.innerHTML=`${pageHeading('휴지통','삭제한 기록은 영구 삭제하기 전까지 여기에 보관되며 복구할 수 있습니다.','')}<div class="card">${rows.length?rows.map(r=>{const x=r.record||{};const title=x.title||x.name||x.food||x.subject||(x.body?String(x.body).slice(0,30):'')||'기록';return `<div class="record-item"><div class="record-main"><strong>${esc(TRASH_LABELS[r.store]||r.store)} · ${esc(title)}</strong><small>${esc(x.date||'')} · 삭제 ${esc(new Date(r.deletedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</small></div><button class="btn btn-small btn-secondary" data-action="trash-restore" data-id="${r.id}">복구</button><button class="btn btn-small btn-ghost" data-action="trash-purge" data-id="${r.id}">영구 삭제</button></div>`;}).join(''):emptyState('휴지통이 비어 있습니다','삭제한 기록이 있으면 여기에 보관됩니다.')}</div>`;
}

async function appendLongTerm(){
  const all=await getAll('studyEntries');const dayMap={};
  for(const e of all){dayMap[e.date]=(dayMap[e.date]||0)+num(e.minutes);}
  const days=Object.entries(dayMap).filter(([,m])=>m>0).sort((a,b)=>a[0].localeCompare(b[0]));
  if(!days.length){root.insertAdjacentHTML('beforeend','<div class="card section-gap"><div class="card-head"><div><h3>전체 기간 통계</h3><p>공부 기록이 쌓이면 월별·누적 그래프가 여기에 표시됩니다.</p></div></div></div>');return;}
  const today=todayISO();const firstDay=days[0][0];const total=days.reduce((a,[,m])=>a+m,0);
  const spanDays=Math.round((dateFromISO(today)-dateFromISO(firstDay))/86400000)+1;
  const most=days.reduce((a,b)=>b[1]>a[1]?b:a),least=days.reduce((a,b)=>b[1]<a[1]?b:a);
  // 첫 기록 달부터 이번 달까지 빈 달은 0으로 채움
  const monthly=[];let [y,m]=firstDay.slice(0,7).split('-').map(Number);const [ty,tm]=today.slice(0,7).split('-').map(Number);
  while(y<ty||(y===ty&&m<=tm)){const k=`${y}-${String(m).padStart(2,'0')}`;monthly.push({k,v:days.filter(([d])=>d.startsWith(k)).reduce((a,[,x])=>a+x,0)});m++;if(m>12){m=1;y++;}}
  let cum=0;const series=monthly.map((x,i)=>{cum+=x.v;return {label:`${x.k.slice(2,4)}.${x.k.slice(5)}`,month:x.v,cum,avg:cum/(i+1)};});
  const hrs=v=>Math.round(v/60*10)/10;
  root.insertAdjacentHTML('beforeend',`<div class="card section-gap"><div class="card-head"><div><h3>전체 기간 통계</h3><p>첫 기록(${fmtLongDate(firstDay)})부터 지금까지 · 단위: 시간</p></div><select id="lt-range" style="min-height:44px"><option value="0">전체 기간</option><option value="12">최근 12개월</option><option value="6">최근 6개월</option><option value="3">최근 3개월</option></select></div>
  <div class="grid grid-4"><div class="card metric-card"><div class="metric-label">전체 누적</div><div class="metric-value">${fmtMin(total)}</div></div><div class="card metric-card"><div class="metric-label">공부한 날짜 수</div><div class="metric-value">${days.length}일</div><div class="metric-note">전체 ${spanDays}일 중</div></div><div class="card metric-card"><div class="metric-label">가장 많이 공부한 날</div><div class="metric-value">${fmtMin(most[1])}</div><div class="metric-note">${fmtLongDate(most[0])}</div></div><div class="card metric-card"><div class="metric-label">가장 적게 공부한 날</div><div class="metric-value">${fmtMin(least[1])}</div><div class="metric-note">${fmtLongDate(least[0])} · 기록 있는 날 중</div></div></div>
  <div class="grid grid-4 section-gap"><div class="card metric-card"><div class="metric-label">일 평균 (달력 기준)</div><div class="metric-value">${fmtMin(total/spanDays)}</div></div><div class="card metric-card"><div class="metric-label">일 평균 (공부한 날 기준)</div><div class="metric-value">${fmtMin(total/days.length)}</div></div><div class="card metric-card"><div class="metric-label">주 평균</div><div class="metric-value">${fmtMin(total/Math.max(1,spanDays/7))}</div></div><div class="card metric-card"><div class="metric-label">월 평균</div><div class="metric-value">${fmtMin(total/monthly.length)}</div></div></div>
  <div class="grid grid-2 section-gap"><div class="card"><div class="card-head"><div><h3>월별 공부 시간</h3></div></div><div class="chart-wrap"><canvas id="lt-monthly"></canvas></div></div><div class="card"><div class="card-head"><div><h3>월평균 공부 시간 변화</h3><p>그 달까지의 월평균</p></div></div><div class="chart-wrap"><canvas id="lt-avg"></canvas></div></div></div>
  <div class="card section-gap"><div class="card-head"><div><h3>누적 공부 시간</h3></div></div><div class="chart-wrap"><canvas id="lt-cum"></canvas></div></div></div>`);
  const draw=()=>{const n=num($('#lt-range').value);const part=n?series.slice(-n):series;
    drawBarChart($('#lt-monthly'),part.map(x=>({label:x.label,value:hrs(x.month)})));
    drawBarChart($('#lt-avg'),part.map(x=>({label:x.label,value:hrs(x.avg)})));
    drawBarChart($('#lt-cum'),part.map(x=>({label:x.label,value:hrs(x.cum)})));};
  $('#lt-range').addEventListener('change',draw);draw();
}

async function checkMemorialGate(){
  try{
    const state=await getSetting('memorialState',null);
    const events=await getAll('events');
    const released=events.some(e=>e.type==='성적표 발표일'&&e.date&&e.date<=todayISO());
    if(!(state&&state.unlocked)&&!released)return;
    const mod=await import('./memorial.js');
    await mod.initMemorial({getAll,getSetting,setSetting,getStreak,saveBlob,toast,todayISO});
  }catch(err){console.warn('memorial gate',err);}
}

init();
