1import { db, usuario, PEDIDOS, PUNTOS } from './firebase.js';
import {
  collection, addDoc, doc, onSnapshot, updateDoc, serverTimestamp,
  query, where, getDocs, getDoc, runTransaction,
} from 'firebase/firestore';
import {
  L, $, crearMapa, icono, ajustar, buscarLugar, direccionDe, calcularRuta, miPosicion, dist, gmaps,
  TIPOS, CONF, ECO, VENTANAS, aplicarTarifas, precio, precioEco, money, esc, toast, sha256, lsGet, lsSet, wa, tel10, fecha,
} from './comun.js';

const ITEMS = ['📄 Documentos', '🍱 Comida', '👕 Ropa', '📱 Electrónico', '📦 Otro'];
const PAGOS = [['efectivo', '💵 Efectivo'], ['transferencia', '🏦 Transferencia'], ['recibe', '🤝 Paga quien recibe']];
const SEGUIR = new URLSearchParams(location.search).get('seguir'); // enlace de rastreo para quien recibe
const PUNTO = new URLSearchParams(location.search).get('punto'); // enlace del negocio aliado (entrega paquetes a quien los recoge)
const CLAVE = new URLSearchParams(location.search).get('k');

const S = {
  paso: 'cargando', campo: 'destino', texto: '', ref: '', origen: null, destino: null, sug: [], ruta: null,
  tipo: 'moto', item: '', remitente: lsGet('ed_tel', ''), nombre: '', tel: '', pago: 'efectivo',
  modo: 'express', ventana: 'm', punto: null, puntosOn: false, puntos: [], neg: { estado: 'cargando', punto: null, pedidos: [], pin: {} }, ofertaOn: false, oferta: 0, id: null, p: null, ofertas: [], calif: 5, propina: 0, nota: '', enviando: false,
};
let uid = null, unP = null, unO = null, tBuscar = null, rutaDe = null;
const pins = lsGet('ed_pins', {});
const NUMS = { origen: '', destino: '' }; // último número de casa escrito (no se pierde al cambiar la calle)

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
  S.texto = ''; // al tocar el mapa no hay texto escrito que conservar
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
  <p class="muted small">Escribe calle y número, o toca el mapa para marcar el punto exacto.</p>
  <ul class="list" id="sug"></ul>
  <button class="ghost" data-act="verPuntos">${S.puntosOn ? 'Ocultar negocios' : '🏪 Dejarlo en un negocio aliado (se recoge allá)'}</button>${listaPuntos()}`;
}
function listaSug() {
  const e = $('#sug'); if (!e) return;
  e.innerHTML = S.sug.map((p, i) => `<li><button data-act="elegir" data-i="${i}"><span class="ico">${S.campo === 'origen' ? '🟢' : '📍'}</span>
    <span><b>${esc(p.n)}</b><span class="muted">${esc(p.dir)}</span></span></button></li>`).join('')
    || '<li class="muted" style="padding:10px 0">Sin resultados. Agrega la colonia o la ciudad.</li>';
}

function listaPuntos() {
  if (!S.puntosOn) return '';
  const l = S.puntos.map((p) => ({ ...p, d: S.origen ? dist(S.origen, p) : null })).sort((a, b) => (a.d ?? 99) - (b.d ?? 99));
  return `<span class="lbl">Negocios donde puedes dejarlo</span><ul class="list">${l.map((p) => `<li><button data-act="punto" data-id="${p.id}"><span class="ico">🏪</span>
    <span><b>${esc(p.nombre)}</b><span class="muted">${esc(p.dir)}${p.horario ? ' · ' + esc(p.horario) : ''}${p.d != null ? ' · ' + p.d.toFixed(1) + ' km' : ''}</span></span></button></li>`).join('')
    || '<li class="muted" style="padding:10px 0">Aún no hay negocios aliados disponibles.</li>'}</ul>`;
}

function vOpciones() {
  const r = S.ruta, eco = S.modo === 'economico';
  const pr = (k) => (eco ? precioEco(k, r.km, r.min) : precio(k, r.km, r.min)), base = pr(S.tipo);
  return `<div class="grab"></div>
  <div class="row between"><h2 style="margin:0">¿En qué lo mandamos?</h2><span class="muted">${r.km.toFixed(1)} km · ${r.min} min</span></div>
  <div class="veh">${[['express', '⚡', 'Express', 'Un repartidor solo para tu paquete, ahora'], ['economico', '💰', 'Económico', 'Ruta compartida: recogemos en una ventana y entregamos hoy']].map(([k, ic, n, d]) => `<button data-act="modo" data-v="${k}" aria-pressed="${S.modo === k}">
    <span class="em">${ic}</span><span class="mid"><b>${n}</b><span class="muted">${d}</span></span>${k === 'economico' ? `<span class="pr">−${Math.round(ECO.descuento * 100)}%</span>` : ''}</button>`).join('')}</div>
  ${eco ? `<span class="lbl">¿A qué hora pasamos a recoger?</span>
  <div class="chips">${Object.entries(VENTANAS).map(([k, t]) => `<button class="chip" data-act="ventana" data-v="${k}" aria-pressed="${S.ventana === k}">${t}</button>`).join('')}</div>` : ''}
  <div class="veh">${Object.entries(TIPOS).map(([k, t]) => `<button data-act="tipo" data-v="${k}" aria-pressed="${k === S.tipo}">
    <span class="em">${t.ic}</span><span class="mid"><b>${t.n}</b><span class="muted">${t.d}</span></span><span class="pr">${money(pr(k))}</span></button>`).join('')}</div>
  ${S.punto ? `<div class="offerbox"><b>🏪 Se deja en ${esc(S.punto.nombre)}</b><br><span class="muted">${esc(S.punto.dir)}${S.punto.horario ? ' · ' + esc(S.punto.horario) : ''}. Quien lo recoge pasa con su código.</span></div>` : ''}
