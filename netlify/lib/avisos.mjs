// Avisos al teléfono de la proveedora (notificaciones push de la consola).
import webpush from 'web-push';
import { store } from './consola.mjs';

export async function claves(st = store()) {
  let k = await st.get('vapid', { type: 'json' });
  if (!k || !k.publicKey || !k.privateKey) { k = webpush.generateVAPIDKeys(); await st.setJSON('vapid', k); }
  return k;
}
export async function subId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
// Envía un aviso a todos los teléfonos donde activaste los avisos de la consola
export async function avisar(payload, st = store()) {
  if (globalThis.__consolaAvisos) return globalThis.__consolaAvisos(payload);  // pruebas locales
  const k = await claves(st);
  const site = process.env.URL || 'https://migym-consola.netlify.app';
  webpush.setVapidDetails(site.startsWith('https://') ? site : 'mailto:avisos@example.com', k.publicKey, k.privateKey);
  const { blobs } = await st.list({ prefix: 'avisos/' });
  let enviados = 0;
  for (const { key } of blobs) {
    const sub = await st.get(key, { type: 'json' });
    if (!sub) continue;
    try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400 }); enviados++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await st.delete(key); else console.warn('Aviso no enviado:', e && e.statusCode); }
  }
  return enviados;
}
