import {useEffect,useRef} from 'react';
import L from 'leaflet';
export const VEH={moto:{n:'Moto',e:'🏍️',d:'Sobres y paquetes chicos, hasta 10 kg',base:45,km:7},
 auto:{n:'Vehículo',e:'🚗',d:'Cajas y paquetes medianos, hasta 50 kg',base:70,km:10}};
export const CONT=[['📄','Documentos'],['🍱','Comida'],['👕','Ropa'],['📱','Electrónico'],['📦','Otro']];
export const SIGUIENTE={aceptado:'recogido',recogido:'entregado'};
export const dirTxt=d=>`${d.calle} ${d.numero}, Col. ${d.colonia}`;
export const guardar=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
export const leer=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
export const waLink=(n,t)=>`https://wa.me/52${n}?text=${encodeURIComponent(t||'')}`;
export const distKm=(a,b)=>{const r=x=>x*Math.PI/180,h=Math.sin(r(b[0]-a[0])/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(r(b[1]-a[1])/2)**2;return 12742*Math.asin(Math.sqrt(h))*1.3};
export const precio=(v,km,eco)=>Math.round((VEH[v].base+VEH[v].km*km)*(eco?.75:1)/5)*5;
async function geo(q){try{const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q='+encodeURIComponent(q+', Tamaulipas'));const j=await r.json();return j[0]?[+j[0].lat,+j[0].lon]:null}catch{return null}}
export async function geoDir(d){for(const q of [`${d.calle} ${d.numero}, ${d.colonia}`,`${d.calle}, ${d.colonia}`,d.colonia]){const p=await geo(q);if(p)return p}return null}

export function DirForm({t,d,set,ubicar,ok}){
 const c=k=>({value:d[k]||'',autoComplete:'off',onChange:e=>set({...d,[k]:e.target.value})});
 return <div className="card"><h4>{t}</h4>
  <input placeholder="Calle" {...c('calle')}/>
  <div className="fila"><input placeholder="Número" {...c('numero')}/><input placeholder="Colonia" {...c('colonia')}/></div>
  <input placeholder="Referencias (portón, color de la casa…)" {...c('ref')}/>
  <button type="button" className="sec" onClick={ubicar}>{ok?'📍 Ubicado ✔':'📍 Ubicar en el mapa'}</button></div>;
}
export function Mapa({a,b}){
 const el=useRef(),m=useRef(),g=useRef();
 useEffect(()=>{m.current=L.map(el.current,{zoomControl:false}).setView([22.33,-97.88],11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(m.current);
  g.current=L.layerGroup().addTo(m.current);return()=>m.current.remove()},[]);
 useEffect(()=>{g.current.clearLayers();const p=[a,b].filter(Boolean);
  p.forEach((x,i)=>L.circleMarker(x,{radius:9,color:'#0f3d4c',fillColor:(a&&i==0&&b)||!b?'#0a8f6a':'#ffb400',fillOpacity:1}).addTo(g.current));
  if(a&&b)L.polyline([a,b],{color:'#0f3d4c',weight:4}).addTo(g.current);
  if(p.length)m.current.fitBounds(p,{padding:[40,40],maxZoom:15})},[a,b]);
 return <div ref={el} className="mapa"/>;
}
