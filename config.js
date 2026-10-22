// ===== Your settings. Edit this file once, then commit & push. =====
window.COURSEWORK_CONFIG = {
  // Firebase → Project settings → Your apps → Web app → "firebaseConfig".
  // These values are safe to publish; your Firestore rules are what protect your data.
  firebase: {
    apiKey: "AIzaSyAG•••••••••••••••••••••••••••••••",
    authDomain: "my-coursework-64c90.firebaseapp.com",
    projectId: "my-coursework-64c90",
    storageBucket: "my-coursework-64c90.firebasestorage.app",
    messagingSenderId: "584725250689",
    appId: "1:584725250689:web:2b2167534469e216958380",
    measurementId: "G-3D3EKHFT7Y"
  },

  // Where your friend's hub keeps its data. Tried in order; the first that works is used.
  hubUrls: [
    "https://neotahiro.github.io/assignment-hub/data.js",
    "https://raw.githubusercontent.com/neotahiro/assignment-hub/main/data.js"
  ],

  // How often to re-check the hub while the page is open (minutes).
  hubRefreshMinutes: 5
};
