import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, onSnapshot,
  writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCla6YZLadWP5xQwRvtbMd6n-8R9c9GVB4",
  authDomain: "kway-501e4.firebaseapp.com",
  projectId: "kway-501e4",
  storageBucket: "kway-501e4.firebasestorage.app",
  messagingSenderId: "852571995295",
  appId: "1:852571995295:web:845e3d5495ad2b8d1976aa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

function tripsRef(uid){ return collection(db,'users',uid,'trips'); }

async function register(email,password){
  return createUserWithEmailAndPassword(auth,email,password);
}
async function login(email,password){
  return signInWithEmailAndPassword(auth,email,password);
}
async function logout(){ return signOut(auth); }
function onUser(callback){ return onAuthStateChanged(auth,callback); }
function subscribeTrips(uid,callback,onError){
  return onSnapshot(tripsRef(uid), snap=>{
    const items=snap.docs.map(d=>({id:d.id,...d.data()}));
    callback(items);
  }, onError);
}
async function syncTrips(uid,trips){
  const ref=tripsRef(uid);
  const existing=await getDocs(ref);
  const batch=writeBatch(db);
  const wanted=new Set(trips.map(t=>t.id));
  existing.docs.forEach(d=>{ if(!wanted.has(d.id)) batch.delete(d.ref); });
  trips.forEach(t=>{
    const clean=JSON.parse(JSON.stringify(t));
    batch.set(doc(ref,t.id),{...clean,cloudUpdatedAt:serverTimestamp()},{merge:false});
  });
  await batch.commit();
}

window.KwayCloud={register,login,logout,onUser,subscribeTrips,syncTrips,get user(){return auth.currentUser;}};
window.dispatchEvent(new Event('kway-cloud-ready'));
