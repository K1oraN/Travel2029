const API = '/.netlify/functions';
const $ = (selector) => document.querySelector(selector);
const startUTC = Date.UTC(2026, 10, 24);
const endUTC = Date.UTC(2029, 7, 31);
const DAY = 86_400_000;
const daysCount = Math.round((endUTC - startUTC) / DAY) + 1;
const ptMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(Number(v) || 0);
const ptEuro = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(v) || 0);
const nfmt = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v || 0);
const dateFromIndex = (i) => new Date(startUTC + i * DAY).toISOString().slice(0, 10);
const msFromISO = (date) => Date.parse(date + 'T00:00:00Z');
const dayIndex = (date) => Math.round((msFromISO(date) - startUTC) / DAY);
const displayDate = (iso, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) => new Intl.DateTimeFormat('pt-BR', { ...opts, timeZone: 'UTC' }).format(new Date(msFromISO(iso)));
const monthName = (date) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(msFromISO(date)));
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));
const nowISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const dayEntry = (date) => state.data.daily[date] || { p1: 0, p2: 0 };
const amount = (date, who) => Number(dayEntry(date)[who]) || 0;
const pName = (index) => state.data.people[index];

const allMonths = (() => {
  const months = [];
  let y = 2026, m = 10;
  while (y < 2029 || (y === 2029 && m <= 7)) {
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const days = [];
    for (let i = 0; i < daysCount; i++) if (dateFromIndex(i).startsWith(start.slice(0, 7))) days.push(dateFromIndex(i));
    months.push({ id: start.slice(0, 7), label: monthName(start), days });
    m++; if (m === 12) { m = 0; y++; }
  }
  return months;
})();
const allWeeks = (() => { const weeks = []; for (let i = 0; i < daysCount; i += 7) weeks.push({ index: weeks.length + 1, days: Array.from({ length: Math.min(7, daysCount - i) }, (_, d) => dateFromIndex(i + d)) }); return weeks; })();
const allExchanges = (() => { const exchanges = []; for (let i = 0; i < 20; i++) exchanges.push({ index: i + 1, date: dateFromIndex((i + 1) * 49 - 1), dayCount: 49 }); exchanges.push({ index: 21, date: '2029-08-31', dayCount: 32 }); return exchanges; })();

const state = {
  data: { version: 1, people: ['Pessoa 1', 'Pessoa 2'], daily: {}, exchanges: {}, updatedAt: null },
  etag: null, role: null, month: null, tab: 'resumo', editDay: null, editExchange: null,
  saveTimer: null, pending: false, dirty: false, blocked: false, changeSeq: 0
};

function activeMonth() {
  const today = nowISO().slice(0, 7);
  return allMonths.some(m => m.id === today) ? today : today < allMonths[0].id ? allMonths[0].id : allMonths.at(-1).id;
}
state.month = activeMonth();

