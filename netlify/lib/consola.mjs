// Consola de clientes de Mi Gym (sitio aparte, solo para la proveedora).
// Guarda un registro por cada app de cliente en Netlify Blobs de ESTE sitio.
import { getStore } from '@netlify/blobs';

const mem = () => globalThis.__consolaStores;  // solo para pruebas locales
export const store = () => (mem() ? mem().consola : getStore({ name: 'migym-consola', consistency: 'strong' }));

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
});
export const err = (status, error, extra = {}) => json({ error, ...extra }, status);

// Inicio de sesión: Netlify Identity de la consola (solo la proveedora está invitada)
const seen = new Map();
export async function requireUser(req) {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token || token.length > 4096) return null;
  const hit = seen.get(token); if (hit && hit.until > Date.now()) return hit.user;
  let user = null;
  if (globalThis.__consolaVerify) user = await globalThis.__consolaVerify(token);
  else {
    try {
      const r = await fetch(new URL('/.netlify/identity/user', req.url), { headers: { Authorization: 'Bearer ' + token } });
      if (r.ok) { const u = await r.json(); if (u && u.id && u.email) user = { id: u.id, email: u.email }; }
    } catch {}
  }
  if (user) { seen.set(token, { user, until: Date.now() + 60_000 }); if (seen.size > 200) seen.clear(); }
  return user;
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
