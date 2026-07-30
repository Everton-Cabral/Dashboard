// ============================================================
// URL DA PLANILHA ONLINE (GOOGLE SHEETS) — JÁ CONFIGURADA
// ============================================================
const ONLINE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQlvl-KnpcmszvVp_pN-w3R-R1ZS8-snBHvjQRApxB-JHgS5gIkEI6Vja3-nwnTkd1T8hQ3IC6DxFsF/pub?output=csv';

// ============================================================
// DADOS ESTÁTICOS (FALLBACK) — use um único registro de exemplo
// ============================================================
const STATIC_DATA = [];

// ============================================================
// VARIÁVEL GLOBAL DE DADOS (será preenchida dinamicamente)
// ============================================================
let DATA = [];

// ============================================================
// HELPERS E FUNÇÕES DE PROCESSAMENTO
// ============================================================
const fmtInt = n => (n==null||isNaN(n)) ? '—' : Math.round(n).toLocaleString('pt-BR');
const fmtDec = (n,d=1) => (n==null||isNaN(n)) ? '—' : n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtPct = (n,d=1) => (n==null||isNaN(n)) ? '—' : n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})+'%';
function fmtDate(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function monthKey(iso){
  if(!iso) return null;
  const d = new Date(iso);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthLabel(key){
  const [y,m] = key.split('-');
  const names=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return names[parseInt(m,10)-1]+'/'+y.slice(2);
}

const COLOR_TIPO = {
  'PREVENTIVA':'#249688','CORRETIVA':'#F2661D','ASSISTÊNCIA 24H':'#FFB238',
  'AVARIA':'#E5484D','SINISTRO':'#6B4E9E'
};
const PALETTE = ['#F2661D','#0A1F44','#249688','#FFB238','#6B4E9E','#E5484D','#3D6FB4','#9AA3B2','#B87400','#7A8CFF','#C8506B','#5B6472'];
function colorFor(label, idx){ return PALETTE[idx % PALETTE.length]; }

let allTipos = [], allClientes = [], allPlacas = [], allStatusGeo = [], allControladores = [], allFornecedores = [], allStatusRodando = [];
let minDate = null, maxDate = null;

function normStatusRodando(v){
  if(!v) return null;
  const s = String(v).trim().toUpperCase();
  return s || null;
}

function computeOptions(){
  allTipos = Array.from(new Set(DATA.map(d=>d.tipoManut).filter(Boolean))).sort();
  allClientes = Array.from(new Set(DATA.map(d=>d.cliente).filter(Boolean))).sort();
  allPlacas = Array.from(new Set(DATA.map(d=>d.placa).filter(Boolean))).sort();
  allStatusGeo = Array.from(new Set(DATA.map(d=>d.statusParadaGeo).filter(Boolean))).sort();
  allControladores = Array.from(new Set(DATA.map(d=>d.controlador).filter(Boolean))).sort();
  allFornecedores = Array.from(new Set(DATA.map(d=>d.fornecedor).filter(Boolean))).sort();
  allStatusRodando = Array.from(new Set(DATA.map(d=>normStatusRodando(d.statusParadoRodando)).filter(Boolean))).sort();
}
function computeDateBounds(){
  const paradaDates = DATA.map(d=>d.dtParadaOficina).filter(Boolean).sort();
  minDate = paradaDates[0] ? paradaDates[0].slice(0,10) : null;
  maxDate = paradaDates[paradaDates.length-1] ? paradaDates[paradaDates.length-1].slice(0,10) : null;
}

let state = {
  dateFrom:null, dateTo:null,
  tipos:new Set(),
  clientes:new Set(),
  statusGeo:new Set(),
  controladores:new Set(),
  placas:new Set(),
  fornecedores:new Set(),
  statusRodando:new Set(),
  sortKey:'dtParadaOficina', sortDir:'desc',
  page:1, pageSize:25
};

function buildChipGroup(containerId, values, selectedSet, onChange){
  const el = document.getElementById(containerId);
  el.innerHTML='';
  values.forEach(v=>{
    const b = document.createElement('button');
    b.type='button'; b.className='chip-toggle active'; b.textContent=v;
    b.addEventListener('click', ()=>{
      if(selectedSet.has(v)){ selectedSet.delete(v); b.classList.remove('active'); }
      else { selectedSet.add(v); b.classList.add('active'); }
      onChange();
    });
    el.appendChild(b);
  });
}
function renderTagFilter(selectedEl, selectedSet, onRemove){
  const el = document.getElementById(selectedEl);
  el.innerHTML='';
  selectedSet.forEach(v=>{
    const tag = document.createElement('span'); tag.className='placa-tag';
    tag.innerHTML = v + ' ';
    const btn = document.createElement('button'); btn.textContent='×';
    btn.addEventListener('click', ()=>{ selectedSet.delete(v); onRemove(); });
    tag.appendChild(btn);
    el.appendChild(tag);
  });
}
function initTagSearch(inputId, suggestId, selectedEl, selectedSet, optionsGetter, onAdd){
  const input = document.getElementById(inputId);
  const suggest = document.getElementById(suggestId);
  input.addEventListener('input', ()=>{
    const q = input.value.trim().toUpperCase();
    if(!q){ suggest.classList.remove('show'); suggest.innerHTML=''; return; }
    const matches = optionsGetter().filter(p=>p.toUpperCase().includes(q) && !selectedSet.has(p)).slice(0,12);
    suggest.innerHTML='';
    matches.forEach(m=>{
      const d = document.createElement('div'); d.textContent=m;
      d.addEventListener('click', ()=>{
        selectedSet.add(m); onAdd(); input.value=''; suggest.classList.remove('show'); refreshAll();
      });
      suggest.appendChild(d);
    });
    suggest.classList.toggle('show', matches.length>0);
  });
  document.addEventListener('click', (e)=>{
    if(!suggest.contains(e.target) && e.target!==input) suggest.classList.remove('show');
  });
}
function renderPlacaTags(){
  renderTagFilter('placaSelected', state.placas, ()=>{ renderPlacaTags(); refreshAll(); });
}
function initPlacaSearch(){
  initTagSearch('fPlacaSearch','placaSuggest','placaSelected', state.placas, ()=>allPlacas, renderPlacaTags);
}
function createDropdownFilter(cfg){
  const toggle = document.getElementById(cfg.toggleId);
  const panel = document.getElementById(cfg.panelId);
  const list = document.getElementById(cfg.listId);
  const search = document.getElementById(cfg.searchId);
  const btnAll = document.getElementById(cfg.allId);
  const btnNone = document.getElementById(cfg.noneId);

  function updateLabel(){
    const opts = cfg.getOptions(), sel = cfg.getSelected();
    if(opts.length===0) toggle.textContent = 'Sem opções';
    else if(sel.size === opts.length) toggle.textContent = 'Todos selecionados';
    else if(sel.size === 0) toggle.textContent = 'Nenhum selecionado';
    else toggle.textContent = sel.size + ' de ' + opts.length + ' selecionados';
  }
  function renderList(){
    const q = search.value.trim().toUpperCase();
    const opts = cfg.getOptions(), sel = cfg.getSelected();
    const filtered = opts.filter(o=>!q || o.toUpperCase().includes(q));
    list.innerHTML='';
    if(!filtered.length){
      const empty = document.createElement('div'); empty.className='dropdown-empty'; empty.textContent='Nenhum item encontrado';
      list.appendChild(empty); return;
    }
    filtered.forEach(o=>{
      const item = document.createElement('label'); item.className='dropdown-item';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.checked = sel.has(o);
      cb.addEventListener('change', ()=>{
        if(cb.checked) sel.add(o); else sel.delete(o);
        updateLabel(); refreshAll();
      });
      const span = document.createElement('span'); span.textContent = o;
      item.appendChild(cb); item.appendChild(span);
      list.appendChild(item);
    });
  }
  toggle.addEventListener('click', ()=>{
    const willShow = !panel.classList.contains('show');
    panel.classList.toggle('show', willShow);
    if(willShow) renderList();
  });
  search.addEventListener('input', renderList);
  btnAll.addEventListener('click', ()=>{ cfg.getOptions().forEach(o=>cfg.getSelected().add(o)); renderList(); updateLabel(); refreshAll(); });
  btnNone.addEventListener('click', ()=>{ cfg.getSelected().clear(); renderList(); updateLabel(); refreshAll(); });
  document.addEventListener('click', (e)=>{
    if(!panel.contains(e.target) && e.target!==toggle) panel.classList.remove('show');
  });
  updateLabel();
  return { refresh: ()=>{ renderList(); updateLabel(); } };
}
let fornecedorDropdown = null;
function initFornecedorDropdown(){
  fornecedorDropdown = createDropdownFilter({
    toggleId:'fFornecedorToggle', panelId:'fFornecedorPanel', listId:'fFornecedorList', searchId:'fFornecedorFilterSearch',
    allId:'fFornecedorAll', noneId:'fFornecedorNone',
    getOptions: ()=>allFornecedores, getSelected: ()=>state.fornecedores
  });
}
function refreshFornecedorDropdown(){
  if(fornecedorDropdown) fornecedorDropdown.refresh();
}
document.getElementById('fDateFrom').addEventListener('change', e=>{ state.dateFrom = e.target.value || null; refreshAll(); });
document.getElementById('fDateTo').addEventListener('change', e=>{ state.dateTo = e.target.value || null; refreshAll(); });
function rebuildAllChipGroups(){
  buildChipGroup('fTipoManut', allTipos, state.tipos, refreshAll);
  buildChipGroup('fCliente', allClientes, state.clientes, refreshAll);
  buildChipGroup('fStatusGeo', allStatusGeo, state.statusGeo, refreshAll);
  buildChipGroup('fStatusRodando', allStatusRodando, state.statusRodando, refreshAll);
  buildChipGroup('fControlador', allControladores, state.controladores, refreshAll);
}
document.getElementById('btnClear').addEventListener('click', ()=>{
  state.dateFrom=null; state.dateTo=null;
  document.getElementById('fDateFrom').value='';
  document.getElementById('fDateTo').value='';
  state.tipos = new Set(allTipos);
  state.clientes = new Set(allClientes);
  state.statusGeo = new Set(allStatusGeo);
  state.statusRodando = new Set(allStatusRodando);
  state.controladores = new Set(allControladores);
  state.placas = new Set();
  state.fornecedores = new Set(allFornecedores);
  rebuildAllChipGroups();
  renderPlacaTags();
  refreshFornecedorDropdown();
  refreshAll();
});

document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    setTimeout(renderCharts, 10);
  });
});

