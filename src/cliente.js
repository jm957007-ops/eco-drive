import { db, usuario, PEDIDOS } from './firebase.js';
import {
  collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp,
  query, where, getDocs, runTransaction,
} from 'firebase/firestore';
import {
  L, $, crearMapa, icono, ajustar, buscarLugar, direccionDe, calcularRuta, miPosicion,
  TIPOS, precio, money, esc, toast, sha256, lsGet, lsSet, wa, tel10, fecha,
} from './comun.js';

const ITEMS = ['📄 Documentos', '🍱 Comida', '👕 Ropa', '📱 Electrónico', '📦 Otro'];
const PAGOS = [['efectivo', '💵 Efectivo'], ['transferencia', '🏦 Transferencia'], ['recibe', '🤝 Paga quien recibe']];
const SEGUIR = new URLSearchParams(location.search).get('seguir'); // enlace de rastreo para quien recibe

const S = {
  paso: 'cargando', campo: 'destino', origen: null, destino: null, sug: [], ruta: null,
  tipo: 'moto', item: '', remitente: lsGet('ed_tel', ''), nombre: '', tel: '', pago: 'efectivo',
  ofertaOn: false, oferta: 0, id: null, p: null, ofertas: [], calif: 5, propina: 0, nota: '', enviando: false,
};
let uid = null, unP = null, unO = null, tBuscar = null, rutaDe = null;
const pins = lsGet('ed_pins', {});

// ---------- Mapa ----------
const mapa = crearMapa('mapa');
const capa = L.layerGroup().addTo(mapa);
let mkRep = null;

function dibujar(encuadrar = true) {
  capa.clearLayers(); mkRep = null;
  const o = S.p ? S.p.origen : S.origen, d = S.p ? S.p.destino : S.destino, pts = [];
  if (S.ruta) L.polyline(S.ruta.coords, { color: '#0B3140', weight: 6, opacity: 0.85 }).addTo(capa);
  if (o) { L.marker([o.lat, o.lng], { icon: icono('o') }).addTo(capa); pts.push([o.lat, o.lng]); }
  if (d) { L.marker([d.lat, d.lng], { icon: icono('d') }).addTo(capa); pts.push([d.lat, d.lng]); }
  moverRep();
  if (S.p?.repPos) pts.push([S.p.repPos.lat, S.p.repPos.lng]);
  if (encuadrar) ajustar(mapa, pts);
}
function moverRep() {
  const r = S.p?.repPos;
  if (!r || !['asignado', 'recogido'].includes(S.p.estado)) return;
  if (mkRep) mkRep.setLatLng([r.lat, r.lng]);
  else mkRep = L.marker([r.lat, r.lng], { icon: icono('r', S.p.tipo === 'moto' ? '🏍️' : '🚗'), zIndexOffset: 1000 }).addTo(capa);
}

mapa.on('click', async (e) => {
  if (S.paso !== 'inicio') return;
  const p = await direccionDe(e.latlng.lat, e.latlng.lng);
  elegirPunto(p);
});

// ---------- Vistas ----------
const repCard = (r) => `<div class="row"><div class="avatar">${esc(r.nombre.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</div>
  <div style="flex:1"><b style="font-size:18px">${esc(r.nombre)}</b><br><span class="muted">★ ${Number(r.calif || 5).toFixed(1)} · ${esc(r.vehiculo)}</span></div>
  <span class="plate">${esc(r.placas)}</span></div>`;

