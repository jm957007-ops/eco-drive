import './estilos.css';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig, PEDIDOS, REPS } from './firebase.js';

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

const DEF = { moto: { base: 25, km: 6, min: 0.8, minimo: 35 }, auto: { base: 35, km: 8.5, min: 1.2, minimo: 50 }, comision: 0.10 };
const NOMBRE = { moto: '🏍️ Moto', auto: '🚗 Vehículo' };
const EST_P = { buscando: ['Buscando', 'warn'], asignado: ['Asignado', ''], recogido: ['En camino', ''], entregado: ['Entregado', 'ok'], cancelado: ['Cancelado', 'bad'] };
const EST_R = { pendiente: ['Pendiente', 'warn'], aprobado: ['Aprobado', 'ok'], bloqueado: ['Bloqueado', 'bad'] };

const S = { tab: 'envios', pedidos: [], reps: [], tar: structuredClone(DEF), editando: false };
let subs = [];

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
  const ent = hoy.filter((p) => p.estado === 'entregado');
  const ventas = ent.reduce((s, p) => s + (p.precio || 0), 0);
  const com = ent.reduce((s, p) => s + (p.precio || 0) * (p.comision ?? S.tar.comision), 0);
  const activos = S.pedidos.filter((p) => ['buscando', 'asignado', 'recogido'].includes(p.estado));
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
  const [t, c] = EST_P[p.estado] || [p.estado, ''];
  const activo = ['buscando', 'asignado', 'recogido'].includes(p.estado);
  return `<div class="fila"><div class="mid"><b>${esc(p.origen?.n)} → ${esc(p.destino?.n)}</b>
    <span class="muted">${NOMBRE[p.tipo] || ''} · ${fecha(p.creado)} · ${p.repartidor ? esc(p.repartidor.nombre) : 'sin repartidor'}${p.calif ? ' · ★ ' + p.calif : ''}</span>
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
    const entregas = S.pedidos.filter((p) => p.repartidor?.uid === r.id && p.estado === 'entregado').length;
    return `<div class="fila"><div class="mid"><b>${r.enLinea && est === 'aprobado' ? '<span class="enlinea" title="Conectado"></span>' : ''}${esc(r.nombre)}</b>
      <span class="muted">${NOMBRE[r.tipo] || ''} · ${esc(r.vehiculo)} · ${esc(r.placas)} · ${entregas} entregas recientes</span>
      <div class="btns"><a href="https://wa.me/52${tel10(r.tel)}" target="_blank" rel="noopener">WhatsApp</a>
      ${est !== 'aprobado' ? `<button class="go" data-act="estadoRep" data-id="${r.id}" data-v="aprobado">${est === 'bloqueado' ? 'Reactivar' : 'Aprobar'}</button>` : ''}
      ${est !== 'bloqueado' ? `<button class="bad" data-act="estadoRep" data-id="${r.id}" data-v="bloqueado">${est === 'pendiente' ? 'Rechazar' : 'Suspender'}</button>` : ''}</div></div>
      <span class="badge ${c}">${t}</span></div>`;
  }).join('') || '<p class="muted">Aún no se registra ningún repartidor. Comparte la liga /repartidor.</p>'}</div>`;
}

