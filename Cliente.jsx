import {useEffect,useState} from 'react';
import {addDoc,collection,deleteField,doc,onSnapshot,query,serverTimestamp,updateDoc,where} from 'firebase/firestore';
import {db} from './firebase';
import QR from './QR';
import {PEDIDOS,PUNTOS,TARIFAS,VEH,CONT,ESTADO,Lugar,lugar,useCol,guardar,leer,waLink,cod,calcularRuta,precioKm} from './comun';
const L0={tipo:'domicilio',calle:'',numero:'',colonia:'',municipio:'',ref:'',puntoId:''};
function Menu({items}){
 const [a,setA]=useState(false);
 return <div style={{position:'relative'}}>
  <button onClick={()=>setA(!a)} aria-label="Menú" style={{background:'none',border:'none',color:'inherit',fontSize:28,padding:'0 10px'}}>⋮</button>
  {a&&<><div onClick={()=>setA(false)} style={{position:'fixed',inset:0,zIndex:49}}/>
  <div style={{position:'absolute',right:0,top:'100%',minWidth:200,background:'#fff',color:'#222',borderRadius:10,zIndex:50,boxShadow:'0 4px 16px rgba(0,0,0,.25)',overflow:'hidden'}}>
   {items.map(([t,fn])=><button key={t} onClick={()=>{setA(false);fn()}} style={{display:'block',width:'100%',textAlign:'left',padding:'14px 16px',background:'none',border:'none',borderBottom:'1px solid #eee',fontSize:16,color:'#222'}}>{t}</button>)}
  </div></>}
 </div>
}
export default function Cliente(){
 const per=leer('ed_perfil',{}),bor=leer('ed_borrador2',{});
 const [f,setF]=useState({wa:per.wa||'',o:{...L0,...per.dir},d:L0,veh:'auto',que:'',rec:'',recWa:'',tarifa:'',oferta:false,monto:'',gp:true,...bor});
 const puntos=useCol(PUNTOS),tarifas=[...useCol(TARIFAS)].sort((a,b)=>a.precio-b.precio);
 const [folio,setFolio]=useState(leer('ed_folio','')),[ped,setPed]=useState(null),[msg,setMsg]=useState('');
 const [calc,setCalc]=useState(null),[calcando,setCalcando]=useState(false);
 const s=k=>v=>setF(x=>({...x,[k]:v}));
 useEffect(()=>guardar('ed_borrador2',f),[f]);
 useEffect(()=>folio?onSnapshot(doc(db,PEDIDOS,folio),d=>setPed(d.data())):undefined,[folio]);
 const [vista,setVista]=useState(''),[lista,setLista]=useState(null);
 const wa=/^\d{10}$/.test(f.wa)?f.wa:per.wa;
 useEffect(()=>{
  if(vista!='pedidos'||!wa)return;
  return onSnapshot(query(collection(db,PEDIDOS),where('clienteWa','==',wa)),snap=>
   setLista(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.creado?.seconds||0)-(a.creado?.seconds||0))));
 },[vista,wa]);
 const abrir=id=>{guardar('ed_folio',id);setFolio(id);setPed(null);setVista('')};
 const nuevo=()=>{guardar('ed_folio','');setFolio('');setPed(null);setVista('')};
 const verEstado=()=>{setVista('');if(!folio)setMsg('No tienes ningún pedido en curso.')};
 const cab=<header style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b>eco drive</b>
  <Menu items={[['📦 Mis pedidos',()=>setVista('pedidos')],['📍 Estado del pedido',verEstado],['➕ Nuevo envío',nuevo]]}/></header>;
 const clave=JSON.stringify([f.o,f.d]),cv=calc&&calc.k==clave?calc:null,pk=cv?precioKm(cv.km,f.veh):0;
 const T=tarifas.find(t=>t.id==f.tarifa),total=f.oferta?+f.monto||0:(f.tarifa=='calc'?pk:(T?T.precio:0));
 async function calcular(){
  const O=lugar(f.o,puntos),D=lugar(f.d,puntos);
  if(!O||!D)return setMsg('Llena origen y destino primero (calle, número, colonia y municipio).');
  setMsg('');setCalcando(true);
  try{const r=await calcularRuta(O,D);setCalc({km:r.km,k:clave});s('tarifa')('calc')}
  catch(e){setMsg((e&&e.message)||'No pude calcular el precio. Elige una tarifa u ofrece tu precio.')}
  setCalcando(false);
 }
 async function enviar(){
  const O=lugar(f.o,puntos),D=lugar(f.d,puntos),e=[];
  if(!/^\d{10}$/.test(f.wa))e.push('tu WhatsApp (10 dígitos)');
  if(!O)e.push('origen (calle, número y colonia, o un Punto Eco)');
  if(!D)e.push('destino (calle, número y colonia, o un Punto Eco)');
  if(!f.que)e.push('qué envías');if(!f.rec)e.push('nombre de quien recibe');
  if(!/^\d{10}$/.test(f.recWa))e.push('WhatsApp de quien recibe (10 dígitos)');
  if(!total)e.push(f.oferta?'tu precio':'elegir una tarifa u ofrecer tu precio');
  if(e.length)return setMsg('Falta: '+e.join(', ')+'.');
  if(f.gp)guardar('ed_perfil',{wa:f.wa,dir:f.o.tipo=='domicilio'?f.o:{}});
  const r=await addDoc(collection(db,PEDIDOS),{clienteWa:f.wa,origen:O,destino:D,vehiculo:f.veh,que:f.que,recibe:f.rec,recibeWa:f.recWa,oferta:f.oferta,precio:total,km:(!f.oferta&&f.tarifa=='calc'&&cv)?cv.km:null,estado:'pendiente',enPunto:false,codRecoge:cod(),codEntrega:cod(),creado:serverTimestamp()});
  fetch('/api/notificar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id})}).catch(()=>{});
  guardar('ed_folio',r.id);setFolio(r.id);setMsg('');setF(x=>({...x,d:L0,que:'',rec:'',recWa:'',tarifa:'',oferta:false,monto:''}));
 }
 const ref=()=>doc(db,PEDIDOS,folio);
 if(vista=='pedidos')return <div className="app">{cab}<main>
  <h4>Mis pedidos</h4>
  {!wa?<small>Aún no hay pedidos en este teléfono.</small>
   :lista===null?<small>Cargando…</small>
   :!lista.length?<small>Aún no tienes pedidos.</small>
   :lista.map(p=><div key={p.id} className="card" style={{cursor:'pointer'}} onClick={()=>abrir(p.id)}>
     <b>{ESTADO[p.estado]||p.estado}</b> · ${p.precio}<br/>
     <small>{p.que} → {p.recibe}{p.creado?' · '+new Date(p.creado.seconds*1000).toLocaleDateString('es-MX'):''}</small></div>)}
  <button className="sec" onClick={()=>setVista('')}>Volver</button></main></div>;
 if(folio)return <div className="app">{cab}<main>
  <div className="card"><h3>¡Pedido enviado!</h3><p>Estado: <b>{ESTADO[ped?.estado]||'Enviando…'}</b></p>{ped?.repartidor&&<p>Repartidor: {ped.repartidor}</p>}<p>Precio: ${ped?.precio}</p></div>
  {ped?.contra&&ped.estado=='pendiente'&&<div className="card"><b>{ped.contra.nombre} propone ${ped.contra.precio}</b><div className="fila">
   <button className="big" onClick={()=>updateDoc(ref(),{estado:'aceptado',precio:ped.contra.precio,repartidor:ped.contra.nombre,repartidorWa:ped.contra.wa,contra:deleteField()})}>Aceptar</button>
   <button className="sec" onClick={()=>updateDoc(ref(),{contra:deleteField()})}>Rechazar</button></div></div>}
  {ped&&ped.estado!='entregado'&&<>
   <div className="card qrbox"><h4>1. QR del paquete</h4><QR texto={`EDR:${folio}:${ped.codRecoge}`}/><p className="cod">{ped.codRecoge}</p>
    <small>{ped.origen.tipo=='punto'?'Imprímelo y llévalo con el paquete al Punto Eco.':'Imprímelo o cópialo en una hoja y pégalo en el paquete.'} El repartidor lo escanea al recogerlo.</small></div>
   <div className="card"><h4>2. Aviso a quien recibe</h4><small>Quien recibe necesita su QR para confirmar la entrega.</small>