function vInicio() {
  return `<div class="grab"></div><h2>Envía un paquete</h2>
  <div class="fields">
    <div class="field"><span class="dot"></span><input id="fo" data-campo="origen" autocomplete="off" placeholder="¿Dónde se recoge?" value="${esc(S.origen?.n || '')}">
      <button class="mini" data-act="gps" aria-label="Usar mi ubicación">📍</button></div>
    <div class="field"><span class="sqd"></span><input id="fd" data-campo="destino" autocomplete="off" placeholder="¿A dónde lo mandamos?" value="${esc(S.destino?.n || '')}"></div>
  </div>
  <p class="muted small">Escribe calle y colonia, o toca el mapa para marcar el punto.</p>
  <ul class="list" id="sug"></ul>`;
}
function listaSug() {
  const e = $('#sug'); if (!e) return;
  e.innerHTML = S.sug.map((p, i) => `<li><button data-act="elegir" data-i="${i}"><span class="ico">${S.campo === 'origen' ? '🟢' : '📍'}</span>
    <span><b>${esc(p.n)}</b><span class="muted">${esc(p.dir)}</span></span></button></li>`).join('')
    || '<li class="muted" style="padding:10px 0">Sin resultados. Agrega la colonia o la ciudad.</li>';
}

function vOpciones() {
  const r = S.ruta, base = precio(S.tipo, r.km, r.min);
  return `<div class="grab"></div>
  <div class="row between"><h2 style="margin:0">¿En qué lo mandamos?</h2><span class="muted">${r.km.toFixed(1)} km · ${r.min} min</span></div>
  <div class="veh">${Object.entries(TIPOS).map(([k, t]) => `<button data-act="tipo" data-v="${k}" aria-pressed="${k === S.tipo}">
    <span class="em">${t.ic}</span><span class="mid"><b>${t.n}</b><span class="muted">${t.d}</span></span><span class="pr">${money(precio(k, r.km, r.min))}</span></button>`).join('')}</div>
  <span class="lbl">¿Qué envías?</span>
  <div class="chips">${ITEMS.map((c) => `<button class="chip" data-act="item" data-v="${c}" aria-pressed="${S.item === c}">${c}</button>`).join('')}</div>
  <label class="lbl" for="iRem">Tu WhatsApp (para que el repartidor te contacte)</label>
  <input class="in" id="iRem" type="tel" inputmode="numeric" placeholder="10 dígitos" value="${esc(S.remitente)}">
  <label class="lbl" for="iNom">¿Quién recibe?</label>
  <input class="in" id="iNom" type="text" placeholder="Nombre" value="${esc(S.nombre)}">
  <input class="in" id="iTel" type="tel" inputmode="numeric" placeholder="WhatsApp de quien recibe (10 dígitos)" value="${esc(S.tel)}">
  <div class="offerbox">
    <div class="row between"><span><b>Ofrece tu precio</b><br><span class="muted">Los repartidores aceptan o contraofertan</span></span>
    <button class="chip" data-act="ofertaOn" aria-pressed="${S.ofertaOn}">${S.ofertaOn ? 'Activado' : 'Activar'}</button></div>
    ${S.ofertaOn ? `<div class="stepper"><button data-act="oferta" data-v="-5" aria-label="Bajar 5 pesos">−</button><output>${money(S.oferta)}</output>
    <button data-act="oferta" data-v="5" aria-label="Subir 5 pesos">+</button></div>
    <div class="muted" style="text-align:center">Sugerido ${money(base)} · mínimo ${money(minOferta())}</div>` : ''}
  </div>
  <span class="lbl">Pago</span>
  <div class="chips">${PAGOS.map(([k, l]) => `<button class="chip" data-act="pago" data-v="${k}" aria-pressed="${S.pago === k}">${l}</button>`).join('')}</div>
  <button class="cta" data-act="pedir" ${S.enviando ? 'disabled' : ''}>${S.ofertaOn ? 'Buscar repartidor con ' + money(S.oferta) : 'Enviar en ' + TIPOS[S.tipo].n + ' · ' + money(base)}</button>
  <button class="ghost" data-act="cambiar">Cambiar direcciones</button>`;
}
const minOferta = () => Math.round(precio(S.tipo, S.ruta.km, S.ruta.min) * 0.8 / 5) * 5;

