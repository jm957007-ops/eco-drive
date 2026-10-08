import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {db} from './firebase';
import QR from './QR';
import {PEDIDOS,ESTADO} from './comun';
export default function Recibo(){
 const [,,id,k]=location.hash.split('/'),[p,setP]=useState(undefined);
 useEffect(()=>id?onSnapshot(doc(db,PEDIDOS,id),d=>setP(d.exists()?d.data():null)):undefined,[id]);
 const valido=p&&p.codEntrega==k;
 return <div className="app"><header><b>eco drive</b></header><main>
  {p===undefined&&<p>Cargando…</p>}
  {(p===null||(p&&!valido))&&<div className="card"><b>Este enlace no es válido.</b></div>}
  {valido&&<div className="card qrbox"><h3>Tu paquete: {p.que}</h3><p>Estado: <b>{ESTADO[p.estado]}</b></p>
   {p.estado=='entregado'?<b>✔ Entregado</b>:<><p>{p.destino.tipo=='punto'?`Enseña este QR en ${p.destino.nombre} para recoger tu paquete:`:'Enséñale este QR al repartidor cuando llegue:'}</p><QR texto={`EDE:${id}:${p.codEntrega}`}/><p className="cod">{p.codEntrega}</p>
   <small>Si no se puede escanear, di este código. No lo compartas con nadie más.</small></>}</div>}
 </main></div>;
}
