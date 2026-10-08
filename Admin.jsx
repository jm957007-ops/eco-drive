import {useEffect,useState} from 'react';
import {addDoc,collection,deleteDoc,doc,onSnapshot,serverTimestamp,setDoc,updateDoc} from 'firebase/firestore';
import {db,PEDIDOS,PUNTOS} from './firebase';
import {dirTxt,geoDir,precio,useTarifas} from './comun';
const PIN='1234'; // CÁMBIALO
const R='ecodrive_repartidores';
const V={nombre:'',calle:'',numero:'',colonia:'',wa:''};
const TABS=[['pedidos','Pedidos'],['repartidores','Repartidores'],['tarifas','Tarifas'],['puntos','Puntos Eco']];
export default function Admin(){
 const T=useTarifas();
 const [ok,setOk]=useState(false),[pin,setPin]=useState(''),[tab,setTab]=useState('pedidos'),[ps,setPs]=useState([]),[pt,setPt]=useState([]),[rp,setRp]=useState([]);
 const [f,setF]=useState(V),[rf,setRf]=useState({nombre:'',wa:'',v:'moto'}),[tf,setTf]=useState(null),[msg,setMsg]=useState('');
 useEffect(()=>setTf({mb:T.moto.base,mk:T.moto.km,ab:T.auto.base,ak:T.auto.km,e:T.eco}),[T]);
 useEffect(()=>{if(!ok)return;
  const L=[[PEDIDOS,setPs],[PUNTOS,setPt],[R,setRp]].map(([c,s])=>onSnapshot(collection(db,c),q=>s(q.docs.map(d=>({id:d.id,...d.data()})))));
  return()=>L.forEach(u=>u())},[ok]);
 if(!ok)return <div className="app"><header><b>eco drive admin</b></header><main><input type="password" placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/>
  <button className="big" onClick={()=>setOk(pin==PIN)}>Entrar</button></main></div>;
 async function agregarPunto(){
  if(Object.values(f).some(x=>!x))return setMsg('Llena todos los campos.');
  const p=await geoDir(f);if(!p)return setMsg('No pude ubicar la dirección.');
  await addDoc(collection(db,PUNTOS),{...f,lat:p[0],lng:p[1]});setF(V);setMsg('');}
 async function agregarRep(){
  if(!rf.nombre||!/^\d{10}$/.test(rf.wa))return setMsg('Escribe el nombre y un WhatsApp de 10 dígitos.');
  if(rp.some(r=>r.wa==rf.wa))return setMsg('Ese WhatsApp ya está registrado.');
  await addDoc(collection(db,R),{nombre:rf.nombre,wa:rf.wa,v:rf.v,activo:true,creado:serverTimestamp()});setRf({nombre:'',wa:'',v:'moto'});setMsg('');}
 const TT=tf&&{moto:{base:+tf.mb,km:+tf.mk},auto:{base:+tf.ab,km:+tf.ak},eco:+tf.e};
 async function guardarTar(){await setDoc(doc(db,'ecodrive_config','tarifas'),TT);setMsg('Tarifas guardadas ✔')}
 const k=e=>({value:f[e],autoComplete:'off',onChange:x=>setF({...f,[e]:x.target.value})});
 const tk=(c,l)=><label key={c}><small>{l}</small><input inputMode="numeric" value={tf[c]} onChange={e=>setTf({...tf,[c]:e.target.value.replace(/\D/g,'')})}/></label>;
 return <div className="app"><header><b>eco drive admin</b></header><main>
  <div className="chips">{TABS.map(([c,t])=><button key={c} className={tab==c?'on':''} onClick={()=>{setTab(c);setMsg('')}}>{t}</button>)}</div>
  {tab=='pedidos'&&<><h4>Pedidos ({ps.length})</h4>{ps.map(p=><div className="card" key={p.id}><b>${p.precio} · {p.estado}</b><br/><small>{dirTxt(p.origen)} → {dirTxt(p.destino)}<br/>Repartidor: {p.repartidor||'—'}</small></div>)}</>}
  {tab=='repartidores'&&<><div className="card"><h4>Agregar repartidor</h4>
    <input placeholder="Nombre" autoComplete="off" value={rf.nombre} onChange={e=>setRf({...rf,nombre:e.target.value})}/>
    <input inputMode="numeric" maxLength={10} placeholder="WhatsApp (10 dígitos)" autoComplete="off" value={rf.wa} onChange={e=>setRf({...rf,wa:e.target.value.replace(/\D/g,'')})}/>
    <select value={rf.v} onChange={e=>setRf({...rf,v:e.target.value})}><option value="moto">🏍️ Moto</option><option value="auto">🚗 Vehículo</option></select>
    {msg&&<p className="msg">{msg}</p>}<button onClick={agregarRep}>Guardar repartidor</button></div>
   <h4>Repartidores ({rp.length})</h4>{rp.map(r=><div className="card" key={r.id}><b>{r.v=='moto'?'🏍️':'🚗'} {r.nombre}</b> {r.activo?'':'· desactivado'}<br/><small>{r.wa}</small>
    <div className="fila"><button className="sec" onClick={()=>updateDoc(doc(db,R,r.id),{activo:!r.activo})}>{r.activo?'Desactivar':'Activar'}</button>
    <button className="sec" onClick={()=>confirm('¿Quitar a '+r.nombre+'?')&&deleteDoc(doc(db,R,r.id))}>Quitar</button></div></div>)}</>}
  {tab=='tarifas'&&tf&&<div className="card"><h4>Tarifas (en pesos)</h4>
    <b>🏍️ Moto</b><div className="fila">{tk('mb','Base')}{tk('mk','Por km')}</div>
    <b>🚗 Vehículo</b><div className="fila">{tk('ab','Base')}{tk('ak','Por km')}</div>
    {tk('e','Descuento Modo Económico (%)')}
    <p><small>Ejemplo a 10 km: Moto ${precio('moto',10,false,TT)} · Vehículo ${precio('auto',10,false,TT)}</small></p>
    {msg&&<p className="msg">{msg}</p>}<button className="big" onClick={guardarTar}>Guardar tarifas</button></div>}
  {tab=='puntos'&&<><div className="card"><h4>Nuevo Punto Eco (negocio)</h4><input placeholder="Nombre del negocio" {...k('nombre')}/><input placeholder="Calle" {...k('calle')}/>
    <div className="fila"><input placeholder="Número" {...k('numero')}/><input placeholder="Colonia" {...k('colonia')}/></div><input placeholder="WhatsApp del negocio" {...k('wa')}/>
    {msg&&<p className="msg">{msg}</p>}<button onClick={agregarPunto}>Guardar punto</button></div>
   <h4>Puntos Eco ({pt.length})</h4>{pt.map(p=><div className="card" key={p.id}><b>{p.nombre}</b><br/><small>{dirTxt(p)}</small><button className="sec" onClick={()=>deleteDoc(doc(db,PUNTOS,p.id))}>Quitar</button></div>)}</>}
 </main></div>;
}
