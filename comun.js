import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './estilos.css';

export { L };
// Valores por defecto. El panel de administrador los sobrescribe desde Firestore (ecodrive_config/tarifas).
export const CONF = { comision: 0.10 };
// Envío económico (ruta compartida): descuento al cliente y pago fijo al repartidor por paquete
export const ECO = { descuento: 0.35, pagoRep: 20, minimo: 25 };
export const VENTANAS = { m: '11 AM – 2 PM', t: '4 – 7 PM' };

export const TIPOS = {
  moto: { n: 'Moto', d: 'Sobres y paquetes chicos, hasta 10 kg', ic: '🏍️', base: 25, km: 6, min: 0.8, minimo: 35 },
  auto: { n: 'Vehículo', d: 'Cajas y paquetes medianos, hasta 50 kg', ic: '🚗', base: 35, km: 8.5, min: 1.2, minimo: 50 },
};
export function aplicarTarifas(d) {
  if (!d) return;
  ['moto', 'auto'].forEach((k) => {
    const x = d[k]; if (!x) return;
    ['base', 'km', 'min', 'minimo'].forEach((c) => { if (typeof x[c] === 'number' && x[c] >= 0) TIPOS[k][c] = x[c]; });
  });
  if (typeof d.comision === 'number' && d.comision >= 0 && d.comision < 1) CONF.comision = d.comision;
  const e = d.eco;
  if (e) {
    if (typeof e.descuento === 'number' && e.descuento >= 0 && e.descuento < 0.9) ECO.descuento = e.descuento;
    if (typeof e.pagoRep === 'number' && e.pagoRep >= 0) ECO.pagoRep = e.pagoRep;
    if (typeof e.minimo === 'number' && e.minimo >= 0) ECO.minimo = e.minimo;
  }
}
// Lo que recibe el repartidor por un envío (usa la comisión guardada en el pedido)
// En envíos económicos el repartidor gana un monto fijo por paquete (pagoRep, guardado en el pedido)
export const neto = (p) => (p.modo === 'economico' && typeof p.pagoRep === 'number' ? p.pagoRep : (p.precio || 0) * (1 - (p.comision ?? CONF.comision)));
export const precio = (t, km, min) => {
  const x = TIPOS[t];
  return Math.max(x.minimo, Math.round((x.base + km * x.km + min * x.min) / 5) * 5);
};

// Precio del modo económico: el precio normal menos el descuento, redondeado a $5, con mínimo propio
export const precioEco = (t, km, min) => Math.max(ECO.minimo, Math.round((precio(t, km, min) * (1 - ECO.descuento)) / 5) * 5);

// Accesos rápidos (coordenadas aproximadas)
export const LUGARES = [
  { n: 'Centro de Altamira', dir: 'Altamira, Tamaulipas', lat: 22.3930, lng: -97.9414 },
  { n: 'Aeropuerto de Tampico', dir: 'Tampico, Tamaulipas', lat: 22.2964, lng: -97.8659 },
  { n: 'Centro de Ciudad Madero', dir: 'Ciudad Madero, Tamaulipas', lat: 22.2759, lng: -97.8335 },
  { n: 'Playa Miramar', dir: 'Ciudad Madero, Tamaulipas', lat: 22.2770, lng: -97.7985 },
  { n: 'Plaza de Armas de Tampico', dir: 'Centro, Tampico', lat: 22.2163, lng: -97.8578 },
];

export const $ = (s) => document.querySelector(s);
export const money = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const tel10 = (t) => String(t || '').replace(/\D/g, '').slice(-10);
export const wa = (tel, txt) => `https://wa.me/52${tel10(tel)}?text=${encodeURIComponent(txt)}`;
export const gmaps = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;

export function toast(t) {
  const e = $('#toast');
  e.textContent = t;
  e.classList.add('show');
  clearTimeout(e._t);
  e._t = setTimeout(() => e.classList.remove('show'), 2800);
}

export async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export function dist(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const corto = (s) => String(s).split(',').slice(0, 3).join(',').trim();

// Búsqueda de direcciones (OpenStreetMap / Nominatim), limitada a la Zona Conurbada
export async function buscarLugar(q) {
  const t = q.trim().toLowerCase();
  const locales = LUGARES.filter((p) => !t || (p.n + ' ' + p.dir).toLowerCase().includes(t));
  if (t.length < 3) return locales;
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=mx&accept-language=es'
      + '&viewbox=-98.05,22.55,-97.72,22.12&bounded=1&q=' + encodeURIComponent(q);
    const j = await (await fetch(url)).json();
    return [...locales, ...j.map((x) => ({ lat: +x.lat, lng: +x.lon, n: x.name || corto(x.display_name), dir: corto(x.display_name) }))];
  } catch {
    return locales;
  }
}

export async function direccionDe(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&lat=${lat}&lon=${lng}`;
    const j = await (await fetch(url)).json();
    const a = j.address || {};
    const n = a.road ? a.road + (a.house_number ? ' ' + a.house_number : '') : corto(j.display_name);
    return { lat, lng, n, dir: [a.suburb || a.neighbourhood, a.city || a.town].filter(Boolean).join(', ') || corto(j.display_name) };
  } catch {
    return { lat, lng, n: 'Punto en el mapa', dir: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
  }
}

// Ruta por calles (OSRM). Si falla, estima en línea recta.
export async function calcularRuta(a, b) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const j = await (await fetch(url)).json();
    const r = j.routes[0];
    return { km: r.distance / 1000, min: Math.max(3, Math.round(r.duration / 60)), coords: r.geometry.coordinates.map(([x, y]) => [y, x]) };
  } catch {
    const km = dist(a, b) * 1.35;
    return { km, min: Math.round(km * 2.2 + 3), coords: [[a.lat, a.lng], [b.lat, b.lng]] };
  }
}

export function miPosicion() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Este celular no tiene GPS disponible'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      rej,
      { enableHighAccuracy: true, timeout: 12000 },
    );
  });
}

export function crearMapa(id) {
  const m = L.map(id, { zoomControl: false }).setView([22.30, -97.87], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(m);
  m.attributionControl.setPosition('topright');
  return m;
}

export const icono = (cls, html = '') => L.divIcon({ className: '', html: `<div class="mk ${cls}">${html}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

// Encuadra puntos dejando libre el espacio de la hoja inferior
export function ajustar(m, pts) {
  if (!pts.length) return;
  const sh = document.getElementById('sheet')?.offsetHeight || 0;
  let b = pts;
  if (pts.length === 1) { const [la, ln] = pts[0]; b = [[la - 0.005, ln - 0.005], [la + 0.005, ln + 0.005]]; }
  m.fitBounds(b, { paddingTopLeft: [40, 90], paddingBottomRight: [40, sh + 30], maxZoom: 16 });
}

export function avisoSonoro() {
  try {
    navigator.vibrate?.([250, 120, 250]);
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.25, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
    o.start(); o.stop(c.currentTime + 0.6);
  } catch { /* sin audio */ }
}

export const fecha = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};
export const esHoy = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return !!d && d.toDateString() === new Date().toDateString();
};
