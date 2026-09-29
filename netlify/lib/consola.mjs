// Consola de clientes de Mi Gym (sitio aparte, solo para la proveedora).
// Guarda un registro por cada app de cliente en Netlify Blobs de ESTE sitio.
import { getStore } from '@netlify/blobs';

const mem = () => globalThis.__consolaStores;  // solo para pruebas locales
export const store = () => (mem() ? mem().consola : getStore({ name: 'migym-consola', consistency: 'strong' }));

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
});
export const err = (status, error, extra = {}) => json({ error, ...extra }, status);

// Inicio de sesión: UNA contraseña, guardada en Netlify como variable CONSOLA_CLAVE (nunca en el código).
// Al entrar, la consola da un pase firmado que dura 30 días. Cambiar la contraseña invalida todos los pases.
import { createHmac, createHash, timingSafeEqual, randomBytes } from 'node:crypto';
const DIAS = 30, MAX_FALLOS = 5, BLOQUEO_MIN = 15;
export const claveConfigurada = () => String(process.env.CONSOLA_CLAVE || '').length >= 8;
const h = v => createHash('sha256').update(String(v)).digest();
async function secreto(st = store()) {
  let s = await st.get('sesion', { type: 'json' });
  if (!s || !s.sal) { s = { sal: randomBytes(24).toString('hex') }; await st.setJSON('sesion', s); }
  return h(s.sal + '|' + process.env.CONSOLA_CLAVE).toString('hex');
}
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export async function crearPase(st = store()) {
  const body = b64({ exp: Date.now() + DIAS * 864e5 });
  return body + '.' + createHmac('sha256', await secreto(st)).update(body).digest('base64url');
}
export async function entrar(clave, st = store()) {
  if (!claveConfigurada()) return { ok: false, sinClave: true };
  const i = (await st.get('intentos', { type: 'json' })) || { fallos: 0, hasta: 0 };
  if (i.hasta > Date.now()) return { ok: false, bloqueada: Math.ceil((i.hasta - Date.now()) / 60000) };
  const ok = typeof clave === 'string' && timingSafeEqual(h(clave), h(process.env.CONSOLA_CLAVE));
  if (!ok) {
    i.fallos = (i.fallos || 0) + 1;
    if (i.fallos >= MAX_FALLOS) { i.hasta = Date.now() + BLOQUEO_MIN * 60000; i.fallos = 0; }
    await st.setJSON('intentos', i);
    return { ok: false, quedan: i.hasta > Date.now() ? 0 : MAX_FALLOS - i.fallos, bloqueada: i.hasta > Date.now() ? BLOQUEO_MIN : 0 };
  }
  await st.setJSON('intentos', { fallos: 0, hasta: 0 });
  return { ok: true, pase: await crearPase(st) };
}
export async function requireUser(req) {
  if (globalThis.__consolaVerify) { const hh = req.headers.get('authorization') || ''; return globalThis.__consolaVerify(hh.replace(/^Bearer /, '')); }
  if (!claveConfigurada()) return null;
  const a = req.headers.get('authorization') || '', t = a.startsWith('Bearer ') ? a.slice(7).trim() : '';
  const [body, sig] = t.split('.');
  if (!body || !sig || t.length > 600) return null;
  const good = createHmac('sha256', await secreto()).update(body).digest('base64url');
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  let p; try { p = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  return p && p.exp > Date.now() ? { email: 'Proveedora' } : null;
}

// ---------- Fechas ----------
export const today = () => new Date().toISOString().slice(0, 10);
export function addMonth(iso) {  // 2026-01-31 → 2026-02-28
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last))).toISOString().slice(0, 10);
}
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

// ---------- Estado de un cliente ----------
// estado guardado: nuevo | activo | suspendido | cancelado
// "debe" no se guarda: se calcula (activo con la fecha de pago vencida)
export const DEFAULT_AJUSTES = { auto: false, dias: 5 };
export async function getAjustes(st = store()) { return { ...DEFAULT_AJUSTES, ...((await st.get('ajustes', { type: 'json' })) || {}) }; }

export function vista(c, aj, hoy = today()) {
  const out = { ...c };
  out.atraso = 0;
  if (c.propia) { out.efectivo = 'activo'; return out; }
  if (c.estado === 'activo' && c.proximoPago && c.proximoPago < hoy) {
    out.atraso = daysBetween(c.proximoPago, hoy);
    // al reactivar a mano a alguien que debe, los días de gracia vuelven a contar desde ese día
    const base = c.gracia && c.gracia > c.proximoPago ? c.gracia : c.proximoPago;
    out.efectivo = aj.auto && daysBetween(base, hoy) > aj.dias ? 'suspendido' : 'debe';
    if (out.efectivo === 'suspendido') out.autoSuspendida = true;
  } else out.efectivo = c.estado === 'nuevo' ? 'nuevo' : c.estado;
  return out;
}
// Lo que las apps necesitan saber: ¿funciono o me pauso?
export const bloquea = efectivo => efectivo === 'suspendido' || efectivo === 'cancelado';

export const idFor = async siteId => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('migym-cliente:' + siteId));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
};
