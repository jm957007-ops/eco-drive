import {useEffect,useState} from 'react';
import {collection,doc,getDocs,onSnapshot,query,updateDoc,where} from 'firebase/firestore';
import {db,PEDIDOS} from './firebase';
import {VEH,SIGUIENTE,dirTxt,guardar,leer,waLink} from './comun';
const R='ecodrive_repartidores';
export default function Repartidor(){
 const [yo,setYo]=useState(leer('ed_repartidor',null)),[w,setW]=useState(''),[ps,setPs]=useState([]),[msg,setMsg]=useState('');
 const salir=()=>{try{localStorage.removeItem('ed_repartidor')}catch{}setYo(null)};
 useEffect(()=>yo?onSnapshot(collection(db,PEDIDOS),q=>setPs(q.docs.map(d=>({id:d.id,...d.data()})))):undefined,[yo]);
 useEffect(()=>yo?onSnapshot(query(collection(db,R),where('wa','==',yo.w)),q=>{if(!q.docs.some(d=>d.data().activo))salir()}):undefined,[yo?.w]);
 async function entrar(){
  if(w.length!=10)return setMsg('Escribe tu WhatsApp de 10 dígitos.');
  const q=await getDocs(query(collection(db,R),where('wa','==',w)));
  const r=q.docs.map(d=>d.data()).find(x=>x.activo);
  if(!r)return setMsg('Tu número no está registrado o está desactivado. Pide tu alta.');
  const y={n:r.nombre,w:r.wa,v:r.v};guardar('ed_repartidor',y);setYo(y);setMsg('');
 }
 if(!yo)return <div className="app"><header><b>eco drive repartidor</b></header><main>
  <h4>Entra con tu WhatsApp registrado</h4>
  <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 dígitos" value={w} onChange={e=>setW(e.target.value.replace(/\D/g,''))}/>
  {msg&&<p className="msg">{msg}</p>}<button className="big" onClick={entrar}>Entrar</button></main></div>;
 const mine=ps.filter(p=>p.repartidorWa==yo.w&&p.estado!='entregado'),libres=ps.filter(p=>p.estado=='pendiente'&&(!yo.v||p.vehiculo==yo.v));
 const up=(p,e)=>updateDoc(doc(db,PEDIDOS,p.id),e);
 const Tarjeta=({p,children})=><div className="card"><b>{VEH[p.vehiculo].e} ${p.precio} · {p.km} km {p.economico?'· Económico':''}{p.oferta?' · Oferta del cliente':''}</b>
  <p>📍 {dirTxt(p.origen)}<br/><small>{p.origen.ref}</small></p><p>🏁 {dirTxt(p.destino)} {p.puntoNombre&&`(${p.puntoNombre})`}<br/><small>{p.destino.ref}</small></p>
  <p>📦 {p.que} · Recibe: {p.recibe}</p>{children}</div>;
 return <div className="app"><header><b>eco drive repartidor</b></header><main>
  <small>Hola, {yo.n}</small>
  <h4>Mis pedidos</h4>{!mine.length&&<small>Aún no tienes pedidos activos.</small>}
  {mine.map(p=><Tarjeta key={p.id} p={p}><div className="fila">
   <a className="btn" href={waLink(p.clienteWa,'Hola, soy tu repartidor de Eco Drive')}>Cliente</a><a className="btn" href={waLink(p.recibeWa,'Hola, llevo un paquete de Eco Drive para ti')}>Quien recibe</a>
   <button onClick={()=>up(p,{estado:SIGUIENTE[p.estado]})}>Marcar {SIGUIENTE[p.estado]}</button></div></Tarjeta>)}
  <h4>Pedidos disponibles</h4>{!libres.length&&<small>No hay pedidos por ahora.</small>}
  {libres.map(p=><Tarjeta key={p.id} p={p}><button className="big" onClick={()=>up(p,{estado:'aceptado',repartidor:yo.n,repartidorWa:yo.w})}>Aceptar ${p.precio}</button></Tarjeta>)}
  <button className="sec" onClick={salir}>Salir</button>
 </main></div>;
}
