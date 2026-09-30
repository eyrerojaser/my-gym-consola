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
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l2.5-7h11L20 13v6H4z"/><path d="M4 13h4.5l1.5 2h4l1.5-2H20"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
const S = { user: null, loaded: false, clientes: [], solicitudes: [], ajustes: { auto: false, dias: 5 }, hoy: '', filtro: 'todos', q: '', sfiltro: 'nueva' };
let F = null; // formulario abierto

// ---------- conexión ----------
const PASE = 'migym-consola-pase';
async function token() { try { return localStorage.getItem(PASE); } catch { return null; } }
function guardarPase(p) { try { if (p) localStorage.setItem(PASE, p); else localStorage.removeItem(PASE); } catch {} }
async function api(method, path, body) {
  const tk = await token(); if (!tk) { showLogin(); throw new Error('login'); }
  let r; try { r = await fetch(path, { method, headers: { Authorization: 'Bearer ' + tk, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sin conexión. Revisa tu internet.'); }
  let d = {}; try { d = await r.json(); } catch {}
  if (r.status === 401) { guardarPase(null); showLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(d.error || 'No se pudo completar.');
  return d;
}
async function load() { const [d, so] = await Promise.all([api('GET', '/api/consola/clientes'), api('GET', '/api/consola/solicitudes')]); S.clientes = d.clientes; S.ajustes = d.ajustes; S.hoy = d.hoy; S.solicitudes = so.solicitudes || []; S.loaded = true; }
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
  else if (a === 'solicitudes') h = vSolicitudes();
  else if (a === 's' && id) { const x = S.solicitudes.find(y => y.id === id); if (!x) return go('#/solicitudes'); h = vSolicitud(x); }
  else h = vLista();
  $('#app').innerHTML = h;
  if (a === 'ajustes') revisarAvisos().then(pintarAvisos);
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
      <div style="display:flex;gap:8px"><a class="iconbtn" href="#/solicitudes" aria-label="Solicitudes" style="position:relative">${I.inbox}${nNuevas() ? `<span class="badge">${nNuevas()}</span>` : ''}</a>
      <a class="iconbtn" href="#/ajustes" aria-label="Ajustes de la consola">${I.sliders}</a></div></div>
    <h1 class="big cond">Mis clientes</h1>
    <div class="tiles">
      <button class="tile" data-act="filtro" data-v="activo"><b>${n('activo')}</b><span class="t-activo">Activos</span></button>
      <button class="tile" data-act="filtro" data-v="debe"><b>${n('debe')}</b><span class="t-debe">Deben</span></button>
      <button class="tile" data-act="filtro" data-v="suspendido"><b>${n('suspendido')}</b><span class="t-suspendido">Suspendidos</span></button></div>
    ${nNuevas() ? `<a class="alert" href="#/solicitudes" style="background:#1F3A2E;border-color:#2E6B52;color:#C8F5E0">${I.inbox}<span style="flex:1"><b>${nNuevas() === 1 ? '1 entrenadora nueva' : nNuevas() + ' entrenadoras nuevas'}</b> quiere${nNuevas() === 1 ? '' : 'n'} su app</span><b>Ver</b></a>` : ''}
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
  return `<div class="wrap">${head('Ajustes', '', '#/')}
    <div class="card"><button class="switch" role="switch" aria-checked="${a.auto}" data-act="auto"><span><b>Suspender sola si no paga</b><small>Se reactiva sola al registrar el pago</small></span><span class="track"></span></button>
      ${a.auto ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #232B44;padding-top:12px;margin-top:12px"><span style="font-size:14px;color:#C9CEDC">Días de gracia después de la fecha de pago</span>
        <div class="stepper"><button data-act="dias" data-v="-1" aria-label="Menos días">−</button><b>${a.dias}</b><button data-act="dias" data-v="1" aria-label="Más días">+</button></div></div>` : ''}</div>
    <div class="card" id="avisosCard">${avisosHTML()}</div>
    <div class="card"><b>Clientes nuevos</b><p class="muted" style="margin:4px 0 0;font-size:14px">Cuando publicas la app de un cliente nuevo, aparece sola en tu lista como <b style="color:#CFE4FF">Nuevo</b>. Solo completas su nombre y su precio.</p></div>
    <div class="card"><b>Solo tú entras aquí</b><p class="muted" style="margin:4px 0 0;font-size:14px">La consola es un sitio aparte. Tus clientas y sus alumnas no la ven ni saben que existe.</p></div>
    <div class="stack"><button class="btn" data-act="logout">Cerrar sesión</button></div></div>`;
}
const SLBL = { nueva: 'Nueva', contactada: 'Contactada', creada: 'App creada', descartada: 'Descartada' };
const SCLS = { nueva: 's-nuevo', contactada: 's-debe', creada: 's-activo', descartada: 's-cancelado' };
const nNuevas = () => S.solicitudes.filter(x => x.estado === 'nueva').length;
const fdt = iso => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function vSolicitudes() {
  const list = S.solicitudes.filter(x => S.sfiltro === 'todas' || x.estado === S.sfiltro);
  const chips = [['nueva', 'Nuevas'], ['contactada', 'Contactadas'], ['creada', 'App creada'], ['descartada', 'Descartadas'], ['todas', 'Todas']]
    .map(([k, l]) => `<button class="chip" data-act="sfiltro" data-v="${k}" aria-pressed="${S.sfiltro === k}">${l}${k === 'nueva' && nNuevas() ? ' · ' + nNuevas() : ''}</button>`).join('');
  return `<div class="wrap">${head('Solicitudes', 'Entrenadoras que quieren su app', '#/')}
    <div class="chips">${chips}</div>
    <div class="list">${list.map(x => `<a class="row" href="#/s/${x.id}"><span class="ini">${esc(ini(x.negocio || x.nombre))}</span><span class="rt"><b>${esc(x.nombre)}${x.negocio ? ' · ' + esc(x.negocio) : ''}</b><small>${fdt(x.fecha)} · ${x.plan === 'personal' ? 'Personal' : 'Pro'}</small></span><span class="pill ${SCLS[x.estado]}">${SLBL[x.estado]}</span></a>`).join('')
      || `<div class="empty"><b>${S.solicitudes.length ? 'Nada por aquí' : 'Todavía no hay solicitudes'}</b>${S.solicitudes.length ? 'Prueba con otro filtro.' : 'Cuando una entrenadora llene tu página de registro, aparecerá aquí y te llegará un aviso.'}</div>`}</div></div>`;
}
function vSolicitud(x) {
  const wa = x.whatsapp ? `https://wa.me/${x.whatsapp.replace(/[^\d]/g, '')}?text=${encodeURIComponent(`¡Hola ${x.nombre}! Recibí tu solicitud para tener tu propia app de Mi Gym${x.negocio ? ' para ' + x.negocio : ''}. ¿Cuándo te queda bien que hablemos?`)}` : '';
  const btn = (est, label, cls = '') => x.estado === est ? '' : `<button class="btn ${cls}" data-act="sestado" data-id="${x.id}" data-v="${est}">${label}</button>`;
  return `<div class="wrap">${head(x.nombre, x.negocio || 'Solicitud', '#/solicitudes', `<span class="pill ${SCLS[x.estado]}">${SLBL[x.estado]}</span>`)}
    <div class="stack">
      ${wa ? `<a class="btn primary" href="${esc(wa)}" target="_blank" rel="noopener">Escribirle por WhatsApp</a>` : ''}
      <a class="btn" href="mailto:${esc(x.correo)}?subject=${encodeURIComponent('Tu app de Mi Gym')}">Enviarle un correo</a></div>
    <div class="info">
      <div><span>Nombre</span><b>${esc(x.nombre)}</b></div>
      ${x.negocio ? `<div><span>Negocio</span><b>${esc(x.negocio)}</b></div>` : ''}
      <div><span>Correo</span><b>${esc(x.correo)}</b></div>
      ${x.whatsapp ? `<div><span>WhatsApp</span><b>${esc(x.whatsapp)}</b></div>` : ''}
      <div><span>Plan</span><b>${x.plan === 'personal' ? 'Personal' : 'Pro'}</b></div>
      <div><span>Recibida</span><b>${fdt(x.fecha)}</b></div></div>
    ${x.mensaje ? `<div class="sectitle">Mensaje</div><div class="card" style="white-space:pre-wrap;font-size:14px">${esc(x.mensaje)}</div>` : ''}
    <div class="sectitle">¿En qué va?</div>
    <div class="stack">${btn('contactada', 'Ya la contacté')}${btn('creada', 'Ya le creé su app', 'ok')}${btn('nueva', 'Volver a nueva')}</div>
    <div style="display:flex;justify-content:center;margin-top:14px">${x.estado === 'descartada' ? `<button class="btn link" data-act="sborrar" data-id="${x.id}">Borrar solicitud</button>` : `<button class="btn link" data-act="sestado" data-id="${x.id}" data-v="descartada">Descartar</button>`}</div></div>`;
}
function addMonth(iso) { const [y, m, d] = iso.split('-').map(Number); const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10); }
function addDays(iso, n) { const t = new Date(iso + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }

// ---------- avisos en este teléfono ----------
const AV = { estado: 'cargando' };
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
async function revisarAvisos() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { AV.estado = esIOS() && !standalone() ? 'instalar' : 'nosoporta'; return; }
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); AV.estado = sub && Notification.permission === 'granted' ? 'activo' : (Notification.permission === 'denied' ? 'bloqueado' : 'apagado'); }
  catch { AV.estado = 'apagado'; }
}
function avisosHTML() {
  const t = { cargando: 'Revisando…', activo: 'Activos en este teléfono ✓', apagado: 'Apagados en este teléfono', bloqueado: 'Bloqueados: permítelos en los ajustes del teléfono para esta app.',
    instalar: 'En iPhone primero agrega la consola a tu pantalla de inicio (Compartir → Agregar a pantalla de inicio) y ábrela desde ese ícono.', nosoporta: 'Este navegador no permite avisos.' }[AV.estado];
  return `<b>Avisos en este teléfono</b><p class="muted" style="margin:4px 0 10px;font-size:14px">Te avisa cuando una entrenadora pide su app. ${esc(t)}</p>
    ${AV.estado === 'activo' ? `<div class="two" style="margin-top:0"><button class="btn" data-act="avisos-prueba">Probar aviso</button><button class="btn" data-act="avisos-off">Apagar</button></div>`
      : AV.estado === 'apagado' ? `<button class="btn primary" data-act="avisos-on">Activar avisos</button>` : ''}`;
}
function pintarAvisos() { const c = $('#avisosCard'); if (c) c.innerHTML = avisosHTML(); }
async function activarAvisos() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { AV.estado = perm === 'denied' ? 'bloqueado' : 'apagado'; return pintarAvisos(); }
    const { publicKey } = await api('GET', '/api/consola/avisos/clave');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(publicKey) });
    await api('POST', '/api/consola/avisos', { subscription: sub.toJSON() });
    AV.estado = 'activo'; pintarAvisos(); toast('Avisos activados ✓');
  } catch (er) { if (er.message !== 'login') toast('No se pudieron activar los avisos: ' + er.message, true); }
}
async function desactivarAvisos() {
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { await api('DELETE', '/api/consola/avisos', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    AV.estado = 'apagado'; pintarAvisos(); toast('Avisos apagados'); } catch (er) { if (er.message !== 'login') toast(er.message, true); }
}

// ---------- eventos ----------
document.addEventListener('input', e => { const el = e.target; if (F && el.dataset.k) F.d[el.dataset.k] = el.value; });
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (el.tagName === 'BUTTON') e.preventDefault();
  const run = async (fn, ok) => { el.disabled = true; try { const r = await fn(); if (r && r.cliente) upd(r.cliente); if (ok) toast(ok); return true; } catch (er) { if (er.message !== 'login') toast(er.message, true); el.disabled = false; return false; } };
  switch (act) {
    case 'sfiltro': S.sfiltro = el.dataset.v; return render();
    case 'sestado': {
      try { const r = await api('PUT', `/api/consola/solicitudes/${id}`, { estado: el.dataset.v }); const i = S.solicitudes.findIndex(x => x.id === id); S.solicitudes[i] = r.solicitud; render();
        toast({ contactada: 'Marcada como contactada', creada: '¡Listo! Ahora complétala en Mis clientes cuando aparezca', nueva: 'Marcada como nueva', descartada: 'Descartada' }[el.dataset.v]); }
      catch (er) { if (er.message !== 'login') toast(er.message, true); } return;
    }
    case 'sborrar': if (!confirm('¿Borrar esta solicitud?')) return;
      try { await api('DELETE', `/api/consola/solicitudes/${id}`); S.solicitudes = S.solicitudes.filter(x => x.id !== id); go('#/solicitudes'); } catch (er) { if (er.message !== 'login') toast(er.message, true); } return;
    case 'avisos-on': return activarAvisos();
    case 'avisos-off': return desactivarAvisos();
    case 'avisos-prueba': try { const r = await api('POST', '/api/consola/avisos/prueba'); toast(r.enviados ? 'Aviso enviado ✓' : 'No hay teléfonos con avisos activos.', !r.enviados); } catch (er) { if (er.message !== 'login') toast(er.message, true); } return;
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
    case 'logout': guardarPase(null); showLogin(); return;
  }
});

