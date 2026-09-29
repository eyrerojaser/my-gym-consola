/* Consola de clientes de Mi Gym — solo para la proveedora. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = {
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
const S = { user: null, loaded: false, clientes: [], ajustes: { auto: false, dias: 5 }, hoy: '', filtro: 'todos', q: '' };
let F = null; // formulario abierto

// ---------- conexión ----------
async function token() { const ni = window.netlifyIdentity, u = ni && ni.currentUser(); if (!u) return null; try { return await u.jwt(); } catch { return null; } }
async function api(method, path, body) {
  const tk = await token(); if (!tk) { showLogin(); throw new Error('login'); }
  let r; try { r = await fetch(path, { method, headers: { Authorization: 'Bearer ' + tk, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sin conexión. Revisa tu internet.'); }
  let d = {}; try { d = await r.json(); } catch {}
  if (r.status === 401) { showLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(d.error || 'No se pudo completar.');
  return d;
}
async function load() { const d = await api('GET', '/api/consola/clientes'); S.clientes = d.clientes; S.ajustes = d.ajustes; S.hoy = d.hoy; S.loaded = true; }
function upd(c) { const i = S.clientes.findIndex(x => x.id === c.id); if (i >= 0) S.clientes[i] = c; else S.clientes.push(c); }

// ---------- utilidades ----------
let tt; function toast(m, bad) { const t = $('#toast'); t.textContent = m; t.classList.toggle('bad', !!bad); t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), bad ? 5000 : 2600); }
const fd = (iso, y) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) }) : '—';
const money = n => (n == null || n === '' ? '—' : '$' + (Number(n) % 1 ? Number(n).toFixed(2) : Number(n)));
const ini = s => (String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();
const LBL = { activo: 'Activo', debe: 'Debe', suspendido: 'Suspendido', nuevo: 'Nuevo', cancelado: 'Cancelado' };
const pill = e => `<span class="pill s-${e}">${LBL[e]}</span>`;
function sub(c) {
  if (c.propia) return 'Tu app · sin cobro';
  switch (c.efectivo) {
    case 'nuevo': return 'Completa sus datos y precio';
    case 'debe': return `Venció el ${fd(c.proximoPago)} · lleva ${c.atraso} ${c.atraso === 1 ? 'día' : 'días'}`;
    case 'suspendido': return c.autoSuspendida ? `Suspendida sola · ${c.atraso} días sin pagar` : `Suspendida desde el ${fd(c.suspendidaDesde)}`;
    case 'cancelado': return `Cancelada el ${fd(c.canceladaDesde)}`;
    default: return c.proximoPago ? `Próximo pago: ${fd(c.proximoPago)} · ${money(c.precio)}` : 'Sin fecha de pago';
  }
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { F = null; render(); window.scrollTo(0, 0); });
const parts = () => location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);

// ---------- vistas ----------
function render() {
  if (!S.user) return showLogin();
  if (!S.loaded) { $('#app').innerHTML = '<div class="boot"><div class="spinner" aria-hidden="true"></div></div>'; return; }
  const [a, id, b] = parts();
  let h;
  if (a === 'c' && id) { const c = S.clientes.find(x => x.id === id); if (!c) return go('#/'); h = b === 'pago' ? vPago(c) : b === 'editar' ? vEditar(c) : vCliente(c); }
  else if (a === 'ajustes') h = vAjustes();
  else h = vLista();
  $('#app').innerHTML = h;
  const q = $('#q'); if (q) q.oninput = () => { S.q = q.value; const p = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
}
function head(title, sub2, back, right = '') {
  return `<div class="pagehead"><a class="iconbtn" href="${back}" aria-label="Volver">${I.back}</a><div class="t"><h1 class="cond">${esc(title)}</h1>${sub2 ? `<small>${esc(sub2)}</small>` : ''}</div>${right}</div>`;
}
function vLista() {
  const cs = S.clientes, n = e => cs.filter(c => c.efectivo === e).length;
  const debe = cs.filter(c => c.efectivo === 'debe').sort((x, y) => y.atraso - x.atraso);
  const orden = { debe: 0, nuevo: 1, suspendido: 2, activo: 3, cancelado: 4 };
  const lista = cs.filter(c => (S.filtro === 'todos' ? c.efectivo !== 'cancelado' : c.efectivo === S.filtro))
    .filter(c => !S.q || [c.appName, c.entrenadora, c.url].join(' ').toLowerCase().includes(S.q.toLowerCase()))
    .sort((x, y) => (orden[x.efectivo] - orden[y.efectivo]) || String(x.appName).localeCompare(String(y.appName), 'es'));
  const chips = [['todos', 'Todos'], ['activo', 'Activos'], ['debe', 'Deben'], ['suspendido', 'Suspendidos'], ['nuevo', 'Nuevos'], ['cancelado', 'Cancelados']]
    .map(([k, l]) => `<button class="chip" data-act="filtro" data-v="${k}" aria-pressed="${S.filtro === k}">${l}</button>`).join('');
  return `<div class="wrap">
    <div class="top"><div class="brand"><span class="brand-ico">${I.grid}</span><span class="brand-name">MI GYM <span>· CONSOLA</span></span></div>
      <a class="iconbtn" href="#/ajustes" aria-label="Ajustes de la consola">${I.sliders}</a></div>
    <h1 class="big cond">Mis clientes</h1>
    <div class="tiles">
      <button class="tile" data-act="filtro" data-v="activo"><b>${n('activo')}</b><span class="t-activo">Activos</span></button>
      <button class="tile" data-act="filtro" data-v="debe"><b>${n('debe')}</b><span class="t-debe">Deben</span></button>
      <button class="tile" data-act="filtro" data-v="suspendido"><b>${n('suspendido')}</b><span class="t-suspendido">Suspendidos</span></button></div>
    ${debe.length ? `<a class="alert" href="#/c/${debe[0].id}">${I.warn}<span style="flex:1"><b>${esc(debe[0].appName)}</b> lleva ${debe[0].atraso} ${debe[0].atraso === 1 ? 'día' : 'días'} sin pagar${debe.length > 1 ? ` · y ${debe.length - 1} más` : ''}</span><b>Ver</b></a>` : ''}
    ${n('nuevo') ? `<button class="alert" style="background:#162A45;border-color:#274A75;color:#CFE4FF" data-act="filtro" data-v="nuevo"><span style="flex:1">${n('nuevo') === 1 ? '1 app nueva espera sus datos' : n('nuevo') + ' apps nuevas esperan sus datos'}</span><b>Ver</b></button>` : ''}
    <label class="search">${I.search}<input id="q" type="search" value="${esc(S.q)}" placeholder="Buscar cliente" aria-label="Buscar cliente"></label>
    <div class="chips">${chips}</div>
    <div class="list">${lista.map(c => `<a class="row" href="#/c/${c.id}"><span class="ini">${esc(ini(c.appName))}</span><span class="rt"><b>${esc(c.appName)}</b><small>${esc(sub(c))}</small></span>${pill(c.efectivo)}</a>`).join('')
      || `<div class="empty"><b>${cs.length ? 'Nada por aquí' : 'Todavía no hay clientes'}</b>${cs.length ? 'Prueba con otro filtro.' : 'Cuando publiques la app de un cliente, aparecerá aquí sola.'}</div>`}</div></div>`;
}
function vCliente(c) {
  const e = c.efectivo, msg = ({
    nuevo: () => 'Esta app se acaba de conectar. Completa sus datos y su precio para empezar a llevar sus pagos.',
    debe: () => `Venció el ${fd(c.proximoPago)} · lleva ${c.atraso} ${c.atraso === 1 ? 'día' : 'días'} sin pagar.${S.ajustes.auto ? ` Se suspende sola después de ${S.ajustes.dias} días.` : ''}`,
    suspendido: () => `Su app está en pausa${c.autoSuspendida ? ' (se suspendió sola por falta de pago)' : ` desde el ${fd(c.suspendidaDesde)}`}. Sus alumnas ven el aviso y su panel está bloqueado. No se borró nada.`,
    cancelado: () => `Cancelada el ${fd(c.canceladaDesde, true)}. Su app sigue en pausa. Según el contrato, puedes borrar su sitio en Netlify después del ${fd(addDays(c.canceladaDesde, 60), true)}.`,
    activo: () => c.propia ? 'Es tu propia app: siempre activa y sin cobro.' : `Al día. Próximo pago: ${fd(c.proximoPago)}.`
  }[e] || (() => ''))();
  const suspendida = e === 'suspendido' && !c.autoSuspendida;
  const btns = e === 'cancelado'
    ? `<button class="btn ok" data-act="reactivar" data-id="${c.id}">Reactivar cliente</button>`
    : `${c.propia ? '' : `<a class="btn primary" href="#/c/${c.id}/pago">${I.check}Marcar como pagado</a>`}
       ${e === 'nuevo' ? `<a class="btn" href="#/c/${c.id}/editar">Completar datos</a>` : ''}
       ${c.propia ? '' : (suspendida || c.autoSuspendida ? `<button class="btn ok" data-act="reactivar" data-id="${c.id}">Reactivar app</button>` : `<button class="btn danger" data-act="suspender" data-id="${c.id}">Suspender app</button>`)}`;
  const pagos = (c.pagos || []).slice(0, 12).map(p => `<div class="pago"><span>${fd(p.fecha, true)}${p.metodo ? ' · ' + esc(p.metodo) : ''}${p.nota ? ' · ' + esc(p.nota) : ''}</span><b>${money(p.monto)}</b></div>`).join('');
  return `<div class="wrap">${head(c.appName, [c.entrenadora, c.edicion === 'personal' ? 'Edición Personal' : 'Edición Pro'].filter(Boolean).join(' · '), '#/', pill(e))}
    <div class="box ${e}">${esc(msg)}</div>
    <div class="stack">${btns}</div>
    <div class="info">
      ${c.propia ? '' : `<div><span>Plan</span><b>${c.precio != null ? money(c.precio) + ' al mes' : '—'}</b></div><div><span>Próximo pago</span><b>${fd(c.proximoPago, true)}</b></div>`}
      <div><span>Conectada desde</span><b>${fd(c.creado, true)}</b></div>
      ${c.correo ? `<div><span>Correo</span><b>${esc(c.correo)}</b></div>` : ''}
      ${c.telefono ? `<div><span>Teléfono</span><b>${esc(c.telefono)}</b></div>` : ''}
      <div><span>Dirección</span><b>${esc(c.url.replace(/^https?:\/\//, ''))}</b></div></div>
    <div class="two"><a class="btn" href="${esc(c.url)}/" target="_blank" rel="noopener">Abrir su app</a><a class="btn" href="${esc(c.url)}/panel/" target="_blank" rel="noopener">Abrir su panel</a></div>
    <div class="two" style="grid-template-columns:1fr"><a class="btn" href="#/c/${c.id}/editar">Editar datos</a></div>
    ${c.notas ? `<div class="sectitle">Notas</div><div class="card" style="white-space:pre-wrap;font-size:14px">${esc(c.notas)}</div>` : ''}
    ${c.propia ? '' : `<div class="sectitle">Pagos</div><div class="stack" style="gap:6px">${pagos || '<p class="muted" style="margin:4px 2px">Todavía no hay pagos registrados.</p>'}</div>`}
    <div style="display:flex;justify-content:center;margin-top:18px">${e === 'cancelado' ? `<button class="btn link" data-act="quitar" data-id="${c.id}">Quitar de la lista</button>` : (c.propia ? '' : `<button class="btn link" data-act="cancelar" data-id="${c.id}">Cancelar cliente</button>`)}</div></div>`;
}
function vEditar(c) {
  F = F && F.id === c.id && F.tipo === 'editar' ? F : { id: c.id, tipo: 'editar', d: { appName: c.appName || '', entrenadora: c.entrenadora || '', correo: c.correo || '', telefono: c.telefono || '', edicion: c.edicion || 'pro', precio: c.precio ?? '', proximoPago: c.proximoPago || '', propia: !!c.propia, notas: c.notas || '' } };
  const d = F.d;
  return `<div class="wrap">${head('Datos del cliente', c.appName, `#/c/${c.id}`)}
    <form class="form" onsubmit="return false">
      <label class="f"><span>Nombre de la app o negocio</span><input class="in" data-k="appName" value="${esc(d.appName)}" placeholder="Coach Ana Fit"></label>
      <label class="f"><span>Entrenadora</span><input class="in" data-k="entrenadora" value="${esc(d.entrenadora)}" placeholder="Nombre y apellido"></label>
      <div class="grid2"><label class="f"><span>Correo</span><input class="in" type="email" data-k="correo" value="${esc(d.correo)}" placeholder="correo@…"></label>
        <label class="f"><span>Teléfono</span><input class="in" type="tel" data-k="telefono" value="${esc(d.telefono)}" placeholder="Opcional"></label></div>
      <div class="f"><span>Edición</span><div class="opts"><button type="button" class="chip" data-act="opt" data-k="edicion" data-v="pro" aria-pressed="${d.edicion !== 'personal'}">Pro</button><button type="button" class="chip" data-act="opt" data-k="edicion" data-v="personal" aria-pressed="${d.edicion === 'personal'}">Personal</button></div></div>
      <button type="button" class="switch card" style="margin:0" role="switch" aria-checked="${d.propia}" data-act="propia"><span><b>Es mi propia app</b><small>Siempre activa y sin cobro</small></span><span class="track"></span></button>
      ${d.propia ? '' : `<div class="grid2"><label class="f"><span>Precio al mes</span><input class="in" type="number" inputmode="decimal" step="0.01" min="0" data-k="precio" value="${esc(d.precio)}" placeholder="39"></label>
        <label class="f"><span>Próximo pago</span><input class="in" type="date" data-k="proximoPago" value="${esc(d.proximoPago)}"></label></div>`}
      <label class="f"><span>Notas</span><textarea class="in" data-k="notas" placeholder="Opcional">${esc(d.notas)}</textarea></label>
    </form></div>
    <div class="savebar"><div><button class="btn primary" data-act="guardar" id="saveBtn">Guardar</button></div></div>`;
}
function vPago(c) {
  F = F && F.id === c.id && F.tipo === 'pago' ? F : { id: c.id, tipo: 'pago', d: { monto: c.precio ?? '', fecha: S.hoy, metodo: 'Zelle', nota: '' } };
  const d = F.d, prox = addMonth(c.proximoPago || d.fecha || S.hoy);
  return `<div class="wrap">${head('Registrar pago', c.appName, `#/c/${c.id}`)}
    <form class="form" onsubmit="return false">
      <div class="grid2"><label class="f"><span>Monto</span><input class="in" type="number" inputmode="decimal" step="0.01" min="0" data-k="monto" value="${esc(d.monto)}" placeholder="39" style="font-weight:700;font-size:18px"></label>
        <label class="f"><span>Fecha</span><input class="in" type="date" data-k="fecha" value="${esc(d.fecha)}"></label></div>
      <div class="f"><span>Forma de pago</span><div class="opts">${['Zelle', 'Tarjeta', 'Transferencia', 'Efectivo'].map(m => `<button type="button" class="chip" data-act="opt" data-k="metodo" data-v="${m}" aria-pressed="${d.metodo === m}">${m}</button>`).join('')}</div></div>
      <label class="f"><span>Nota</span><input class="in" data-k="nota" value="${esc(d.nota)}" placeholder="Opcional"></label>
      <div class="card" style="font-size:14px;color:#C9CEDC">Próximo pago: <b style="color:var(--ink)">${fd(prox, true)}</b>.${c.efectivo === 'suspendido' ? ' Su app se reactiva al guardar.' : ''}</div>
    </form></div>
    <div class="savebar"><div><button class="btn primary" data-act="pagar" id="saveBtn">Guardar pago</button></div></div>`;
}
function vAjustes() {
  const a = S.ajustes;
  return `<div class="wrap">${head('Ajustes', S.user, '#/')}
    <div class="card"><button class="switch" role="switch" aria-checked="${a.auto}" data-act="auto"><span><b>Suspender sola si no paga</b><small>Se reactiva sola al registrar el pago</small></span><span class="track"></span></button>
      ${a.auto ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #232B44;padding-top:12px;margin-top:12px"><span style="font-size:14px;color:#C9CEDC">Días de gracia después de la fecha de pago</span>
        <div class="stepper"><button data-act="dias" data-v="-1" aria-label="Menos días">−</button><b>${a.dias}</b><button data-act="dias" data-v="1" aria-label="Más días">+</button></div></div>` : ''}</div>
    <div class="card"><b>Clientes nuevos</b><p class="muted" style="margin:4px 0 0;font-size:14px">Cuando publicas la app de un cliente nuevo, aparece sola en tu lista como <b style="color:#CFE4FF">Nuevo</b>. Solo completas su nombre y su precio.</p></div>
    <div class="card"><b>Solo tú entras aquí</b><p class="muted" style="margin:4px 0 0;font-size:14px">La consola es un sitio aparte. Tus clientas y sus alumnas no la ven ni saben que existe.</p></div>
    <div class="stack"><button class="btn" data-act="logout">Cerrar sesión</button></div></div>`;
}
function addMonth(iso) { const [y, m, d] = iso.split('-').map(Number); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10); }
function addDays(iso, n) { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// ---------- eventos ----------
document.addEventListener('input', e => { const el = e.target; if (F && el.dataset.k) F.d[el.dataset.k] = el.value; });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (el.tagName === 'BUTTON') e.preventDefault();
  const run = async (fn, ok) => { el.disabled = true; try { const r = await fn(); if (r && r.cliente) upd(r.cliente); if (ok) toast(ok); return true; } catch (er) { if (er.message !== 'login') toast(er.message, true); el.disabled = false; return false; } };
  switch (act) {
    case 'filtro': S.filtro = S.filtro === el.dataset.v && el.classList.contains('tile') ? 'todos' : el.dataset.v; return render();
    case 'opt': F.d[el.dataset.k] = el.dataset.v; return render();
    case 'propia': F.d.propia = !F.d.propia; return render();
    case 'suspender': if (!confirm('¿Suspender su app? Sus alumnas verán un aviso y su panel quedará bloqueado. No se borra nada.')) return;
      if (await run(() => api('POST', `/api/consola/clientes/${id}/suspender`), 'App suspendida')) render(); return;
    case 'reactivar': if (await run(() => api('POST', `/api/consola/clientes/${id}/reactivar`), 'App reactivada ✓')) render(); return;
    case 'cancelar': if (!confirm('¿Cancelar este cliente? Su app queda en pausa y se marca como cancelada. Puedes reactivarla después.')) return;
      if (await run(() => api('POST', `/api/consola/clientes/${id}/cancelar`), 'Cliente cancelado')) render(); return;
    case 'quitar': if (!confirm('¿Quitar este cliente de tu lista? Si su app sigue publicada y vuelve a conectarse, aparecerá de nuevo como "Nuevo".')) return;
      if (await run(() => api('DELETE', `/api/consola/clientes/${id}`), 'Quitado de la lista')) { S.clientes = S.clientes.filter(c => c.id !== id); go('#/'); } return;
    case 'guardar': {
      const d = F.d;
      if (!String(d.appName).trim()) return toast('Escribe el nombre.', true);
      if (d.correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo)) return toast('Revisa el correo.', true);
      if (!d.propia && d.precio !== '' && !(Number(d.precio) >= 0)) return toast('Revisa el precio.', true);
      if (await run(() => api('PUT', `/api/consola/clientes/${F.id}`, d), 'Guardado ✓')) { const back = `#/c/${F.id}`; F = null; go(back); } return;
    }
    case 'pagar': {
      const d = F.d;
      if (!(Number(d.monto) > 0)) return toast('Escribe el monto.', true);
      if (await run(() => api('POST', `/api/consola/clientes/${F.id}/pago`, d), 'Pago registrado ✓')) { const back = `#/c/${F.id}`; F = null; go(back); } return;
    }
    case 'auto': case 'dias': {
      const a = { ...S.ajustes };
      if (act === 'auto') a.auto = !a.auto; else a.dias = Math.min(60, Math.max(0, a.dias + Number(el.dataset.v)));
      try { S.ajustes = await api('PUT', '/api/consola/ajustes', a); await load(); render(); } catch (er) { if (er.message !== 'login') toast(er.message, true); }
      return;
    }
    case 'logout': window.netlifyIdentity && window.netlifyIdentity.logout(); return;
  }
});

// ---------- inicio de sesión ----------
function showLogin() {
  S.user = null; S.loaded = false;
  const ok = !!window.netlifyIdentity;
  $('#app').innerHTML = `<div class="center"><div class="login"><span class="brand-ico" style="margin:0 auto;width:56px;height:56px;border-radius:16px">${I.grid}</span>
    <h1 class="cond">Consola</h1><p class="muted">${ok ? 'Inicia sesión para ver tus clientes.' : 'No se pudo cargar el inicio de sesión. Revisa tu internet y recarga.'}</p>
    ${ok ? '<button class="btn primary" id="loginBtn" style="margin-top:12px">Iniciar sesión</button>' : ''}</div></div>`;
  const b = $('#loginBtn'); if (b) b.onclick = () => window.netlifyIdentity.open('login');
}
async function start() { try { await load(); render(); } catch (e) { if (e.message !== 'login') $('#app').innerHTML = `<div class="center"><div class="login"><h1 class="cond">Ups</h1><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Reintentar</button></div></div>`; } }
function boot() {
  const ni = window.netlifyIdentity; if (!ni) return showLogin();
  ni.on('init', u => { if (u) { S.user = u.email; render(); start(); } else showLogin(); });
  ni.on('login', u => { ni.close(); S.user = u.email; render(); start(); });
  ni.on('logout', () => showLogin());
  ni.init();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
