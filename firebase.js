import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
// Pega aquí la configuración de tu proyecto Firebase
const cfg={apiKey:'TU_API_KEY',authDomain:'TU_PROYECTO.firebaseapp.com',projectId:'TU_PROYECTO',appId:'TU_APP_ID'};
export const db=getFirestore(initializeApp(cfg));
export const PEDIDOS='ecodrive_pedidos', PUNTOS='ecodrive_puntos';
