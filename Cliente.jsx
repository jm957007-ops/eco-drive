import {useEffect,useState} from 'react';
import {addDoc,collection,deleteField,doc,onSnapshot,serverTimestamp,updateDoc} from 'firebase/firestore';
import {db} from './firebase';
import QR from './QR';
import {PEDIDOS,PUNTOS,TARIFAS,VEH,CONT,ESTADO,Lugar,lugar,useCol,guardar,leer,waLink,cod,calcularRuta,precioKm} from './comun';
const L0={tipo:'domicilio',calle:'',numero:'',colonia:'',municipio:'',ref:'',puntoId:''};
export default function Cliente(){
 const per=leer('ed_perfil',{}),bor=leer('ed_borrador2',{});
 const [f,setF]=useState({wa:per.wa||'',o:{...L0,...per.dir},d:L0,veh:'auto',que:'',rec:'',recWa:'',tarifa:'',oferta:false,monto:'',gp:true,...bor});
 const puntos=useCol(PUNTOS),tarifas=[...useCol(TARIFAS)].sort((a,b)=>a.precio-b.precio);
 const [folio,setFolio]=useState(leer('ed_folio','')),[ped,setPed]=useState(null),[msg,setMsg]=useState('');
 const [calc,setCalc]=useState(null),[calcando,setCalcando]=useState(false);
 const s=k=>v=>setF(x=>({...x,[k]:v}));
 useEffect(()=>guardar('ed_borrador2',f),[f]);
 useEffect(()=>folio?onSnapshot(doc(db,PEDIDOS,folio),d=>setPed(d.data())):undefined,[folio]);
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
 if(folio)return <div className="app"><header><b>eco drive</b></header><main>
  <div className="card"><h3>¡Pedido enviado!</h3><p>Estado: <b>{ESTADO[ped?.estado]||'Enviando…'}</b></p>{ped?.repartidor&&<p>Repartidor: {ped.repartidor}</p>}<p>Precio: ${ped?.precio}</p></div>
  {ped?.contra&&ped.estado=='pendiente'&&<div className="card"><b>{ped.contra.nombre} propone ${ped.contra.precio}</b><div className="fila">
   <button className="big" onClick={()=>updateDoc(ref(),{estado:'aceptado',precio:ped.contra.precio,repartidor:ped.contra.nombre,repartidorWa:ped.contra.wa,contra:deleteField()})}>Aceptar</button>
   <button className="sec" onClick={()=>updateDoc(ref(),{contra:deleteField()})}>Rechazar</button></div></div>}
  {ped&&ped.estado!='entregado'&&<>
   <div className="card qrbox"><h4>1. QR del paquete</h4><QR texto={`EDR:${folio}:${ped.codRecoge}`}/><p className="cod">{ped.codRecoge}</p>
    <small>{ped.origen.tipo=='punto'?'Imprímelo y llévalo con el paquete al Punto Eco.':'Imprímelo o cópialo en una hoja y pégalo en el paquete.'} El repartidor lo escanea al recogerlo.</small></div>
   <div className="card"><h4>2. Aviso a quien recibe</h4><small>Quien recibe necesita su QR para confirmar la entrega.</small>
    <a className="btn big" style={{display:'block'}} href={waLink(ped.recibeWa,`Hola ${ped.recibe}, te enviaron un paquete con Eco Drive. Cuando llegue, enseña este QR: ${location.origin}/#/recibo/${folio}/${ped.codEntrega}`)}>Enviar QR por WhatsApp</a></div></>}
  {ped?.estado=='entregado'&&<div className="card"><b>✔ Paquete entregado</b></div>}
  <button className="sec" onClick={()=>{guardar('ed_folio','');setFolio('');setPed(null)}}>Hacer otro envío</button></main></div>;
 return <div className="app"><header><b>eco drive</b></header><main>
  <Lugar t="Origen: ¿dónde recogemos?" v={f.o} set={s('o')} puntos={puntos}/>
  <Lugar t="Destino: ¿dónde entregamos?" v={f.d} set={s('d')} puntos={puntos}/>
  <h4>Vehículo</h4>
  {Object.entries(VEH).map(([k,v])=><div key={k} className={'veh '+(f.veh==k?'on':'')} onClick={()=>s('veh')(k)}><span>{v.e}</span><div><b>{v.n}</b><br/><small>{v.d}</small></div></div>)}
  <h4>¿Qué envías?</h4><div className="chips">{CONT.map(([e,t])=><button key={t} className={f.que==t?'on':''} onClick={()=>s('que')(t)}>{e} {t}</button>)}</div>
  <h4>Precio</h4>
  {!f.oferta&&<div className={'veh '+(f.tarifa=='calc'?'on':'')} onClick={()=>{if(!calcando)cv?s('tarifa')('calc'):calcular()}}><div><b>📍 Precio por distancia</b><br/><small>{calcando?'Calculando…':cv?`Aprox. ${cv.km} km`:'Toca para calcular con tus direcciones'}</small></div><b>{cv?`$${pk}`:''}</b></div>}
  {!f.oferta&&(tarifas.length?tarifas.map(t=><div key={t.id} className={'veh '+(f.tarifa==t.id?'on':'')} onClick={()=>s('tarifa')(t.id)}><div><b>{t.nombre}</b></div><b>${t.precio}</b></div>):<small>Aún no hay tarifas fijas: ofrece tu precio.</small>)}
  <div className="card"><div className="fila"><div><b>Ofrece tu precio</b><br/><small>Los repartidores aceptan o contraofertan</small></div>
   <button className={f.oferta?'on':'sec'} onClick={()=>s('oferta')(!f.oferta)}>{f.oferta?'Activado':'Activar'}</button></div>
   {f.oferta&&<input inputMode="numeric" placeholder="Tu precio en $" value={f.monto} onChange={e=>s('monto')(e.target.value.replace(/\D/g,''))}/>}</div>
  <h4>Tu WhatsApp (para que el repartidor te contacte)</h4>
  <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 dígitos" value={f.wa} onChange={e=>s('wa')(e.target.value.replace(/\D/g,''))}/>
  <label className="chk"><input type="checkbox" checked={f.gp} onChange={e=>s('gp')(e.target.checked)}/> Guardar mi WhatsApp y dirección de origen en este teléfono</label>
  <h4>¿Quién recibe?</h4><input placeholder="Nombre" autoComplete="off" value={f.rec} onChange={e=>s('rec')(e.target.value)}/>
  <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="WhatsApp de quien recibe (10 dígitos)" value={f.recWa} onChange={e=>s('recWa')(e.target.value.replace(/\D/g,''))}/>
  {msg&&<p className="msg">{msg}</p>}
  <button className="big" onClick={enviar}>Pedir envío {total?`· $${total}`:''}</button></main></div>;
                                                         }