function getFiltered(){
  return DATA.filter(d=>{
    if(state.dateFrom && (!d.dtParadaOficina || d.dtParadaOficina.slice(0,10) < state.dateFrom)) return false;
    if(state.dateTo && (!d.dtParadaOficina || d.dtParadaOficina.slice(0,10) > state.dateTo)) return false;
    if(d.tipoManut && !state.tipos.has(d.tipoManut)) return false;
    if(!d.tipoManut && state.tipos.size < allTipos.length) return false;
    if(d.cliente && !state.clientes.has(d.cliente)) return false;
    if(!d.cliente && state.clientes.size < allClientes.length) return false;
    if(d.statusParadaGeo && !state.statusGeo.has(d.statusParadaGeo)) return false;
    if(!d.statusParadaGeo && state.statusGeo.size < allStatusGeo.length) return false;
    const sr = normStatusRodando(d.statusParadoRodando);
    if(sr && !state.statusRodando.has(sr)) return false;
    if(!sr && state.statusRodando.size < allStatusRodando.length) return false;
    if(d.controlador && !state.controladores.has(d.controlador)) return false;
    if(!d.controlador && state.controladores.size < allControladores.length) return false;
    if(state.placas.size>0 && !state.placas.has(d.placa)) return false;
    if(d.fornecedor && !state.fornecedores.has(d.fornecedor)) return false;
    if(!d.fornecedor && state.fornecedores.size < allFornecedores.length) return false;
    return true;
  });
}
function countBy(arr, field){
  const m = new Map();
  arr.forEach(d=>{
    const k = d[field] || '—';
    m.set(k, (m.get(k)||0)+1);
  });
  return m;
}
function avgDurationByDynamic(arr, field){
  const ref = (()=>{
    const now = new Date();
    if(state.dateTo){
      const end = new Date(state.dateTo+'T23:59:59');
      return end < now ? end : now;
    }
    return now;
  })();
  const sums = new Map(), counts = new Map();
  arr.forEach(d=>{
    let v = d.duracaoDias;
    if(v==null){
      if(!d.dtParadaOficina) return;
      const start = new Date(d.dtParadaOficina);
      v = (ref - start) / 86400000;
      if(v<0) return;
    }
    const k = d[field] || '—';
    sums.set(k, (sums.get(k)||0) + v);
    counts.set(k, (counts.get(k)||0) + 1);
  });
  const res = new Map();
  sums.forEach((s,k)=> res.set(k, s / counts.get(k)));
  return res;
}
function avgFieldBy(arr, groupField, valueField){
  const sums = new Map(), counts = new Map();
  arr.forEach(d=>{
    const v = d[valueField];
    if(v==null || v<0 || v>400) return;
    const k = d[groupField] || '—';
    sums.set(k, (sums.get(k)||0) + v);
    counts.set(k, (counts.get(k)||0) + 1);
  });
  const res = new Map();
  sums.forEach((s,k)=> res.set(k, s / counts.get(k)));
  return res;
}
function mapToSortedArr(m, desc=true){
  return Array.from(m.entries()).map(([label,value])=>({label,value})).sort((a,b)=> desc ? b.value-a.value : a.value-b.value);
}

