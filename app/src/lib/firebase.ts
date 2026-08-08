import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  projectId: 'express-voting',
  appId: '1:198077832216:web:5931aa7e49798bfd87376d',
  storageBucket: 'express-voting.firebasestorage.app',
  apiKey: 'AIzaSyC8V3-GYgp-eZsDIABWzZ4xZNBUK51K_D8',
  authDomain: 'express-voting.firebaseapp.com',
  messagingSenderId: '198077832216',
};

export const firebaseApp =
  getApps()[0] ?? initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
