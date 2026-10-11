import {useEffect,useState} from 'react';
import {collection,onSnapshot} from 'firebase/firestore';
import {db} from './firebase';
export const PEDIDOS='ecodrive_pedidos',PUNTOS='ecodrive_puntos',REPS='ecodrive_repartidores',TARIFAS='ecodrive_tarifas_fijas';
export const VEH={moto:{n:'Moto',e:'🏍️',d:'Sobres y paquetes chicos, hasta 10 kg'},auto:{n:'Vehículo',e:'🚗',d:'Cajas y paquetes medianos, hasta 50 kg'}};
export const CONT=[['📄','Documentos'],['🍱','Comida'],['👕','Ropa'],['📱','Electrónico'],['📦','Otro']];
export const ESTADO={pendiente:'Buscando repartidor',aceptado:'Repartidor en camino',recogido:'Paquete recogido',en_punto:'Esperando en el Punto Eco',entregado:'Entregado'};
export const dirTxt=d=>(d.tipo=='punto'?`🏪 ${d.nombre} · `:'')+`${d.calle} ${d.numero}, Col. ${d.colonia}`+(d.municipio?`, ${d.municipio}`:'');
export const guardar=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
export const leer=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
export const waLink=(n,t)=>`https://wa.me/52${n}?text=${encodeURIComponent(t||'')}`;
export const cod=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>(b%36).toString(36)).join('').toUpperCase();
export const coincide=(p,t,txt)=>{const c=t=='r'?p.codRecoge:p.codEntrega,x=(txt||'').trim().toUpperCase();return !!c&&(x==c||x==`ED${t=='r'?'R':'E'}:${p.id}:${c}`.toUpperCase())};
export function useCol(n){const [l,setL]=useState([]);useEffect(()=>onSnapshot(collection(db,n),q=>setL(q.docs.map(d=>({id:d.id,...d.data()})))),[n]);return l}

/* ===== Tarifa por distancia (OpenStreetMap) =====
   precio = base + km * porKm, con mínimo, redondeado a $5.
   CAMBIA AQUÍ TUS PRECIOS: */
export const TAR_KM={
 moto:{base:35,km:7,min:35},
 auto:{base:45,km:9,min:60}
};
export const precioKm=(km,veh)=>{const t=TAR_KM[veh]||TAR_KM.auto;return Math.max(t.min,Math.round((t.base+km*t.km)/5)*5)};
const pausa=ms=>new Promise(r=>setTimeout(r,ms));
const ZONA='&viewbox=-98.15,22.70,-97.65,22.10&bounded=1';
const qTxt=(...p)=>p.filter(Boolean).join(', ')+', Tamaulipas, México';
async function geo(q){
 const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx'+ZONA+'&q='+encodeURIComponent(q));
 const j=await r.json();
 return j&&j[0]?{lat:+j[0].lat,lon:+j[0].lon}:null;
}
async function geoLugar(v){
 const intentos=[
  qTxt(`${v.calle||''} ${v.numero||''}`.trim(),v.colonia,v.municipio),
  qTxt(v.colonia,v.municipio)
 ];
 for(let i=0;i<intentos.length;i++){
  const p=await geo(intentos[i]);
  if(p)return p;
  if(i<intentos.length-1)await pausa(1100);
 }
 return null;
}
export async function calcularRuta(O,D){
 const a=await geoLugar(O);
 await pausa(1100);
 const b=await geoLugar(D);
 if(!a||!b)throw new Error('No pude ubicar una de las direcciones. Revisa la colonia y el municipio.');
 const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
 const j=await r.json();
 if(!j.routes||!j.routes[0])throw new Error('No pude calcular la ruta.');
 return {km:Math.round(j.routes[0].distance/100)/10};
}
/* ===== fin tarifa por distancia ===== */

export function Lugar({t,v,set,puntos}){
 const c=k=>({value:v[k]||'',autoComplete:'off',onChange:e=>set({...v,[k]:e.target.value})});
 const P=puntos.find(p=>p.id==v.puntoId);
 return <div className="card"><h4>{t}</h4>
  <div className="chips">{[['domicilio','🏠 Domicilio'],['punto','🏪 Punto Eco']].map(([k,l])=><button key={k} className={v.tipo==k?'on':''} onClick={()=>set({...v,tipo:k})}>{l}</button>)}</div>
  {v.tipo=='punto'?<><select value={v.puntoId||''} onChange={e=>set({...v,puntoId:e.target.value})}><option value="">Elige un Punto Eco</option>{puntos.map(p=><option key={p.id} value={p.id}>{p.nombre} · {p.colonia}</option>)}</select>{P&&<small>{dirTxt(P)}</small>}</>
  :<><input placeholder="Calle" {...c('calle')}/><div className="fila" style={{flexWrap:'nowrap'}}><input placeholder="Número" {...c('numero')}/><input placeholder="Colonia" {...c('colonia')}/></div><input placeholder="Municipio (Altamira, Madero, Tampico…)" list="ed-municipios" {...c('municipio')}/><datalist id="ed-municipios"><option value="Altamira"/><option value="Ciudad Madero"/><option value="Tampico"/></datalist><input placeholder="Referencias (portón, color de la casa…)" {...c('ref')}/></>}</div>;
}
export const lugar=(v,puntos)=>{
 if(v.tipo=='punto'){const p=puntos.find(x=>x.id==v.puntoId);return p?{tipo:'punto',puntoId:p.id,nombre:p.nombre,calle:p.calle,numero:p.numero,colonia:p.colonia,municipio:p.municipio||'',ref:''}:null}
 return v.calle&&v.numero&&v.colonia?{tipo:'domicilio',calle:v.calle,numero:v.numero,colonia:v.colonia,municipio:(v.municipio||'').trim(),ref:v.ref||''}:null};
