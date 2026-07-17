import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBx9A957kw2a5xN0guNSTbup6aCJqBn2kg",
  authDomain: "callverse-00.firebaseapp.com",
  projectId: "callverse-00",
  storageBucket: "callverse-00.firebasestorage.app",
  messagingSenderId: "837741687008",
  appId: "1:837741687008:web:0a435da70c8a44df812085"
};

console.log("Firebase Config:", firebaseConfig);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  signInWithPopup,
  googleProvider
};
