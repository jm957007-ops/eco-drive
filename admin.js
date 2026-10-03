import './estilos.css';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy, limit, serverTimestamp, runTransaction,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig, PEDIDOS, REPS, PUNTOS } from './firebase.js';
import { buscarLugar, sha256 } from './comun.js';

const RUTA_CLIENTE = '/'; // dirección de la app de clientes (el negocio abre ?punto=...&k=... ahí)
const enlaceNegocio = (id, clave) => `${location.origin}${RUTA_CLIENTE}?punto=${id}&k=${clave}`;
const ACT = ['buscando', 'asignado', 'recogido', 'enpunto'];

// Instancia separada: la sesión del administrador no se mezcla con la de cliente/repartidor en el mismo navegador
const app = initializeApp(firebaseConfig, 'admin');
const db = getFirestore(app);
const auth = getAuth(app);

const $ = (s) => document.querySelector(s);
const money = (n) => '$' + Math.round(n || 0).toLocaleString('es-MX');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tel10 = (t) => String(t || '').replace(/\D/g, '').slice(-10);
const fecha = (ts) => (ts?.toDate ? ts.toDate().toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const esHoy = (ts) => !!ts?.toDate && ts.toDate().toDateString() === new Date().toDateString();
function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 3000); }
const sinPermiso = (e) => toast(e?.code === 'permission-denied' ? 'Esta cuenta no es administradora. Revisa el correo en las reglas de Firestore.' : 'No se pudo guardar. Revisa tu conexión.');

const esEco = (p) => p.modo === 'economico';
const esProg = (p) => p.estado === 'buscando' && esEco(p); // económico esperando que lo metan a un lote
const VENT = { m: '11 AM – 2 PM', t: '4 – 7 PM' };
const ZONAS = [['Altamira', 22.3930, -97.9414], ['Ciudad Madero', 22.2759, -97.8335], ['Tampico', 22.2163, -97.8578]];
function zonaDe(pt) {
  if (!pt) return 'Otra zona';
  let mejor = 'Otra zona', bd = 0.15; // ~16 km máximo
  ZONAS.forEach(([n, la, ln]) => { const d = Math.hypot(pt.lat - la, pt.lng - ln); if (d < bd) { bd = d; mejor = n; } });
  return mejor;
}

const DEF = { moto: { base: 25, km: 6, min: 0.8, minimo: 35 }, auto: { base: 35, km: 8.5, min: 1.2, minimo: 50 }, comision: 0.10, eco: { descuento: 0.35, pagoRep: 20, minimo: 25 } };
const NOMBRE = { moto: '🏍️ Moto', auto: '🚗 Vehículo' };
const EST_P = { buscando: ['Buscando', 'warn'], asignado: ['Asignado', ''], recogido: ['En camino', ''], enpunto: ['En negocio', 'warn'], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'bad'] };
const EST_R = { pendiente: ['Pendiente', 'warn'], aprobado: ['Aprobado', 'ok'], bloqueado: ['Bloqueado', 'bad'] };

const formVacio = () => ({ nombre: '', tel: '', horario: '', pago: 10, q: '', sel: null, res: [] });
const S = { tab: 'envios', pedidos: [], reps: [], puntos: [], form: formVacio(), tar: structuredClone(DEF), editando: false, sel: new Set(), repSel: '' };
let subs = [];
let tPunto = null;

// ---------- Vistas ----------
function vLogin() {
  return `<div class="box" style="margin-top:24px"><h2>Entrar al panel</h2>
  <p class="muted" style="margin-top:-6px">Usa el correo y contraseña de administrador que creaste en Firebase.</p>
  <input class="in" id="lEmail" type="email" autocomplete="username" placeholder="Correo">
  <input class="in" id="lPass" type="password" autocomplete="current-password" placeholder="Contraseña">
  <button class="cta dark" data-act="entrar">Entrar</button></div>`;
}

