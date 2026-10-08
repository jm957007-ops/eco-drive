import {useEffect,useRef,useState} from 'react';
import jsQR from 'jsqr';
export default function Scanner({onCode,onClose}){
 const v=useRef(),[err,setErr]=useState('');
 useEffect(()=>{let s,on=true;const c=document.createElement('canvas');
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(m=>{s=m;v.current.srcObject=m;v.current.play();
   const tick=()=>{if(!on)return;const e=v.current;
    if(e.videoWidth){c.width=e.videoWidth;c.height=e.videoHeight;const x=c.getContext('2d');x.drawImage(e,0,0);
     const d=x.getImageData(0,0,c.width,c.height),r=jsQR(d.data,c.width,c.height);
     if(r&&r.data){on=false;onCode(r.data);return}}
    requestAnimationFrame(tick)};tick()}).catch(()=>setErr('No pude abrir la cámara. Escribe el código a mano.'));
  return()=>{on=false;s&&s.getTracks().forEach(t=>t.stop())}},[]);
 return <div className="scan"><video ref={v} playsInline muted/>{err&&<p className="msg">{err}</p>}<button className="sec" onClick={onClose}>Cerrar cámara</button></div>;
}
