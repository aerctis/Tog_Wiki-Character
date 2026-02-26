// src/config/firebase.js
// Firebase modular SDK — single initialization point
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCr08RHyYpKBy3omDUtSmYYr3KkXxx30E4",
  authDomain: "tog-charactersheet.firebaseapp.com",
  projectId: "tog-charactersheet",
  storageBucket: "tog-charactersheet.appspot.com",
  messagingSenderId: "915406998560",
  appId: "1:915406998560:web:4edbb2e3deb9d70c0a4045",
  measurementId: "G-ZMQF30F2FC"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
