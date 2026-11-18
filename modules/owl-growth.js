import { OWL_STAGES, fmtMin, owlStage } from './logic.js';

export function renderOwlGrowth(exp) {
  const stage = owlStage(exp);
  const nextText = stage.next
    ? `다음 단계까지 ${fmtMin(stage.next.need - exp)}`
    : '가장 높은 성장 단계입니다';
  const visual = stage.image
    ? `<img src="${stage.image}" alt="${stage.name}" class="owl-growth-photo stage-${stage.stage}">`
    : `<div class="owl-egg stage-1" role="img" aria-label="알"><span></span></div>`;
  const steps = OWL_STAGES.map(item => `<li class="${item.stage === stage.stage ? 'is-current' : item.stage < stage.stage ? 'is-done' : ''}"><img src="${item.image}" alt=""><b>${item.stage}</b><span>${item.name}</span></li>`).join('');
  return `<article class="card v190-growth-card">
    <div class="card-head"><div><h3>부엉이 성장</h3><p>도감 수집과는 별도로, 누적 공부량에 따라 자랍니다</p></div><span class="pill">${stage.stage}단계</span></div>
    <div class="owl-growth-row">
      <div class="owl-growth-frame stage-${stage.stage}">${visual}</div>
      <div>
        <strong class="owl-growth-name">${stage.name}</strong>
        <p class="subtle">${nextText}</p>
        <ol class="owl-growth-steps">${steps}</ol>
      </div>
    </div>
  </article>`;
}
