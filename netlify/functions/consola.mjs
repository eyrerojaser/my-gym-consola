// Consola (solo con sesión iniciada):
//   GET  /api/consola/clientes                 → lista con su estado calculado
//   GET  /api/consola/ajustes | PUT {auto,dias}
//   PUT  /api/consola/clientes/:id             {datos}  → editar nombre, entrenadora, correo, precio, próximo pago, notas, propia
//   POST /api/consola/clientes/:id/pago        {monto, fecha, metodo, nota}
//   POST /api/consola/clientes/:id/suspender | reactivar | cancelar
//   DELETE /api/consola/clientes/:id           → quitar de la lista
import { store, json, err, requireUser, vista, getAjustes, today, addMonth } from '../lib/consola.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const s = (v, n = 300) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const EDIT = { appName: 80, entrenadora: 80, correo: 120, telefono: 40, edicion: 10, notas: 2000 };

export default async (req) => {
  const user = await requireUser(req);
  if (!user) return err(401, 'Inicia sesión.');
  const parts = new URL(req.url).pathname.replace(/^\/api\/consola\/?/, '').split('/').filter(Boolean);
  const [area, id, accion] = parts, M = req.method, st = store();
  try {
    if (area === 'ajustes') {
      if (M === 'GET') return json(await getAjustes(st));
      if (M === 'PUT') { const b = await req.json(); const aj = { auto: !!b.auto, dias: Math.min(60, Math.max(0, parseInt(b.dias, 10) || 0)) }; await st.setJSON('ajustes', aj); return json(aj); }
    }
    if (area === 'yo' && M === 'GET') return json({ email: user.email });
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