function vBuscando() {
  const p = S.p;
  return `<div class="grab"></div><div class="row"><span class="pulse"></span><h2 style="margin:0">Buscando repartidor</h2></div>
  <p class="muted">${TIPOS[p.tipo].n} · ${money(p.precio)} · ${p.ofertaCliente ? 'Los repartidores pueden contraofertar.' : 'Te avisamos en cuanto alguien acepte.'}</p>
  ${p.ofertaCliente ? `<div id="ofertas">${S.ofertas.length ? S.ofertas.map((o, i) => `<div class="card row">
    <div style="flex:1">${repCard(o.rep)}</div></div>
    <div class="row between" style="padding:6px 4px 0"><span class="big" style="font-size:26px">${money(o.precio)}</span>
    <button class="cta go" style="width:auto;margin:0;padding:10px 18px;font-size:16px" data-act="tomarOferta" data-i="${i}">Aceptar</button></div>`).join('')
    : '<p class="muted">Aún no hay respuestas.</p>'}</div>` : ''}
  <button class="ghost" data-act="subir" style="color:var(--ink)">Subir a ${money(p.precio + 10)} para encontrar más rápido</button>
  <button class="ghost" data-act="cancelar">Cancelar envío</button>`;
}

function textoAviso() {
  const p = S.p, r = p.repartidor, pin = pins[S.id];
  const link = `${location.origin}${location.pathname}?seguir=${S.id}`;
  return `Hola ${p.recibe.nombre}, te mandé un paquete por Eco Drive a ${p.destino.n}.`
    + (r ? ` Lo lleva ${r.nombre} (${r.vehiculo}, placas ${r.placas}).` : '')
    + (pin ? ` Código de entrega: ${pin}. Dáselo al repartidor solo cuando tengas el paquete en tus manos.` : '')
    + ` Síguelo en vivo aquí: ${link}`;
}

function vEnCurso() {
  const p = S.p, r = p.repartidor, pin = pins[S.id];
  const titulo = p.estado === 'asignado' ? `${esc(r.nombre.split(' ')[0])} va por tu paquete` : 'Tu paquete va en camino';
  return `<div class="grab"></div><h2>${titulo}</h2>${repCard(r)}
  ${pin ? `<div class="muted" style="margin-top:12px">Código de entrega: compártelo con ${esc(p.recibe.nombre)}</div>
    <div class="pin">${pin.split('').map((c) => `<span>${c}</span>`).join('')}</div>`
    : '<p class="muted">El código de entrega está en el celular donde se pidió el envío.</p>'}
  <div class="acts">
    <a href="tel:${tel10(r.tel)}"><span>📞</span>Llamar</a>
    <a href="${wa(p.recibe.tel, textoAviso())}" target="_blank" rel="noopener"><span>📤</span>Avisar a quien recibe</a>
    ${p.estado === 'asignado' ? '<button data-act="cancelar"><span>✕</span>Cancelar</button>' : `<a href="${wa(r.tel, 'Hola, soy quien envió el paquete de Eco Drive.')}" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a>`}
  </div>
  <p class="muted small">Pago: ${PAGOS.find(([k]) => k === p.pago)?.[1] || ''} · ${money(p.precio)}</p>`;
}

function vEntregado() {
  const p = S.p;
  return `<div class="grab"></div><h2>Paquete entregado</h2>
  <p class="muted" style="margin-top:-6px">${esc(p.recibe.nombre)} lo recibió en ${esc(p.destino.n)} y confirmó con el código.</p>
  <div class="row between"><span class="muted">Total</span><span class="big">${money(p.precio + S.propina)}</span></div>
  <p style="text-align:center;margin:14px 0 0"><b>¿Cómo estuvo el servicio de ${esc(p.repartidor.nombre.split(' ')[0])}?</b></p>
  <div class="stars">${[1, 2, 3, 4, 5].map((i) => `<button data-act="calif" data-v="${i}" class="${i <= S.calif ? 'on' : ''}" aria-label="${i} estrellas">★</button>`).join('')}</div>
  <div class="chips" style="justify-content:center">${(S.calif >= 4 ? ['Puntual', 'Cuidó el paquete', 'Buena atención', 'Muy rápido'] : ['Llegó tarde', 'Paquete dañado', 'Mala atención', 'Tardó en recoger'])
    .map((c) => `<button class="chip" data-act="nota" data-v="${c}" aria-pressed="${S.nota === c}">${c}</button>`).join('')}</div>
  <span class="lbl">Propina, 100% para el repartidor</span>
  <div class="chips">${[0, 10, 20, 30].map((n) => `<button class="chip" data-act="propina" data-v="${n}" aria-pressed="${S.propina === n}">${n ? money(n) : 'Sin propina'}</button>`).join('')}</div>
  <button class="cta" data-act="calificar">Enviar calificación</button>`;
}

