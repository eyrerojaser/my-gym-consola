// Consola (solo con sesión iniciada):
//   POST /api/consola/entrar                   {clave} → pase de 30 días
//   GET  /api/consola/clientes                 → lista con su estado calculado
//   GET  /api/consola/ajustes | PUT {auto,dias}
//   PUT  /api/consola/clientes/:id             {datos}  → editar nombre, entrenadora, correo, precio, próximo pago, notas, propia
//   POST /api/consola/clientes/:id/pago        {monto, fecha, metodo, nota}
//   POST /api/consola/clientes/:id/suspender | reactivar | cancelar
//   DELETE /api/consola/clientes/:id           → quitar de la lista
import { store, json, err, requireUser, vista, getAjustes, today, addMonth, entrar, claveConfigurada } from '../lib/consola.mjs';
import { claves, subId, avisar } from '../lib/avisos.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const s = (v, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const EDIT = { appName: 80, entrenadora: 80, correo: 120, telefono: 40, edicion: 10, notas: 2000 };

export default async (req) => {
  const parts = new URL(req.url).pathname.replace(/^\/api\/consola\/?/, '').split('/').filter(Boolean);
  // entrar con la contraseña (no necesita pase)
  if (parts[0] === 'entrar' && req.method === 'POST') {
    let b = {}; try { b = await req.json(); } catch {}
    const r = await entrar(b.clave);
    if (r.ok) return json({ pase: r.pase });
    if (r.sinClave) return err(503, 'Falta configurar la contraseña de la consola.', { sinClave: true });
    if (r.bloqueada) return err(429, `Demasiados intentos. Espera ${r.bloqueada} minutos.`, { bloqueada: r.bloqueada });
    return err(401, 'Contraseña incorrecta.', { quedan: r.quedan });
  }
  if (parts[0] === 'estado-clave' && req.method === 'GET') return json({ configurada: claveConfigurada() });
  const user = await requireUser(req);
  if (!user) return err(401, 'Inicia sesión.');
  const [area, id, accion] = parts, M = req.method, st = store();
  try {
    if (area === 'ajustes') {
      if (M === 'GET') return json(await getAjustes(st));
      if (M === 'PUT') { const b = await req.json(); const aj = { auto: !!b.auto, dias: Math.min(60, Math.max(0, parseInt(b.dias, 10) || 0)) }; await st.setJSON('ajustes', aj); return json(aj); }
    }
    if (area === 'yo' && M === 'GET') return json({ email: user.email });

    // ---- Solicitudes de entrenadoras ----
    if (area === 'solicitudes') {
      if (!id && M === 'GET') {
        const { blobs } = await st.list({ prefix: 'solicitudes/' }), out = [];
        for (const { key } of blobs) { const x = await st.get(key, { type: 'json' }); if (x) out.push(x); }
        out.sort((a, b) => b.fecha.localeCompare(a.fecha));
        return json({ solicitudes: out });
      }
      if (!/^[a-f0-9]{24}$/.test(id || '')) return err(404, 'No existe.');
      const key = `solicitudes/${id}`, x = await st.get(key, { type: 'json' });
      if (!x) return err(404, 'No existe.');
      if (M === 'DELETE') { await st.delete(key); return json({ ok: true }); }
      if (M === 'PUT') {
        const b = await req.json();
        if (['nueva', 'contactada', 'creada', 'descartada'].includes(b.estado)) { x.estado = b.estado; x.cambio = today(); }
        if ('nota' in b) x.nota = typeof b.nota === 'string' ? b.nota.slice(0, 2000) : '';
        if ('clienteId' in b) x.clienteId = /^[a-f0-9]{24}$/.test(b.clienteId || '') ? b.clienteId : null;
        await st.setJSON(key, x); return json({ solicitud: x });
      }
    }

    // ---- Avisos en este teléfono ----
    if (area === 'avisos') {
      if (id === 'clave' && M === 'GET') return json({ publicKey: (await claves(st)).publicKey });
      if (!id && M === 'POST') {
        const b = await req.json(), sub = b && b.subscription;
        if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return err(400, 'Suscripción inválida.');
        await st.setJSON(`avisos/${await subId(sub.endpoint)}`, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
        return json({ ok: true });
      }
      if (!id && M === 'DELETE') { const b = await req.json().catch(() => ({})); if (b.endpoint) await st.delete(`avisos/${await subId(b.endpoint)}`); return json({ ok: true }); }
      if (id === 'prueba' && M === 'POST') { const n = await avisar({ title: 'Consola Mi Gym', body: 'Los avisos funcionan ✓', url: '/' }, st); return json({ ok: true, enviados: n }); }
    }
    if (area !== 'clientes') return err(404, 'No existe.');
    const aj = await getAjustes(st);
    if (!id && M === 'GET') {
      const { blobs } = await st.list({ prefix: 'clientes/' });
      const out = [];
      for (const { key } of blobs) { const c = await st.get(key, { type: 'json' }); if (c) out.push(vista(c, aj)); }
      return json({ clientes: out, ajustes: aj, hoy: today() });
    }
    if (!/^[a-f0-9]{24}$/.test(id || '')) return err(404, 'No existe.');
    const key = `clientes/${id}`;
    const c = await st.get(key, { type: 'json' });
    if (!c) return err(404, 'No existe.');
    const save = async () => { await st.setJSON(key, c); return json({ cliente: vista(c, aj) }); };

    if (M === 'DELETE' && !accion) { await st.delete(key); return json({ ok: true }); }
    if (M === 'PUT' && !accion) {
      const b = await req.json();
      for (const [k, n] of Object.entries(EDIT)) if (k in b) c[k] = s(b[k], n);
      if ('precio' in b) c.precio = b.precio === '' || b.precio == null ? null : Math.max(0, Math.round(Number(b.precio) * 100) / 100);
      if ('proximoPago' in b) { if (b.proximoPago && !ISO.test(b.proximoPago)) return err(400, 'Fecha inválida.'); c.proximoPago = b.proximoPago || null; }
      if ('propia' in b) c.propia = !!b.propia;
      if (c.estado === 'nuevo' && (c.precio != null || c.proximoPago || c.propia)) c.estado = 'activo';
      return save();
    }
    if (M === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (accion === 'pago') {
        const fecha = ISO.test(b.fecha || '') ? b.fecha : today();
        const monto = Math.max(0, Math.round(Number(b.monto) * 100) / 100);
        if (!monto) return err(400, 'Escribe el monto.');
        c.pagos = [{ fecha, monto, metodo: s(b.metodo, 30), nota: s(b.nota, 300), por: user.email }, ...(c.pagos || [])].slice(0, 500);
        // el próximo pago avanza un mes desde la fecha que tocaba (o desde hoy si no había)
        c.proximoPago = addMonth(c.proximoPago || fecha);
        // registrar un pago reactiva la app si estaba suspendida o era nueva (no si está cancelada)
        if (c.estado === 'suspendido' || c.estado === 'nuevo') c.estado = 'activo';
        delete c.suspendidaPor; delete c.suspendidaDesde; delete c.gracia; return save();
      }
      if (accion === 'suspender') { c.estado = 'suspendido'; c.suspendidaPor = 'manual'; c.suspendidaDesde = today(); return save(); }
      if (accion === 'reactivar') { c.estado = 'activo'; delete c.suspendidaPor; delete c.suspendidaDesde; delete c.canceladaDesde;
        // si su fecha de pago ya pasó, no vuelve a quedar suspendida sola hasta la próxima fecha
        if (c.proximoPago && c.proximoPago < today() && aj.auto) c.gracia = today();
        return save(); }
      if (accion === 'cancelar') { c.estado = 'cancelado'; c.canceladaDesde = today(); return save(); }
    }
    return err(404, 'No existe.');
  } catch (e) { console.error(e); return err(500, 'No se pudo completar. Inténtalo otra vez.'); }
};

export const config = { path: ['/api/consola', '/api/consola/*'] };
