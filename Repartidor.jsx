import {useEffect,useState} from 'react';
import {collection,doc,onSnapshot,updateDoc} from 'firebase/firestore';
import {db,PEDIDOS} from './firebase';
import {VEH,SIGUIENTE,dirTxt,guardar,leer,waLink} from './comun';
export default function Repartidor(){
 const [yo,setYo]=useState(leer('ed_repartidor',null)),[n,setN]=useState(''),[w,setW]=useState(''),[ps,setPs]=useState([]);
 useEffect(()=>yo?onSnapshot(collection(db,PEDIDOS),q=>setPs(q.docs.map(d=>({id:d.id,...d.data()})))):undefined,[yo]);
 if(!yo)return <div className="app"><header><b>eco drive repartidor</b></header><main>
  <input placeholder="Tu nombre" value={n} onChange={e=>setN(e.target.value)}/>
  <input inputMode="numeric" maxLength={10} placeholder="Tu WhatsApp (10 dígitos)" value={w} onChange={e=>setW(e.target.value.replace(/\D/g,''))}/>
  <button className="big" onClick={()=>{if(n&&w.length==10){const r={n,w};guardar('ed_repartidor',r);setYo(r)}}}>Entrar</button></main></div>;
 const mine=ps.filter(p=>p.repartidorWa==yo.w&&p.estado!='entregado'),libres=ps.filter(p=>p.estado=='pendiente');
 const up=(p,e)=>updateDoc(doc(db,PEDIDOS,p.id),e);
 const Tarjeta=({p,children})=><div className="card"><b>{VEH[p.vehiculo].e} ${p.precio} · {p.km} km {p.economico?'· Económico':''}{p.oferta?' · Oferta del cliente':''}</b>
  <p>📍 {dirTxt(p.origen)}<br/><small>{p.origen.ref}</small></p><p>🏁 {dirTxt(p.destino)} {p.puntoNombre&&`(${p.puntoNombre})`}<br/><small>{p.destino.ref}</small></p>
  <p>📦 {p.que} · Recibe: {p.recibe}</p>{children}</div>;
 return <div className="app"><header><b>eco drive repartidor</b></header><main>
  <h4>Mis pedidos</h4>{!mine.length&&<small>Aún no tienes pedidos activos.</small>}
  {mine.map(p=><Tarjeta key={p.id} p={p}><div className="fila">
   <a className="btn" href={waLink(p.clienteWa,'Hola, soy tu repartidor de Eco Drive')}>Cliente</a><a className="btn" href={waLink(p.recibeWa,'Hola, llevo un paquete de Eco Drive para ti')}>Quien recibe</a>
   <button onClick={()=>up(p,{estado:SIGUIENTE[p.estado]})}>Marcar {SIGUIENTE[p.estado]}</button></div></Tarjeta>)}
  <h4>Pedidos disponibles</h4>{!libres.length&&<small>No hay pedidos por ahora.</small>}
  {libres.map(p=><Tarjeta key={p.id} p={p}><button className="big" onClick={()=>up(p,{estado:'aceptado',repartidor:yo.n,repartidorWa:yo.w})}>Aceptar ${p.precio}</button></Tarjeta>)}
 </main></div>;
}
