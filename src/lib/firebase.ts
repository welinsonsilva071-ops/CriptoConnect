import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  "projectId": "ciptoconnect",
  "appId": "1:75601167967:web:6c9dc67bed68e11390bdea",
  "storageBucket": "ciptoconnect.appspot.com",
  "apiKey": "AIzaSyAlDmg8gVChqIyBe3ex7lXWc2pdikY6oek",
  "authDomain": "ciptoconnect.firebaseapp.com",
  "measurementId": "",
  "messagingSenderId": "75601167967"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

export { app, auth, db, storage };

    