<span class="lbl">Número de casa</span>
<input class="in" id="iNumO" type="text" placeholder="Número donde se recoge (obligatorio)" value="${esc(S.origen?.numero || '')}">
${S.punto ? '' : `<input class="in" id="iNumD" type="text" placeholder="Número donde se entrega (obligatorio)" value="${esc(S.destino?.numero || '')}">`}
  <span class="lbl">¿Qué envías?</span>
  <div class="chips">${ITEMS.map((c) => `<button class="chip" data-act="item" data-v="${c}" aria-pressed="${S.item === c}">${c}</button>`).join('')}</div>
  <label class="lbl" for="iRem">Tu WhatsApp (para que el repartidor te contacte)</label>
  <input class="in" id="iRem" type="tel" inputmode="numeric" placeholder="10 dígitos" value="${esc(S.remitente)}">
  <label class="lbl" for="iNom">${S.punto ? '¿Quién lo va a recoger?' : '¿Quién recibe?'}</label>
  <input class="in" id="iNom" type="text" placeholder="Nombre" value="${esc(S.nombre)}">
  <input class="in" id="iTel" type="tel" inputmode="numeric" placeholder="WhatsApp de quien recibe (10 dígitos)" value="${esc(S.tel)}">
  <input class="in" id="iRef" type="text" placeholder="Referencias (casa azul, portón negro…)" value="${esc(S.ref)}">
  ${eco ? '' : `<div class="offerbox">
    <div class="row between"><span><b>Ofrece tu precio</b><br><span class="muted">Los repartidores aceptan o contraofertan</span></span>
    <button class="chip" data-act="ofertaOn" aria-pressed="${S.ofertaOn}">${S.ofertaOn ? 'Activado' : 'Activar'}</button></div>
    ${S.ofertaOn ? `<div class="stepper"><button data-act="oferta" data-v="-5" aria-label="Bajar 5 pesos">−</button><output>${money(S.oferta)}</output>
    <button data-act="oferta" data-v="5" aria-label="Subir 5 pesos">+</button></div>
    <div class="muted" style="text-align:center">Sugerido ${money(base)} · mínimo ${money(minOferta())}</div>` : ''}
  </div>`}
  <span class="lbl">Pago</span>
  <div class="chips">${PAGOS.filter(([k]) => !(S.punto && k === 'recibe')).map(([k, l]) => `<button class="chip" data-act="pago" data-v="${k}" aria-pressed="${S.pago === k}">${l}</button>`).join('')}</div>
  <button class="cta" data-act="pedir" ${S.enviando ? 'disabled' : ''}>${eco ? 'Programar envío económico · ' + money(base) : S.ofertaOn ? 'Buscar repartidor con ' + money(S.oferta) : 'Enviar en ' + TIPOS[S.tipo].n + ' · ' + money(base)}</button>
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