function vSeguimiento() {
  const p = S.p;
  if (!p) return '<div class="grab"></div><h2>Buscando tu envío…</h2>';
  const txt = { buscando: 'Buscando repartidor para tu paquete', asignado: 'El repartidor va a recoger tu paquete', recogido: 'Tu paquete va en camino', entregado: 'Paquete entregado', cancelado: 'Este envío fue cancelado' }[p.estado];
  return `<div class="grab"></div><h2>${txt}</h2>
  <p class="muted" style="margin-top:-6px">Para ${esc(p.recibe.nombre)} · ${esc(p.destino.n)}</p>
  ${p.repartidor && p.estado !== 'cancelado' ? repCard(p.repartidor) : ''}
  ${p.estado === 'recogido' ? `<p class="muted">Cuando llegue, revisa el paquete y dale el código de entrega que te mandaron por WhatsApp.</p>
    <div class="acts"><a href="tel:${tel10(p.repartidor.tel)}"><span>📞</span>Llamar</a><a href="${wa(p.repartidor.tel, 'Hola, soy quien recibe el paquete de Eco Drive.')}" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a></div>` : ''}
  ${p.estado === 'recogido' && p.pago === 'recibe' ? `<p><b>Ten listo ${money(p.precio)} para pagar el envío.</b></p>` : ''}`;
}

function render() {
  const v = SEGUIR ? vSeguimiento
    : ({ cargando: () => '<div class="grab"></div><p class="muted">Conectando…</p>', inicio: vInicio, opciones: vOpciones, buscando: vBuscando, asignado: vEnCurso, recogido: vEnCurso, entregado: vEntregado })[S.paso];
  $('#sheet').innerHTML = v();
  if (S.paso === 'inicio' && !SEGUIR) listaSug();
}

// ---------- Selección de direcciones ----------
function elegirPunto(p) {
  S[S.campo] = p;
  if (S.campo === 'origen' && !S.destino) S.campo = 'destino';
  else if (S.campo === 'destino' && !S.origen) S.campo = 'origen';
  S.sug = [];
  dibujar();
  if (S.origen && S.destino) return preparar();
  render();
  $(S.campo === 'origen' ? '#fo' : '#fd')?.focus();
}
async function preparar() {
  toast('Calculando ruta…');
  S.ruta = await calcularRuta(S.origen, S.destino);
  S.oferta = precio(S.tipo, S.ruta.km, S.ruta.min);
  S.paso = 'opciones';
  render(); dibujar();
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.campo) {
    S.campo = t.dataset.campo;
    S[S.campo] = null;
    clearTimeout(tBuscar);
    tBuscar = setTimeout(async () => { S.sug = await buscarLugar(t.value); listaSug(); }, 450);
  }
  if (t.id === 'iRem') { S.remitente = t.value; lsSet('ed_tel', t.value); }
  if (t.id === 'iNom') S.nombre = t.value;
  if (t.id === 'iTel') S.tel = t.value;
});
document.addEventListener('focusin', async (e) => {
  const t = e.target;
  if (t.dataset?.campo && S.paso === 'inicio') {
    S.campo = t.dataset.campo;
    S.sug = await buscarLugar(t.value || '');
    listaSug();
  }
});