function setupCanvas(canvas, cssHeight){
  const parent = canvas.parentElement;
  const cssWidth = parent.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssWidth+'px';
  canvas.style.height = cssHeight+'px';
  canvas.width = Math.round(cssWidth*dpr);
  canvas.height = Math.round(cssHeight*dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cssWidth,cssHeight);
  return {ctx, w:cssWidth, h:cssHeight};
}
function roundRect(ctx,x,y,w,h,r){
  if(w<=0||h<=0) return;
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function emptyState(canvas, msg){
  const {ctx,w,h} = setupCanvas(canvas, 220);
  ctx.fillStyle = '#9AA3B2'; ctx.font='12.5px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(msg || 'Sem dados para os filtros selecionados', w/2, h/2);
}
function drawHBar(canvasId, items, opts={}){
  const canvas = document.getElementById(canvasId);
  if(!items.length){ emptyState(canvas); return; }
  const rowH = 30;
  const height = Math.max(140, items.length*rowH + 20);
  const {ctx,w,h} = setupCanvas(canvas, height);
  const labelW = opts.labelWidth || 128;
  const valW = 56;
  const chartLeft = labelW, chartRight = w - valW - 10;
  const maxVal = Math.max(...items.map(i=>i.value), 1);
  ctx.font='11.5px -apple-system,Segoe UI,Roboto,sans-serif';
  items.forEach((it, i)=>{
    const y = 10 + i*rowH;
    const barH = 16;
    const barW = Math.max(2, (it.value/maxVal) * (chartRight-chartLeft));
    ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillStyle='#2B3242';
    let label = String(it.label);
    if(label.length>22) label = label.slice(0,21)+'…';
    ctx.fillText(label, chartLeft-10, y+barH/2);
    ctx.fillStyle = opts.color ? (typeof opts.color==='function'?opts.color(it,i):opts.color) : colorFor(it.label,i);
    roundRect(ctx, chartLeft, y, barW, barH, 5);
    ctx.fill();
    ctx.textAlign='left'; ctx.fillStyle='#5B6472'; ctx.font='11px -apple-system,Segoe UI,Roboto,sans-serif';
    const valText = opts.valueFormatter ? opts.valueFormatter(it.value) : fmtInt(it.value);
    ctx.fillText(valText, chartLeft+barW+8, y+barH/2);
  });
}
function drawDonut(canvasId, items, legendId, opts={}){
  const canvas = document.getElementById(canvasId);
  if(!items.length || items.every(i=>i.value===0)){ emptyState(canvas); if(legendId) document.getElementById(legendId).innerHTML=''; return; }
  const {ctx,w,h} = setupCanvas(canvas, 230);
  const cx = w/2, cy = h/2, rOuter = Math.min(w,h)/2 - 8, rInner = rOuter*0.58;
  const total = items.reduce((s,i)=>s+i.value,0);
  let start = -Math.PI/2;
  const slices = [];
  items.forEach((it,i)=>{
    const angle = (it.value/total) * Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,rOuter,start,start+angle);
    ctx.closePath();
    ctx.fillStyle = opts.color ? opts.color(it.label,i) : colorFor(it.label,i);
    ctx.fill();
    slices.push({mid:start+angle/2, angle, pct:it.value/total*100});
    start += angle;
  });
  ctx.globalCompositeOperation='destination-out';
  ctx.beginPath(); ctx.arc(cx,cy,rInner,0,Math.PI*2); ctx.fill();
  ctx.globalCompositeOperation='source-over';
  const rLabel = (rOuter+rInner)/2;
  ctx.font='700 11px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  slices.forEach(s=>{
    if(s.pct < 4) return;
    const lx = cx + Math.cos(s.mid)*rLabel;
    const ly = cy + Math.sin(s.mid)*rLabel;
    const label = fmtPct(s.pct,1);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(10,31,68,.55)';
    roundRect(ctx, lx-tw/2-5, ly-9, tw+10, 18, 9);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, lx, ly+0.5);
  });
  ctx.fillStyle='#0A1F44'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='700 20px -apple-system,Segoe UI,Roboto,sans-serif';
  ctx.fillText(fmtInt(total), cx, cy-8);
  ctx.font='10.5px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.fillStyle='#9AA3B2';
  ctx.fillText('OS', cx, cy+12);
  if(legendId){
    const el = document.getElementById(legendId); el.innerHTML='';
    items.forEach((it,i)=>{
      const pct = (it.value/total*100);
      const div = document.createElement('div'); div.className='legend-item';
      const dot = document.createElement('span'); dot.className='legend-dot';
      dot.style.background = opts.color ? opts.color(it.label,i) : colorFor(it.label,i);
      div.appendChild(dot);
      div.appendChild(document.createTextNode(it.label+' · '+fmtInt(it.value)+' · '+fmtPct(pct)));
      el.appendChild(div);
    });
  }
}
function drawCombo(canvasId, months, counts, avgs, legendId){
  const canvas = document.getElementById(canvasId);
  if(!months.length){ emptyState(canvas); return; }
  const {ctx,w,h} = setupCanvas(canvas, 260);
  const padL=38, padR=40, padT=26, padB=34;
  const chartW = w-padL-padR, chartH = h-padT-padB;
  const maxCount = Math.max(...counts,1);
  const maxAvg = Math.max(...avgs.filter(v=>!isNaN(v)),1);
  const n = months.length;
  const bw = chartW/n * 0.5;
  ctx.strokeStyle='#EDEFF4'; ctx.lineWidth=1;
  for(let g=0; g<=4; g++){
    const y = padT + chartH - (g/4)*chartH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+chartW,y); ctx.stroke();
    ctx.fillStyle='#9AA3B2'; ctx.font='10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillText(fmtInt(maxCount*g/4), padL-8, y);
  }
  months.forEach((m,i)=>{
    const x = padL + (i+0.5)*(chartW/n);
    const barH = (counts[i]/maxCount)*chartH;
    ctx.fillStyle='#F2661D';
    roundRect(ctx, x-bw/2, padT+chartH-barH, bw, barH, 4);
    ctx.fill();
    ctx.fillStyle='#F2661D'; ctx.font='700 10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(fmtInt(counts[i]), x, padT+chartH-barH-4);
    ctx.fillStyle='#5B6472'; ctx.font='10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText(monthLabel(m), x, padT+chartH+8);
  });
  ctx.beginPath();
  months.forEach((m,i)=>{
    const x = padL + (i+0.5)*(chartW/n);
    const v = avgs[i];
    if(isNaN(v)) return;
    const y = padT + chartH - (v/maxAvg)*chartH;
    if(i===0 || isNaN(avgs[i-1])) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle='#0A1F44'; ctx.lineWidth=2.4; ctx.stroke();
  months.forEach((m,i)=>{
    const x = padL + (i+0.5)*(chartW/n);
    const v = avgs[i];
    if(isNaN(v)) return;
    const y = padT + chartH - (v/maxAvg)*chartH;
    ctx.beginPath(); ctx.arc(x,y,3.2,0,Math.PI*2); ctx.fillStyle='#0A1F44'; ctx.fill();
    ctx.fillStyle='#0A1F44'; ctx.font='700 10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(fmtDec(v)+'d', x, y-6);
  });
  if(legendId){
    const el = document.getElementById(legendId); el.innerHTML='';
    const items = [['Qtde. de paradas','#F2661D'],['Tempo médio (dias)','#0A1F44']];
    items.forEach(([label,color])=>{
      const div = document.createElement('div'); div.className='legend-item';
      const dot = document.createElement('span'); dot.className='legend-dot'; dot.style.background=color;
      div.appendChild(dot); div.appendChild(document.createTextNode(label));
      el.appendChild(div);
    });
  }
}
function drawPareto(canvasId, items){
  const canvas = document.getElementById(canvasId);
  if(!items.length){ emptyState(canvas); return; }
  const {ctx,w,h} = setupCanvas(canvas, 280);
  const padL=42, padR=46, padT=16, padB=64;
  const chartW = w-padL-padR, chartH = h-padT-padB;
  const total = items.reduce((s,i)=>s+i.value,0);
  const maxVal = items[0].value;
  const n = items.length;
  const bw = chartW/n*0.56;
  let cum=0;
  const cumPts = [];
  ctx.strokeStyle='#EDEFF4'; ctx.lineWidth=1;
  for(let g=0; g<=4; g++){
    const y = padT + chartH - (g/4)*chartH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+chartW,y); ctx.stroke();
    ctx.fillStyle='#9AA3B2'; ctx.font='10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillText(fmtInt(maxVal*g/4), padL-8, y);
  }
  items.forEach((it,i)=>{
    const x = padL + (i+0.5)*(chartW/n);
    const barH = (it.value/maxVal)*chartH;
    ctx.fillStyle = colorFor(it.label,i);
    roundRect(ctx, x-bw/2, padT+chartH-barH, bw, barH, 4);
    ctx.fill();
    ctx.fillStyle='#2B3242'; ctx.font='700 10.5px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(fmtInt(it.value), x, padT+chartH-barH-4);
    cum += it.value;
    cumPts.push({x, pct: cum/total*100});
    ctx.fillStyle='#5B6472'; ctx.font='10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.save();
    ctx.translate(x, padT+chartH+10);
    ctx.rotate(-0.35);
    let label = it.label.length>16? it.label.slice(0,15)+'…' : it.label;
    ctx.textAlign='right';
    ctx.fillText(label, 4, 4);
    ctx.restore();
  });
  const y80 = padT + chartH - (80/100)*chartH;
  ctx.strokeStyle='#E5484D'; ctx.setLineDash([4,4]); ctx.lineWidth=1.2;
  ctx.beginPath(); ctx.moveTo(padL,y80); ctx.lineTo(padL+chartW,y80); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle='#E5484D'; ctx.font='700 10px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='bottom';
  ctx.fillText('80%', padL+chartW+4, y80+4);
  ctx.beginPath();
  cumPts.forEach((p,i)=>{
    const y = padT + chartH - (p.pct/100)*chartH;
    if(i===0) ctx.moveTo(p.x,y); else ctx.lineTo(p.x,y);
  });
  ctx.strokeStyle='#F2661D'; ctx.lineWidth=2.2; ctx.stroke();
  cumPts.forEach(p=>{
    const y = padT + chartH - (p.pct/100)*chartH;
    ctx.beginPath(); ctx.arc(p.x,y,3,0,Math.PI*2); ctx.fillStyle='#F2661D'; ctx.fill();
    ctx.fillStyle='#F2661D'; ctx.font='700 9.5px -apple-system,Segoe UI,Roboto,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillText(fmtPct(p.pct,0), p.x, y-6);
  });
  ctx.textAlign='left'; ctx.fillStyle='#9AA3B2'; ctx.font='10px -apple-system,Segoe UI,Roboto,sans-serif';
  for(let g=0; g<=4; g++){
    const y = padT + chartH - (g/4)*chartH;
    ctx.fillText((g*25)+'%', padL+chartW+4, y);
  }
}