function flash(message, type = 'error') {
  const el = $('#flashMessage');
  el.textContent = message; el.className = `flash ${type}`; el.hidden = false;
}
function clearFlash() { $('#flashMessage').hidden = true; }
function setSave(text, level = '') { $('#saveState').textContent = '● ' + text; $('#saveState').className = 'save-indicator ' + level; }
async function callAPI(route, options = {}) {
  const response = await fetch(`${API}/${route}`, { credentials: 'same-origin', cache: 'no-store', ...options });
  let body = {};
  try { body = await response.json(); } catch { /* server may be unavailable */ }
  if (!response.ok) {
    const err = new Error(body.error || `Erro HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}
function isAdmin() { return state.role === 'admin'; }

async function loadRemote({ silent = false } = {}) {
  if (state.dirty || state.pending) {
    if (!silent) flash('Há mudanças ainda não sincronizadas. Salve antes de atualizar.');
    return;
  }
  try {
    const server = await callAPI('progress');
    state.role = server.role;
    state.data = server.data;
    state.etag = server.etag;
    state.blocked = false;
    state.dirty = false;
    renderAll();
    setSave('Sincronizado');
    if (!silent) flash('Dados atualizados do servidor.', 'success');
  } catch (err) {
    if (err.status === 401) return logoutLocal('Sua sessão expirou. Entre novamente.');
    setSave('Falha de conexão', 'error');
    if (!silent) flash(err.message);
  }
}

function changed() {
  if (!isAdmin()) return;
  state.dirty = true;
  state.changeSeq++;
  setSave('Salvando...', 'warning');
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flushSave, 450);
  renderAll();
}
async function flushSave() {
  if (!state.dirty || state.pending || state.blocked || !isAdmin()) return;
  state.pending = true;
  const seq = state.changeSeq;
  const payload = { etag: state.etag, data: deepCopy(state.data) };
  try {
    const server = await callAPI('progress', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    state.etag = server.etag;
    state.data.updatedAt = server.data.updatedAt;
    if (seq === state.changeSeq) state.dirty = false;
    setSave(state.dirty ? 'Salvando...' : 'Sincronizado');
    clearFlash();
    $('#lastSync').textContent = formatUpdated();
  } catch (err) {
    if (err.status === 409) {
      state.blocked = true;
      flash('Outro dispositivo salvou dados antes de você. Baixe seu JSON de segurança e depois atualize os dados do servidor.');
    } else if (err.status === 401) {
      flash('A sessão expirou. Faça backup do seu JSON antes de recarregar.');
    } else {
      flash('Não foi possível salvar: ' + err.message + '. As alterações continuam apenas nesta tela até você tentar novamente.');
    }
    setSave('Não salvo na nuvem', 'error');
  } finally {
    state.pending = false;
    if (state.dirty && !state.blocked && seq !== state.changeSeq) state.saveTimer = setTimeout(flushSave, 350);
  }
}
function formatUpdated() {
  if (!state.data.updatedAt) return 'Nenhum depósito registrado ainda';
  const date = new Date(state.data.updatedAt);
  return 'Salvo em ' + date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function totals() {
  let p1 = 0, p2 = 0, complete = 0;
  for (const [key, val] of Object.entries(state.data.daily)) {
    p1 += Number(val.p1) || 0;
    p2 += Number(val.p2) || 0;
    if (Number(val.p1) >= 30 && Number(val.p2) >= 30) complete++;
  }
  return { p1, p2, total: p1 + p2, complete };
}
function sumDates(days) { return days.reduce((acc, date) => acc + amount(date, 'p1') + amount(date, 'p2'), 0); }
function completionCounts(days) {
  return [days.filter(d => amount(d, 'p1') >= 30).length, days.filter(d => amount(d, 'p2') >= 30).length];
}
function percent(value, total) { return Math.min(100, (value / Math.max(1, total)) * 100); }
function pill(value, target) {
  if (value >= target) return '<span class="pill good">✓ Concluído</span>';
  if (value > 0) return '<span class="pill partial">Parcial</span>';
  return '<span class="pill">Pendente</span>';
}
function renderAll() {
  $('#roleChip').textContent = isAdmin() ? 'Editar' : 'Acompanhar';
  $('.role-chip').title = isAdmin() ? 'Pode editar os dados' : 'Pode apenas visualizar os dados';
  for (const el of document.querySelectorAll('.admin-only')) el.hidden = !isAdmin();
  $('#heroToday').innerHTML = isAdmin() ? 'Registrar hoje <span>↗</span>' : 'Ver hoje <span>↗</span>'; 
  $('#lastSync').textContent = formatUpdated();
  const t = totals();
  $('#statSaved').textContent = ptMoney(t.total);
  $('#statRemaining').textContent = ptMoney(Math.max(0, 60_720 - t.total));
  $('#statDays').innerHTML = `${t.complete} <small>/ 1.012</small>`;
  $('#statPercent').textContent = nfmt((t.total / 60_720) * 100) + '%';
  const safePct = Math.min(100, (t.total / 60_720) * 100);
  $('#heroPercent').textContent = nfmt(safePct) + '%';
  $('#heroDonut').style.setProperty('--progress', safePct.toFixed(2) + '%');
  $('#heroProgressLine').style.width = safePct.toFixed(2) + '%';
  renderOverview(t);
  renderDaily();
  renderWeekly();
  renderMonthly();
  renderExchanges();
  document.querySelectorAll('i[data-pct]').forEach((el) => { el.style.width = el.dataset.pct + '%'; });
  $('#nameP1').value = pName(0); $('#nameP2').value = pName(1);
  $('#nameP1').disabled = !isAdmin(); $('#nameP2').disabled = !isAdmin();
}
function renderOverview(t) {
  const perTarget = 30_360;
  $('#peopleProgress').innerHTML = [0, 1].map((i) => {
    const saved = i === 0 ? t.p1 : t.p2;
    const who = escapeHTML(pName(i));
    return `<div class="person-line"><div class="person-line-top"><strong>${who}</strong><span>${ptMoney(saved)} / ${ptMoney(perTarget)}</span></div><div class="progress-track"><i data-pct="${percent(saved,perTarget)}"></i></div><div class="person-meta"><span>${nfmt(percent(saved,perTarget))}% concluído</span><span>${ptMoney(Math.max(0,perTarget-saved))} restantes</span></div></div>`;
  }).join('');
  const today = nowISO();
  const remainingDays = Math.max(0, Math.round((endUTC - msFromISO(today)) / DAY) + 1);
  const next = allExchanges.find((e) => e.date >= today) || allExchanges.at(-1);
  const beforeTrip = Math.max(0, remainingDays);
  $('#upcomingMilestones').innerHTML = [
    ['✦', 'Próximo fechamento de euros', displayDate(next.date), 'Troca ' + String(next.index).padStart(2, '0')],
    ['▦', 'Dias até concluir o plano', `${beforeTrip} dias`, 'Meta até 31/08/2029'],
    ['✈', 'Passagens do casal', ptMoney(13_000), 'R$ 6.500 por pessoa']
  ].map(([icon, title, sub, tail]) => `<div class="milestone-row"><span class="milestone-icon">${icon}</span><div><strong>${title}</strong><small>${sub}</small></div><span>${tail}</span></div>`).join('');
  const date = today < dateFromIndex(0) ? dateFromIndex(0) : today > dateFromIndex(daysCount-1) ? dateFromIndex(daysCount-1) : today;
  $('#todayHeading').textContent = 'Economias de ' + displayDate(date, { day: '2-digit', month: 'long' });
  $('#todayProgress').innerHTML = [0,1].map(i=>{const x=amount(date,`p${i+1}`);return `<div class="today-row"><strong>${escapeHTML(pName(i))}</strong><span class="${x>=30?'positive':'negative'}">${x>=30?'✓':''} ${ptMoney(x)} / R$ 30</span></div>`}).join('') + '<div class="today-state">Cada conquista vale a pena celebrar. ✦</div>';
}
function renderDaily() {
  const currentMonth = allMonths.find(m => m.id === state.month) || allMonths[0];
  $('#monthSelect').value = currentMonth.id;
  const saved = sumDates(currentMonth.days);
  $('#monthTarget').textContent = ptMoney(currentMonth.days.length * 60);
  $('#monthReal').textContent = ptMoney(saved);
  $('#monthDays').textContent = String(currentMonth.days.length);
  $('#prevMonth').disabled = allMonths[0].id === currentMonth.id;
  $('#nextMonth').disabled = allMonths.at(-1).id === currentMonth.id;
  $('#dailyHead1').textContent = pName(0).toUpperCase();
  $('#dailyHead2').textContent = pName(1).toUpperCase();
  const currentDay = nowISO();
  $('#dailyBody').innerHTML = currentMonth.days.map((date) => {
    const v1 = amount(date, 'p1'), v2 = amount(date, 'p2'), total = v1 + v2;
    const marks = [v1, v2].map((x, i) => {
      const cls = x >= 30 ? 'checked' : x > 0 ? 'partial' : '';
      const sym = x >= 30 ? '✓' : x > 0 ? '◐' : '○';
      return `<td><button class="mark-btn ${cls}" data-action="toggle-day" data-date="${date}" data-person="p${i+1}" ${isAdmin()?'':'disabled'} title="${isAdmin() ? 'Marcar ou desmarcar R$ 30' : 'Apenas visualização'}"><span class="check-symbol">${sym}</span> ${ptMoney(x)}</button></td>`;
    }).join('');
    const dayLabel = displayDate(date, { day:'2-digit', month:'2-digit' });
    const weekday = displayDate(date, { weekday:'short' });
    return `<tr class="${date === currentDay ? 'is-today' : ''}"><td><strong>${dayLabel}</strong><small>${weekday}${date===currentDay?' · Hoje':''}</small></td>${marks}<td class="numeric"><strong>${ptMoney(total)}</strong></td><td>${pill(total,60)}</td>${isAdmin()?`<td><button class="mini-edit" data-action="edit-day" data-date="${date}" aria-label="Editar ${date}">✎</button></td>`:''}</tr>`;
  }).join('');
}
function renderWeekly() {
  let completed = 0;
  const filter = $('#weekFilter').value;
  const rows = [];
  allWeeks.forEach((w) => {
    const sum = sumDates(w.days), goal = w.days.length * 60;
    if (sum >= goal) completed++;
    if ((filter === 'pending' && sum >= goal) || (filter === 'complete' && sum < goal)) return;
    const counts = completionCounts(w.days);
    rows.push(`<tr><td><strong>${String(w.index).padStart(3,'0')}</strong><small>${counts[0]}/${w.days.length} ${escapeHTML(pName(0))} · ${counts[1]}/${w.days.length} ${escapeHTML(pName(1))}</small></td><td>${displayDate(w.days[0])} – ${displayDate(w.days.at(-1))}</td><td class="numeric">${ptMoney(goal)}</td><td class="numeric"><strong>${ptMoney(sum)}</strong></td><td>${pill(sum,goal)}<div class="tiny-progress"><i data-pct="${percent(sum,goal)}"></i></div></td></tr>`);
  });
  $('#weeklyBody').innerHTML = rows.join('') || '<tr><td colspan="5">Nenhuma semana com este filtro.</td></tr>';
  $('#weeklySummary').textContent = `${completed} de ${allWeeks.length} semanas atingiram a meta do casal · O último período tem 4 dias`;
}
function renderMonthly() {
  let running = 0;
  $('#monthlyBody').innerHTML = allMonths.map((m) => {
    const sum=sumDates(m.days), goal=m.days.length*60; running+=sum;
    return `<tr><td><strong>${escapeHTML(m.label.charAt(0).toUpperCase()+m.label.slice(1))}</strong><small>${m.days.length} dias</small></td><td class="numeric">${ptMoney(goal)}</td><td class="numeric"><strong>${ptMoney(sum)}</strong></td><td class="numeric">${ptMoney(running)}</td><td>${pill(sum,goal)}</td></tr>`;
  }).join('');
}
function exchangeItem(num, person) {
  return (state.data.exchanges[String(num)] || {})[person] || { done: false, brl: 0, eur: 0 };
}
function renderExchanges() {
  let totalEUR = 0, doneCount = 0;
  const cards = allExchanges.map((x) => {
    const p1 = exchangeItem(x.index,'p1'), p2 = exchangeItem(x.index,'p2');
    totalEUR += (p1.eur || 0) + (p2.eur || 0);
    if (p1.done && p2.done) doneCount++;
    const nominal = x.dayCount * 23;
    const personHTML = [p1,p2].map((p,i) => `<div class="exchange-person ${p.done?'done':''}"><strong>${p.done?'✓ ':'○ '}${escapeHTML(pName(i))}</strong><span>${ptMoney(p.brl)} → ${ptEuro(p.eur)}</span></div>`).join('');
    return `<article class="exchange-card ${(p1.done&&p2.done)?'is-done':''}"><div class="exchange-head"><div><span>${x.index===21?'FECHAMENTO FINAL':`TROCA ${String(x.index).padStart(2,'0')}`}</span><h3>${displayDate(x.date)}</h3></div>${pill(Number(p1.done)+Number(p2.done),2)}</div><p>${x.dayCount} dias · reserva prevista de ${ptMoney(nominal)} por pessoa (${ptMoney(nominal*2)} casal)</p><div class="exchange-people">${personHTML}</div><div class="exchange-footer"><small>${p1.done&&p2.done?'Duas compras registradas':'Conversão real depende da cotação'}</small><button ${isAdmin()?'':'disabled'} data-action="edit-exchange" data-num="${x.index}">${isAdmin()?'Registrar / editar →':''}</button></div></article>`;
  }).join('');
  $('#exchangeList').innerHTML = cards;
  $('#exchangeSummary').innerHTML = `<div><span>CICLOS REGISTRADOS</span><strong>${doneCount} / 21</strong></div><div><span>EUROS COMPRADOS (CASAL)</span><strong>${ptEuro(totalEUR)}</strong></div><div><span>META DA RESERVA PARA EUROS</span><strong>${ptMoney(23*1012*2)}</strong></div>`;
}
function goTab(tab) {
  if (!['resumo','diario','semanas','meses','cambio','config'].includes(tab)) return;
  state.tab = tab;
  for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.id !== `panel-${tab}`;
  for (const button of document.querySelectorAll('.tab')) button.classList.toggle('active', button.dataset.tab === tab);
  if (tab === 'diario') renderDaily();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function openDay(date) {
  if (!isAdmin()) return;
  state.editDay = date;
  $('#dayDialogTitle').textContent = displayDate(date, { day:'2-digit', month:'long', year:'numeric' });
  $('#dayLabel1').textContent = pName(0) + ' · R$';
  $('#dayLabel2').textContent = pName(1) + ' · R$';
  $('#dayAmount1').value = String(amount(date,'p1'));
  $('#dayAmount2').value = String(amount(date,'p2'));
  $('#dayDialog').showModal();
}
function setDay(date, p1, p2) {
  const n1 = Number(p1), n2 = Number(p2);
  if (![n1,n2].every(v => Number.isFinite(v) && v >= 0 && v <= 1e6)) return flash('Digite valores válidos e não negativos.');
  if (n1===0 && n2===0) delete state.data.daily[date];
  else state.data.daily[date]={p1: Math.round(n1*100)/100, p2: Math.round(n2*100)/100};
  changed();
}
function openExchange(number) {
  if (!isAdmin()) return;
  const selected=allExchanges.find(x=>x.index===number);
  if (!selected) return;
  state.editExchange=number;
  $('#exchangeDialogTitle').textContent = `${selected.index===21?'Fechamento final':'Troca '+String(number).padStart(2,'0')} · ${displayDate(selected.date)}`;
  [1,2].forEach(i=>{
    const p=exchangeItem(number,`p${i}`);
    $(`#fxLabel${i}`).textContent = pName(i-1) + ' · compra concluída';
    $(`#fxDone${i}`).checked=Boolean(p.done);
    $(`#fxBRL${i}`).value=p.brl || 0;
    $(`#fxEUR${i}`).value=p.eur || 0;
  });
  $('#exchangeDialog').showModal();
}
function makeBackup() {
  return { app:'Europa2029', exportedAt:new Date().toISOString(), data:deepCopy(state.data) };
}
function downloadBackup() {
  const blob = new Blob([JSON.stringify(makeBackup(),null,2)], { type:'application/json;charset=utf-8' });
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url; link.download=`europa-2029-backup-${nowISO()}.json`; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  flash('Backup JSON gerado. Guarde-o em um lugar seguro.', 'success');
}
function logoutLocal(message='') {
  state.role=null; state.etag=null; state.dirty=false; state.pending=false;
  clearTimeout(state.saveTimer);
  $('#appView').hidden=true; $('#loginView').hidden=false;
  $('#loginPassword').value='';
  $('#loginError').hidden=!message; $('#loginError').textContent=message;
}

function applyTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = selected;
  $('#themeIcon').textContent = selected === 'dark' ? '☀' : '☾';
  $('#themeButton').title = selected === 'dark' ? 'Ativar tema claro' : 'Ativar modo escuro';
  $('#themeButton').setAttribute('aria-label', $('#themeButton').title);
  try { localStorage.setItem('europa2029-theme', selected); } catch { /* navegação privada */ }
}
function wireEvents() {
  for (const b of document.querySelectorAll('[data-role]')) b.addEventListener('click', () => {
    $('#loginRole').value = b.dataset.role;
    document.querySelectorAll('[data-role]').forEach(option => {
      const selected = option === b;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
  });
  $('#togglePassword').addEventListener('click', () => {
    const input = $('#loginPassword');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    $('#togglePassword').setAttribute('aria-pressed', String(visible));
    $('#togglePassword').setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    $('#togglePassword').textContent = visible ? '◌' : '◉';
  });
  $('#themeButton').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('#loginForm').addEventListener('submit', async(event)=>{
    event.preventDefault();
    const button=$('#loginButton'); button.disabled=true; $('#loginError').hidden=true;
    try {
      await callAPI('auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:$('#loginRole').value,password:$('#loginPassword').value})});
      const result=await callAPI('progress');
      state.role=result.role; state.data=result.data; state.etag=result.etag;
      $('#loginView').hidden=true; $('#appView').hidden=false;
      $('#loginPassword').value='';
      state.dirty=false; state.blocked=false; renderAll(); goTab('resumo');
      setSave('Sincronizado');
    } catch (err) {
      $('#loginError').hidden=false;
      $('#loginError').textContent=err.status === 503 ? 'Acesso temporariamente indisponível. Tente novamente em instantes.' : err.message;
    } finally { button.disabled=false; }
  });
  $('#logoutButton').addEventListener('click',async()=>{
    if (state.dirty && !confirm('Há mudanças não salvas. Deseja sair mesmo assim?')) return;
    try { await callAPI('auth',{method:'DELETE'}); } catch {/* still sign out */}
    logoutLocal();
  });
  for(const tab of document.querySelectorAll('.tab')) tab.addEventListener('click',()=>goTab(tab.dataset.tab));
  for(const button of document.querySelectorAll('[data-goto]')) button.addEventListener('click',()=>goTab(button.dataset.goto));
  $('#heroToday').addEventListener('click',()=>{
    const date=nowISO(); const inRange=date>=dateFromIndex(0)&&date<=dateFromIndex(daysCount-1);
    if (!inRange) return flash('A data de hoje está fora do período de economia.');
    state.month=date.slice(0,7); goTab('diario');
    const row=document.querySelector(`button[data-date="${date}"]`); if(row) row.closest('tr').scrollIntoView({behavior:'smooth',block:'center'});
  });
  $('#monthSelect').addEventListener('change',event=>{state.month=event.target.value;renderDaily();});
  $('#prevMonth').addEventListener('click',()=>{const i=allMonths.findIndex(x=>x.id===state.month);if(i>0){state.month=allMonths[i-1].id;renderDaily();}});
  $('#nextMonth').addEventListener('click',()=>{const i=allMonths.findIndex(x=>x.id===state.month);if(i<allMonths.length-1){state.month=allMonths[i+1].id;renderDaily();}});
  $('#weekFilter').addEventListener('change',renderWeekly);
  $('#dailyBody').addEventListener('click',event=>{
    const btn=event.target.closest('button[data-action]');
    if(!btn||!isAdmin())return;
    const date=btn.dataset.date;
    if(btn.dataset.action==='edit-day')return openDay(date);
    if(btn.dataset.action==='toggle-day'){
      const p=btn.dataset.person;
      const next=amount(date,p)>=30?0:30;
      setDay(date,p==='p1'?next:amount(date,'p1'),p==='p2'?next:amount(date,'p2'));
    }
  });
  $('#exchangeList').addEventListener('click',event=>{const btn=event.target.closest('[data-action="edit-exchange"]');if(btn)openExchange(Number(btn.dataset.num));});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.close).close()));
  $('#dayForm').addEventListener('submit',event=>{
    event.preventDefault();if(!isAdmin())return;
    setDay(state.editDay,$('#dayAmount1').value,$('#dayAmount2').value);$('#dayDialog').close();
  });
  $('#exchangeForm').addEventListener('submit',event=>{
    event.preventDefault();if(!isAdmin())return;
    const item={};
    for (const i of [1,2]) {
      const brl=Number($(`#fxBRL${i}`).value),eur=Number($(`#fxEUR${i}`).value);
      if (![brl,eur].every(v=>Number.isFinite(v)&&v>=0&&v<=1e6)) return flash('Valor de câmbio inválido.');
      item[`p${i}`]={done:$(`#fxDone${i}`).checked,brl:Math.round(brl*100)/100,eur:Math.round(eur*100)/100};
    }
    state.data.exchanges[String(state.editExchange)]=item; changed(); $('#exchangeDialog').close();
  });
  $('#peopleForm').addEventListener('submit',event=>{
    event.preventDefault();if(!isAdmin())return;
    const one=$('#nameP1').value.trim(),two=$('#nameP2').value.trim();
    if(!one||!two||one.length>32||two.length>32)return flash('Informe os dois nomes (até 32 caracteres).');
    state.data.people=[one,two];changed();
  });
  $('#downloadBackup').addEventListener('click',downloadBackup);
  $('#uploadBackup').addEventListener('click',()=>{if(isAdmin())$('#backupFile').click();});
  $('#backupFile').addEventListener('change',async(event)=>{
    const file=event.target.files?.[0];if(!file)return;
    if(!confirm('Restaurar o arquivo substituirá TODO o progresso atual salvo no site. Continuar?')) { event.target.value='';return; }
    try {
      const parsed=JSON.parse(await file.text());
      const candidate=parsed.data || parsed;
      if(candidate.version!==1||!Array.isArray(candidate.people)||!candidate.daily||!candidate.exchanges)throw new Error('O arquivo não é um backup deste diário.');
      state.data=deepCopy(candidate);state.dirty=true;state.changeSeq++;state.blocked=false;
      renderAll();await flushSave();
      if(!state.dirty)flash('Backup restaurado e sincronizado na nuvem.','success');
    } catch(err) {flash('Não foi possível restaurar: '+err.message);}
    event.target.value='';
  });
  $('#reloadServer').addEventListener('click',async()=>{
    if(state.dirty){
      if(!confirm('Existem alterações não salvas. Deseja DESCARTAR as alterações locais e carregar os dados salvos? Considere baixar um JSON antes.'))return;
      state.dirty=false;state.blocked=false;clearTimeout(state.saveTimer);
    }
    await loadRemote();
  });
  $('#retrySave').addEventListener('click',()=>{state.blocked=false;flushSave();});
  window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.role&&!state.dirty&&!state.pending)loadRemote({silent:true});});
  setInterval(()=>{if(state.role&&!state.dirty&&!state.pending)loadRemote({silent:true});},45000);
}
async function init() {
  const opts=allMonths.map(m=>`<option value="${m.id}">${escapeHTML(m.label.charAt(0).toUpperCase()+m.label.slice(1))}</option>`).join('');
  $('#monthSelect').innerHTML=opts;
  wireEvents();
  let preferred = 'dark';
  try { preferred = localStorage.getItem('europa2029-theme') || 'dark'; } catch {}
  applyTheme(preferred);
  try {
    const session=await callAPI('auth');
    if(session.authenticated) {
      state.role=session.role;
      const progress=await callAPI('progress');
      state.data=progress.data;state.etag=progress.etag;
      $('#loginView').hidden=true;$('#appView').hidden=false;
      renderAll();goTab('resumo');setSave('Sincronizado');
    }
  } catch(err) {
    if(err.status===503) {
      $('#loginError').textContent=err.status === 503 ? 'Acesso temporariamente indisponível. Tente novamente em instantes.' : err.message;
      $('#loginError').hidden=false;
    }
  }
}
init();
