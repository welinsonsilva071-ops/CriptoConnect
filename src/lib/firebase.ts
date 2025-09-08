import { initializeApp, getApp, getApps } from 'firebase/app';

const firebaseConfig = {
  "projectId": "ciptoconnect",
  "appId": "1:75601167967:web:6c9dc67bed68e11390bdea",
  "storageBucket": "ciptoconnect.firebasestorage.app",
  "apiKey": "AIzaSyAlDmg8gVChqIyBe3ex7lXWc2pdikY6oek",
  "authDomain": "ciptoconnect.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "75601167967"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export { app };