function renderKPIs(filtered){
  const total = filtered.length;
  const uniqueVeic = new Set(filtered.map(d=>d.placa).filter(Boolean)).size;
  const uniqueCli = new Set(filtered.map(d=>d.cliente).filter(Boolean)).size;
  const durs = filtered.map(d=>d.duracaoDias).filter(v=>v!=null);
  const avgDur = durs.length ? durs.reduce((a,b)=>a+b,0)/durs.length : null;
  const glosaKnown = filtered.filter(d=>d.glosa);
  const noPrazo = glosaKnown.filter(d=>d.glosa==='NO PRAZO').length;
  const pctPrazo = glosaKnown.length ? noPrazo/glosaKnown.length*100 : null;
  const preventiva = filtered.filter(d=>d.tipoManut==='PREVENTIVA').length;
  const pctPrev = total ? preventiva/total*100 : null;
  const cards = [
    {val:fmtInt(total), lbl:'Total de OS (paradas)', cls:'c-navy'},
    {val:fmtInt(uniqueVeic), lbl:'Veículos únicos', cls:''},
    {val:fmtInt(uniqueCli), lbl:'Clientes atendidos', cls:'c-purple'},
    {val:avgDur!=null?fmtDec(avgDur)+' d':'—', lbl:'Tempo médio de parada', cls:'c-amber'},
    {val:pctPrazo!=null?fmtPct(pctPrazo,0):'—', lbl:'OS entregues no prazo', cls:'c-teal'},
    {val:pctPrev!=null?fmtPct(pctPrev,0):'—', lbl:'Manutenções preventivas', cls:'c-red'},
  ];
  const grid = document.getElementById('kpiGrid');
  grid.innerHTML='';
  cards.forEach(c=>{
    const div = document.createElement('div'); div.className='kpi-card '+c.cls;
    div.innerHTML = '<div class="val">'+c.val+'</div><div class="lbl">'+c.lbl+'</div>';
    grid.appendChild(div);
  });
}
function renderParadosKPIs(parados){
  const el=document.getElementById('kpiParados'); if(!el)return;
  const totalParados=parados.length;
  const placasUnicas=new Set(parados.map(d=>d.placa)).size;
  const mediaVDias=parados.length?Math.round(parados.reduce((a,b)=>a+b.diasParado,0)/parados.length):0;
  const maxDias=parados.length?Math.max(...parados.map(d=>d.diasParado)):0;
  const maisAntigaPlaca=parados.length?parados.reduce((a,b)=>a.diasParado>b.diasParado?a:b).placa:'—';
  const emAtraso=parados.filter(d=>d.glosa==='EM ATRASO').length;
  el.innerHTML=`
    <div class="kpi-card c-red"><div class="val">${totalParados}</div><div class="lbl">OS Abertas em Oficina</div></div>
    <div class="kpi-card" style="border-left-color:var(--orange)"><div class="val">${placasUnicas}</div><div class="lbl">Veículos Únicos Parados</div></div>
    <div class="kpi-card c-amber"><div class="val">${mediaVDias}</div><div class="lbl">Média de Dias Parado</div></div>
    <div class="kpi-card c-red"><div class="val">${maxDias}</div><div class="lbl">Maior Imobilização (dias) — ${maisAntigaPlaca}</div></div>
    <div class="kpi-card c-navy"><div class="val">${emAtraso}</div><div class="lbl">Em Atraso (Glosa)</div></div>
  `;
}
function getParadosData(rows){
  const today = new Date();
  return rows.filter(d=>{
    if(d.dtEntregaCliente) return false;
    if(!d.dtParadaOficina) return false;
    return true;
  }).map(d=>{
    const entrada=new Date(d.dtParadaOficina);
    const diasParado=Math.round((today-entrada)/86400000);
    return {...d, diasParado};
  });
}
function renderParadoMotivo(parados){
  const freq={};
  parados.forEach(d=>{
    const m=(d.motivoParada||'NÃO INFORMADO').toUpperCase().trim().substring(0,34);
    freq[m]=(freq[m]||0)+1;
  });
  const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,15)
    .map(([label,value])=>({label,value}));
  drawHBar('chartParadoMotivo', sorted, {labelWidth:200});
}
function renderParadoTipo(parados){
  const freq={};
  parados.forEach(d=>{const k=d.tipoManut||'N/A';freq[k]=(freq[k]||0)+1;});
  const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  const colors={'PREVENTIVA':'#249688','CORRETIVA':'#F2661D','ASSISTÊNCIA 24H':'#FFB238','AVARIA':'#E5484D','SINISTRO':'#6B4E9E'};
  drawDonut('chartParadoTipo', sorted, 'legendParadoTipo', {color:(l)=>colors[l]||'#9AA3B2'});
}
function renderParadoDias(parados){
  if(!parados.length){emptyState(document.getElementById('chartParadoDias'));return;}
  const byPlaca={};
  parados.forEach(d=>{
    if(!byPlaca[d.placa]||d.diasParado>byPlaca[d.placa].diasParado)byPlaca[d.placa]=d;
  });
  const sorted=Object.values(byPlaca).sort((a,b)=>b.diasParado-a.diasParado).slice(0,15)
    .map(d=>({label:d.placa, value:d.diasParado}));
  drawHBar('chartParadoDias', sorted, {labelWidth:96, color:(it)=>it.value>=30?'#E5484D':it.value>=15?'#FFB238':'#F2661D', valueFormatter:(v)=>v+'d'});
}
function renderParadoCliente(parados){
  const freq={};
  parados.forEach(d=>{const k=d.cliente||'N/A';freq[k]=(freq[k]||0)+1;});
  const sorted=Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  drawDonut('chartParadoCliente', sorted, 'legendParadoCliente', {});
}
function renderParadosTable(parados){
  const th=document.getElementById('thParados');
  const tb=document.getElementById('tbParados');
  if(!th||!tb)return;
  const hdrs=['Placa','Cliente','Base','Tipo Manut.','Motivo Parada','Fornecedor','Entrada Oficina','Dias Parado','Aging Manutenção','Glosa','Guincho'];
  th.innerHTML=hdrs.map(h=>`<th style="background:var(--gray-50);padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--gray-600);text-align:left;border-bottom:1px solid var(--gray-200);white-space:nowrap">${h}</th>`).join('');
  const sorted=[...parados].sort((a,b)=>b.diasParado-a.diasParado);
  tb.innerHTML=sorted.map(d=>{
    const diasCls=d.diasParado>=30?'color:#E5484D;font-weight:700':d.diasParado>=15?'color:#B87400;font-weight:700':'color:#2B3242';
    const glosaCls=d.glosa==='EM ATRASO'?'background:#FDEBEC;color:#E5484D':'background:#E4F5F1;color:#249688';
    const dt=d.dtParadaOficina?new Date(d.dtParadaOficina).toLocaleDateString('pt-BR'):'—';
    return `<tr style="border-bottom:1px solid var(--gray-100)">
      <td style="padding:7px 10px;font-weight:700;color:var(--navy)">${d.placa||'—'}</td>
      <td style="padding:7px 10px;font-size:11.5px">${d.cliente||'—'}</td>
      <td style="padding:7px 10px;font-size:11.5px">${d.base||'—'}</td>
      <td style="padding:7px 10px;font-size:11.5px">${d.tipoManut||'—'}</td>
      <td style="padding:7px 10px;font-size:11.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.motivoParada||'—'}</td>
      <td style="padding:7px 10px;font-size:11.5px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.fornecedor||'—'}</td>
      <td style="padding:7px 10px;font-size:11.5px">${dt}</td>
      <td style="padding:7px 10px;${diasCls}">${d.diasParado}</td>
      <td style="padding:7px 10px;font-size:11.5px">${d.agingManutencao!=null?d.agingManutencao+'d':'—'}</td>
      <td style="padding:7px 10px"><span style="padding:3px 8px;border-radius:12px;font-size:10px;font-weight:700;${glosaCls}">${d.glosa||'—'}</span></td>
      <td style="padding:7px 10px;font-size:11.5px">${d.guincho||'—'}</td>
    </tr>`;
  }).join('');
}
function renderParadosTab(rows){
  const parados=getParadosData(rows);
  renderParadosKPIs(parados);
  renderParadoMotivo(parados);
  renderParadoTipo(parados);
  renderParadoDias(parados);
  renderParadoCliente(parados);
  renderParadosTable(parados);
}

