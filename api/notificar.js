const EMO={moto:'🏍️',auto:'🚗'};
const LINK='https://eco-drive-sigma.vercel.app/?app=repartidor';
const MALOS=['messaging/registration-token-not-registered','messaging/invalid-registration-token'];
let cache=null;

async function listo(){
  if(cache)return cache;
  const mod=await import('firebase-admin');
  const admin=mod.default||mod;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT;
  if(!raw)throw new Error('Falta la variable FIREBASE_SERVICE_ACCOUNT en Vercel (o falta hacer Redeploy)');
  let cred;
  try{cred=JSON.parse(raw)}catch{throw new Error('FIREBASE_SERVICE_ACCOUNT no es un JSON válido: pega el archivo completo, de { a }')}
  if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(cred)});
  cache={admin,db:admin.firestore()};
  return cache;
}

export default async function handler(req,res){
  try{
    const {admin,db}=await listo();
    if(req.method!=='POST')return res.status(200).json({ok:true,estado:'función lista'});

    const id=req.body&&req.body.id;
    if(!id||typeof id!=='string')return res.status(400).json({error:'falta id'});

    const ref=db.collection('ecodrive_pedidos').doc(id);
    const snap=await ref.get();
    if(!snap.exists)return res.status(404).json({error:'pedido no existe'});
    const p=snap.data();
    if(p.estado!=='pendiente'||p.avisado)return res.status(200).json({ok:true,omitido:true});
    await ref.update({avisado:true});

    const reps=await db.collection('ecodrive_repartidores').where('activo','==',true).get();
    const activos=new Map();
    reps.forEach(d=>{const r=d.data();activos.set(r.wa,r)});

    const toks=await db.collection('ecodrive_tokens').get();
    const tokens=[];
    toks.forEach(d=>{
      const t=d.data(),r=activos.get(t.wa);
      if(!r)return;
      if(r.v&&r.v!==p.vehiculo)return;
      tokens.push(d.id);
    });
    if(!tokens.length)return res.status(200).json({ok:true,enviados:0});

    const o=p.origen||{},de=p.destino||{};
    const body=`${EMO[p.vehiculo]||'📦'} $${p.precio} · ${o.colonia||'Origen'} → ${de.colonia||'Destino'}`;
    const r=await admin.messaging().sendEachForMulticast({
      tokens,
      notification:{title:'🛵 Nuevo pedido en Eco Drive',body},
      webpush:{
        headers:{Urgency:'high',TTL:'600'},
        notification:{icon:'/icon-repartidor-192.png',badge:'/icon-repartidor-192.png',requireInteraction:true,vibrate:[300,150,300]},
        fcmOptions:{link:LINK}
      }
    });

    const viejos=[];
    r.responses.forEach((x,i)=>{if(!x.success&&x.error&&MALOS.includes(x.error.code))viejos.push(tokens[i])});
    await Promise.all(viejos.map(t=>db.collection('ecodrive_tokens').doc(t).delete()));

    return res.status(200).json({ok:true,enviados:r.successCount,fallidos:r.failureCount});
  }catch(e){
    return res.status(500).json({error:String(e&&e.message||e)});
  }
}
