import {useEffect,useState} from 'react';
import {addDoc,collection,doc,onSnapshot,serverTimestamp} from 'firebase/firestore';
import {db,PEDIDOS,PUNTOS} from './firebase';
import {VEH,CONT,Mapa,DirForm,geoDir,distKm,precio,dirTxt,guardar,leer} from './comun';
const V={calle:'',numero:'',colonia:'',ref:''};
export default function Cliente(){
 const per=leer('ed_perfil',{}), bor=leer('ed_borrador',{});
 const [f,setF]=useState({wa:per.wa||'',o:{...V,...per.dir},d:V,tipo:'domicilio',punto:'',veh:'auto',eco:false,que:'',rec:'',recWa:'',oferta:false,monto:'',gp:true,...bor});
 const [co,setCo]=useState(null),[cd,setCd]=useState(null),[puntos,setPuntos]=useState([]),[folio,setFolio]=useState(''),[ped,setPed]=useState(null),[msg,setMsg]=useState('');
 const s=k=>v=>setF(x=>({...x,[k]:v}));
 useEffect(()=>guardar('ed_borrador',f),[f]);
 useEffect(()=>onSnapshot(collection(db,PUNTOS),q=>setPuntos(q.docs.map(d=>({id:d.id,...d.data()})))),[]);
 useEffect(()=>folio?onSnapshot(doc(db,PEDIDOS,folio),d=>setPed(d.data())):undefined,[folio]);
 const P=f.tipo=='punto'?puntos.find(p=>p.id==f.punto):null;
 const D=P||f.d, dest=P?[P.lat,P.lng]:cd;
 const km=co&&dest?distKm(co,dest):0, auto=km?precio(f.veh,km,f.eco):0;
 const total=f.oferta&&+f.monto>0?+f.monto:auto;
 async function ubicar(dir,set){setMsg('Buscando…');const p=await geoDir(dir);setMsg(p?'':'No encontré la dirección; revisa calle y colonia.');if(p)set(p)}
 async function enviar(){
  const e=[];
  if(!/^\d{10}$/.test(f.wa))e.push('tu WhatsApp (10 dígitos)');
  for(const [t,x] of [['origen',f.o],['destino',D||{}]])if(!x.calle||!x.numero||!x.colonia)e.push(`calle, número y colonia de ${t}`);
  if(!f.que)e.push('qué envías');if(!f.rec)e.push('nombre de quien recibe');
  if(!/^\d{10}$/.test(f.recWa))e.push('WhatsApp de quien recibe (10 dígitos)');
  if(!co||!dest)e.push('ubicar origen y destino en el mapa');
  if(e.length)return setMsg('Falta: '+e.join(', ')+'.');
  if(f.gp)guardar('ed_perfil',{wa:f.wa,dir:f.o});
  const r=await addDoc(collection(db,PEDIDOS),{clienteWa:f.wa,origen:{...f.o,lat:co[0],lng:co[1]},destino:{calle:D.calle,numero:D.numero,colonia:D.colonia,ref:D.ref||'',lat:dest[0],lng:dest[1]},
   puntoNombre:P?.nombre||'',vehiculo:f.veh,economico:f.eco,que:f.que,recibe:f.rec,recibeWa:f.recWa,oferta:f.oferta,precio:total,km:+km.toFixed(1),estado:'pendiente',creado:serverTimestamp()});
  setFolio(r.id);setMsg('');setF(x=>({...x,d:V,punto:'',que:'',rec:'',recWa:'',oferta:false,monto:''}));setCd(null);
 }
 if(folio)return <div className="app"><header><b>eco drive</b></header><div className="card"><h3>¡Pedido enviado!</h3>
  <p>Estado: <b>{ped?.estado||'pendiente'}</b></p>{ped?.repartidor&&<p>Repartidor: {ped.repartidor}</p>}<p>Precio: ${ped?.precio}</p>
  <button onClick={()=>setFolio('')}>Hacer otro envío</button></div></div>;
 return <div className="app"><header><b>eco drive</b></header><Mapa a={co} b={dest}/>
  <main>
   <DirForm t="Origen: ¿dónde recogemos?" d={f.o} set={s('o')} ok={!!co} ubicar={()=>ubicar(f.o,setCo)}/>
   <div className="chips">{[['domicilio','🏠 Domicilio'],['punto','🏪 Punto Eco']].map(([k,t])=><button key={k} className={f.tipo==k?'on':''} onClick={()=>s('tipo')(k)}>{t}</button>)}</div>
   {f.tipo=='punto'?<div className="card"><h4>Destino: negocio donde se recoge</h4>
     <select value={f.punto} onChange={e=>s('punto')(e.target.value)}><option value="">Elige un punto</option>{puntos.map(p=><option key={p.id} value={p.id}>{p.nombre} · {p.colonia}</option>)}</select>
     {P&&<small>{dirTxt(P)}</small>}</div>
    :<DirForm t="Destino: ¿dónde entregamos?" d={f.d} set={s('d')} ok={!!cd} ubicar={()=>ubicar(f.d,setCd)}/>}
   {Object.entries(VEH).map(([k,v])=><div key={k} className={'veh '+(f.veh==k?'on':'')} onClick={()=>s('veh')(k)}>
     <span>{v.e}</span><div><b>{v.n}</b><br/><small>{v.d}</small></div><b>{km?'$'+precio(k,km,f.eco):''}</b></div>)}
   <label className="chk"><input type="checkbox" checked={f.eco} onChange={e=>s('eco')(e.target.checked)}/> Modo Económico (25% menos, entrega en ruta con varias paradas)</label>
   <h4>¿Qué envías?</h4><div className="chips">{CONT.map(([e,t])=><button key={t} className={f.que==t?'on':''} onClick={()=>s('que')(t)}>{e} {t}</button>)}</div>
   <h4>Tu WhatsApp (para que el repartidor te contacte)</h4>
   <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 dígitos" value={f.wa} onChange={e=>s('wa')(e.target.value.replace(/\D/g,''))}/>
   <label className="chk"><input type="checkbox" checked={f.gp} onChange={e=>s('gp')(e.target.checked)}/> Guardar mi WhatsApp y dirección de origen en este teléfono</label>
   <h4>¿Quién recibe?</h4><input placeholder="Nombre" autoComplete="off" value={f.rec} onChange={e=>s('rec')(e.target.value)}/>
   <input inputMode="numeric" maxLength={10} autoComplete="off" placeholder="WhatsApp de quien recibe (10 dígitos)" value={f.recWa} onChange={e=>s('recWa')(e.target.value.replace(/\D/g,''))}/>
   <div className="card"><div className="fila"><div><b>Ofrece tu precio</b><br/><small>Los repartidores aceptan o no</small></div>
    <button className={f.oferta?'on':'sec'} onClick={()=>s('oferta')(!f.oferta)}>{f.oferta?'Activado':'Activar'}</button></div>
    {f.oferta&&<input inputMode="numeric" placeholder="Tu precio en $" value={f.monto} onChange={e=>s('monto')(e.target.value.replace(/\D/g,''))}/>}</div>
   {msg&&<p className="msg">{msg}</p>}
   <button className="big" onClick={enviar}>Pedir envío {total?`· $${total}`:''}</button>
  </main></div>;
}