function vProgramado() {
  const p = S.p;
  return `<div class="grab"></div><div class="row"><span class="pulse"></span><h2 style="margin:0">Envío programado</h2></div>
  <p class="muted">Económico · ${TIPOS[p.tipo].n} · ${money(p.precio)}. Pasamos a recoger entre ${VENTANAS[p.ventana] || 'el horario elegido'} y lo entregamos el mismo día junto con otros paquetes de tu zona. Te avisamos aquí cuando un repartidor tome tu paquete.</p>
  <button class="ghost" data-act="cancelar">Cancelar envío</button>`;
}

function textoAviso() {
  const p = S.p, r = p.repartidor, pin = pins[S.id];
  const link = `${location.origin}${location.pathname}?seguir=${S.id}`;
  if (p.puntoId) {
    return `Hola ${p.recibe.nombre}, te mandé un paquete por Eco Drive y lo puedes recoger en ${p.punto.nombre} (${p.punto.dir}${p.punto.horario ? ', horario: ' + p.punto.horario : ''}).`
      + (pin ? ` Tu código para recogerlo: ${pin}. Dáselo al negocio solo cuando tengas el paquete en tus manos.` : '')
      + ` Síguelo aquí: ${link}`;
  }
  return `Hola ${p.recibe.nombre}, te mandé un paquete por Eco Drive a ${p.destino.n}.`
    + (r ? ` Lo lleva ${r.nombre} (${r.vehiculo}, placas ${r.placas}).` : '')
    + (pin ? ` Código de entrega: ${pin}. Dáselo al repartidor solo cuando tengas el paquete en tus manos.` : '')
    + ` Síguelo en vivo aquí: ${link}`;
}

function vEnCurso() {
  const p = S.p, r = p.repartidor, pin = pins[S.id];
  const titulo = p.estado === 'asignado' ? `${esc(r.nombre.split(' ')[0])} va por tu paquete` : 'Tu paquete va en camino';
  return `<div class="grab"></div><h2>${titulo}</h2>${repCard(r)}
  ${p.puntoId ? `<p class="muted" style="margin-top:10px">🏪 Lo dejará en ${esc(p.punto.nombre)}. ${esc(p.recibe.nombre)} lo recoge allá con su código.</p>` : ''}
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
  <p class="muted" style="margin-top:-6px">${p.puntoId ? `${esc(p.recibe.nombre)} lo recogió en ${esc(p.punto.nombre)}` : `${esc(p.recibe.nombre)} lo recibió en ${esc(p.destino.n)}`} y confirmó con el código.</p>
  <div class="row between"><span class="muted">Total</span><span class="big">${money(p.precio + S.propina)}</span></div>
  <p style="text-align:center;margin:14px 0 0"><b>¿Cómo estuvo el servicio de ${esc(p.repartidor.nombre.split(' ')[0])}?</b></p>
  <div class="stars">${[1, 2, 3, 4, 5].map((i) => `<button data-act="calif" data-v="${i}" class="${i <= S.calif ? 'on' : ''}" aria-label="${i} estrellas">★</button>`).join('')}</div>
  <div class="chips" style="justify-content:center">${(S.calif >= 4 ? ['Puntual', 'Cuidó el paquete', 'Buena atención', 'Muy rápido'] : ['Llegó tarde', 'Paquete dañado', 'Mala atención', 'Tardó en recoger'])
    .map((c) => `<button class="chip" data-act="nota" data-v="${c}" aria-pressed="${S.nota === c}">${c}</button>`).join('')}</div>
  <span class="lbl">Propina, 100% para el repartidor</span>
  <div class="chips">${[0, 10, 20, 30].map((n) => `<button class="chip" data-act="propina" data-v="${n}" aria-pressed="${S.propina === n}">${n ? money(n) : 'Sin propina'}</button>`).join('')}</div>
  <button class="cta" data-act="calificar">Enviar calificación</button>`;
}

