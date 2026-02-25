const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const addBtn = document.getElementById('add');
const spinBtn = document.getElementById('spin');
const clearBtn = document.getElementById('clear');
const randomBtn = document.getElementById('random');
const itemsEl = document.getElementById('items');
const statusEl = document.getElementById('status');
const verdictEl = document.getElementById('verdict');
const labelInput = document.getElementById('label');
const weightInput = document.getElementById('weight');
const wheelContainer = document.getElementById('wheelContainer');
// highlightWin is always active — checkbox removed
const shareEditBtn = document.getElementById('shareEdit');
const shareViewBtn = document.getElementById('shareView');
const loadBtn = document.getElementById('load');
const loadInput = document.getElementById('loadString');
const helpBtn = document.getElementById('help');
const helpOverlay = document.getElementById('helpOverlay');
const helpClose = document.getElementById('helpClose');

let options = [];
let cumulativeRotation = 0; // always increase, do not reduce to ensure clockwise motion
let spinning = false;
let lastWinIndex = -1;
let viewMode = false;
let winGlowAlpha = 0;   // current opacity of per-wedge pulse (0-1)
let winGlowAnimId = null;

const PALETTE = [0,20,40,80,120,160,200,240,280,320, 10,50,70,140,180];
const MAX_WEDGES = 15;       // limit for Random Set generator
const MAX_USER_OPTIONS = 50; // limit for manual user additions

function pickColor(i, prevColor){
  // choose hue ensuring not equal to previous
  let hue = PALETTE[i % PALETTE.length] + (i * 11) % 30;
  if (prevColor && Math.abs(prevColor - hue) < 10) {
    hue = PALETTE[(i + 3) % PALETTE.length];
  }
  return `hsl(${hue}deg 72% 52%)`;
}

