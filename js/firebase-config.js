// js/firebase-config.js
// ---------------------------------------------------
// Este arquivo inicializa o Firebase e exporta o
// objeto `db` (Firestore) e as funções necessárias.
// ---------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// TODO: Substitua pelos dados do seu projeto Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyCA5MFTCh-QsaQAnC-ZzVhQF1jCg_8TUfY",
  authDomain: "evoluwill-2447e.firebaseapp.com",
  projectId: "evoluwill-2447e",
  storageBucket: "evoluwill-2447e.firebasestorage.app",
  messagingSenderId: "867851671732",
  appId: "1:867851671732:web:a933fe61ff83eea82fdfe1"
};

// Inicializa app
const app = initializeApp(firebaseConfig);

// Inicializa Firestore
const db = getFirestore(app);

// Exportamos o db e as funções do Firestore para uso nos outros arquivos.
export {
  db,
  collection,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
};

