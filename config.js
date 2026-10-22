// ===== Your settings. Edit this file once, then commit & push. =====
window.COURSEWORK_CONFIG = {
  // Firebase → Project settings → General → Your apps → Web app → "firebaseConfig".
  // These values are safe to publish; your Firestore rules are what protect your data.
  firebase: {
    apiKey: "PASTE_YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000"
  },

  // Where your friend's hub keeps its data. Tried in order; the first that works is used.
  hubUrls: [
    "https://neotahiro.github.io/assignment-hub/data.js",
    "https://raw.githubusercontent.com/neotahiro/assignment-hub/main/data.js"
  ],

  // How often to re-check the hub while the page is open (minutes).
  hubRefreshMinutes: 5
};
