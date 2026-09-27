import { db, usuario, PEDIDOS, REPS } from './firebase.js';
import {
  collection, doc, setDoc, updateDoc, onSnapshot, query, where,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import {
  L, $, crearMapa, icono, ajustar, calcularRuta, TIPOS, CONF, neto, aplicarTarifas, money, esc, toast,
  sha256, wa, tel10, gmaps, dist, fecha, esHoy, avisoSonoro,
} from './comun.js';

const PAGO_TXT = {
  efectivo: (p) => `Cobra ${money(p.precio)} en efectivo a quien envía al recoger.`,
  transferencia: (p) => `Quien envía te transfiere ${money(p.precio)}.`,
  recibe: (p) => `Cobra ${money(p.precio)} a quien recibe al entregar.`,
};

const S = { paso: 'cargando', rep: null, enLinea: false, pos: null, disp: [], mios: [], activo: null, fin: null, contra: {}, enviadas: {}, ocupado: false };
let uid = null, unDisp = null, unMios = null, rutaDe = null, ruta = null, ultPedido = 0, ultRep = 0, vistos = new Set();

// ---------- Mapa ----------
const mapa = crearMapa('mapa');
const capa = L.layerGroup().addTo(mapa);
let mkYo = null;

function dibujar(encuadrar = true) {
  capa.clearLayers();
  const pts = [];
  if (S.paso === 'activo' && S.activo) {
    const p = S.activo;
    if (ruta) L.polyline(ruta.coords, { color: '#0B3140', weight: 6, opacity: 0.85 }).addTo(capa);
    L.marker([p.origen.lat, p.origen.lng], { icon: icono('o') }).addTo(capa);
    L.marker([p.destino.lat, p.destino.lng], { icon: icono('d') }).addTo(capa);
    const meta = p.estado === 'asignado' ? p.origen : p.destino;
    pts.push([meta.lat, meta.lng]);
  } else if (S.enLinea) {
    S.disp.forEach((p) => { L.marker([p.origen.lat, p.origen.lng], { icon: icono('p') }).addTo(capa); pts.push([p.origen.lat, p.origen.lng]); });
  }
  if (S.pos) pts.push([S.pos.lat, S.pos.lng]);
  if (encuadrar) ajustar(mapa, pts);
}
function moverYo() {
  if (!S.pos) return;
  if (mkYo) mkYo.setLatLng([S.pos.lat, S.pos.lng]);
  else mkYo = L.marker([S.pos.lat, S.pos.lng], { icon: icono('yo'), zIndexOffset: 1000 }).addTo(mapa);
}

// GPS continuo: se usa para ordenar pedidos cercanos y para que el cliente vea al repartidor en vivo
function iniciarGPS() {
  if (!navigator.geolocation) return toast('Este celular no tiene GPS disponible.');
  navigator.geolocation.watchPosition((g) => {
    const primera = !S.pos;
    S.pos = { lat: g.coords.latitude, lng: g.coords.longitude };
    moverYo();
    if (primera) dibujar();
    const ahora = Date.now();
    if (S.activo && ahora - ultPedido > 8000) {
      ultPedido = ahora;
      updateDoc(doc(db, PEDIDOS, S.activo.id), { repPos: S.pos }).catch(() => {});
    }
    if (S.enLinea && ahora - ultRep > 30000) {
      ultRep = ahora;
      updateDoc(doc(db, REPS, uid), { pos: S.pos, visto: serverTimestamp() }).catch(() => {});
    }
  }, () => toast('Activa la ubicación para recibir envíos.'), { enableHighAccuracy: true, maximumAge: 5000 });
}

// ---------- Datos del repartidor ----------
const hoy = () => S.mios.filter((p) => p.estado === 'entregado' && esHoy(p.entregado));
const califProm = () => {
  const c = S.mios.filter((p) => p.calif);
  return c.length ? c.reduce((s, p) => s + p.calif, 0) / c.length : 5;
};
const repInfo = () => ({
  uid, nombre: S.rep.nombre, tel: S.rep.tel, vehiculo: S.rep.vehiculo, placas: S.rep.placas,
  calif: Math.round(califProm() * 10) / 10,
});

// ---------- Vistas ----------
function vRegistro() {
  const r = S.rep || {};
  return `<div class="grab"></div><h2>Regístrate como repartidor</h2>
  <p class="muted" style="margin-top:-6px">Estos datos los ve el cliente cuando aceptas un envío.</p>
  <input class="in" id="rNom" placeholder="Nombre completo" value="${esc(r.nombre || '')}">
  <input class="in" id="rTel" type="tel" inputmode="numeric" placeholder="WhatsApp (10 dígitos)" value="${esc(r.tel || '')}">
  <span class="lbl">¿En qué repartes?</span>
  <div class="chips">${Object.entries(TIPOS).map(([k, t]) => `<button class="chip" data-act="rTipo" data-v="${k}" aria-pressed="${(S.tipoReg || r.tipo) === k}">${t.ic} ${t.n}</button>`).join('')}</div>
  <input class="in" id="rVeh" placeholder="Marca, modelo y color (ej. Italika FT150 negra)" value="${esc(r.vehiculo || '')}">
  <input class="in" id="rPla" placeholder="Placas" value="${esc(r.placas || '')}">
  <button class="cta" data-act="registrar">Guardar y continuar</button>
  ${S.rep ? '<button class="ghost" data-act="volver">Volver</button>' : ''}`;
}

function vPanel() {
  const est = S.rep.estado || 'pendiente';
  if (est !== 'aprobado') {
    return `<div class="grab"></div>${est === 'bloqueado'
      ? '<h2>Cuenta suspendida</h2><p class="muted">Tu cuenta de repartidor está suspendida. Comunícate con Eco Drive para más información.</p>'
      : '<h2>Registro en revisión</h2><p class="muted">Eco Drive está revisando tus datos. En cuanto te aprueben podrás conectarte; esta pantalla se actualiza sola.</p>'}
      <button class="ghost" data-act="editar">Editar mis datos</button>`;
  }
  const h = hoy(), gan = h.reduce((s, p) => s + neto(p) + (p.propina || 0), 0);
  const lista = S.disp
    .map((p) => ({ ...p, lejos: S.pos ? dist(S.pos, p.origen) : null }))
    .sort((a, b) => (a.lejos ?? 99) - (b.lejos ?? 99));
  return `<div class="grab"></div>
  <div class="earn"><div><span class="muted">Hoy</span><b>${money(gan)}</b></div><div><span class="muted">Entregas</span><b>${h.length}</b></div><div><span class="muted">Calificación</span><b>★ ${califProm().toFixed(1)}</b></div></div>
  <button class="cta ${S.enLinea ? 'dark' : 'go'}" data-act="linea">${S.enLinea ? 'Desconectarme' : 'Conectarme'}</button>
  ${S.enLinea ? (lista.length ? lista.map(tarjeta).join('') : '<p class="row"><span class="pulse"></span><span>Conectado. Te avisamos cuando haya un envío cerca.</span></p>')
    : `<p class="muted">Solo recibes envíos de ${TIPOS[S.rep.tipo].n.toLowerCase()}. Comisión de la app: ${Math.round(CONF.comision * 100)}%.</p>`}`;
}

function tarjeta(p) {
  const c = S.contra[p.id] ?? p.precio + 10;
  const enviada = S.enviadas[p.id];
  return `<div class="card">
    <div class="row between"><span class="big" style="font-size:30px">${money(p.precio)}</span>
      <span class="muted" style="text-align:right">Ganas ${money(neto(p))}<br>${p.lejos != null ? p.lejos.toFixed(1) + ' km de ti · ' : ''}viaje ${p.km} km</span></div>
    <ul class="list" style="margin-top:4px">
      <li><div><span class="ico">🟢</span><span><b>${esc(p.origen.n)}</b><span class="muted">${esc(p.origen.dir)}</span></span></div></li>
      <li><div><span class="ico">🟨</span><span><b>${esc(p.destino.n)}</b><span class="muted">${esc(p.destino.dir)} · ${esc(p.item)}</span></span></div></li>
    </ul>
    <button class="cta go" data-act="aceptar" data-id="${p.id}" ${S.ocupado ? 'disabled' : ''}>Aceptar por ${money(p.precio)}</button>
    ${p.ofertaCliente ? `<div class="stepper" style="margin-top:10px">
      <button data-act="contra" data-id="${p.id}" data-v="-5" aria-label="Bajar 5 pesos">−</button>
      <button class="chip" style="height:auto;width:auto;border-radius:999px;font-size:15px" data-act="enviarContra" data-id="${p.id}">${enviada ? 'Enviada: ' + money(enviada) : 'Contraofertar ' + money(c)}</button>
      <button data-act="contra" data-id="${p.id}" data-v="5" aria-label="Subir 5 pesos">+</button></div>` : ''}
  </div>`;
}

function vActivo() {
  const p = S.activo, recoger = p.estado === 'asignado', meta = recoger ? p.origen : p.destino;
  const quien = recoger ? { n: 'quien envía', tel: p.remitente.tel } : { n: p.recibe.nombre, tel: p.recibe.tel };
  return `<div class="grab"></div><h2>${recoger ? 'Recoge el paquete' : 'Entrega el paquete'}</h2>
  <ul class="list" style="margin-top:-6px"><li><div><span class="ico">${recoger ? '🟢' : '🟨'}</span><span><b>${esc(meta.n)}</b><span class="muted">${esc(meta.dir)}</span></span></div></li></ul>
  <div class="acts">
    <a href="${gmaps(meta)}" target="_blank" rel="noopener"><span>🧭</span>Navegar</a>
    <a href="tel:${tel10(quien.tel)}"><span>📞</span>Llamar</a>
    <a href="${wa(quien.tel, recoger ? 'Hola, soy tu repartidor de Eco Drive. Voy por el paquete.' : `Hola ${p.recibe.nombre}, soy el repartidor de Eco Drive. Voy en camino con tu paquete.`)}" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a>
  </div>
  <p class="muted">${esc(p.item)} · ${PAGO_TXT[p.pago](p)}</p>
  ${recoger ? `<button class="cta" data-act="recogi" ${S.ocupado ? 'disabled' : ''}>Ya recogí el paquete</button>`
    : `<label class="lbl" for="pin">Código de entrega que te dice ${esc(p.recibe.nombre)}</label>
      <input class="in" id="pin" inputmode="numeric" maxlength="4" placeholder="4 dígitos" style="font-size:24px;letter-spacing:.3em;text-align:center">
      <button class="cta go" data-act="entregar" ${S.ocupado ? 'disabled' : ''}>Confirmar entrega</button>`}`;
}

function vFin() {
  const p = S.fin;
  return `<div class="grab"></div><h2>Entrega completada</h2>
  <div class="row between"><span class="muted">Ganaste en esta entrega</span><span class="big">${money(neto(p))}</span></div>
  <p class="muted">Comisión de la app: ${money(p.precio - neto(p))}. ${PAGO_TXT[p.pago](p)}</p>
  <button class="cta" data-act="seguir">${S.enLinea ? 'Seguir conectado' : 'Volver al inicio'}</button>`;
}

function render() {
  const v = { cargando: () => '<div class="grab"></div><p class="muted">Conectando…</p>', registro: vRegistro, panel: vPanel, activo: vActivo, fin: vFin }[S.paso];
  $('#sheet').innerHTML = v();
}

// ---------- Firestore ----------
function escucharMios() {
  unMios = onSnapshot(query(collection(db, PEDIDOS), where('repartidor.uid', '==', uid)), async (s) => {
    S.mios = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const act = S.mios.find((p) => ['asignado', 'recogido'].includes(p.estado)) || null;
    const antes = S.activo;
    S.activo = act;
    if (act) {
      if (!antes) { avisoSonoro(); toast('Envío asignado. Ve por el paquete.'); }
      if (rutaDe !== act.id) { rutaDe = act.id; ruta = await calcularRuta(act.origen, act.destino); }
      if (S.paso !== 'activo' || antes?.estado !== act.estado) { S.paso = 'activo'; render(); dibujar(); }
    } else if (antes && S.paso === 'activo') {
      const ahora = S.mios.find((p) => p.id === antes.id);
      if (ahora?.estado === 'cancelado') toast('El cliente canceló el envío.');
      S.paso = 'panel'; ruta = null; rutaDe = null; render(); dibujar();
    } else if (S.paso === 'panel') render();
  });
}

function conectar() {
  S.enLinea = true;
  updateDoc(doc(db, REPS, uid), { enLinea: true, pos: S.pos || null, visto: serverTimestamp() }).catch(() => {});
  unDisp = onSnapshot(query(collection(db, PEDIDOS), where('estado', '==', 'buscando')), (s) => {
    S.disp = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.tipo === S.rep.tipo);
    const nuevos = S.disp.filter((p) => !vistos.has(p.id));
    nuevos.forEach((p) => vistos.add(p.id));
    if (nuevos.length && S.paso === 'panel') { avisoSonoro(); toast('Nuevo envío disponible'); }
    if (S.paso === 'panel') { render(); dibujar(false); }
  });
}
function desconectar() {
  S.enLinea = false; unDisp?.(); unDisp = null; S.disp = [];
  updateDoc(doc(db, REPS, uid), { enLinea: false }).catch(() => {});
}