function vEnPunto() {
  const p = S.p, pt = p.punto || {}, pin = pins[S.id];
  return `<div class="grab"></div><h2>Tu paquete ya está en ${esc(pt.nombre)}</h2>
  <p class="muted" style="margin-top:-6px">${esc(pt.dir)}${pt.horario ? ' · Horario: ' + esc(pt.horario) : ''}</p>
  ${pin ? `<div class="muted" style="margin-top:12px">Código para recogerlo: compártelo con ${esc(p.recibe.nombre)}</div>
    <div class="pin">${pin.split('').map((c) => `<span>${c}</span>`).join('')}</div>`
    : '<p class="muted">El código está en el celular donde se pidió el envío.</p>'}
  <div class="acts">
    <a href="${gmaps(p.destino)}" target="_blank" rel="noopener"><span>🧭</span>Cómo llegar</a>
    <a href="${wa(p.recibe.tel, textoAviso())}" target="_blank" rel="noopener"><span>📤</span>Avisar a quien recoge</a>
    ${pt.tel ? `<a href="tel:${tel10(pt.tel)}"><span>📞</span>Negocio</a>` : ''}
  </div>
  <p class="muted small">El negocio solo entrega el paquete a quien le dé el código de 4 dígitos.</p>`;
}

function vNegocio() {
  const n = S.neg;
  if (n.estado === 'cargando') return '<div class="grab"></div><p class="muted">Conectando…</p>';
  if (n.estado === 'error') return '<div class="grab"></div><h2>Enlace no válido</h2><p class="muted">Pide a Eco Drive un enlace nuevo para tu negocio.</p>';
  return `<div class="grab"></div><h2>🏪 ${esc(n.punto.nombre)}</h2>
  <p class="muted" style="margin-top:-6px">Paquetes que dejaron los repartidores. Entrégalos solo a quien te dé el código de 4 dígitos.</p>
  ${n.pedidos.length ? n.pedidos.map((p) => `<div class="card">
    <div class="row between"><b>Para ${esc(p.recibe.nombre)}</b><span class="muted">${fecha(p.dejado)}</span></div>
    <span class="muted">${esc(p.item)}</span>
    ${p.recibidoPunto ? '<p class="muted small" style="margin:6px 0 0">✔ Ya confirmaste que llegó</p>' : `<button class="ghost" data-act="negRecibido" data-id="${p.id}">Confirmar que ya llegó el paquete</button>`}
    <input class="in" id="np_${p.id}" inputmode="numeric" maxlength="4" placeholder="Código de 4 dígitos" value="${esc(n.pin[p.id] || '')}" style="font-size:22px;letter-spacing:.3em;text-align:center">
    <button class="cta go" data-act="negEntregar" data-id="${p.id}">Entregar a ${esc(p.recibe.nombre.split(' ')[0])}</button></div>`).join('')
    : '<p class="muted">No hay paquetes esperando. Cuando un repartidor deje uno, aparece aquí.</p>'}`;
}

function vSeguimiento() {
  const p = S.p;
  if (!p) return '<div class="grab"></div><h2>Buscando tu envío…</h2>';
  const txt = { buscando: p.modo === 'economico' ? 'Tu paquete está programado para recogerse hoy' : 'Buscando repartidor para tu paquete', asignado: 'El repartidor va a recoger tu paquete', recogido: 'Tu paquete va en camino', enpunto: p.puntoId ? `Tu paquete ya está en ${p.punto.nombre}, listo para recoger` : 'Tu paquete ya llegó', entregado: 'Paquete entregado', cancelado: 'Este envío fue cancelado' }[p.estado];
  return `<div class="grab"></div><h2>${txt}</h2>
  <p class="muted" style="margin-top:-6px">Para ${esc(p.recibe.nombre)} · ${esc(p.destino.n)}</p>
  ${p.repartidor && p.estado !== 'cancelado' ? repCard(p.repartidor) : ''}
  ${p.estado === 'recogido' ? `<p class="muted">${p.puntoId ? 'Lo llevan a ' + esc(p.punto.nombre) + '. Te avisamos cuando esté listo para recoger.' : 'Cuando llegue, revisa el paquete y dale el código de entrega que te mandaron por WhatsApp.'}</p>
    <div class="acts"><a href="tel:${tel10(p.repartidor.tel)}"><span>📞</span>Llamar</a><a href="${wa(p.repartidor.tel, 'Hola, soy quien recibe el paquete de Eco Drive.')}" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a></div>` : ''}
  ${p.estado === 'enpunto' && p.puntoId ? `<p class="muted">${esc(p.punto.dir)}${p.punto.horario ? ' · Horario: ' + esc(p.punto.horario) : ''}. Lleva el código de 4 dígitos que te mandaron por WhatsApp.</p>
    <div class="acts"><a href="${gmaps(p.destino)}" target="_blank" rel="noopener"><span>🧭</span>Cómo llegar</a></div>` : ''}
  ${p.estado === 'recogido' && p.pago === 'recibe' ? `<p><b>Ten listo ${money(p.precio)} para pagar el envío.</b></p>` : ''}`;
}

