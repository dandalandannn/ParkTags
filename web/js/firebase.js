// Replace every REDACTED value below with your own Firebase web app config
// (Firebase console -> Project settings -> Your apps -> Web app).
const FIREBASE_VERSION = "12.19.0";
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

const { initializeApp, getApps } = await import(`${CDN}/firebase-app.js`);
const authSdk = await import(`${CDN}/firebase-auth.js`);
const dbSdk = await import(`${CDN}/firebase-database.js`);


const firebaseConfig = {
  apiKey: "REDACTED",
  authDomain: "REDACTED.firebaseapp.com",
  databaseURL: "https://REDACTED-default-rtdb.REDACTED.firebasedatabase.app",
  projectId: "REDACTED",
  storageBucket: "REDACTED.firebasestorage.app",
  messagingSenderId: "REDACTED",
  appId: "REDACTED",
};

const app = initializeApp(firebaseConfig);
export const db = dbSdk.getDatabase(app);
export const auth = authSdk.getAuth(app);

/** A second app instance, so an admin can create accounts without being signed out. */
export const getSecondaryAuth = () =>
  authSdk.getAuth(getApps().find((a) => a.name === "aux") || initializeApp(firebaseConfig, "aux"));

export const { onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } = authSdk;
export const { ref, get, set, push, update, onValue } = dbSdk;