async function aceptar(id) {
  S.ocupado = true; render();
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, PEDIDOS, id), s = await tx.get(ref);
      if (!s.exists() || s.data().estado !== 'buscando') throw new Error('ocupado');
      tx.update(ref, { estado: 'asignado', repartidor: repInfo(), repPos: S.pos || null, actualizado: serverTimestamp() });
    });
  } catch { toast('Otro repartidor tomó este envío.'); }
  S.ocupado = false; render();
}

async function enviarContra(id) {
  const p = S.disp.find((x) => x.id === id); if (!p) return;
  const monto = S.contra[id] ?? p.precio + 10;
  try {
    await setDoc(doc(db, PEDIDOS, id, 'ofertas', uid), { rep: repInfo(), precio: monto, creado: serverTimestamp() });
    S.enviadas[id] = monto; toast('Contraoferta enviada. Si la acepta, te llega aquí.');
  } catch { toast('No se pudo enviar la contraoferta.'); }
  render();
}

async function recogi() {
  S.ocupado = true; render();
  await updateDoc(doc(db, PEDIDOS, S.activo.id), { estado: 'recogido', recogido: serverTimestamp(), actualizado: serverTimestamp() })
    .catch(() => toast('No se pudo actualizar. Revisa tu conexión.'));
  S.ocupado = false;
  render();
}

