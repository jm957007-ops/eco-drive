import {useEffect,useState} from 'react';
import {addDoc,collection,deleteDoc,doc,updateDoc,serverTimestamp} from 'firebase/firestore';
import {db} from './firebase';
import {PEDIDOS,PUNTOS,REPS,TARIFAS,ESTADO,dirTxt,useCol} from './comun';
const PIN='1234'; // CÁMBIALO
const TABS=[['pedidos','Pedidos'],['repartidores','Repartidores'],['tarifas','Tarifas'],['puntos','Puntos Eco']];
const P0={nombre:'',calle:'',numero:'',colonia:'',wa:''};
const num=x=>x.replace(/\D/g,'');
export default function Admin(){
 const ps=useCol(PEDIDOS),pt=useCol(PUNTOS),rp=useCol(REPS),tf=useCol(TARIFAS);
 const [ok,setOk]=useState(false),[pin,setPin]=useState(''),[tab,setTab]=useState('pedidos'),[msg,setMsg]=useState('');
 const [p,setP]=useState(P0),[r,setR]=useState({nombre:'',wa:'',v:'moto'}),[t,setT]=useState({nombre:'',precio:''});
 if(!ok)return <div className="app"><header><b>eco drive admin</b></header><main><input type="password" placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/>
  <button className="big" onClick={()=>setOk(pin==PIN)}>Entrar</button></main></div>;
 const err=m=>{setMsg(m);return true};
 async function addPunto(){
  if(Object.values(p).some(x=>!x))return err('Llena todos los campos.');
  if(!/^\d{10}$/.test(p.wa))return err('El WhatsApp debe tener 10 dígitos.');
  await addDoc(collection(db,PUNTOS),p);setP(P0);setMsg('');}
 async function addRep(){
  if(!r.nombre||!/^\d{10}$/.test(r.wa))return err('Escribe el nombre y un WhatsApp de 10 dígitos.');
  if(rp.some(x=>x.wa==r.wa))return err('Ese WhatsApp ya está registrado.');
  await addDoc(collection(db,REPS),{nombre:r.nombre,wa:r.wa,v:r.v,activo:true,creado:serverTimestamp()});setR({nombre:'',wa:'',v:'moto'});setMsg('');}
 async function addTar(){
  if(!t.nombre||!(+t.precio>0))return err('Escribe el nombre de la tarifa y su precio.');
  await addDoc(collection(db,TARIFAS),{nombre:t.nombre,precio:+t.precio});setT({nombre:'',precio:''});setMsg('');}
 const k=e=>({value:p[e],autoComplete:'off',onChange:x=>setP({...p,[e]:e=='wa'?num(x.target.value):x.target.value})});
 const M=()=>msg?<p className="msg">{msg}</p>:null;
 const del=(c,id,n)=>confirm('¿Quitar '+n+'?')&&deleteDoc(doc(db,c,id));
 return <div className="app"><header><b>eco drive admin</b></header><main>
  <div className="chips">{TABS.map(([c,l])=><button key={c} className={tab==c?'on':''} onClick={()=>{setTab(c);setMsg('')}}>{l}</button>)}</div>
  {tab=='pedidos'&&<><h4>Pedidos ({ps.length})</h4>{[...ps].sort((a,b)=>((b.creado&&b.creado.seconds)||0)-((a.creado&&a.creado.seconds)||0)).map(x=><div className="card" key={x.id}>
    <b>${x.precio} · {x.vehiculo}</b><br/><small>{dirTxt(x.origen)} → {dirTxt(x.destino)}<br/>Repartidor: {x.repartidor||'—'}</small>
    <select value={x.estado} onChange={e=>updateDoc(doc(db,PEDIDOS,x.id),{estado:e.target.value})}>{Object.entries(ESTADO).map(([c,l])=><option key={c} value={c}>{l}</option>)}</select>
    <button className="sec" onClick={()=>del(PEDIDOS,x.id,'este pedido')}>Quitar pedido</button></div>)}</>}
  {tab=='repartidores'&&<><div className="card"><h4>Agregar repartidor</h4>
    <input placeholder="Nombre" autoComplete="off" value={r.nombre} onChange={e=>setR({...r,nombre:e.target.value})}/>
    <input inputMode="numeric" maxLength={10} placeholder="WhatsApp (10 dígitos)" autoComplete="off" value={r.wa} onChange={e=>setR({...r,wa:num(e.target.value)})}/>
    <select value={r.v} onChange={e=>setR({...r,v:e.target.value})}><option value="moto">🏍️ Moto</option><option value="auto">🚗 Vehículo</option></select>
    <M/><button onClick={addRep}>Guardar repartidor</button></div>
   <h4>Repartidores ({rp.length})</h4>{rp.map(x=><div className="card" key={x.id}><b>{x.v=='moto'?'🏍️':'🚗'} {x.nombre}</b> {x.activo?'':'· desactivado'}<br/><small>{x.wa}</small>
    <div className="fila"><button className="sec" onClick={()=>updateDoc(doc(db,REPS,x.id),{activo:!x.activo})}>{x.activo?'Desactivar':'Activar'}</button>
    <button className="sec" onClick={()=>del(REPS,x.id,x.nombre)}>Quitar</button></div></div>)}</>}
  {tab=='tarifas'&&<><div className="card"><h4>Nueva tarifa fija</h4><small>Precios que el cliente puede elegir (por ejemplo: "Altamira ↔ Madero · $90").</small>
    <input placeholder="Nombre de la tarifa" autoComplete="off" value={t.nombre} onChange={e=>setT({...t,nombre:e.target.value})}/>
    <input inputMode="numeric" placeholder="Precio en $" value={t.precio} onChange={e=>setT({...t,precio:num(e.target.value)})}/>
    <M/><button onClick={addTar}>Guardar tarifa</button></div>
   <h4>Tarifas ({tf.length})</h4>{[...tf].sort((a,b)=>a.precio-b.precio).map(x=><div className="card fila" key={x.id}><b>{x.nombre} · ${x.precio}</b><button className="sec" onClick={()=>del(TARIFAS,x.id,x.nombre)}>Quitar</button></div>)}</>}
  {tab=='puntos'&&<><div className="card"><h4>Nuevo Punto Eco (negocio)</h4><input placeholder="Nombre del negocio" {...k('nombre')}/><input placeholder="Calle" {...k('calle')}/>
    <div className="fila" style={{flexWrap:'nowrap'}}><input placeholder="Número" {...k('numero')}/><input placeholder="Colonia" {...k('colonia')}/></div><input inputMode="numeric" maxLength={10} placeholder="WhatsApp del negocio (10 dígitos)" {...k('wa')}/>
    <M/><button onClick={addPunto}>Guardar punto</button></div>
   <h4>Puntos Eco ({pt.length})</h4>{pt.map(x=><div className="card" key={x.id}><b>{x.nombre}</b><br/><small>{dirTxt(x)} · {x.wa}</small><button className="sec" onClick={()=>del(PUNTOS,x.id,x.nombre)}>Quitar</button></div>)}</>}
 </main></div>;
}
