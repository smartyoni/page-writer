import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase configuration for smartrealapp
const firebaseConfig = {
  apiKey: "AIzaSyC3p97w01DDKd4vc67exX4AQ4puTLCq0_g",
  authDomain: "smartrealapp.firebaseapp.com",
  projectId: "smartrealapp",
  storageBucket: "smartrealapp.firebasestorage.app",
  messagingSenderId: "651193312612",
  appId: "1:651193312612:web:5e9c2afe6a48fd4da94671"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/**
 * Utility to get or create a persistent Device ID for no-login isolation.
 */
export const getDeviceId = () => {
  let deviceId = localStorage.getItem('page_writer_device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    localStorage.setItem('page_writer_device_id', deviceId);
  }
  return deviceId;
};