async function entregar() {
  const pin = ($('#pin')?.value || '').trim();
  if (!/^\d{4}$/.test(pin)) return toast('Escribe el código de 4 dígitos.');
  if (await sha256(pin) !== S.activo.pinHash) return toast('El código no coincide. Pídelo de nuevo a quien recibe.');
  S.ocupado = true; render();
  const p = S.activo;
  try {
    await updateDoc(doc(db, PEDIDOS, p.id), { estado: 'entregado', entregado: serverTimestamp(), actualizado: serverTimestamp() });
    S.fin = p; S.paso = 'fin'; S.activo = null; ruta = null; rutaDe = null;
  } catch { toast('No se pudo confirmar. Revisa tu conexión.'); }
  S.ocupado = false; render(); dibujar();
}

async function registrar() {
  const nombre = $('#rNom').value.trim(), tel = tel10($('#rTel').value), tipo = S.tipoReg || S.rep?.tipo;
  const vehiculo = $('#rVeh').value.trim(), placas = $('#rPla').value.trim().toUpperCase();
  if (!nombre || tel.length < 10 || !tipo || !vehiculo || !placas) return toast('Completa todos los datos.');
  const datos = { nombre, tel, tipo, vehiculo, placas, enLinea: false, actualizado: serverTimestamp() };
  if (!S.rep) { datos.creado = serverTimestamp(); datos.estado = 'pendiente'; }
  try {
    await setDoc(doc(db, REPS, uid), datos, { merge: true });
    S.rep = { ...S.rep, ...datos }; S.paso = 'panel'; render();
    escucharPerfil();
    if (!unMios) escucharMios();
  } catch (err) { console.error(err); toast(err?.code === 'permission-denied' ? 'Firebase no dio permiso para guardar. Revisa las reglas de Firestore.' : 'No se pudo guardar. Revisa tu conexión.'); }
}

