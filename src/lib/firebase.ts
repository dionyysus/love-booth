import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyAqY63c_KuSIEaGNc3NwSxDqdVlFXej5a8",
  authDomain: "lovebooth-56b8b.firebaseapp.com",
  projectId: "lovebooth-56b8b",
  storageBucket: "lovebooth-56b8b.firebasestorage.app",
  messagingSenderId: "47097059131",
  appId: "1:47097059131:web:f0d863ebe3664b8b7d491e",
  databaseURL: "https://lovebooth-56b8b-default-rtdb.firebaseio.com"
}

const app = initializeApp(firebaseConfig)
export const database = getDatabase(app)

console.log('Firebase initialized:', app.name)
