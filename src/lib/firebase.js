import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB8XHkT_DedTncHBUSu8d5AwjJLXqDFP2g",
  authDomain: "smartrealapp.firebaseapp.com",
  projectId: "smartrealapp",
  storageBucket: "smartrealapp.firebasestorage.app",
  messagingSenderId: "651193312612",
  appId: "1:651193312612:web:47e8a1780f9c2cd3a94671"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