function abrirHistorial() {
  const l = S.mios.filter((p) => p.estado === 'entregado').sort((a, b) => (b.entregado?.seconds || 0) - (a.entregado?.seconds || 0));
  $('#msheet').innerHTML = `<div class="grab"></div><h2>Entregas realizadas</h2>
  ${l.length ? `<ul class="list">${l.map((p) => `<li><div><span class="ico">${TIPOS[p.tipo].ic}</span><span style="flex:1"><b>${esc(p.destino.n)}</b>
    <span class="muted">${fecha(p.entregado)}${p.calif ? ' · ★ ' + p.calif : ''}${p.propina ? ' · propina ' + money(p.propina) : ''}</span></span><b>${money(neto(p))}</b></div></li>`).join('')}</ul>`
    : '<p class="muted">Aún no tienes entregas. Conéctate para recibir la primera.</p>'}
  ${S.rep ? '<button class="ghost" data-act="editar">Editar mis datos</button>' : ''}
  <button class="cta dark" data-act="cerrar">Cerrar</button>`;
  $('#modal').classList.add('open');
}

// ---------- Acciones ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  switch (a) {
    case 'rTipo': S.tipoReg = b.dataset.v; b.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c === b)); return;
    case 'registrar': registrar(); return;
    case 'volver': S.paso = 'panel'; render(); return;
    case 'linea': S.enLinea ? desconectar() : conectar(); render(); dibujar(); return;
    case 'aceptar': aceptar(id); return;
    case 'contra': { const p = S.disp.find((x) => x.id === id); S.contra[id] = Math.max(p.precio, (S.contra[id] ?? p.precio + 10) + +b.dataset.v); render(); return; }
    case 'enviarContra': enviarContra(id); return;
    case 'recogi': recogi(); return;
    case 'entregar': entregar(); return;
    case 'seguir': S.fin = null; S.paso = 'panel'; render(); dibujar(); return;
    case 'hist': abrirHistorial(); return;
    case 'editar': $('#modal').classList.remove('open'); if (S.paso !== 'activo') { S.paso = 'registro'; render(); } return;
    case 'cerrar': $('#modal').classList.remove('open'); return;
    default:
  }
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });
window.addEventListener('beforeunload', () => { if (S.enLinea) updateDoc(doc(db, REPS, uid), { enLinea: false }).catch(() => {}); });