function vEnvios() {
  const hoy = S.pedidos.filter((p) => esHoy(p.creado));
  const ent = hoy.filter((p) => ['entregado', 'enpunto'].includes(p.estado));
  const ventas = ent.reduce((s, p) => s + (p.precio || 0), 0);
  const com = ent.reduce((s, p) => s + (esEco(p) ? (p.precio || 0) - (p.pagoRep ?? S.tar.eco.pagoRep) : (p.precio || 0) * (p.comision ?? S.tar.comision)) - (p.pagoPunto || 0), 0);
  const activos = S.pedidos.filter((p) => ACT.includes(p.estado));
  return `<div class="stats">
    <div><span class="muted">Envíos hoy</span><b>${hoy.length}</b></div>
    <div><span class="muted">Entregados hoy</span><b>${ent.length}</b></div>
    <div><span class="muted">Ventas hoy</span><b>${money(ventas)}</b></div>
    <div><span class="muted">Tu comisión hoy</span><b>${money(com)}</b></div>
  </div>
  <div class="box"><h2 style="margin-bottom:4px">En curso (${activos.length})</h2>${activos.length ? activos.map(filaPedido).join('') : '<p class="muted">No hay envíos en curso.</p>'}</div>
  <div class="box"><h2 style="margin-bottom:4px">Últimos envíos</h2>${S.pedidos.filter((p) => !activos.includes(p)).slice(0, 40).map(filaPedido).join('') || '<p class="muted">Aún no hay envíos.</p>'}</div>`;
}
function filaPedido(p) {
  const [t, c] = esProg(p) ? ['Programado', 'warn'] : (EST_P[p.estado] || [p.estado, '']);
  const activo = ACT.includes(p.estado);
  return `<div class="fila"><div class="mid"><b>${esc(p.origen?.n)} → ${esc(p.destino?.n)}</b>
    <span class="muted">${NOMBRE[p.tipo] || ''}${esEco(p) ? ' · 💰 Económico' : ''}${p.puntoId ? ' · 🏪 ' + esc(p.punto?.nombre) + (p.estado === 'enpunto' ? (p.recibidoPunto ? ' (negocio confirmó)' : ' (sin confirmar)') : '') : ''} · ${fecha(p.creado)} · ${p.repartidor ? esc(p.repartidor.nombre) : 'sin repartidor'}${p.calif ? ' · ★ ' + p.calif : ''}</span>
    ${activo ? `<div class="btns"><a href="https://wa.me/52${tel10(p.remitente?.tel)}" target="_blank" rel="noopener">WhatsApp cliente</a>
      ${p.repartidor ? `<a href="https://wa.me/52${tel10(p.repartidor.tel)}" target="_blank" rel="noopener">WhatsApp repartidor</a>` : ''}
      <button class="bad" data-act="cancelarPedido" data-id="${p.id}">Cancelar</button></div>` : ''}</div>
    <div style="text-align:right"><b>${money(p.precio)}</b><br><span class="badge ${c}">${t}</span></div></div>`;
}

function vReps() {
  const orden = { pendiente: 0, aprobado: 1, bloqueado: 2 };
  const l = [...S.reps].sort((a, b) => (orden[a.estado || 'pendiente'] - orden[b.estado || 'pendiente']) || String(a.nombre).localeCompare(b.nombre));
  const pend = l.filter((r) => (r.estado || 'pendiente') === 'pendiente').length;
  return `<div class="box"><h2 style="margin-bottom:4px">Repartidores (${l.length})</h2>
  <p class="muted">${pend ? `${pend} esperando aprobación. ` : ''}Solo los aprobados pueden conectarse y aceptar envíos.</p>
  ${l.map((r) => {
    const est = r.estado || 'pendiente', [t, c] = EST_R[est];
    const entregas = S.pedidos.filter((p) => p.repartidor?.uid === r.id && ['entregado', 'enpunto'].includes(p.estado)).length;
    return `<div class="fila"><div class="mid"><b>${r.enLinea && est === 'aprobado' ? '<span class="enlinea" title="Conectado"></span>' : ''}${esc(r.nombre)}</b>
      <span class="muted">${NOMBRE[r.tipo] || ''} · ${esc(r.vehiculo)} · ${esc(r.placas)} · ${entregas} entregas recientes</span>
      <div class="btns"><a href="https://wa.me/52${tel10(r.tel)}" target="_blank" rel="noopener">WhatsApp</a>
      ${est !== 'aprobado' ? `<button class="go" data-act="estadoRep" data-id="${r.id}" data-v="aprobado">${est === 'bloqueado' ? 'Reactivar' : 'Aprobar'}</button>` : ''}
      ${est !== 'bloqueado' ? `<button class="bad" data-act="estadoRep" data-id="${r.id}" data-v="bloqueado">${est === 'pendiente' ? 'Rechazar' : 'Suspender'}</button>` : ''}</div></div>
      <span class="badge ${c}">${t}</span></div>`;
  }).join('') || '<p class="muted">Aún no se registra ningún repartidor. Comparte la liga /repartidor.</p>'}</div>`;
}

