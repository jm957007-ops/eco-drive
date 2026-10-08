import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
const cfg={
  apiKey:'AIzaSyD8nNbCgoY95e0NPC1WqSNykCsZm6w9fwY',
  authDomain:'ecodrive-7735e.firebaseapp.com',
  projectId:'ecodrive-7735e',
  storageBucket:'ecodrive-7735e.firebasestorage.app',
  messagingSenderId:'73616435344',
  appId:'1:73616435344:web:d37a90b8a739282ea61015'
};
export const db=getFirestore(initializeApp(cfg));