function render() {
  const v = PUNTO ? vNegocio : SEGUIR ? vSeguimiento
    : ({ cargando: () => '<div class="grab"></div><p class="muted">Conectando…</p>', inicio: vInicio, opciones: vOpciones, buscando: () => (S.p?.modo === 'economico' ? vProgramado() : vBuscando()), asignado: vEnCurso, recogido: vEnCurso, enpunto: vEnPunto, entregado: vEntregado })[S.paso];
  $('#sheet').innerHTML = v();
  if (S.paso === 'inicio' && !SEGUIR) listaSug();
}

// ---------- Selección de direcciones ----------
function elegirPunto(p) {
  if (S.campo === 'destino' && !p.esPunto) S.punto = null; // eligió una dirección normal, no un negocio
  // El buscador solo trae la calle: conservamos el número que escribió el usuario
  if (!p.esPunto) { const num = NUMS[S.campo] || ''; p = { ...p, base: p.n, numero: num, n: num ? `${p.n} #${num}` : p.n }; }
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
  if (S.destino) S.destino.ref = S.ref; // las referencias viajan dentro del destino del pedido
  S.paso = 'opciones';
  render(); dibujar();
}

function setNum(k, v) {
  const d = S[k]; if (!d) return;
  const numero = v.trim(), base = d.base ?? d.n;
  NUMS[k] = numero; // se recuerda aunque se vuelva a elegir la calle
  S[k] = { ...d, base, numero, n: numero ? `${base} #${numero}` : base };
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.campo) {
    S.campo = t.dataset.campo;
    S.texto = t.value; // lo que escribió el usuario (con número de casa)
    S[S.campo] = null;
    if (S.campo === 'destino') S.punto = null;
    clearTimeout(tBuscar);
    tBuscar = setTimeout(async () => { S.sug = await buscarLugar(t.value); listaSug(); }, 450);
  }
  if (t.id === 'iRem') { S.remitente = t.value; lsSet('ed_tel', t.value); }
  if (t.id === 'iNom') S.nombre = t.value;
  if (t.id === 'iTel') S.tel = t.value;
  if (t.id === 'iRef') { S.ref = t.value; if (S.destino) S.destino.ref = t.value; }
  if (t.id?.startsWith('np_')) S.neg.pin[t.id.slice(3)] = t.value;
  if (t.id === 'iNumO') setNum('origen', t.value);
  if (t.id === 'iNumD') setNum('destino', t.value);
});
document.addEventListener('focusin', async (e) => {
  const t = e.target;
  if (t.dataset?.campo && S.paso === 'inicio') {
    S.campo = t.dataset.campo;
    S.texto = t.value || '';
    S.sug = await buscarLugar(t.value || '');
    listaSug();
  }
});

// ---------- Firestore ----------
// Compatibilidad: PEDIDOS/PUNTOS pueden ser nombre de colección o referencia
const colPed = () => (typeof PEDIDOS === 'string' ? collection(db, PEDIDOS) : PEDIDOS);
const docPed = (id) => (typeof PEDIDOS === 'string' ? doc(db, PEDIDOS, id) : doc(PEDIDOS, id));
const colPun = () => (typeof PUNTOS === 'string' ? collection(db, PUNTOS) : PUNTOS);
const docPun = (id) => (typeof PUNTOS === 'string' ? doc(db, PUNTOS, id) : doc(PUNTOS, id));
const limpio = (o) => JSON.parse(JSON.stringify(o ?? null)); // Firestore no acepta undefined
const d10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);