const calc = (t, km, min) => { const x = S.tar[t]; return Math.max(x.minimo, Math.round((x.base + km * x.km + min * x.min) / 5) * 5); };
function vTarifas() {
  const campo = (t, c, lbl) => `<label>${lbl}<input class="in" type="number" inputmode="decimal" min="0" step="0.5" data-t="${t}" data-c="${c}" value="${S.tar[t][c]}"></label>`;
  return `<div class="box"><h2>Tarifas</h2><p class="muted" style="margin-top:-6px">El precio se calcula con banderazo + kilómetros + minutos, redondeado a $5, y nunca baja del mínimo.</p>
  ${['moto', 'auto'].map((t) => `<h3 style="margin:14px 0 4px">${NOMBRE[t]}</h3><div class="grid4">
    ${campo(t, 'base', 'Banderazo $')}${campo(t, 'km', 'Por km $')}${campo(t, 'min', 'Por minuto $')}${campo(t, 'minimo', 'Mínimo $')}</div>`).join('')}
  <h3 style="margin:14px 0 4px">Comisión de la app</h3>
  <label class="muted">Porcentaje que se queda Eco Drive de cada envío<input class="in" type="number" inputmode="decimal" min="0" max="50" step="1" id="tCom" value="${Math.round(S.tar.comision * 100)}"></label>
  <div class="box" style="background:var(--surface2)" id="ejemplo">${ejemplo()}</div>
  <button class="cta" data-act="guardarTar">Guardar tarifas</button>
  <p class="muted small">Los cambios aplican al instante a los envíos nuevos. Los que ya están en curso conservan su precio.</p></div>`;
}
function ejemplo() {
  const c = S.tar.comision;
  const ej = [[3, 8], [8, 18], [15, 30]];
  return `<b>Ejemplos con estas tarifas</b>${ej.map(([k, m]) => `<div class="fila"><span class="mid">${k} km · ${m} min</span>
    <span>🏍️ ${money(calc('moto', k, m))} · 🚗 ${money(calc('auto', k, m))}<br><span class="muted small">repartidor moto recibe ${money(calc('moto', k, m) * (1 - c))}</span></span></div>`).join('')}`;
}

function render() {
  const app = $('#app');
  if (!auth.currentUser) { app.innerHTML = vLogin(); $('#salir').hidden = true; return; }
  $('#salir').hidden = false;
  const pend = S.reps.filter((r) => (r.estado || 'pendiente') === 'pendiente').length;
  app.innerHTML = `<div class="tabs" role="tablist">
    <button data-act="tab" data-v="envios" aria-pressed="${S.tab === 'envios'}">Envíos</button>
    <button data-act="tab" data-v="reps" aria-pressed="${S.tab === 'reps'}">Repartidores${pend ? ` (${pend})` : ''}</button>
    <button data-act="tab" data-v="tarifas" aria-pressed="${S.tab === 'tarifas'}">Tarifas</button></div>
    ${{ envios: vEnvios, reps: vReps, tarifas: vTarifas }[S.tab]()}`;
}
// No redibujar la pestaña de tarifas mientras el administrador escribe
const refrescar = () => { if (!(S.tab === 'tarifas' && S.editando)) render(); };

// ---------- Datos ----------
function escuchar() {
  subs.forEach((u) => u()); subs = [];
  subs.push(onSnapshot(query(collection(db, PEDIDOS), orderBy('creado', 'desc'), limit(150)), (s) => {
    S.pedidos = s.docs.map((d) => ({ id: d.id, ...d.data() })); refrescar();
  }, () => toast('No se pudieron leer los envíos.')));
  subs.push(onSnapshot(collection(db, REPS), (s) => {
    S.reps = s.docs.map((d) => ({ id: d.id, ...d.data() })); refrescar();
  }));
  subs.push(onSnapshot(doc(db, 'ecodrive_config', 'tarifas'), (s) => {
    const d = s.exists() ? s.data() : {};
    S.tar = { moto: { ...DEF.moto, ...d.moto }, auto: { ...DEF.auto, ...d.auto }, comision: d.comision ?? DEF.comision };
    refrescar();
  }));
}

// ---------- Eventos ----------
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.t) { S.editando = true; const v = parseFloat(t.value); if (!isNaN(v) && v >= 0) S.tar[t.dataset.t][t.dataset.c] = v; }
  if (t.id === 'tCom') { S.editando = true; const v = parseFloat(t.value); if (!isNaN(v) && v >= 0 && v < 100) S.tar.comision = v / 100; }
  const ej = $('#ejemplo'); if (ej) ej.innerHTML = ejemplo();
});
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
      if (!ok || t.comision < 0 || t.comision >= 0.5) return toast('Revisa los números: no pueden ser negativos y la comisión debe ser menor a 50%.');
      try {
        await setDoc(doc(db, 'ecodrive_config', 'tarifas'), { moto: t.moto, auto: t.auto, comision: t.comision, actualizado: serverTimestamp(), por: auth.currentUser.email });
        S.editando = false; toast('Tarifas guardadas. Ya aplican a los envíos nuevos.'); render();
      } catch (err) { sinPermiso(err); }
      return;
    }
    default:
  }
});

onAuthStateChanged(auth, (u) => {
  if (u) escuchar(); else { subs.forEach((x) => x()); subs = []; }
  render();
});
