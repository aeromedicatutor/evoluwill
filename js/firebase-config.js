// js/firebase-config.js
// ---------------------------------------------------
// Inicializa o Firebase e exporta:
//  - db (instância do Firestore)
//  - helpers do Firestore usados no restante do projeto
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

// TODO: use os dados reais do seu projeto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCA5MFTCh-QsaQAnC-ZzVhQF1jCg_8TUfY",
  authDomain: "evoluwill-2447e.firebaseapp.com",
  projectId: "evoluwill-2447e",
  storageBucket: "evoluwill-2447e.firebasestorage.app",
  messagingSenderId: "867851671732",
  appId: "1:867851671732:web:a933fe61ff83eea82fdfe1"
};

// Inicializa o app Firebase
const app = initializeApp(firebaseConfig);

// Inicializa o Firestore
const db = getFirestore(app);

// Exporta db + funções do Firestore para o restante do código
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
  serverTimestamp,
  runTransaction
};
