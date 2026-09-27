import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// Proyecto de Firebase: ecodrive-7735e
export const firebaseConfig = {
  apiKey: 'AIzaSyD8nNbCgoY95e0NPC1WqSNykCsZm6w9fwY',
  authDomain: 'ecodrive-7735e.firebaseapp.com',
  projectId: 'ecodrive-7735e',
  storageBucket: 'ecodrive-7735e.firebasestorage.app',
  messagingSenderId: '73616435344',
  appId: '1:73616435344:web:d37a90b8a739282ea61015',
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Colecciones con prefijo para no chocar con tus otras apps
export const PEDIDOS = 'ecodrive_pedidos';
export const REPS = 'ecodrive_repartidores';

// Cada celular recibe un usuario anónimo que se conserva entre visitas
export function usuario() {
  return new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => {
      if (u) { off(); resolve(u.uid); }
    });
    signInAnonymously(auth).catch((e) => { off(); reject(e); });
  });
}
