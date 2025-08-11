// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDA5O8VpNkr0VCDPQfs8srt9kh_5X4FZs0",
  authDomain: "markup-7f676.firebaseapp.com",
  projectId: "markup-7f676",
  storageBucket: "markup-7f676.appspot.com", // <- appspot.com is correct
  messagingSenderId: "457436009457",
  appId: "1:457436009457:web:7903f0fe6b35a38c262a50",
  measurementId: "G-MYD45HQJPC"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