// ---------- Borrador: calle, número y datos NO se pierden si recargas o se cierra la app ----------
function guardarBorrador() {
  if (SEGUIR || PUNTO || S.id) return;
  lsSet('ed_borrador', {
    origen: S.origen, destino: S.destino, ref: S.ref, nombre: S.nombre, tel: S.tel, item: S.item,
    pago: S.pago, modo: S.modo, ventana: S.ventana, tipo: S.tipo, punto: S.punto, nums: NUMS,
  });
}
document.addEventListener('input', (e) => {
  if (e.target.dataset?.campo) NUMS[e.target.dataset.campo] = ''; // buscó otra dirección: el número anterior ya no aplica
  guardarBorrador();
});

function reiniciar() {
  unP?.(); unO?.(); unP = unO = null; rutaDe = null;
  lsSet('ed_activo', null); lsSet('ed_borrador', null);
  Object.assign(S, {
    paso: 'inicio', campo: 'destino', texto: '', ref: '', origen: null, destino: null, sug: [], ruta: null,
    item: '', nombre: '', tel: '', punto: null, puntosOn: false, ofertaOn: false, id: null, p: null, ofertas: [],
    calif: 5, propina: 0, nota: '', enviando: false,
  });
  NUMS.origen = NUMS.destino = '';
  render(); dibujar();
}

// ---------- Seguimiento del envío (cliente que lo pidió) ----------
function seguir(id) {
  S.id = id; lsSet('ed_activo', id);
  unP?.(); unO?.(); unO = null;
  unP = onSnapshot(docPed(id), async (snap) => {
    if (!snap.exists()) { toast('No encontramos ese envío'); return reiniciar(); }
    const antes = S.p?.estado;
    S.p = { id, ...snap.data() };
    const est = S.p.estado;
    if (est === 'cancelado') { toast('El envío fue cancelado'); return reiniciar(); }
    S.paso = est;
    if (rutaDe !== id) {
      rutaDe = id;
      try { S.ruta = await calcularRuta(S.p.origen, S.p.destino); } catch (e) { S.ruta = null; }
    }
    if (S.p.ofertaCliente && est === 'buscando' && !unO) {
      unO = onSnapshot(collection(docPed(id), 'ofertas'), (q) => {
        S.ofertas = q.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (S.paso === 'buscando') render();
      });
    } else if (est !== 'buscando' && unO) { unO(); unO = null; S.ofertas = []; }
    render(); dibujar(est !== antes);
  }, (e) => { console.error(e); toast('Sin conexión con el envío'); });
}

// ---------- Seguimiento (quien recibe, con el enlace ?seguir=) ----------
function seguirExterno() {
  let ruta = false;
  onSnapshot(docPed(SEGUIR), async (snap) => {
    S.p = snap.exists() ? { id: snap.id, ...snap.data() } : null;
    if (S.p && !ruta) { ruta = true; try { S.ruta = await calcularRuta(S.p.origen, S.p.destino); } catch (e) { /* sin ruta */ } }
    render(); dibujar();
  });
}

// ---------- Negocio aliado (enlace ?punto=&k=) ----------
async function iniciarNegocio() {
  try {
    const s = await getDoc(docPun(PUNTO));
    const pt = s.exists() ? { id: s.id, ...s.data() } : null;
    let ok = false;
    if (pt && CLAVE) ok = pt.clave === CLAVE || (!!pt.claveHash && pt.claveHash === await sha256(CLAVE));
    if (!ok) { S.neg.estado = 'error'; return render(); }
    S.neg.punto = pt; S.neg.estado = 'ok';
    onSnapshot(query(colPed(), where('puntoId', '==', PUNTO), where('estado', '==', 'enpunto')), (q) => {
      S.neg.pedidos = q.docs.map((d) => ({ id: d.id, ...d.data() }));
      render();
    });
    render();
  } catch (e) { console.error(e); S.neg.estado = 'error'; render(); }
}