const resPuntos = () => (S.form.sel
  ? `<li class="muted" style="padding:6px 0">📍 ${esc(S.form.sel.n)} · ${esc(S.form.sel.dir)}</li>`
  : S.form.res.map((p, i) => `<li><button data-act="puntoElegir" data-i="${i}"><span class="ico">📍</span><span><b>${esc(p.n)}</b><span class="muted">${esc(p.dir)}</span></span></button></li>`).join(''));

function vPuntos() {
  const f = S.form;
  return `<div class="box"><h2 style="margin-bottom:4px">Negocios aliados (${S.puntos.length})</h2>
  <p class="muted">Tiendas, papelerías o abarrotes donde el repartidor deja paquetes y el cliente los recoge con su código. Ganan un pago fijo por cada paquete entregado.</p>
  ${S.puntos.map((p) => {
    const n = S.pedidos.filter((x) => x.puntoId === p.id && x.estado === 'enpunto').length;
    return `<div class="fila"><div class="mid"><b>${esc(p.nombre)}</b>
      <span class="muted">${esc(p.dir)}${p.horario ? ' · ' + esc(p.horario) : ''} · pago ${money(p.pago)} por paquete · ${n} esperando</span>
      <div class="btns"><button data-act="puntoActivo" data-id="${p.id}">${p.activo ? 'Pausar' : 'Activar'}</button>
      <button data-act="puntoEnlace" data-id="${p.id}">Enlace nuevo del negocio</button>
      ${p.tel ? `<a href="https://wa.me/52${tel10(p.tel)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div></div>
      <span class="badge ${p.activo ? 'ok' : 'bad'}">${p.activo ? 'Activo' : 'Pausado'}</span></div>`;
  }).join('') || '<p class="muted">Aún no hay negocios. Agrega el primero abajo.</p>'}</div>
  <div class="box"><h3 style="margin:0 0 4px">Agregar negocio</h3>
  <input class="in" data-f="nombre" placeholder="Nombre del negocio" value="${esc(f.nombre)}">
  <input class="in" data-f="tel" type="tel" inputmode="numeric" placeholder="WhatsApp del negocio (10 dígitos)" value="${esc(f.tel)}">
  <input class="in" data-f="horario" placeholder="Horario (ej. Lun a Sáb 9 AM – 8 PM)" value="${esc(f.horario)}">
  <label class="muted">Pago al negocio por paquete entregado $<input class="in" data-f="pago" type="number" inputmode="decimal" min="0" step="1" value="${f.pago}"></label>
  <input class="in" id="pQ" data-f="q" autocomplete="off" placeholder="Busca la dirección (calle y colonia)" value="${esc(f.q)}">
  <ul class="list" id="pRes">${resPuntos()}</ul>
  <button class="cta" data-act="puntoCrear">Guardar negocio</button>
  <p class="muted small">Al guardar se genera el enlace del negocio. Mándaselo por WhatsApp: ahí ve los paquetes que le dejan y los entrega con el código.</p></div>`;
}

function vLotes() {
  const prog = S.pedidos.filter(esProg);
  [...S.sel].forEach((id) => { if (!prog.some((p) => p.id === id)) S.sel.delete(id); });
  const porZona = {};
  prog.forEach((p) => { const z = zonaDe(p.destino); (porZona[z] = porZona[z] || []).push(p); });
  const aprobados = S.reps.filter((r) => (r.estado || 'pendiente') === 'aprobado');
  const pagoDe = (p) => p.pagoRep ?? S.tar.eco.pagoRep;
  const sel = prog.filter((p) => S.sel.has(p.id));
  const ingreso = sel.reduce((s, p) => s + (p.precio || 0), 0), pago = sel.reduce((s, p) => s + pagoDe(p), 0);
  const lotes = {};
  S.pedidos.filter((p) => p.loteId && p.estado !== 'cancelado').forEach((p) => { (lotes[p.loteId] = lotes[p.loteId] || []).push(p); });
  const enCurso = Object.values(lotes).filter((l) => l.some((p) => ['asignado', 'recogido'].includes(p.estado)));
  return `<div class="box"><h2 style="margin-bottom:4px">Paquetes económicos (${prog.length})</h2>
  <p class="muted">Junta paquetes de la misma zona y asígnalos a un repartidor en una sola ruta.</p>
  ${Object.entries(porZona).map(([z, l]) => `<div class="row between" style="margin-top:12px"><h3 style="margin:0">${esc(z)} (${l.length})</h3>
    <button class="chip" data-act="selZona" data-v="${esc(z)}">${l.every((p) => S.sel.has(p.id)) ? 'Quitar todos' : 'Elegir todos'}</button></div>
    ${l.map((p) => `<label class="fila"><input type="checkbox" data-act="sel" data-id="${p.id}" ${S.sel.has(p.id) ? 'checked' : ''}>
      <div class="mid"><b>${esc(p.origen?.n)} → ${esc(p.destino?.n)}</b>
      <span class="muted">${NOMBRE[p.tipo] || ''} · recoger ${VENT[p.ventana] || ''} · ${p.km} km · ${fecha(p.creado)}</span></div>
      <b>${money(p.precio)}</b></label>`).join('')}`).join('') || '<p class="muted">No hay paquetes económicos esperando.</p>'}</div>
  ${prog.length ? `<div class="box"><h3 style="margin:0 0 4px">Armar lote</h3>
    <p class="muted">${sel.length} paquetes · cobras ${money(ingreso)} · pagas al repartidor ${money(pago)} · te quedan <b>${money(ingreso - pago)}</b></p>
    <select class="in" id="repSel"><option value="">Elige repartidor</option>${aprobados.map((r) => `<option value="${r.id}" ${S.repSel === r.id ? 'selected' : ''}>${esc(r.nombre)} · ${esc(NOMBRE[r.tipo] || '')}${r.enLinea ? ' · en línea' : ''}</option>`).join('')}</select>
    <button class="cta" data-act="crearLote" ${sel.length && S.repSel ? '' : 'disabled'}>Crear lote y asignar</button></div>` : ''}
  ${enCurso.length ? `<div class="box"><h3 style="margin:0 0 4px">Lotes en ruta (${enCurso.length})</h3>${enCurso.map((l) => `<div class="fila"><div class="mid"><b>${esc(l[0].repartidor?.nombre)}</b>
    <span class="muted">${l.filter((p) => p.estado === 'entregado').length} de ${l.length} entregados · ${l.filter((p) => p.estado === 'recogido').length} en camino</span></div>
    <span class="badge">${money(l.reduce((s, p) => s + (p.precio || 0), 0))}</span></div>`).join('')}</div>` : ''}`;
}

const calc = (t, km, min) => { const x = S.tar[t]; return Math.max(x.minimo, Math.round((x.base + km * x.km + min * x.min) / 5) * 5); };
function vTarifas() {
  const campo = (t, c, lbl) => `<label>${lbl}<input class="in" type="number" inputmode="decimal" min="0" step="0.5" data-t="${t}" data-c="${c}" value="${S.tar[t][c]}"></label>`;
  return `<div class="box"><h2>Tarifas</h2><p class="muted" style="margin-top:-6px">El precio se calcula con banderazo + kilómetros + minutos, redondeado a $5, y nunca baja del mínimo.</p>
  ${['moto', 'auto'].map((t) => `<h3 style="margin:14px 0 4px">${NOMBRE[t]}</h3><div class="grid4">
    ${campo(t, 'base', 'Banderazo $')}${campo(t, 'km', 'Por km $')}${campo(t, 'min', 'Por minuto $')}${campo(t, 'minimo', 'Mínimo $')}</div>`).join('')}
  <h3 style="margin:14px 0 4px">Comisión de la app</h3>
  <label class="muted">Porcentaje que se queda Eco Drive de cada envío<input class="in" type="number" inputmode="decimal" min="0" max="50" step="1" id="tCom" value="${Math.round(S.tar.comision * 100)}"></label>
  <h3 style="margin:14px 0 4px">💰 Envío económico (ruta compartida)</h3>
  <div class="grid4">
    <label>Descuento %<input class="in" type="number" inputmode="decimal" min="0" max="80" step="1" id="eDesc" value="${Math.round(S.tar.eco.descuento * 100)}"></label>
    <label>Pago repartidor por paquete $<input class="in" type="number" inputmode="decimal" min="0" step="1" id="ePago" value="${S.tar.eco.pagoRep}"></label>
    <label>Precio mínimo $<input class="in" type="number" inputmode="decimal" min="0" step="1" id="eMin" value="${S.tar.eco.minimo}"></label></div>
  <div class="box" style="background:var(--surface2)" id="ejemplo">${ejemplo()}</div>
  <button class="cta" data-act="guardarTar">Guardar tarifas</button>
  <p class="muted small">Los cambios aplican al instante a los envíos nuevos. Los que ya están en curso conservan su precio.</p></div>`;
}
function ejemplo() {
  const c = S.tar.comision, e = S.tar.eco;
  const ej = [[3, 8], [8, 18], [15, 30]];
  const pe = Math.max(e.minimo, Math.round((calc('moto', 8, 18) * (1 - e.descuento)) / 5) * 5);
  return `<b>Ejemplos con estas tarifas</b>${ej.map(([k, m]) => `<div class="fila"><span class="mid">${k} km · ${m} min</span>
    <span>🏍️ ${money(calc('moto', k, m))} · 🚗 ${money(calc('auto', k, m))}<br><span class="muted small">repartidor moto recibe ${money(calc('moto', k, m) * (1 - c))}</span></span></div>`).join('')}
  <div class="fila"><span class="mid"><b>💰 Económico</b> · moto, 8 km · 18 min</span>
    <span>cliente paga ${money(pe)}<br><span class="muted small">repartidor recibe ${money(e.pagoRep)} · te quedan ${money(pe - e.pagoRep)} por paquete · ruta de 8 paquetes: ${money((pe - e.pagoRep) * 8)}</span></span></div>`;
}

function render() {
  const app = $('#app');
  if (!auth.currentUser) { app.innerHTML = vLogin(); $('#salir').hidden = true; return; }
  $('#salir').hidden = false;
  const pend = S.reps.filter((r) => (r.estado || 'pendiente') === 'pendiente').length;
  const nProg = S.pedidos.filter(esProg).length;
  app.innerHTML = `<div class="tabs" role="tablist">
    <button data-act="tab" data-v="envios" aria-pressed="${S.tab === 'envios'}">Envíos</button>
    <button data-act="tab" data-v="lotes" aria-pressed="${S.tab === 'lotes'}">Lotes${nProg ? ` (${nProg})` : ''}</button>
    <button data-act="tab" data-v="puntos" aria-pressed="${S.tab === 'puntos'}">Negocios</button>
    <button data-act="tab" data-v="reps" aria-pressed="${S.tab === 'reps'}">Repartidores${pend ? ` (${pend})` : ''}</button>
    <button data-act="tab" data-v="tarifas" aria-pressed="${S.tab === 'tarifas'}">Tarifas</button></div>
    ${{ envios: vEnvios, lotes: vLotes, puntos: vPuntos, reps: vReps, tarifas: vTarifas }[S.tab]()}`;
}
// No redibujar la pestaña de tarifas mientras el administrador escribe
const refrescar = () => { if (!(['tarifas', 'puntos'].includes(S.tab) && S.editando)) render(); };

// ---------- Datos ----------
function escuchar() {
  subs.forEach((u) => u()); subs = [];
  subs.push(onSnapshot(query(collection(db, PEDIDOS), orderBy('creado', 'desc'), limit(150)), (s) => {
    S.pedidos = s.docs.map((d) => ({ id: d.id, ...d.data() })); refrescar();
  }, () => toast('No se pudieron leer los envíos.')));
  subs.push(onSnapshot(collection(db, PUNTOS), (s) => {
    S.puntos = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nombre).localeCompare(b.nombre)); refrescar();
  }, () => toast('No se pudieron leer los negocios.')));
  subs.push(onSnapshot(collection(db, REPS), (s) => {
    S.reps = s.docs.map((d) => ({ id: d.id, ...d.data() })); refrescar();
  }));
  subs.push(onSnapshot(doc(db, 'ecodrive_config', 'tarifas'), (s) => {
    const d = s.exists() ? s.data() : {};
    S.tar = { moto: { ...DEF.moto, ...d.moto }, auto: { ...DEF.auto, ...d.auto }, comision: d.comision ?? DEF.comision, eco: { ...DEF.eco, ...d.eco } };
    refrescar();
  }));
}

// ---------- Eventos ----------
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.t) { S.editando = true; const v = parseFloat(t.value); if (!isNaN(v) && v >= 0) S.tar[t.dataset.t][t.dataset.c] = v; }
  if (t.id === 'tCom') { S.editando = true; const v = parseFloat(t.value); if (!isNaN(v) && v >= 0 && v < 100) S.tar.comision = v / 100; }
  const eco = { eDesc: ['descuento', 100], ePago: ['pagoRep', 1], eMin: ['minimo', 1] }[t.id];
  if (eco) { S.editando = true; const v = parseFloat(t.value); if (!isNaN(v) && v >= 0 && v < (eco[1] === 100 ? 90 : 100000)) S.tar.eco[eco[0]] = v / eco[1]; }
  if (t.dataset.f) {
    S.editando = true; S.form[t.dataset.f] = t.type === 'number' ? (parseFloat(t.value) || 0) : t.value;
    if (t.dataset.f === 'q') {
      S.form.sel = null; clearTimeout(tPunto);
      tPunto = setTimeout(async () => { S.form.res = (await buscarLugar(S.form.q)).filter((x) => x.lat); const e = $('#pRes'); if (e) e.innerHTML = resPuntos(); }, 450);
    }
  }
  const ej = $('#ejemplo'); if (ej) ej.innerHTML = ejemplo();
});
document.addEventListener('change', (e) => { if (e.target.id === 'repSel') { S.repSel = e.target.value; render(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.target.id === 'lPass' || e.target.id === 'lEmail')) $('[data-act="entrar"]')?.click(); });

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id, v = b.dataset.v;
  switch (a) {
    case 'entrar': {
      const email = $('#lEmail').value.trim(), pass = $('#lPass').value;
      if (!email || !pass) return toast('Escribe correo y contraseña.');
      b.disabled = true;
      try { await signInWithEmailAndPassword(auth, email, pass); }
      catch { toast('Correo o contraseña incorrectos.'); b.disabled = false; }
      return;
    }
    case 'salir': await signOut(auth); return;
    case 'tab': S.tab = v; S.editando = false; render(); return;
    case 'estadoRep': {
      const r = S.reps.find((x) => x.id === id);
      if (v === 'bloqueado' && !confirm(`¿Suspender a ${r?.nombre}? Ya no podrá recibir envíos.`)) return;
      try {
        await updateDoc(doc(db, REPS, id), { estado: v, ...(v === 'bloqueado' ? { enLinea: false } : {}), revisado: serverTimestamp() });
        toast(v === 'aprobado' ? `${r?.nombre} ya puede recibir envíos.` : `${r?.nombre} fue suspendido.`);
      } catch (err) { sinPermiso(err); }
      return;
    }
    case 'cancelarPedido':
      if (!confirm('¿Cancelar este envío? El cliente y el repartidor lo verán cancelado.')) return;
      try { await updateDoc(doc(db, PEDIDOS, id), { estado: 'cancelado', canceladoPor: 'admin', actualizado: serverTimestamp() }); toast('Envío cancelado.'); }
      catch (err) { sinPermiso(err); }
      return;
    case 'guardarTar': {
      const t = S.tar, ok = ['moto', 'auto'].every((k) => ['base', 'km', 'min', 'minimo'].every((c) => typeof t[k][c] === 'number' && t[k][c] >= 0));
      if (!ok || t.comision < 0 || t.comision >= 0.5 || !(t.eco.descuento >= 0 && t.eco.descuento < 0.9) || !(t.eco.pagoRep >= 0) || !(t.eco.minimo >= 0)) return toast('Revisa los números: no pueden ser negativos y la comisión debe ser menor a 50%.');
      try {
        await setDoc(doc(db, 'ecodrive_config', 'tarifas'), { moto: t.moto, auto: t.auto, comision: t.comision, eco: t.eco, actualizado: serverTimestamp(), por: auth.currentUser.email });
        S.editando = false; toast('Tarifas guardadas. Ya aplican a los envíos nuevos.'); render();
      } catch (err) { sinPermiso(err); }
      return;
    }
    case 'puntoElegir': S.form.sel = S.form.res[+b.dataset.i]; render(); return;
    case 'puntoCrear': {
      const f = S.form;
      if (!f.nombre.trim() || !f.sel) return toast('Escribe el nombre y elige la dirección de la lista.');
      const clave = [...crypto.getRandomValues(new Uint8Array(9))].map((x) => x.toString(16).padStart(2, '0')).join('');
      const ref = doc(collection(db, PUNTOS));
      b.disabled = true;
      try {
        await setDoc(ref, {
          nombre: f.nombre.trim(), tel: tel10(f.tel), horario: f.horario.trim(), pago: f.pago >= 0 ? f.pago : 10,
          dir: f.sel.dir || f.sel.n, lat: f.sel.lat, lng: f.sel.lng, activo: true, claveHash: await sha256(clave), creado: serverTimestamp(),
        });
        S.form = formVacio(); S.editando = false; render();
        const link = enlaceNegocio(ref.id, clave);
        try { await navigator.clipboard.writeText(link); toast('Negocio guardado. Enlace copiado: mándaselo por WhatsApp.'); }
        catch { prompt('Negocio guardado. Copia este enlace y mándaselo al negocio:', link); }
      } catch (err) { sinPermiso(err); b.disabled = false; }
      return;
    }
    case 'puntoActivo': {
      const p = S.puntos.find((x) => x.id === id);
      try { await updateDoc(doc(db, PUNTOS, id), { activo: !p?.activo }); } catch (err) { sinPermiso(err); }
      return;
    }
    case 'puntoEnlace': {
      if (!confirm('Se crea un enlace nuevo y el anterior deja de funcionar. ¿Continuar?')) return;
      const clave = [...crypto.getRandomValues(new Uint8Array(9))].map((x) => x.toString(16).padStart(2, '0')).join('');
      try {
        await updateDoc(doc(db, PUNTOS, id), { claveHash: await sha256(clave) });
        const link = enlaceNegocio(id, clave);
        try { await navigator.clipboard.writeText(link); toast('Enlace nuevo copiado.'); }
        catch { prompt('Copia este enlace y mándaselo al negocio:', link); }
      } catch (err) { sinPermiso(err); }
      return;
    }
    case 'sel': if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); render(); return;
    case 'selZona': {
      const l = S.pedidos.filter(esProg).filter((p) => zonaDe(p.destino) === v);
      const todos = l.every((p) => S.sel.has(p.id));
      l.forEach((p) => { if (todos) S.sel.delete(p.id); else S.sel.add(p.id); });
      render(); return;
    }
    case 'crearLote': {
      const r = S.reps.find((x) => x.id === S.repSel);
      const ps = S.pedidos.filter((p) => esProg(p) && S.sel.has(p.id));
      if (!r || !ps.length) return toast('Elige paquetes y un repartidor.');
      if (r.tipo === 'moto' && ps.some((p) => p.tipo === 'auto')) return toast('Hay paquetes de vehículo. Elige un repartidor con vehículo.');
      const cs = S.pedidos.filter((p) => p.repartidor?.uid === r.id && p.calif);
      const calif = cs.length ? Math.round((cs.reduce((s, p) => s + p.calif, 0) / cs.length) * 10) / 10 : 5;
      const info = { uid: r.id, nombre: r.nombre, tel: r.tel, vehiculo: r.vehiculo, placas: r.placas, calif };
      const loteId = 'L' + Date.now().toString(36);
      b.disabled = true;
      try {
        await runTransaction(db, async (tx) => {
          const refs = ps.map((p) => doc(db, PEDIDOS, p.id));
          const snaps = await Promise.all(refs.map((rf) => tx.get(rf)));
          if (snaps.some((sn) => !sn.exists() || sn.data().estado !== 'buscando')) throw new Error('cambio');
          refs.forEach((rf) => tx.update(rf, { estado: 'asignado', repartidor: info, loteId, actualizado: serverTimestamp() }));
        });
        S.sel.clear(); toast(`Lote creado: ${ps.length} paquetes para ${r.nombre}.`);
      } catch (err) {
        if (err?.message === 'cambio') toast('Un paquete cambió (¿lo canceló el cliente?). Revisa la lista.'); else sinPermiso(err);
      }
      render(); return;
    }
    default:
  }
});

onAuthStateChanged(auth, (u) => {
  if (u) escuchar(); else { subs.forEach((x) => x()); subs = []; }
  render();
});