function renderCharts(){
  const filtered = getFiltered();
  const activeTab = document.querySelector('.tab-panel.active').id;
  renderKPIs(filtered);
  if(activeTab==='tab-visao'){
    const byMonth = new Map();
    filtered.forEach(d=>{
      const k = monthKey(d.dtParadaOficina);
      if(!k) return;
      if(!byMonth.has(k)) byMonth.set(k, {count:0,sum:0,n:0});
      const o = byMonth.get(k);
      o.count++;
      if(d.duracaoDias!=null){ o.sum+=d.duracaoDias; o.n++; }
    });
    const months = Array.from(byMonth.keys()).sort();
    const counts = months.map(m=>byMonth.get(m).count);
    const avgs = months.map(m=>{ const o=byMonth.get(m); return o.n? o.sum/o.n : NaN; });
    drawCombo('chartMonthly', months, counts, avgs, 'legendMonthly');
    const tipoCounts = mapToSortedArr(countBy(filtered,'tipoManut'));
    drawDonut('chartTipoDonut', tipoCounts, 'legendTipoDonut', {color:(l)=>COLOR_TIPO[l]||'#9AA3B2'});
    const glosaCounts = mapToSortedArr(countBy(filtered.filter(d=>d.glosa),'glosa'));
    const glosaColor = {'NO PRAZO':'#249688','EM ATRASO':'#E5484D','EXPIRA HOJE':'#FFB238'};
    drawDonut('chartPrazoDonut', glosaCounts, 'legendPrazoDonut', {color:(l)=>glosaColor[l]||'#9AA3B2'});
    const statusCounts = mapToSortedArr(countBy(filtered.filter(d=>d.statusParadaGeo),'statusParadaGeo'));
    drawDonut('chartStatusGeo', statusCounts, 'legendStatusGeo', {});
  }
  if(activeTab==='tab-pareto'){
    const tipoCounts = mapToSortedArr(countBy(filtered,'tipoManut'));
    drawPareto('chartParetoTipo', tipoCounts);
    const grupoCounts = mapToSortedArr(countBy(filtered,'grupoManut'));
    drawPareto('chartParetoGrupo', grupoCounts);
    const tempoTipo = mapToSortedArr(avgDurationByDynamic(filtered,'tipoManut'));
    drawHBar('chartTempoTipo', tempoTipo, {color:(it)=>COLOR_TIPO[it.label]||'#9AA3B2', valueFormatter:v=>fmtDec(v)+' d'});
    const tempoGrupo = mapToSortedArr(avgDurationByDynamic(filtered,'grupoManut'));
    drawHBar('chartTempoGrupo', tempoGrupo, {valueFormatter:v=>fmtDec(v)+' d'});
    const tempoManutTipo = mapToSortedArr(avgFieldBy(filtered,'tipoManut','agingManutencao'));
    drawHBar('chartTempoManutTipo', tempoManutTipo, {color:(it)=>COLOR_TIPO[it.label]||'#9AA3B2', valueFormatter:v=>fmtDec(v)+' d'});
    const tempoManutGrupo = mapToSortedArr(avgFieldBy(filtered,'grupoManut','agingManutencao'));
    drawHBar('chartTempoManutGrupo', tempoManutGrupo, {valueFormatter:v=>fmtDec(v)+' d'});
  }
  if(activeTab==='tab-parados'){
    renderParadosTab(filtered);
    return;
  }
  if(activeTab==='tab-frota'){
    const clienteCounts = mapToSortedArr(countBy(filtered,'cliente'));
    drawHBar('chartCliente', clienteCounts, {labelWidth:150});
    const placaCounts = mapToSortedArr(countBy(filtered,'placa')).slice(0,10);
    drawHBar('chartTopPlacas', placaCounts, {labelWidth:100});
    const fornCounts = mapToSortedArr(countBy(filtered,'fornecedor')).slice(0,10);
    drawHBar('chartFornecedor', fornCounts, {labelWidth:150});
    const baseCounts = mapToSortedArr(countBy(filtered,'base')).slice(0,10);
    drawHBar('chartBase', baseCounts, {labelWidth:150});
  }
}

