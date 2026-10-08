import {useEffect,useState} from 'react';
import {collection,onSnapshot} from 'firebase/firestore';
import {db} from './firebase';
export const PEDIDOS='ecodrive_pedidos',PUNTOS='ecodrive_puntos',REPS='ecodrive_repartidores',TARIFAS='ecodrive_tarifas_fijas';
export const VEH={moto:{n:'Moto',e:'🏍️',d:'Sobres y paquetes chicos, hasta 10 kg'},auto:{n:'Vehículo',e:'🚗',d:'Cajas y paquetes medianos, hasta 50 kg'}};
export const CONT=[['📄','Documentos'],['🍱','Comida'],['👕','Ropa'],['📱','Electrónico'],['📦','Otro']];
export const ESTADO={pendiente:'Buscando repartidor',aceptado:'Repartidor en camino',recogido:'Paquete recogido',en_punto:'Esperando en el Punto Eco',entregado:'Entregado'};
export const dirTxt=d=>(d.tipo=='punto'?`🏪 ${d.nombre} · `:'')+`${d.calle} ${d.numero}, Col. ${d.colonia}`;
export const guardar=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
export const leer=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
export const waLink=(n,t)=>`https://wa.me/52${n}?text=${encodeURIComponent(t||'')}`;
export const cod=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>(b%36).toString(36)).join('').toUpperCase();
export const coincide=(p,t,txt)=>{const c=t=='r'?p.codRecoge:p.codEntrega,x=(txt||'').trim().toUpperCase();return !!c&&(x==c||x==`ED${t=='r'?'R':'E'}:${p.id}:${c}`.toUpperCase())};
export function useCol(n){const [l,setL]=useState([]);useEffect(()=>onSnapshot(collection(db,n),q=>setL(q.docs.map(d=>({id:d.id,...d.data()})))),[n]);return l}
export function Lugar({t,v,set,puntos}){
 const c=k=>({value:v[k]||'',autoComplete:'off',onChange:e=>set({...v,[k]:e.target.value})});
 const P=puntos.find(p=>p.id==v.puntoId);
 return <div className="card"><h4>{t}</h4>
  <div className="chips">{[['domicilio','🏠 Domicilio'],['punto','🏪 Punto Eco']].map(([k,l])=><button key={k} className={v.tipo==k?'on':''} onClick={()=>set({...v,tipo:k})}>{l}</button>)}</div>
  {v.tipo=='punto'?<><select value={v.puntoId||''} onChange={e=>set({...v,puntoId:e.target.value})}><option value="">Elige un Punto Eco</option>{puntos.map(p=><option key={p.id} value={p.id}>{p.nombre} · {p.colonia}</option>)}</select>{P&&<small>{dirTxt(P)}</small>}</>
  :<><input placeholder="Calle" {...c('calle')}/><div className="fila" style={{flexWrap:'nowrap'}}><input placeholder="Número" {...c('numero')}/><input placeholder="Colonia" {...c('colonia')}/></div><input placeholder="Referencias (portón, color de la casa…)" {...c('ref')}/></>}</div>;
}
export const lugar=(v,puntos)=>{
 if(v.tipo=='punto'){const p=puntos.find(x=>x.id==v.puntoId);return p?{tipo:'punto',puntoId:p.id,nombre:p.nombre,calle:p.calle,numero:p.numero,colonia:p.colonia,ref:''}:null}
 return v.calle&&v.numero&&v.colonia?{tipo:'domicilio',calle:v.calle,numero:v.numero,colonia:v.colonia,ref:v.ref||''}:null};
