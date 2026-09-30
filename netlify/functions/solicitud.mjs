// Solicitudes de entrenadoras que quieren su app (llegan desde la página de registro de TU app,
// servidor a servidor: la persona nunca ve la dirección de la consola).
//   POST /api/solicitud  {site:{id,url}, datos:{nombre, negocio, correo, whatsapp, plan, mensaje}}
import { store, json, err, idFor } from '../lib/consola.mjs';
import { avisar } from '../lib/avisos.mjs';

const s = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
const MAX_HORA = 30;

export default async (req) => {
  if (req.method !== 'POST') return err(405, 'Método no permitido');
  let b; try { b = await req.json(); } catch { return err(400, 'Datos inválidos'); }
  const st = store(), site = (b && b.site) || {};
  // solo se aceptan solicitudes que vienen de TU propia app (marcada como "Es mi propia app")
  const cliente = typeof site.id === 'string' && /^[a-z0-9-]{6,80}$/i.test(site.id) ? await st.get(`clientes/${await idFor(site.id)}`, { type: 'json' }) : null;
  if (!cliente || !cliente.propia) return err(403, 'Registro no disponible en esta app.');
  const d = (b && b.datos) || {};
  const datos = { nombre: s(d.nombre, 80), negocio: s(d.negocio, 80), correo: s(d.correo, 120).toLowerCase(), whatsapp: s(d.whatsapp, 30).replace(/[^\d+]/g, ''),
    plan: d.plan === 'personal' ? 'personal' : 'pro', mensaje: typeof d.mensaje === 'string' ? d.mensaje.trim().slice(0, 1000) : '' };
  if (datos.nombre.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) return err(400, 'Revisa tu nombre y tu correo.');
  // límite de envíos por hora (evita abusos)
  const hora = new Date().toISOString().slice(0, 13), lim = (await st.get('limite-solicitudes', { type: 'json' })) || {};
  if (lim.hora === hora && lim.n >= MAX_HORA) return err(429, 'Demasiadas solicitudes. Intenta más tarde.');
  await st.setJSON('limite-solicitudes', { hora, n: lim.hora === hora ? (lim.n || 0) + 1 : 1 });
  // si la misma persona ya la envió en las últimas 24 h, se actualiza en lugar de duplicarse
  const { blobs } = await st.list({ prefix: 'solicitudes/' });
  for (const { key } of blobs) {
    const x = await st.get(key, { type: 'json' });
    if (x && x.correo === datos.correo && Date.now() - Date.parse(x.fecha) < 864e5) {
      // solo se actualiza lo que sí escribió esta vez (no se borra lo que ya estaba)
      for (const [k, v] of Object.entries(datos)) if (v && (k !== 'plan' || d.plan)) x[k] = v;
      x.actualizada = new Date().toISOString(); await st.setJSON(key, x);
      return json({ ok: true, repetida: true });
    }
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), v => v.toString(16).padStart(2, '0')).join('');
  const sol = { id, ...datos, fecha: new Date().toISOString(), estado: 'nueva', origen: s(site.url, 200) };
  await st.setJSON(`solicitudes/${id}`, sol);
  try { await avisar({ title: 'Nueva entrenadora', body: `${datos.nombre}${datos.negocio ? ' · ' + datos.negocio : ''} quiere su app`, url: `/#/s/${id}` }, st); } catch (e) { console.warn('Aviso:', e && e.message); }
  return json({ ok: true });
};

export const config = { path: '/api/solicitud' };