// ---------- Firestore ----------
function seguir(id) {
  unP?.(); unO?.(); unO = null;
  S.id = id;
  unP = onSnapshot(doc(db, PEDIDOS, id), async (snap) => {
    if (!snap.exists()) { terminar(); return; }
    const antes = S.p?.estado;
    S.p = snap.data();
    const e = S.p.estado;

    if (!SEGUIR) {
      if (e === 'cancelado') { if (antes && antes !== 'cancelado') toast('El envío fue cancelado.'); terminar(); return; }
      if (e === 'entregado' && S.p.calificado) { terminar(); return; }
      S.paso = e;
      if (e === 'buscando' && S.p.ofertaCliente && !unO) {
        unO = onSnapshot(collection(db, PEDIDOS, id, 'ofertas'), (s) => {
          S.ofertas = s.docs.map((d) => d.data()).sort((a, b) => a.precio - b.precio);
          if (S.paso === 'buscando') render();
        });
      }
      if (e !== 'buscando' && unO) { unO(); unO = null; }
      if (antes === 'buscando' && e === 'asignado') toast(`${S.p.repartidor.nombre.split(' ')[0]} aceptó tu envío`);
    }
    if (rutaDe !== id) { rutaDe = id; S.ruta = await calcularRuta(S.p.origen, S.p.destino); }
    if (antes !== e) { render(); dibujar(); } else { moverRep(); if (e === 'buscando') render(); }
  }, () => toast('No se pudo leer el envío. Revisa tu conexión.'));
}

function terminar() {
  unP?.(); unO?.(); unP = unO = null;
  lsSet('ed_activo', null);
  Object.assign(S, { paso: 'inicio', campo: 'destino', destino: null, ruta: null, p: null, id: null, ofertas: [], ofertaOn: false, calif: 5, propina: 0, nota: '', nombre: '', tel: '', item: '' });
  rutaDe = null;
  render(); dibujar();
}

async function pedir() {
  if (tel10(S.remitente).length < 10) return toast('Escribe tu WhatsApp a 10 dígitos.');
  if (!S.nombre.trim()) return toast('Escribe el nombre de quien recibe.');
  if (tel10(S.tel).length < 10) return toast('Escribe el WhatsApp de quien recibe a 10 dígitos.');
  S.enviando = true; render();
  try {
    const base = precio(S.tipo, S.ruta.km, S.ruta.min);
    const pin = String(1000 + Math.floor(Math.random() * 9000));
    const lim = (p) => ({ lat: p.lat, lng: p.lng, n: p.n, dir: p.dir || '' });
    const ref = await addDoc(collection(db, PEDIDOS), {
      clienteUid: uid, estado: 'buscando', tipo: S.tipo,
      origen: lim(S.origen), destino: lim(S.destino),
      km: Math.round(S.ruta.km * 10) / 10, min: S.ruta.min,
      precio: S.ofertaOn ? S.oferta : base, precioSugerido: base, ofertaCliente: S.ofertaOn,
      item: S.item || '📦 Otro', remitente: { tel: tel10(S.remitente) },
      recibe: { nombre: S.nombre.trim(), tel: tel10(S.tel) }, pago: S.pago,
      pinHash: await sha256(pin), repartidor: null, repPos: null,
      creado: serverTimestamp(), actualizado: serverTimestamp(),
    });
    pins[ref.id] = pin; lsSet('ed_pins', pins); lsSet('ed_activo', ref.id);
    seguir(ref.id);
  } catch (err) {
    console.error(err);
    toast('No se pudo crear el envío. Revisa tu conexión e intenta de nuevo.');
  } finally { S.enviando = false; }
}

async function tomarOferta(o) {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, PEDIDOS, S.id), s = await tx.get(ref);
      if (s.data().estado !== 'buscando') throw new Error('ocupado');
      tx.update(ref, { estado: 'asignado', repartidor: o.rep, precio: o.precio, actualizado: serverTimestamp() });
    });
  } catch { toast('Esa oferta ya no está disponible.'); }
}