function renderList(){
  itemsEl.innerHTML = '';
  options.forEach((option, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${option.label} <small>×${option.weight}</small></span>`;
    if (!viewMode) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.border = 'none';
      removeBtn.style.background = 'transparent';
      removeBtn.style.cursor = 'pointer';
      removeBtn.onclick = () => {
        options.splice(index, 1);
        renderList();
        drawWheel();
      };
      li.appendChild(removeBtn);
    }
    itemsEl.appendChild(li);
  });
}

function drawWheel(highlightIndex = -1){
  const w = canvas.width;
  const h = canvas.height;
  const cx = w/2, cy = h/2;
  const radius = Math.min(cx,cy) - 12; // padding for text
  ctx.clearRect(0,0,w,h);
  const total = options.reduce((s,o)=>s+o.weight,0);
  if(total <= 0){
    ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fillStyle='#eee'; ctx.fill();
    return;
  }

  // Adjust font size based on wedge count
  let fontSize = 14;
  if (options.length > 12) fontSize = 12;
  if (options.length > 16) fontSize = 10;

  let start = 0;
  for(let i=0;i<options.length;i++){
    const opt = options[i];
    const slice = (opt.weight / total) * Math.PI * 2;
    const end = start + slice;

    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,radius,start,end,false);
    ctx.closePath();
    ctx.fillStyle = opt.color || pickColor(i, (options[i-1]||{}).hue);
    ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();

    // label - use white text with black stroke for contrast
    const mid = (start + end) / 2;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(mid);
    ctx.textAlign = 'right';
    ctx.font = `bold ${fontSize}px system-ui,Segoe UI,Arial`;
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const text = opt.label;
    const txtX = radius - 28; // padding from outer edge
    // Only draw text if wedge is big enough
    if ((end-start)*radius > fontSize*1.5) {
      ctx.strokeText(text, txtX, 6);
      ctx.fillText(text, txtX, 6);
    }
    ctx.restore();

    // Store boundaries in [0, 2PI)
    opt._start = (start + Math.PI*2) % (Math.PI*2);
    opt._end = (end + Math.PI*2) % (Math.PI*2);
    start = end;
  }

  // 3D dome gloss overlay for depth
  const glossGrad = ctx.createRadialGradient(cx - radius*0.22, cy - radius*0.22, radius*0.08, cx, cy, radius);
  glossGrad.addColorStop(0, 'rgba(255,255,255,0.28)');
  glossGrad.addColorStop(0.45, 'rgba(255,255,255,0.06)');
  glossGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.fillStyle = glossGrad;
  ctx.fill();

  // Outer rim — dark stroke + inner highlight
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 3, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center hub with metallic gradient
  const hubGrad = ctx.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, 17);
  hubGrad.addColorStop(0, '#f8f8f8');
  hubGrad.addColorStop(0.45, '#b0b0b0');
  hubGrad.addColorStop(1, '#585858');
  ctx.beginPath();
  ctx.arc(cx, cy, 17, 0, Math.PI*2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // winner glow — radial golden fill over winning wedge, alpha driven by RAF pulse
  if(highlightIndex >= 0 && options[highlightIndex] && winGlowAlpha > 0){
    const opt = options[highlightIndex];
    const a = winGlowAlpha;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0.20, `rgba(255,240,100,0)`);
    grad.addColorStop(0.60, `rgba(255,215,0,${(0.70 * a).toFixed(3)}`);
    grad.addColorStop(0.85, `rgba(255,165,0,${(0.50 * a).toFixed(3)}`);
    grad.addColorStop(1,    `rgba(255,120,0,0)`);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,radius,opt._start,opt._end,false);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // bright edge arc to make the slice boundary pop
    ctx.beginPath();
    ctx.arc(cx,cy,radius,opt._start,opt._end,false);
    ctx.strokeStyle = `rgba(255,230,80,${(0.85 * a).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
}

function addOption(){
  if (options.length >= MAX_USER_OPTIONS) {
    showStatus(`Max ${MAX_USER_OPTIONS} options allowed.`);
    return;
  }
  const label = labelInput.value.trim();
  const weight = Math.max(1, parseFloat(weightInput.value) || 1);
  if(!label) return;
  const prevHue = options.length ? parseInt((options[options.length-1].color||'').match(/hsl\((\d+)/)?.[1] || 0) : null;
  const color = pickColor(options.length, prevHue);
  options.push({label, weight, color});
  labelInput.value=''; weightInput.value='1';
  renderList(); drawWheel();
  showStatus("");
  labelInput.focus();
}

addBtn.addEventListener('click', addOption);
labelInput.addEventListener('keyup', (e)=>{ if(e.key==='Enter') addOption(); });
weightInput.addEventListener('keyup', (e)=>{ if(e.key==='Enter') addOption(); });

clearBtn.addEventListener('click', ()=>{ if(spinning) return; options=[]; renderList(); drawWheel(); verdictEl.textContent=''; showStatus(""); });

function pickIndexByWeight(){
  const total = options.reduce((s,o)=>s+o.weight,0);
  const r = Math.random() * total;
  let cum = 0;
  for(let i=0;i<options.length;i++){
    cum += options[i].weight;
    if(r <= cum) return i;
  }
  return options.length-1;
}

function angleAtPointerFromRotation(rotDeg){
  // pointer is at the top of the wheel (12 o'clock = 270deg in canvas coords where 0=right).
  // We compute which angle on the wheel is at pointer: wheel angle = pointerAngle - rotation
  const pointerDeg = 270; // pointer at top (12 o'clock)
  const wheelDeg = (pointerDeg - (rotDeg % 360) + 360) % 360; // degrees on wheel that align with pointer
  return wheelDeg * Math.PI / 180; // radians
}

function findIndexAtAngle(angleRad){
  const ang = (angleRad + Math.PI*2) % (Math.PI*2);
  for(let i=0;i<options.length;i++){
    const s = options[i]._start; const e = options[i]._end;
    if(s <= ang && ang <= e) return i;
    // handle wrap
    if(s > e && (ang >= s || ang <= e)) return i;
  }
  return -1;
}

function stopWinPulse(){
  if(winGlowAnimId !== null){ cancelAnimationFrame(winGlowAnimId); winGlowAnimId = null; }
  winGlowAlpha = 0;
}

function startWinPulse(idx){
  stopWinPulse();
  const t0 = performance.now();
  function frame(t){
    // Pulse between 0.30 and 1.0 over a 1.4s period using a sine wave
    winGlowAlpha = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin((t - t0) / 1400 * Math.PI * 2 - Math.PI / 2));
    drawWheel(idx);
    winGlowAnimId = requestAnimationFrame(frame);
  }
  winGlowAnimId = requestAnimationFrame(frame);
}

function clearHighlight(){
  stopWinPulse();
  drawWheel(-1);
  lastWinIndex = -1;
}

function spin(){
  if(spinning) return;
  if(options.length === 0) return;
  // Remove highlight before spin
  clearHighlight();
  spinning = true; verdictEl.textContent=''; lastWinIndex = -1;
  setSpinLock(true);

  // Spin to a random angle, then determine winner.
  // 3–6 rotations with power-biased randomness: weight toward higher counts for visual energy.
  const rotations = Math.floor(Math.random()*4) + 3; // 3 to 6
  const randomAngle = Math.random() * 360;
  const targetDeg = rotations*360 + randomAngle;
  const finalRotation = cumulativeRotation + targetDeg;
  // Duration scales with rotation count; strong ease-out simulates a powerful flick
  const duration = 2600 + rotations * 420;
  wheelContainer.style.transition = `transform ${duration}ms cubic-bezier(0.08,0.82,0.17,1)`;
  wheelContainer.style.transform = `rotate(${finalRotation}deg)`;

  function onEnd(e){
    if(e.propertyName !== 'transform') return;
    wheelContainer.style.transition = '';
    cumulativeRotation = finalRotation;
    // compute actual wedge under pointer and present result
    const angleRad = angleAtPointerFromRotation(cumulativeRotation);
    const actualIdx = findIndexAtAngle(angleRad);
    lastWinIndex = actualIdx;
    let selectedIdx = actualIdx;
    // If the wedge under the pointer does not match the randomly selected result, rotate until it does
    if (actualIdx >= 0) {
      // Find the selected result index by weight
      const selectedResultIdx = actualIdx;
      // If the wedge under the pointer is not the selected result, rotate to align
      if (selectedResultIdx !== actualIdx) {
        // Calculate the angle to rotate so the selected wedge is under the pointer
        const midAngle = (options[selectedResultIdx]._start + options[selectedResultIdx]._end) / 2;
        const pointerDeg = 270;
        const wheelDeg = pointerDeg - (cumulativeRotation % 360);
        const wheelRad = wheelDeg * Math.PI / 180;
        const deltaRad = ((midAngle - wheelRad) + Math.PI*2) % (Math.PI*2);
        const deltaDeg = deltaRad * 180 / Math.PI;
        cumulativeRotation += deltaDeg;
        wheelContainer.style.transition = 'transform 1200ms cubic-bezier(.22,.98,.36,1)';
        wheelContainer.style.transform = `rotate(${cumulativeRotation}deg)`;
        // Wait for this transition to finish
        wheelContainer.addEventListener('transitionend', function alignEnd(ev) {
          if(ev.propertyName !== 'transform') return;
          wheelContainer.style.transition = '';
          lastWinIndex = selectedResultIdx;
          if(selectedResultIdx >= 0){
            startWinPulse(selectedResultIdx);
          }
          verdictEl.textContent = `Verdict: ${options[selectedResultIdx].label}`;
          spinning = false;
          setSpinLock(false);
          wheelContainer.removeEventListener('transitionend', alignEnd);
        });
        return;
      }
    }
    if(actualIdx >= 0){
      startWinPulse(actualIdx);
    }
    if(actualIdx >= 0){
      verdictEl.textContent = `Verdict: ${options[actualIdx].label}`;
    } else {
      verdictEl.textContent = `Verdict: (unknown)`;
    }
    spinning = false;
    setSpinLock(false);
    wheelContainer.removeEventListener('transitionend', onEnd);
  }
  wheelContainer.addEventListener('transitionend', onEnd);
}

// Help modal
helpBtn.addEventListener('click', () => helpOverlay.classList.add('open'));
helpClose.addEventListener('click', () => helpOverlay.classList.remove('open'));
helpOverlay.addEventListener('click', (e) => { if(e.target === helpOverlay) helpOverlay.classList.remove('open'); });
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') helpOverlay.classList.remove('open'); });

// Remove Spin button, add click-to-spin on wheel in both modes
function enableWheelSpin(){
  wheelContainer.style.cursor = 'pointer';
  wheelContainer.addEventListener('click', spin);
}
function disableWheelSpin(){
  wheelContainer.style.cursor = '';
  wheelContainer.removeEventListener('click', spin);
}

if (spinBtn) spinBtn.style.display = 'none';
enableWheelSpin();

// Random set generator: 5-15 wedges, labels are unique multiples of 500 between 500 and 50000
function generateRandomSet(){
  const count = Math.floor(Math.random() * (MAX_WEDGES - 5 + 1)) + 5; // 5..15
  // Build pool of all multiples of 500 from 500 to 50000 (100 values), shuffle, take `count`
  const pool = [];
  for(let v = 500; v <= 50000; v += 500) pool.push(v);
  for(let i = pool.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  options = [];
  for(let i = 0; i < count; i++){
    const label = String(pool[i]);
    const weight = Math.floor(Math.random() * 3) * 5 + 10; // 10, 15, or 20
    options.push({label, weight, color: pickColor(i, (options[i-1]||{}).hue)});
  }
  renderList(); drawWheel();
  showStatus("");
}
if (randomBtn) randomBtn.addEventListener('click', generateRandomSet);

// Save/load using base64url encoded JSON appended as hash
function base64urlEncode(str){
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function base64urlDecode(s){
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while(s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

function makeShareString(editable=true){
  const data = {options, highlight: true, createdAt: Date.now()};
  const json = JSON.stringify(data);
  const enc = base64urlEncode(json);
  return `${location.origin}${location.pathname}#wheel=${enc}&mode=${editable? 'edit':'view'}`;
}

function showStatus(msg) {
  if (statusEl) statusEl.textContent = msg || '';
}

if (shareEditBtn) shareEditBtn.addEventListener('click', async ()=>{
  const link = makeShareString(true);
  try{ await navigator.clipboard.writeText(link); showStatus('Link copied to clipboard'); }
  catch(e){ showStatus('Copy failed. Here is your link: ' + link); }
});
if (shareViewBtn) shareViewBtn.addEventListener('click', async ()=>{
  const link = makeShareString(false);
  try{ await navigator.clipboard.writeText(link); showStatus('Link copied to clipboard'); }
  catch(e){ showStatus('Copy failed. Here is your link: ' + link); }
});

function loadFromEncoded(enc, mode){
  try{
    const json = base64urlDecode(enc);
    const obj = JSON.parse(json);
    options = obj.options || [];
    if(!Array.isArray(options)) options = [];
    // ensure colors present
    for(let i=0;i<options.length;i++){ if(!options[i].color) options[i].color = pickColor(i); }
    renderList(); drawWheel();
    // if view mode, hide editing
    setEditable(mode === 'edit');
    viewMode = (mode !== 'edit');
    if (viewMode) {
      // Hide panel div completely
      const panelDiv = document.querySelector('.panel');
      if (panelDiv) panelDiv.style.display = 'none';
    }
    showStatus("");
  }catch(err){ showStatus('Failed to load data'); }
}

loadBtn.addEventListener('click', ()=>{
  const txt = loadInput.value.trim();
  if(!txt) return;
  // allow full url or only encoded
  const m = txt.match(/wheel=([A-Za-z0-9_-]+)/);
  const enc = m ? m[1] : txt.replace(/^#/, '').replace(/^wheel=/,'');
  const modeMatch = txt.match(/mode=(edit|view)/);
  const mode = modeMatch ? modeMatch[1] : 'edit';
  loadFromEncoded(enc, mode);
});

// on page load, check hash
function initFromHash(){
  const hash = location.hash.substring(1);
  const params = new URLSearchParams(hash.replace(/&/g,'&'));
  if(params.has('wheel')){
    const enc = params.get('wheel');
    const mode = params.get('mode') || 'edit';
    loadFromEncoded(enc, mode);
  }
}

function setEditable(canEdit){
  const els = [labelInput, weightInput, addBtn, clearBtn, randomBtn];
  els.forEach(e=>{ if(e) e.disabled = !canEdit; });
  // hide and re-enable/disable remove buttons
  Array.from(itemsEl.querySelectorAll('button')).forEach(b=>{
    b.style.display = canEdit ? '' : 'none';
    b.disabled = !canEdit;
  });
}

function setSpinLock(locked){
  if(locked){
    const els = [labelInput, weightInput, addBtn, clearBtn, randomBtn,
                 shareEditBtn, shareViewBtn, loadBtn, loadInput];
    els.forEach(e=>{ if(e) e.disabled = true; });
    Array.from(itemsEl.querySelectorAll('button')).forEach(b=>{ b.disabled = true; });
  } else {
    // Restore edit/view state rather than blindly re-enabling everything
    setEditable(!viewMode);
    const shareEls = [shareEditBtn, shareViewBtn, loadBtn, loadInput];
    shareEls.forEach(e=>{ if(e) e.disabled = false; });
  }
}

// initial
renderList(); drawWheel(); initFromHash();
