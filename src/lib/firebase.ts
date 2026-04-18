import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyCrksSGuyBeaZ55BlKqfzi5GQgILvDUK5w",
  authDomain: "gudang-management-stok.firebaseapp.com",
  projectId: "gudang-management-stok",
  storageBucket: "gudang-management-stok.firebasestorage.app",
  messagingSenderId: "900295294252",
  appId: "1:900295294252:web:8064cdc6f2711f4932c089",
  measurementId: "G-M5PNLZ37WW"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Analytics hanya aktif di browser (tidak saat SSR/build)
if (typeof window !== 'undefined') {
  getAnalytics(app);
}
