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

const STORAGE_KEY = 'page_writer_device_id';

/**
 * Utility to get current Device ID (Sync Key).
 */
export const getDeviceId = () => {
  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    // Generate a shorter, friendly Sync Key by default
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    deviceId = `Writer-${randomSuffix}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  return deviceId;
};

/**
 * Utility to update Device ID (Sync Key).
 */
export const setDeviceId = (newId) => {
  if (newId && newId.trim()) {
    localStorage.setItem(STORAGE_KEY, newId.trim());
    window.location.reload(); // Reload to re-initialize Firestore listeners with new ID
  }
};