// ---------- Crear pedido ----------
async function pedir() {
  if (S.enviando) return;
  const eco = S.modo === 'economico', r = S.ruta;
  if (!r) return toast('Falta calcular la ruta');
  if (!S.origen?.numero?.trim()) return toast('Escribe el número de casa donde se recoge');
  if (!S.punto && !S.destino?.numero?.trim()) return toast('Escribe el número de casa donde se entrega');
  if (!S.item) return toast('Elige qué envías');
  if (d10(S.remitente).length !== 10) return toast('Tu WhatsApp debe tener 10 dígitos');
  if (!S.nombre.trim()) return toast(S.punto ? 'Escribe quién lo va a recoger' : 'Escribe quién recibe');
  if (d10(S.tel).length !== 10) return toast('El WhatsApp de quien recibe debe tener 10 dígitos');
  const sugerido = eco ? precioEco(S.tipo, r.km, r.min) : precio(S.tipo, r.km, r.min);
  const ofertando = S.ofertaOn && !eco;
  if (ofertando && S.oferta < minOferta()) return toast(`El mínimo es ${money(minOferta())}`);
  S.enviando = true; render();
  try {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const ped = limpio({
      cliente: uid, estado: 'buscando', modo: S.modo, ventana: eco ? S.ventana : null,
      tipo: S.tipo, item: S.item, pago: S.pago, precio: ofertando ? S.oferta : sugerido,
      ofertaCliente: ofertando, km: r.km, min: r.min,
      origen: S.origen, destino: { ...S.destino, ref: S.ref },
      remitente: d10(S.remitente), recibe: { nombre: S.nombre.trim(), tel: d10(S.tel) },
      puntoId: S.punto?.id || null,
      punto: S.punto ? { id: S.punto.id, nombre: S.punto.nombre, dir: S.punto.dir, horario: S.punto.horario || '', tel: S.punto.tel || '' } : null,
      pinHash: await sha256(pin), repartidor: null,
    });
    ped.creado = serverTimestamp();
    const ref = await addDoc(colPed(), ped);
    pins[ref.id] = pin; lsSet('ed_pins', pins);
    lsSet('ed_borrador', null);
    S.enviando = false;
    seguir(ref.id);
  } catch (e) {
    console.error(e); S.enviando = false;
    toast('No se pudo enviar. Revisa tu conexión (tus datos se conservan)'); render();
  }
}

async function tomarOferta(i) {
  const o = S.ofertas[i]; if (!o) return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = docPed(S.id), s = await tx.get(ref);
      if (!s.exists() || s.data().estado !== 'buscando') throw new Error('ocupado');
      tx.update(ref, { estado: 'asignado', repartidor: o.rep, precio: o.precio, asignado: serverTimestamp() });
    });
  } catch (e) { console.error(e); toast('Esa oferta ya no está disponible'); }
}

