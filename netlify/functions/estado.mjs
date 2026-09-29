// Público (lo llaman los servidores de las apps de clientes, no los teléfonos):
//   POST /api/estado  {site:{id,url,name}, appName}  →  {estado:'activo'|'suspendido', ...}
// La primera vez que una app pregunta, se registra sola como "Nuevo".
import { store, json, err, vista, bloquea, getAjustes, idFor, today } from '../lib/consola.mjs';

const clean = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const urlOk = u => /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(u) || (globalThis.__consolaAllowHttp && /^http:\/\/localhost(:\d+)?\/?$/.test(u));

export default async (req) => {
  if (req.method !== 'POST') return err(405, 'Método no permitido');
  let b; try { b = await req.json(); } catch { return err(400, 'Datos inválidos'); }
  const site = b && b.site || {};
  const siteId = clean(site.id, 80), url = clean(site.url, 200).replace(/\/$/, '');
  if (!/^[a-z0-9-]{6,80}$/i.test(siteId) || !urlOk(url)) return err(400, 'Sitio inválido');
  const st = store(), id = await idFor(siteId), key = `clientes/${id}`;
  let c = await st.get(key, { type: 'json' });
  const aj = await getAjustes(st);
  if (!c) {
    // Registro automático: se confirma que de verdad es una app de Mi Gym antes de crearlo
    let ok = !!globalThis.__consolaSkipVerify;
    if (!ok) { try { const r = await fetch(url + '/version.json', { signal: AbortSignal.timeout(5000) }); ok = r.ok; } catch {} }
    if (!ok) return json({ estado: 'activo', registrado: false });
    c = { id, siteId, url, siteName: clean(site.name, 80), appName: clean(b.appName, 80) || clean(site.name, 80) || url,
      estado: 'nuevo', creado: today(), pagos: [], notas: '' };
    await st.setJSON(key, c, { onlyIfNew: true });
  } else {
    // mantener al día la dirección y el nombre de la app
    const appName = clean(b.appName, 80);
    if ((url && url !== c.url) || (appName && appName !== c.appName)) { c.url = url || c.url; if (appName) c.appName = appName; c.visto = today(); await st.setJSON(key, c); }
  }
  const v = vista(c, aj);
  return json({ estado: bloquea(v.efectivo) ? 'suspendido' : 'activo', motivo: v.efectivo });
};

export const config = { path: '/api/estado' };