async function abrirHistorial() {
  const m = $('#msheet');
  m.innerHTML = '<div class="grab"></div><h2>Mis envíos</h2><p class="muted">Cargando…</p>';
  $('#modal').classList.add('open');
  try {
    const s = await getDocs(query(collection(db, PEDIDOS), where('clienteUid', '==', uid)));
    const l = s.docs.map((d) => d.data()).sort((a, b) => (b.creado?.seconds || 0) - (a.creado?.seconds || 0));
    const est = { buscando: 'Buscando', asignado: 'En camino', recogido: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };
    m.innerHTML = `<div class="grab"></div><h2>Mis envíos</h2>${l.length ? `<ul class="list">${l.map((p) => `<li><div><span class="ico">${TIPOS[p.tipo].ic}</span>
      <span style="flex:1"><b>${esc(p.destino.n)}</b><span class="muted">${est[p.estado]} · ${fecha(p.creado)} · para ${esc(p.recibe.nombre)}</span></span><b>${money(p.precio)}</b></div></li>`).join('')}</ul>`
      : '<p class="muted">Aún no tienes envíos. Escribe a dónde va tu primer paquete.</p>'}<button class="cta dark" data-act="cerrar">Cerrar</button>`;
  } catch { m.innerHTML += '<p class="muted">No se pudo cargar el historial.</p>'; }
}

// ---------- Acciones ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, v = b.dataset.v;
  switch (a) {
    case 'gps':
      try { toast('Buscando tu ubicación…'); const p = await miPosicion(); S.campo = 'origen'; elegirPunto(await direccionDe(p.lat, p.lng)); }
      catch { toast('Activa la ubicación del celular o escribe la dirección.'); }
      return;
    case 'elegir': elegirPunto(S.sug[+b.dataset.i]); return;
    case 'cambiar': S.paso = 'inicio'; S.destino = null; S.ruta = null; S.campo = 'destino'; render(); dibujar(); return;
    case 'tipo': S.tipo = v; S.oferta = precio(v, S.ruta.km, S.ruta.min); break;
    case 'item': S.item = S.item === v ? '' : v; break;
    case 'ofertaOn': S.ofertaOn = !S.ofertaOn; S.oferta = precio(S.tipo, S.ruta.km, S.ruta.min); break;
    case 'oferta': S.oferta = Math.max(minOferta(), S.oferta + +v); break;
    case 'pago': S.pago = v; break;
    case 'pedir': pedir(); return;
    case 'subir': await updateDoc(doc(db, PEDIDOS, S.id), { precio: S.p.precio + 10, actualizado: serverTimestamp() }).catch(() => toast('No se pudo actualizar.')); return;
    case 'tomarOferta': tomarOferta(S.ofertas[+b.dataset.i]); return;
    case 'cancelar':
      if (!confirm('¿Cancelar este envío?')) return;
      await updateDoc(doc(db, PEDIDOS, S.id), { estado: 'cancelado', actualizado: serverTimestamp() }).catch(() => toast('No se pudo cancelar.'));
      return;
    case 'calif': S.calif = +v; S.nota = ''; break;
    case 'nota': S.nota = S.nota === v ? '' : v; break;
    case 'propina': S.propina = +v; break;
    case 'calificar':
      await updateDoc(doc(db, PEDIDOS, S.id), { calif: S.calif, nota: S.nota, propina: S.propina, calificado: true }).catch(() => toast('No se pudo enviar.'));
      toast('Gracias. Tu calificación ayuda a todos.');
      return;
    case 'hist': if (!SEGUIR) abrirHistorial(); return;
    case 'cerrar': $('#modal').classList.remove('open'); return;
    default: return;
  }
  render();
});
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });

// ---------- Inicio ----------
(async () => {
  render();
  try { uid = await usuario(); }
  catch (err) { console.error(err); $('#sheet').innerHTML = '<div class="grab"></div><h2>Sin conexión</h2><p class="muted">No se pudo conectar. Revisa tu internet y recarga la página.</p>'; return; }
  if (SEGUIR) { seguir(SEGUIR); return; }
  const activo = lsGet('ed_activo', null);
  if (activo) { seguir(activo); return; }
  S.paso = 'inicio'; render();
  try { const p = await miPosicion(); if (!S.origen) { S.origen = await direccionDe(p.lat, p.lng); render(); dibujar(); } }
  catch { /* el cliente escribe la dirección */ }
})();
