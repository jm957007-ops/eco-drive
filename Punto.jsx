import {useEffect,useState} from 'react';
import {collection,doc,getDocs,onSnapshot,query,serverTimestamp,updateDoc,where} from 'firebase/firestore';
import {db} from './firebase';
import Scanner from './Scanner';
import {PEDIDOS,PUNTOS,ESTADO,dirTxt,guardar,leer,coincide} from './comun';
export default function Punto(){
 const [yo,setYo]=useState(leer('ed_punto',null)),[w,setW]=useState(''),[ps,setPs]=useState([]),[msg,setMsg]=useState(''),[scan,setScan]=useState(null),[man,setMan]=useState('');
 const salir=()=>{try{localStorage.removeItem('ed_punto')}catch{}setYo(null)};
 useEffect(()=>yo?onSnapshot(collection(db,PEDIDOS),q=>setPs(q.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.codRecoge&&p.origen&&p.destino))):undefined,[yo]);
 async function entrar(){
  if(w.length!=10)return setMsg('Escribe el WhatsApp de 10 dígitos de tu negocio.');
  const q=await getDocs(query(collection(db,PUNTOS),where('wa','==',w)));
  if(q.empty)return setMsg('Ese número no está registrado como Punto Eco.');
  const d=q.docs[0],y={id:d.id,n:d.data().nombre};guardar('ed_punto',y);setYo(y);setMsg('');
 }
 if(!yo)return <div className="app"><header><b>eco punto</b></header><main>
  <h4>Entra con el WhatsApp de tu negocio</h4>
  <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 dígitos" value={w} onChange={e=>setW(e.target.value.replace(/\D/g,''))}/>
  {msg&&<p className="msg">{msg}</p>}<button className="big" onClick={entrar}>Entrar</button></main></div>;
 const up=(p,e)=>updateDoc(doc(db,PEDIDOS,p.id),e);
 const mios=ps.filter(p=>p.estado!='entregado'&&((p.origen&&p.origen.puntoId==yo.id)||(p.destino&&p.destino.puntoId==yo.id)));
 async function entregar(p,txt){
  if(coincide(p,'e',txt)){await up(p,{estado:'entregado',entregadoEn:serverTimestamp()});setScan(null);setMan('');setMsg('')}
  else setMsg('Código incorrecto. No entregues el paquete.');
 }
 return <div className="app"><header><b>eco punto · {yo.n}</b></header><main>
  <h4>Paquetes en tu punto ({mios.length})</h4>{!mios.length&&<small>No hay paquetes pendientes.</small>}
  {mios.map(p=>{const sale=p.origen.puntoId==yo.id;return <div className="card" key={p.id}>
   <b>{sale?'📤 Se envía desde aquí':'📥 Se recoge aquí'}</b>
   <p>📦 {p.que} · Recibe: {p.recibe}<br/><small>{sale?'Destino: '+dirTxt(p.destino):'Origen: '+dirTxt(p.origen)}</small></p>
   <small>Estado: {ESTADO[p.estado]}</small>
   {sale&&(p.enPunto?<p><b>✔ Paquete recibido</b></p>:<button className="big" onClick={()=>up(p,{enPunto:true})}>Ya recibí el paquete</button>)}
   {!sale&&(p.estado=='en_punto'?<button className="big" onClick={()=>{setMsg('');setScan(p.id)}}>📷 Escanear QR de quien recoge</button>:<p><small>Aún no llega al punto.</small></p>)}
   {scan==p.id&&<div style={{marginTop:8}}><Scanner onCode={x=>entregar(p,x)} onClose={()=>setScan(null)}/>
    <input placeholder="O escribe el código" autoComplete="off" value={man} onChange={e=>setMan(e.target.value)}/><button className="sec" onClick={()=>entregar(p,man)}>Confirmar código</button>{msg&&<p className="msg">{msg}</p>}</div>}</div>})}
  <button className="sec" onClick={salir}>Salir</button></main></div>;
}