// ---------- Inicio ----------
(async () => {
  render();
  try { uid = await usuario(); }
  catch (err) { console.error(err); $('#sheet').innerHTML = '<div class="grab"></div><h2>Sin conexión</h2><p class="muted">No se pudo conectar. Revisa tu internet y recarga la página.</p>'; return; }
  iniciarGPS();
  onSnapshot(doc(db, 'ecodrive_config', 'tarifas'), (s) => { if (s.exists()) { aplicarTarifas(s.data()); if (S.paso === 'panel') render(); } }, () => {});
  escucharPerfil();
})();

// Perfil del repartidor en vivo: así ve al instante cuando el administrador lo aprueba o suspende
let unPerfil = null;
function escucharPerfil() {
  if (unPerfil) return;
  unPerfil = onSnapshot(doc(db, REPS, uid), (s) => {
    if (!s.exists()) { if (S.paso === 'cargando') { S.paso = 'registro'; render(); } return; }
    const antes = S.rep?.estado;
    S.rep = s.data();
    if (S.rep.estado !== 'aprobado' && S.enLinea) desconectar();
    if (antes && antes !== 'aprobado' && S.rep.estado === 'aprobado') { avisoSonoro(); toast('¡Tu cuenta fue aprobada! Ya puedes conectarte.'); }
    if (S.paso === 'cargando') { S.paso = 'panel'; if (!unMios) escucharMios(); }
    if (S.paso === 'panel') render();
  });
}
