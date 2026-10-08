import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
export default function QR({texto,size=220}){
 const [u,setU]=useState('');
 useEffect(()=>{QRCode.toDataURL(texto,{width:size,margin:1}).then(setU)},[texto]);
 return u?<img src={u} width={size} height={size} alt="Código QR"/>:null;
}
