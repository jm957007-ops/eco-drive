import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
const cfg={
  apiKey:'PEGA_AQUI',
  authDomain:'PEGA_AQUI',
  projectId:'PEGA_AQUI',
  storageBucket:'PEGA_AQUI',
  messagingSenderId:'PEGA_AQUI',
  appId:'PEGA_AQUI'
};
export const db=getFirestore(initializeApp(cfg));
