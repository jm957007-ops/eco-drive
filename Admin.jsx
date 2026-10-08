import {useEffect,useState} from 'react';
import {addDoc,collection,deleteDoc,doc,onSnapshot} from 'firebase/firestore';
import {db,PEDIDOS,PUNTOS} from './firebase';
import {dirTxt,geoDir} from './comun';
const PIN='1234'; // CÁMBIALO
const V={nombre:'',calle:'',numero:'',colonia:'',wa:''};
export default function Admin(){
 const [ok,setOk]=useState(false),[pin,setPin]=useState(''),[ps,setPs]=useState([]),[pt,setPt]=useState([]),[f,setF]=useState(V),[msg,setMsg]=useState('');
 useEffect(()=>{if(!ok)return;const a=onSnapshot(collection(db,PEDIDOS),q=>setPs(q.docs.map(d=>({id:d.id,...d.data()}))));
  const b=onSnapshot(collection(db,PUNTOS),q=>setPt(q.docs.map(d=>({id:d.id,...d.data()}))));return()=>{a();b()}},[ok]);
 if(!ok)return <div className="app"><header><b>eco drive admin</b></header><main><input type="password" placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/>
  <button className="big" onClick={()=>setOk(pin==PIN)}>Entrar</button></main></div>;
 async function agregar(){
  if(Object.values(f).some(x=>!x))return setMsg('Llena todos los campos.');
  const p=await geoDir(f);if(!p)return setMsg('No pude ubicar la dirección.');
  await addDoc(collection(db,PUNTOS),{...f,lat:p[0],lng:p[1]});setF(V);setMsg('');}
 const k=e=>({value:f[e],autoComplete:'off',onChange:x=>setF({...f,[e]:x.target.value})});
 return <div className="app"><header><b>eco drive admin</b></header><main>
  <div className="card"><h4>Nuevo Punto Eco (negocio)</h4><input placeholder="Nombre del negocio" {...k('nombre')}/><input placeholder="Calle" {...k('calle')}/>
   <div className="fila"><input placeholder="Número" {...k('numero')}/><input placeholder="Colonia" {...k('colonia')}/></div><input placeholder="WhatsApp del negocio" {...k('wa')}/>
   {msg&&<p className="msg">{msg}</p>}<button onClick={agregar}>Guardar punto</button></div>
  <h4>Puntos Eco ({pt.length})</h4>{pt.map(p=><div className="card" key={p.id}><b>{p.nombre}</b><br/><small>{dirTxt(p)}</small><button className="sec" onClick={()=>deleteDoc(doc(db,PUNTOS,p.id))}>Quitar</button></div>)}
  <h4>Pedidos ({ps.length})</h4>{ps.map(p=><div className="card" key={p.id}><b>${p.precio} · {p.estado}</b><br/><small>{dirTxt(p.origen)} → {dirTxt(p.destino)}<br/>Repartidor: {p.repartidor||'—'}</small></div>)}
 </main></div>;
}