// ---------- inicio de sesión (una contraseña) ----------
function showLogin(msg) {
  S.user = null; S.loaded = false;
  $('#app').innerHTML = `<div class="center"><form class="login" id="loginForm" onsubmit="return false">
    <span class="brand-ico" style="margin:0 auto;width:56px;height:56px;border-radius:16px">${I.grid}</span>
    <h1 class="cond">Consola</h1>
    <label class="f" style="text-align:left;margin-top:14px"><span>Contraseña</span>
      <input class="in" id="clave" type="password" autocomplete="current-password" required minlength="8" aria-describedby="loginMsg"></label>
    <p class="muted" id="loginMsg" role="alert" style="min-height:1.4em;margin:8px 0 0;font-size:14px">${esc(msg || '')}</p>
    <button class="btn primary" id="loginBtn" type="submit" style="margin-top:10px">Entrar</button></form></div>`;
  const f = $('#loginForm'), m = $('#loginMsg'), b = $('#loginBtn');
  setTimeout(() => $('#clave').focus(), 50);
  f.onsubmit = async ev => {
    ev.preventDefault();
    const clave = $('#clave').value;
    if (!clave) return;
    b.disabled = true; b.textContent = 'Entrando…'; m.style.color = '';
    try {
      const r = await fetch('/api/consola/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.pase) { guardarPase(d.pase); S.user = 'Proveedora'; render(); return start(); }
      m.style.color = '#FF9AA8';
      m.textContent = d.sinClave ? 'Falta configurar la contraseña: en Netlify, sitio de la consola, agrega la variable CONSOLA_CLAVE y vuelve a publicar.'
        : d.bloqueada ? d.error : (d.error || 'No se pudo entrar.') + (d.quedan ? ` Te quedan ${d.quedan} intentos.` : '');
    } catch { m.style.color = '#FF9AA8'; m.textContent = 'Sin conexión. Revisa tu internet.'; }
    b.disabled = false; b.textContent = 'Entrar'; $('#clave').select();
  };
}
async function start() { try { await load(); render(); } catch (e) { if (e.message !== 'login') $('#app').innerHTML = `<div class="center"><div class="login"><h1 class="cond">Ups</h1><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Reintentar</button></div></div>`; } }
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (await token()) { S.user = 'Proveedora'; render(); start(); }
  else showLogin();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
