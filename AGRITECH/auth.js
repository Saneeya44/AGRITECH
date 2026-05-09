/**
 * AgriTech - Firebase Authentication Service (auth.js)
 *
 * SETUP: Replace the firebaseConfig below with your own from:
 * Firebase Console → Project Settings → Your Apps → Web App
 *
 * Also enable these in Firebase Console:
 *   Authentication → Sign-in method:
 *     ✅ Email/Password
 *     ✅ Google (optional)
 *     ✅ Anonymous (for Guest mode)
 *   Build → Firestore Database → Create database (test mode)
 */

// ─── Firebase Configuration ───────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ─── Firebase Initialisation ──────────────────────────────────────────────────
let _firebaseReady = false;

function _initFirebase() {
    if (_firebaseReady) return true;
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("AuthService: Firebase not configured. Running in demo/guest mode.");
        return false;
    }
    try {
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        _firebaseReady = true;
        // Enable Firestore offline persistence once DB service is ready
        if (window.DBService) {
            window.DBService.enableOffline();
        }
        return true;
    } catch (e) {
        console.error("Firebase init failed:", e);
        return false;
    }
}

// ─── Auth Service ─────────────────────────────────────────────────────────────
window.AuthService = {

    GUEST_KEY: 'agritech_guest_mode',
    USER_KEY:  'agritech_user_cache',

    // Returns whether Firebase is configured & ready
    isConfigured() {
        return _initFirebase();
    },

    // Watch auth state changes (call this on app load)
    onAuthStateChange(callback) {
        // Handle guest mode (no Firebase needed)
        if (this.isGuestMode()) {
            callback({ displayName: 'Guest', email: '', isGuest: true, photoURL: null });
            return;
        }
        if (!this.isConfigured()) {
            callback(null);
            return;
        }
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                this._cacheUser(user);
            }
            callback(user);
        });
    },

    // Email + Password Sign In
    async signInWithEmail(email, password) {
        if (!this.isConfigured()) throw new Error("Firebase not configured.");
        const result = await firebase.auth().signInWithEmailAndPassword(email, password);
        this._cacheUser(result.user);
        return result.user;
    },

    // Email + Password Sign Up
    async signUpWithEmail(email, password, displayName) {
        if (!this.isConfigured()) throw new Error("Firebase not configured.");
        const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await result.user.updateProfile({ displayName });
        this._cacheUser(result.user);
        // Bootstrap user profile in Firestore
        if (window.DBService) {
            await window.DBService.users.createProfile({
                displayName,
                email,
                photoURL: null
            });
        }
        return result.user;
    },

    // Google Sign In
    async signInWithGoogle() {
        if (!this.isConfigured()) throw new Error("Firebase not configured.");
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await firebase.auth().signInWithPopup(provider);
        this._cacheUser(result.user);
        // Ensure profile exists (idempotent)
        if (window.DBService) {
            await window.DBService.users.createProfile({
                displayName: result.user.displayName,
                email:       result.user.email,
                photoURL:    result.user.photoURL
            });
        }
        return result.user;
    },

    // Anonymous / Guest Sign In
    async signInAsGuest() {
        sessionStorage.setItem(this.GUEST_KEY, 'true');
        // If Firebase is configured, use anonymous auth for better tracking
        if (this.isConfigured()) {
            try {
                const result = await firebase.auth().signInAnonymously();
                return result.user;
            } catch (e) {
                // Fall through to local guest mode
            }
        }
        // Local guest mode (no Firebase)
        return { displayName: 'Guest', email: '', isGuest: true, photoURL: null };
    },

    // Sign Out
    async signOut() {
        sessionStorage.removeItem(this.GUEST_KEY);
        localStorage.removeItem(this.USER_KEY);
        if (this.isConfigured()) {
            await firebase.auth().signOut();
        }
        window.location.href = 'login.html';
    },

    // Get cached user (available synchronously on page load)
    getCachedUser() {
        if (this.isGuestMode()) {
            return { displayName: 'Guest', email: '', isGuest: true, photoURL: null };
        }
        const cached = localStorage.getItem(this.USER_KEY);
        return cached ? JSON.parse(cached) : null;
    },

    isGuestMode() {
        return sessionStorage.getItem(this.GUEST_KEY) === 'true';
    },

    // Auth guard — redirect to login if not authenticated
    requireAuth() {
        if (this.isGuestMode()) return; // guest is allowed
        const cached = this.getCachedUser();
        if (cached) return; // cached user, allow
        if (!this.isConfigured()) return; // no Firebase, demo mode, allow

        // Check Firebase state
        firebase.auth().onAuthStateChanged((user) => {
            if (!user) {
                window.location.href = 'login.html';
            }
        });
    },

    _cacheUser(user) {
        if (!user) return;
        const data = {
            displayName: user.displayName || 'User',
            email: user.email || '',
            photoURL: user.photoURL || null,
            uid: user.uid,
            isGuest: user.isAnonymous || false
        };
        localStorage.setItem(this.USER_KEY, JSON.stringify(data));
    },

    // Get initials from display name for avatar fallback
    getInitials(name) {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
};
