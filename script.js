const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const addBtn = document.getElementById('add');
const spinBtn = document.getElementById('spin');
const clearBtn = document.getElementById('clear');
const randomBtn = document.getElementById('random');
const itemsEl = document.getElementById('items');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');
const verdictEl = document.getElementById('verdict');
const labelInput = document.getElementById('label');
const weightInput = document.getElementById('weight');
const wheelContainer = document.getElementById('wheelContainer');
const highlightCheckbox = document.getElementById('highlightWin');
const shareEditBtn = document.getElementById('shareEdit');
const shareViewBtn = document.getElementById('shareView');
const loadBtn = document.getElementById('load');
const loadInput = document.getElementById('loadString');

let options = [];
let cumulativeRotation = 0; // always increase, do not reduce to ensure clockwise motion
let spinning = false;
let lastWinIndex = -1;
let viewMode = false;

const PALETTE = [0,20,40,80,120,160,200,240,280,320, 10,50,70,140,180];
const MAX_WEDGES = 15; // limit to 15 for random set and manual add

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

  // highlight winner visually by drawing outline/glow on top
  if(highlightIndex >= 0 && options[highlightIndex]){
    const opt = options[highlightIndex];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,radius,opt._start,opt._end,false);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,215,0,0.95)'; ctx.lineWidth = 8; ctx.stroke();
    ctx.restore();
  }
}

function addOption(){
  if (options.length >= MAX_WEDGES) {
    showStatus(`Max ${MAX_WEDGES} options allowed.`);
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

clearBtn.addEventListener('click', ()=>{ if(spinning) return; options=[]; renderList(); drawWheel(); resultEl.textContent=''; verdictEl.textContent=''; showStatus(""); });

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
  // pointer points down (180deg) visually because we placed pointer downward.
  // We compute which angle on the wheel is at pointer: wheel angle = pointerAngle - rotation
  const pointerDeg = 180; // pointer pointing down
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

function clearHighlight(){
  drawWheel(-1);
  lastWinIndex = -1;
}

function spin(){
  if(spinning) return;
  if(options.length === 0) return;
  // Remove highlight before spin
  clearHighlight();
  spinning = true; resultEl.textContent=''; verdictEl.textContent=''; lastWinIndex = -1;

  // Spin to a random angle, then determine winner
  const rotations = Math.floor(Math.random()*3) + 2;
  const randomAngle = Math.random() * 360;
  const targetDeg = rotations*360 + randomAngle;
  const finalRotation = cumulativeRotation + targetDeg;
  const duration = 4000;
  wheelContainer.style.transition = `transform ${duration}ms cubic-bezier(.22,.98,.36,1)`;
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
        const pointerDeg = 180;
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
          if(highlightCheckbox.checked && selectedResultIdx >= 0){
            drawWheel(selectedResultIdx);
            canvas.classList.add('win-glow');
            setTimeout(()=>canvas.classList.remove('win-glow'), 900);
          } else {
            drawWheel();
          }
          resultEl.textContent = `Result: ${options[selectedResultIdx].label}`;
          verdictEl.textContent = `Verdict: ${options[selectedResultIdx].label}`;
          spinning = false;
          wheelContainer.removeEventListener('transitionend', alignEnd);
        });
        return;
      }
    }
    if(highlightCheckbox.checked && actualIdx >= 0){
      drawWheel(actualIdx);
      canvas.classList.add('win-glow');
      setTimeout(()=>canvas.classList.remove('win-glow'), 900);
    } else {
      drawWheel();
    }
    if(actualIdx >= 0){
      resultEl.textContent = `Result: ${options[actualIdx].label}`;
      verdictEl.textContent = `Verdict: ${options[actualIdx].label}`;
    } else {
      resultEl.textContent = `Result: (unknown)`;
      verdictEl.textContent = `Verdict: (unknown)`;
    }
    spinning = false;
    wheelContainer.removeEventListener('transitionend', onEnd);
  }
  wheelContainer.addEventListener('transitionend', onEnd);
}

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

// Random set generator: produce 10-25 entries, increments of 100, weights inversely related to number
function generateRandomSet(){
  const count = Math.floor(Math.random() * (MAX_WEDGES - 5 + 1)) + 5; // 5..15
  options = [];
  let used = new Set();
  for(let i=0;i<count;i++){
    // Generate label as random number for now
    const label = `Option ${i+1}`;
    // Weight: increments of 5, between 10 and 20
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
  const data = {options, highlight: !!highlightCheckbox.checked, createdAt: Date.now()};
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
    if(typeof obj.highlight !== 'undefined') highlightCheckbox.checked = !!obj.highlight;
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
  // hide remove buttons
  Array.from(itemsEl.querySelectorAll('button')).forEach(b=>{ b.style.display = canEdit ? '' : 'none'; });
}

// initial
renderList(); drawWheel(); initFromHash();