function statusBadge(glosa){
  if(glosa==='NO PRAZO') return '<span class="badge ok">No prazo</span>';
  if(glosa==='EM ATRASO') return '<span class="badge late">Em atraso</span>';
  if(glosa==='EXPIRA HOJE') return '<span class="badge today">Expira hoje</span>';
  return '<span class="badge na">—</span>';
}
function renderTable(){
  const filtered = getFiltered();
  document.getElementById('tableCount').textContent = fmtInt(filtered.length)+' registro(s) encontrados';
  const key = state.sortKey, dir = state.sortDir;
  filtered.sort((a,b)=>{
    let va = a[key], vb = b[key];
    if(va==null && vb==null) return 0;
    if(va==null) return 1;
    if(vb==null) return -1;
    if(typeof va==='string' && typeof vb==='string')
      return dir==='asc' ? va.localeCompare(vb,'pt-BR',{sensitivity:'base'}) : vb.localeCompare(va,'pt-BR',{sensitivity:'base'});
    if(typeof va==='number' && typeof vb==='number') return dir==='asc' ? va-vb : vb-va;
    const sa=String(va), sb=String(vb);
    return dir==='asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length/state.pageSize));
  if(state.page>totalPages) state.page = totalPages;
  const startIdx = (state.page-1)*state.pageSize;
  const pageItems = filtered.slice(startIdx, startIdx+state.pageSize);
  const body = document.getElementById('detailBody');
  body.innerHTML = pageItems.map(d=>(
    '<tr>'+
    '<td>'+(d.placa||'—')+'</td>'+
    '<td>'+(d.cliente||'—')+'</td>'+
    '<td>'+(d.tipoManut||'—')+'</td>'+
    '<td>'+(d.grupoManut||'—')+'</td>'+
    '<td>'+fmtDate(d.dtParadaOficina)+'</td>'+
    '<td>'+fmtDate(d.dtEntregaCliente)+'</td>'+
    '<td>'+(d.duracaoDias!=null?fmtDec(d.duracaoDias):'—')+'</td>'+
    '<td>'+statusBadge(d.glosa)+'</td>'+
    '<td>'+(d.statusParadaGeo||'—')+'</td>'+
    '<td>'+(d.fornecedor||'—')+'</td>'+
    '<td>'+(d.base||'—')+'</td>'+
    '<td>'+(d.controlador||'—')+'</td>'+
    '</tr>'
  )).join('');
  const pager = document.getElementById('pager');
  pager.innerHTML='';
  const mkBtn = (label, page, disabled, active)=>{
    const b = document.createElement('button');
    b.textContent = label; b.disabled = !!disabled; if(active) b.classList.add('active');
    b.addEventListener('click', ()=>{ state.page = page; renderTable(); });
    return b;
  };
  pager.appendChild(mkBtn('‹', Math.max(1,state.page-1), state.page===1));
  const windowSize=5;
  let s = Math.max(1, state.page-2), e = Math.min(totalPages, s+windowSize-1);
  s = Math.max(1, e-windowSize+1);
  for(let p=s;p<=e;p++) pager.appendChild(mkBtn(String(p), p, false, p===state.page));
  pager.appendChild(mkBtn('›', Math.min(totalPages,state.page+1), state.page===totalPages));
}
document.querySelectorAll('#detailTable thead th').forEach(th=>{
  th.addEventListener('click', ()=>{
    const key = th.dataset.key;
    if(state.sortKey===key){ state.sortDir = state.sortDir==='asc'?'desc':'asc'; }
    else { state.sortKey = key; state.sortDir='asc'; }
    state.page=1;
    renderTable();
  });
});
document.getElementById('btnExport').addEventListener('click', ()=>{
  const filtered = getFiltered();
  const headers = ['Placa','Cliente','Tipo Manutenção','Grupo','Parada Oficina','Entrega Cliente','Duração (dias)','Prazo','Status GEO','Fornecedor','Base','Controlador'];
  const rows = filtered.map(d=>[
    d.placa,d.cliente,d.tipoManut,d.grupoManut,fmtDate(d.dtParadaOficina),fmtDate(d.dtEntregaCliente),
    d.duracaoDias!=null?fmtDec(d.duracaoDias):'', d.glosa, d.statusParadaGeo, d.fornecedor, d.base, d.controlador
  ]);
  const csv = [headers, ...rows].map(r=> r.map(v=>{
    v = (v==null? '' : String(v)).replace(/"/g,'""');
    return '"'+v+'"';
  }).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'manutencao_grupo_vamos_filtrado.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ============================================================
// UPLOAD MANUAL (MANTIDO COMO FALLBACK)
// ============================================================
const SHEET_COLMAP = {
  placa: 'PLACA',
  cliente: 'CLIENTE',
  base: 'BASE (CIDADE)',
  controlador: 'CONTROLADOR FROTA VAMOS',
  tipoFrota: 'TIPO DE FROTA',
  tipoManut: 'TIPO DE MANUTENÇÃO',
  grupoManut: 'GRUPO DE MANUTENÇÃO',
  modelo: 'MODELO',
  fornecedor: 'FORNECEDOR (OFICINA)',
  motivoParada: 'MOTIVO DA PARADA',
  descServicos: 'DESCRIÇÃO DOS SERVIÇOS',
  dtAbertura: 'DATA/HORA DE ABERTURA',
  dtParadaOficina: 'DATA/HORA DE PARADA OFICINA',
  dtOrcamento: 'DATA/HORA LANÇAMENTO DO ORÇAMENTO',
  dtEnvioCliente: 'DATA/HORA ENVIO AO CLIENTE',
  dtRetornoCliente: 'DATA/HORA RETORNO DO CLIENTE',
  dtAprovacao: 'DATA/HORA DA APROVAÇÃO',
  dtPrevisaoEntrega: 'DATA/HORA PREVISÃO ENTREGA',
  dtEntregaCliente: 'DATA/HORA ENTREGA CLIENTE',
  statusParadaGeo: 'STATUS PARADA (GEO)',
  statusParadoRodando: 'STATUS PARADO/RODANDO',
  guincho: 'GUINCHO',
  agingAgendamento: 'AGING AGENDAMENTO',
  agingManutencao: 'AGING MANUTENÇÃO',
  agingOrcamento: 'AGING ORÇAMENTO',
  agingRetornoCliente: 'AGING RETORNO CLIENTE',
  agingAprovacao: 'AGING APROVAÇÃO',
  agingPrevisaoEntrega: 'AGING PREVISÃO DE ENTREGA',
  agingTotal: 'AGING TOTAL',
  glosa: 'ACOMP. GLOSA'
};
function normStr(v){
  if(v==null) return null;
  const s = String(v).trim().replace(/\s+/g,' ');
  const sl = s.toLowerCase();
  if(!s || sl==='n/a' || sl==='#n/a' || sl==='-') return null;
  return s;
}
function normUpper(v){
  const s = normStr(v);
  return s ? s.toUpperCase() : null;
}
function numOrNull(v){
  if(v==null) return null;
  const s = String(v).trim().toLowerCase();
  if(s==='' || s==='n/a' || s==='#n/a' || s==='-') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}
function parseSheetDate(v){
  if(v==null) return null;
  if(typeof v === 'number'){
    try{
      const d = XLSX.SSF.parse_date_code(v);
      if(!d) return null;
      return new Date(d.y, d.m-1, d.d, d.H||0, d.M||0, Math.round(d.S||0));
    }catch(e){ return null; }
  }
  if(v instanceof Date) return null;
  const s = String(v).trim();
  const sl = s.toLowerCase();
  if(!s || sl==='n/a' || sl==='#n/a' || sl==='-') return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){
    const [,yyyy,mo,dd,hh,mi,ss] = m;
    const dt = new Date(+yyyy, +mo-1, +dd, +(hh||0), +(mi||0), +(ss||0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:[T \-](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){
    let [,dd,mo,yyyy,hh,mi,ss] = m;
    if(yyyy.length===2) yyyy = '20'+yyyy;
    const dt = new Date(+yyyy, +mo-1, +dd, +(hh||0), +(mi||0), +(ss||0));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}
function toISO(d){
  if(!d) return null;
  const pad = n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
}
function rowToRecord(row){
  const g = key => row[SHEET_COLMAP[key]];
  const dtParada = parseSheetDate(g('dtParadaOficina'));
  const dtEntrega = parseSheetDate(g('dtEntregaCliente'));
  let dur = null;
  if(dtParada && dtEntrega){
    const days = (dtEntrega - dtParada) / 86400000;
    if(days>=0 && days<=400) dur = Math.round(days*100)/100;
  }
  let grupo = normUpper(g('grupoManut'));
  if(grupo === 'MECANICA') grupo = 'MECÂNICA';
  let tipoManut = normUpper(g('tipoManut'));
  return {
    placa: normStr(g('placa')),
    cliente: normStr(g('cliente')),
    base: normStr(g('base')),
    controlador: normStr(g('controlador')),
    tipoFrota: normStr(g('tipoFrota')),
    tipoManut,
    grupoManut: grupo,
    modelo: normStr(g('modelo')),
    fornecedor: normStr(g('fornecedor')),
    motivoParada: normStr(g('motivoParada')),
    descServicos: normStr(g('descServicos')),
    dtAbertura: toISO(parseSheetDate(g('dtAbertura'))),
    dtParadaOficina: toISO(dtParada),
    dtOrcamento: toISO(parseSheetDate(g('dtOrcamento'))),
    dtEnvioCliente: toISO(parseSheetDate(g('dtEnvioCliente'))),
    dtRetornoCliente: toISO(parseSheetDate(g('dtRetornoCliente'))),
    dtAprovacao: toISO(parseSheetDate(g('dtAprovacao'))),
    dtPrevisaoEntrega: toISO(parseSheetDate(g('dtPrevisaoEntrega'))),
    dtEntregaCliente: toISO(dtEntrega),
    statusParadaGeo: normStr(g('statusParadaGeo')),
    statusParadoRodando: normStr(g('statusParadoRodando')),
    guincho: normStr(g('guincho')),
    agingAgendamento: numOrNull(g('agingAgendamento')),
    agingManutencao: numOrNull(g('agingManutencao')),
    agingOrcamento: numOrNull(g('agingOrcamento')),
    agingRetornoCliente: numOrNull(g('agingRetornoCliente')),
    agingAprovacao: numOrNull(g('agingAprovacao')),
    agingPrevisaoEntrega: numOrNull(g('agingPrevisaoEntrega')),
    agingTotal: numOrNull(g('agingTotal')),
    glosa: normStr(g('glosa')),
    duracaoDias: dur
  };
}
function showUploadMsg(msg, isError, isLoading){
  const el = document.getElementById('uploadMsg');
  el.textContent = msg;
  el.className = 'upload-msg';
  if(isError) el.classList.add('err');
  else if(isLoading) el.classList.add('loading');
  else el.classList.add('ok');
}
function applyNewData(newRecords, fileName){
  DATA.splice(0, DATA.length, ...newRecords);
  computeOptions();
  computeDateBounds();
  state.dateFrom = null; state.dateTo = null;
  document.getElementById('fDateFrom').value = '';
  document.getElementById('fDateTo').value = '';
  state.tipos = new Set(allTipos);
  state.clientes = new Set(allClientes);
  state.statusGeo = new Set(allStatusGeo);
  state.statusRodando = new Set(allStatusRodando);
  state.controladores = new Set(allControladores);
  state.placas = new Set();
  state.fornecedores = new Set(allFornecedores);
  state.page = 1;
  updateHeaderMeta();
  rebuildAllChipGroups();
  renderPlacaTags();
  refreshFornecedorDropdown();
  refreshAll();
  showUploadMsg('Base atualizada com sucesso a partir de "'+fileName+'" · '+fmtInt(newRecords.length)+' registro(s) carregado(s).', false, false);
}
function initUploadUI(){
  const fileInput = document.getElementById('fileInput');
  const fileNameLabel = document.getElementById('fileNameLabel');
  const btnUpdate = document.getElementById('btnUpdateData');
  fileInput.addEventListener('change', ()=>{
    const f = fileInput.files[0];
    fileNameLabel.textContent = f ? f.name : 'Nenhum arquivo selecionado';
    document.getElementById('uploadMsg').textContent='';
  });
  btnUpdate.addEventListener('click', ()=>{
    const file = fileInput.files[0];
    if(!file){ showUploadMsg('Selecione um arquivo Excel (.xlsx) antes de atualizar.', true, false); return; }
    btnUpdate.disabled = true;
    showUploadMsg('Processando arquivo…', false, true);
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
       const wb = XLSX.read(e.target.result, {type:'array', cellDates:false, raw:true});
        const sheetName = wb.SheetNames.includes('Planilha1') ? 'Planilha1' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});
        if(!rows.length) throw new Error('a planilha não contém linhas de dados.');
        const newRecords = rows.map(rowToRecord).filter(r=>r.placa || r.cliente || r.tipoManut);
        if(!newRecords.length) throw new Error('nenhum registro válido foi encontrado no arquivo.');
        applyNewData(newRecords, file.name);
      }catch(err){
        showUploadMsg('Erro ao processar o arquivo: '+err.message, true, false);
      }finally{
        btnUpdate.disabled = false;
      }
    };
    reader.onerror = ()=>{ showUploadMsg('Não foi possível ler o arquivo selecionado.', true, false); btnUpdate.disabled = false; };
    reader.readAsArrayBuffer(file);
  });
}
function updateHeaderMeta(){
  document.getElementById('metaTotal').textContent = fmtInt(DATA.length);
  document.getElementById('uploadCount').textContent = fmtInt(DATA.length);
  if(minDate && maxDate){
    const df = new Date(minDate), dt = new Date(maxDate);
    document.getElementById('metaPeriodo').textContent = df.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}) + ' – ' + dt.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    document.getElementById('fDateFrom').min = minDate; document.getElementById('fDateFrom').max = maxDate;
    document.getElementById('fDateTo').min = minDate; document.getElementById('fDateTo').max = maxDate;
  }
  document.getElementById('metaClientes').textContent = allClientes.length;
}
function refreshAll(){
  const activeCountParts = [];
  if(state.dateFrom || state.dateTo) activeCountParts.push('período personalizado');
  if(state.tipos.size < allTipos.length) activeCountParts.push(state.tipos.size+' tipo(s) de manutenção');
  if(state.clientes.size < allClientes.length) activeCountParts.push(state.clientes.size+' cliente(s)');
  if(state.statusGeo.size < allStatusGeo.length) activeCountParts.push(state.statusGeo.size+' status GEO');
  if(state.statusRodando.size < allStatusRodando.length) activeCountParts.push(state.statusRodando.size+' status parado/rodando');
  if(state.controladores.size < allControladores.length) activeCountParts.push(state.controladores.size+' controlador(es)');
  if(state.placas.size>0) activeCountParts.push(state.placas.size+' placa(s)');
  if(state.fornecedores.size < allFornecedores.length) activeCountParts.push(state.fornecedores.size+' fornecedor(es)');
  document.getElementById('activeCount').textContent = activeCountParts.length ? 'Filtros ativos: '+activeCountParts.join(' · ') : 'Nenhum filtro adicional aplicado — exibindo toda a base';
  state.page = 1;
  renderCharts();
  renderTable();
}

// ============================================================
// CARREGAR DADOS ONLINE
// ============================================================
async function loadOnlineData(){
  const url = ONLINE_SHEET_URL.trim();
  if(!url){
    showUploadMsg('Nenhuma URL de planilha online configurada. Usando dados estáticos.', false, false);
    return false;
  }
  showUploadMsg('Baixando planilha online...', false, true);
  try{
    const response = await fetch(url);
    if(!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
    const text = await response.text();
    const wb = XLSX.read(text, {type:'string', cellDates:false, raw:true});
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});
    if(!rows.length) throw new Error('A planilha não contém linhas de dados.');
    const newRecords = rows.map(rowToRecord).filter(r=>r.placa || r.cliente || r.tipoManut);
    if(!newRecords.length) throw new Error('Nenhum registro válido foi encontrado.');
    DATA.splice(0, DATA.length, ...newRecords);
    computeOptions();
    computeDateBounds();
    state.dateFrom = null; state.dateTo = null;
    document.getElementById('fDateFrom').value = '';
    document.getElementById('fDateTo').value = '';
    state.tipos = new Set(allTipos);
    state.clientes = new Set(allClientes);
    state.statusGeo = new Set(allStatusGeo);
    state.statusRodando = new Set(allStatusRodando);
    state.controladores = new Set(allControladores);
    state.placas = new Set();
    state.fornecedores = new Set(allFornecedores);
    state.page = 1;
    updateHeaderMeta();
    rebuildAllChipGroups();
    renderPlacaTags();
    refreshFornecedorDropdown();
    refreshAll();
    showUploadMsg(`Dados carregados da planilha online (${fmtInt(newRecords.length)} registros).`, false, false);
    return true;
  }catch(err){
    showUploadMsg('Erro ao carregar planilha online: '+err.message+'. Usando dados estáticos.', true, false);
    return false;
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
async function init(){
  DATA.splice(0, DATA.length, ...STATIC_DATA);
  computeOptions();
  computeDateBounds();
  updateHeaderMeta();
  rebuildAllChipGroups();
  initPlacaSearch();
  renderPlacaTags();
  initFornecedorDropdown();
  initUploadUI();

  if(ONLINE_SHEET_URL.trim()){
    await loadOnlineData();
  } else {
    showUploadMsg('Nenhuma URL de planilha online definida. Usando dados estáticos.', false, false);
  }

  refreshAll();

  let resizeTimer;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderCharts, 150);
  });

  document.getElementById('btnReloadOnline').addEventListener('click', async ()=>{
    document.getElementById('btnReloadOnline').disabled = true;
    await loadOnlineData();
    document.getElementById('btnReloadOnline').disabled = false;
  });
}

document.addEventListener('DOMContentLoaded', init);
