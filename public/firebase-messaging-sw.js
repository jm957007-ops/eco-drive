importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:'AIzaSyD8nNbCgoY95e0NPC1WqSNykCsZm6w9fwY',
  authDomain:'ecodrive-7735e.firebaseapp.com',
  projectId:'ecodrive-7735e',
  storageBucket:'ecodrive-7735e.firebasestorage.app',
  messagingSenderId:'73616435344',
  appId:'1:73616435344:web:d37a90b8a739282ea61015'
});

// Con esto el celular muestra el aviso (con sonido) aunque la app esté cerrada.
firebase.messaging();

