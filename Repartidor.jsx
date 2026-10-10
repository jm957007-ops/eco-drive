import {useEffect,useState} from 'react';
import {collection,doc,getDocs,onSnapshot,query,serverTimestamp,setDoc,updateDoc,where} from 'firebase/firestore';
import {getMessaging,getToken,onMessage,isSupported} from 'firebase/messaging';
import {db} from './firebase';
import Scanner from './Scanner';
import {PEDIDOS,REPS,VEH,dirTxt,guardar,leer,waLink,coincide} from './comun';
const MSG_UBI='Hola, soy tu repartidor de Eco Drive. ¿Me puedes enviar tu ubicación por aquí, por favor? Así llego más fácil. ¡Gracias!';
const VAPID='BCp2JTzDABCVjPfUGaubdp2-NA-7PAcP4jdEUgNpU6kco_tTnKwMg9_6pSHEWanuVqZ0gmUnomYWtKZOTlS7e2I';
const TOKENS='ecodrive_tokens';
function pitar(){try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.value=.3;o.start();setTimeout(()=>{o.stop();c.close()},600)}catch{}}
export default function Repartidor(){
 const [yo,setYo]=useState(leer('ed_repartidor',null)),[w,setW]=useState(''),[ps,setPs]=useState([]),[msg,setMsg]=useState(''),[scan,setScan]=useState(null),[man,setMan]=useState(''),[co,setCo]=useState({});
 const [avisos,setAvisos]=useState(typeof Notification!=='undefined'?Notification.permission:'no');
 const salir=()=>{try{localStorage.removeItem('ed_repartidor')}catch{}setYo(null)};
 useEffect(()=>yo?onSnapshot(collection(db,PEDIDOS),q=>setPs(q.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.codRecoge&&p.origen&&p.destino))):undefined,[yo]);
 useEffect(()=>yo?onSnapshot(query(collection(db,REPS),where('wa','==',yo.w)),q=>{if(!q.docs.some(d=>d.data().activo))salir()}):undefined,[yo?yo.w:'']);
 async function registrar(pedir){
  try{
   if(!(await isSupported())||typeof Notification==='undefined')return setAvisos('no');
   let perm=Notification.permission;
   if(perm==='default'&&pedir)perm=await Notification.requestPermission();
   setAvisos(perm);
   if(perm!=='granted')return;
   const reg=await navigator.serviceWorker.register('/firebase-messaging-sw.js');
   const token=await getToken(getMessaging(),{vapidKey:VAPID,serviceWorkerRegistration:reg});
   if(token)await setDoc(doc(db,TOKENS,token),{wa:yo.w,v:yo.v||'',actualizado:serverTimestamp()});
  }catch(e){setAvisos('error')}
 }
 useEffect(()=>{if(yo)registrar(false)},[yo?yo.w:'']);
 useEffect(()=>{
  if(!yo)return;let off;
  isSupported().then(ok=>{if(ok)off=onMessage(getMessaging(),()=>pitar())}).catch(()=>{});
  return()=>{if(off)off()};
 },[yo?yo.w:'']);
 async function entrar(){
  if(w.length!=10)return setMsg('Escribe tu WhatsApp de 10 dígitos.');
  const q=await getDocs(query(collection(db,REPS),where('wa','==',w)));
  const r=q.docs.map(d=>d.data()).find(x=>x.activo);
  if(!r)return setMsg('Tu número no está registrado o está desactivado. Pide tu alta.');
  const y={n:r.nombre,w:r.wa,v:r.v};guardar('ed_repartidor',y);setYo(y);setMsg('');
 }
 if(!yo)return <div className="app"><header><b>eco drive repartidor</b></header><main>
  <h4>Entra con tu WhatsApp registrado</h4>
  <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 dígitos" value={w} onChange={e=>setW(e.target.value.replace(/\D/g,''))}/>
  {msg&&<p className="msg">{msg}</p>}<button className="big" onClick={entrar}>Entrar</button></main></div>;
 const up=(p,e)=>updateDoc(doc(db,PEDIDOS,p.id),e);
 const mine=ps.filter(p=>p.repartidorWa==yo.w&&p.estado!='entregado'),libres=ps.filter(p=>p.estado=='pendiente'&&(!yo.v||p.vehiculo==yo.v));
 async function verificar(p,t,txt){
  if(coincide(p,t,txt)){await up(p,{estado:t=='r'?'recogido':'entregado',[t=='r'?'recogidoEn':'entregadoEn']:serverTimestamp()});setScan(null);setMan('');setMsg('')}
  else setMsg('Código incorrecto. Revisa que sea el paquete correcto.');
 }
 const Tarjeta=({p,children})=><div className="card"><b>{VEH[p.vehiculo]?VEH[p.vehiculo].e:''} ${p.precio}{p.oferta?' · Oferta del cliente':''}</b>
  <p>📍 {dirTxt(p.origen)}<br/><small>{p.origen.ref}</small></p><p>🏁 {dirTxt(p.destino)}<br/><small>{p.destino.ref}</small></p>
  <p>📦 {p.que} · Recibe: {p.recibe}</p>{children}</div>;
 const bt=(p,t,txt)=><button onClick={()=>{setMsg('');setScan({id:p.id,t})}}>📷 {txt}</button>;
 const txtAvisos={denied:'Bloqueaste las notificaciones. Actívalas en los ajustes del celular para esta app.',no:'Este navegador no permite avisos. Instala la app desde Chrome.',error:'No se pudieron activar los avisos. Intenta de nuevo.',default:'Activa los avisos para que suene tu celular cuando haya un pedido nuevo, aunque la app esté cerrada.'};
 return <div className="app"><header><b>eco drive repartidor</b></header><main>
  <small>Hola, {yo.n}</small>
  {avisos=='granted'?<small>🔔 Avisos de pedidos activados</small>:<div className="card"><b>🔔 Avisos de pedidos nuevos</b><p><small>{txtAvisos[avisos]||txtAvisos.default}</small></p>
   {(avisos=='default'||avisos=='error')&&<button className="big" onClick={()=>registrar(true)}>Activar avisos con sonido</button>}</div>}
  <h4>Mis pedidos</h4>{!mine.length&&<small>Aún no tienes pedidos activos.</small>}
  {mine.map(p=><Tarjeta key={p.id} p={p}><div className="fila">
   <a className="btn" href={waLink(p.clienteWa,MSG_UBI)}>Cliente</a><a className="btn" href={waLink(p.recibeWa,MSG_UBI)}>Quien recibe</a>
   {p.estado=='aceptado'&&bt(p,'r','Escanear paquete')}
   {p.estado=='recogido'&&(p.destino.tipo=='punto'?<button onClick={()=>up(p,{estado:'en_punto'})}>Dejé el paquete en el Punto Eco</button>:bt(p,'e','Escanear QR de quien recibe'))}
   {p.estado=='en_punto'&&<small>Esperando que el Punto Eco entregue el paquete.</small>}</div>
   {scan&&scan.id==p.id&&<div style={{marginTop:8}}><Scanner onCode={x=>verificar(p,scan.t,x)} onClose={()=>setScan(null)}/>
    <input placeholder="O escribe el código" autoComplete="off" value={man} onChange={e=>setMan(e.target.value)}/><button className="sec" onClick={()=>verificar(p,scan.t,man)}>Confirmar código</button>{msg&&<p className="msg">{msg}</p>}</div>}</Tarjeta>)}
  <h4>Pedidos disponibles</h4>{!libres.length&&<small>No hay pedidos por ahora.</small>}
  {libres.map(p=><Tarjeta key={p.id} p={p}>
   <button className="big" onClick={()=>up(p,{estado:'aceptado',repartidor:yo.n,repartidorWa:yo.w})}>Aceptar ${p.precio}</button>
   {p.oferta&&(p.contra?<small>Ya hay una contraoferta (${p.contra.precio}).</small>:<div className="fila" style={{flexWrap:'nowrap'}}>
    <input inputMode="numeric" placeholder="Tu precio $" value={co[p.id]||''} onChange={e=>setCo({...co,[p.id]:e.target.value.replace(/\D/g,'')})}/>
    <button className="sec" onClick={()=>+co[p.id]>0&&up(p,{contra:{precio:+co[p.id],nombre:yo.n,wa:yo.w}})}>Contraofertar</button></div>)}</Tarjeta>)}
  <button className="sec" onClick={salir}>Salir</button>
 </main></div>;
}
