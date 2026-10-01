// La app de una clienta confirma el código de acceso que la proveedora le dio a la entrenadora.
// Llamada servidor a servidor: POST /api/activar {site:{id,url}, codigo, email}
import { createHash } from 'node:crypto';
import { store, json, err, idFor, today } from '../lib/consola.mjs';

const hashCode = c => createHash('sha256').update('migym-acceso:' + String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

export default async (req) => {
  if (req.method !== 'POST') return err(405, 'Método no permitido');
  let b; try { b = await req.json(); } catch { return err(400, 'Datos inválidos'); }
  const site = (b && b.site) || {};
  if (typeof site.id !== 'string' || !/^[a-z0-9-]{6,80}$/i.test(site.id)) return err(400, 'Sitio inválido');
  const st = store(), key = `clientes/${await idFor(site.id)}`, c = await st.get(key, { type: 'json' });
  if (!c) return err(404, 'Esta app todavía no está registrada en la consola.');
  if (c.actBloqueo && c.actBloqueo > Date.now()) return err(429, 'Demasiados intentos. Espera 15 minutos.');
  const a = c.acceso;
  if (!a || !(a.exp > Date.now()) || hashCode(b.codigo) !== a.hash) {
    c.actFallos = (c.actFallos || 0) + 1;
    if (c.actFallos >= 5) { c.actBloqueo = Date.now() + 15 * 60000; c.actFallos = 0; }
    await st.setJSON(key, c);
    return err(401, a && !(a.exp > Date.now()) ? 'Ese código ya venció. Pide uno nuevo.' : 'El código no es correcto.');
  }
  // código de un solo uso
  delete c.acceso; c.actFallos = 0; delete c.actBloqueo;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase().slice(0, 120) : '';
  c.accesos = [{ email, fecha: today() }, ...(c.accesos || []).filter(x => x.email !== email)].slice(0, 20);
  await st.setJSON(key, c);
  return json({ ok: true });
};

export const config = { path: '/api/activar' };