// ---------- Clics ----------
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, v = b.dataset.v;
  try {
    switch (a) {
      case 'gps': {
        toast('Buscando tu ubicación…');
        const pos = await miPosicion();
        const lat = Array.isArray(pos) ? pos[0] : pos?.lat ?? pos?.coords?.latitude;
        const lng = Array.isArray(pos) ? pos[1] : pos?.lng ?? pos?.coords?.longitude;
        if (lat == null || lng == null) return toast('No pudimos obtener tu ubicación');
        const p = await direccionDe(lat, lng);
        S.campo = 'origen'; S.texto = '';
        return elegirPunto(p);
      }
      case 'elegir': S.texto = S.texto || ''; return elegirPunto(S.sug[+b.dataset.i]);
      case 'verPuntos':
        S.puntosOn = !S.puntosOn;
        if (S.puntosOn && !S.puntos.length) {
          const q = await getDocs(colPun());
          S.puntos = q.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.activo !== false && p.lat != null);
        }
        return render();
      case 'punto': {
        const pt = S.puntos.find((p) => p.id === b.dataset.id); if (!pt) return;
        S.punto = pt; S.campo = 'destino'; S.texto = '';
        return elegirPunto({ n: pt.nombre, dir: pt.dir, lat: pt.lat, lng: pt.lng, esPunto: true });
      }
      case 'modo': S.modo = v; if (v === 'economico') S.ofertaOn = false; break;
      case 'ventana': S.ventana = v; break;
      case 'tipo': S.tipo = v; if (S.ruta) S.oferta = precio(v, S.ruta.km, S.ruta.min); break;
      case 'item': S.item = v; break;
      case 'pago': S.pago = v; break;
      case 'ofertaOn': S.ofertaOn = !S.ofertaOn; break;
      case 'oferta': S.oferta = Math.max(minOferta(), S.oferta + Number(v)); break;
      case 'cambiar': // conserva calle, número y referencias al volver a editar
        S.paso = 'inicio'; S.ruta = null; S.campo = 'destino'; S.sug = [];
        guardarBorrador(); render(); return dibujar();
      case 'pedir': return pedir();
      case 'subir': await updateDoc(docPed(S.id), { precio: S.p.precio + 10 }); return toast('Subimos la oferta');
      case 'cancelar':
        if (!confirm('¿Cancelar el envío?')) return;
        await updateDoc(docPed(S.id), { estado: 'cancelado', cancelado: serverTimestamp() });
        return reiniciar();
      case 'tomarOferta': return tomarOferta(+b.dataset.i);
      case 'calif': S.calif = Number(v); S.nota = ''; break;
      case 'nota': S.nota = S.nota === v ? '' : v; break;
      case 'propina': S.propina = Number(v); break;
      case 'calificar':
        await updateDoc(docPed(S.id), { calificacion: { estrellas: S.calif, nota: S.nota, propina: S.propina } });
        toast('¡Gracias por tu calificación!');
        return reiniciar();
      case 'negRecibido':
        await updateDoc(docPed(b.dataset.id), { recibidoPunto: true, recibidoPuntoEn: serverTimestamp() });
        return toast('Marcado como recibido');
      case 'negEntregar': {
        const id = b.dataset.id, ped = S.neg.pedidos.find((p) => p.id === id);
        const pin = (S.neg.pin[id] || '').trim();
        if (!ped) return;
        if (!/^\d{4}$/.test(pin)) return toast('Escribe el código de 4 dígitos');
        if ((await sha256(pin)) !== ped.pinHash) return toast('Código incorrecto');
        await updateDoc(docPed(id), { estado: 'entregado', entregado: serverTimestamp(), entregadoPunto: true });
        S.neg.pin[id] = '';
        return toast('Paquete entregado ✔');
      }
      default: return;
    }
    guardarBorrador(); render();
  } catch (err) { console.error(err); toast('Algo falló. Intenta de nuevo'); }
});

// ---------- Arranque ----------
(async () => {
  try {
    const u = typeof usuario === 'function' ? await usuario() : usuario;
    uid = typeof u === 'string' ? u : u?.uid || null;
  } catch (e) { console.error(e); }
  try { if (typeof aplicarTarifas === 'function') await aplicarTarifas(); } catch (e) { console.warn('tarifas', e); }
  if (PUNTO) { render(); return iniciarNegocio(); }
  if (SEGUIR) { render(); return seguirExterno(); }
  const activo = lsGet('ed_activo', null);
  if (activo) return seguir(activo);
  S.paso = 'inicio';
  const bd = lsGet('ed_borrador', null);
  if (bd) { // recupera lo que ya había escrito
    const ok = (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number';
    if (ok(bd.origen)) S.origen = bd.origen;
    if (ok(bd.destino)) S.destino = bd.destino;
    Object.assign(S, { ref: bd.ref || '', nombre: bd.nombre || '', tel: bd.tel || '', item: bd.item || '', pago: bd.pago || 'efectivo', modo: bd.modo || 'express', ventana: bd.ventana || 'm', tipo: bd.tipo || 'moto', punto: bd.punto || null });
    NUMS.origen = S.origen?.numero || ''; NUMS.destino = S.destino?.numero || '';
    if (S.origen && S.destino) {
      try {
        S.ruta = await calcularRuta(S.origen, S.destino);
        S.oferta = precio(S.tipo, S.ruta.km, S.ruta.min);
        S.paso = 'opciones';
      } catch (e) { console.warn('ruta', e); }
    }
  }
  render(); dibujar();
})();
