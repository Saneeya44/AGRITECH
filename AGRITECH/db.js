/**
 * AgriTech — Firebase Firestore Database Service (db.js)
 *
 * Modular, scalable database layer for all AgriTech data collections.
 * Gracefully falls back to localStorage when Firestore is not configured.
 *
 * Collections:
 *   users/{uid}                    — User profile documents
 *   users/{uid}/diseaseHistory     — AI scan results per user
 *   users/{uid}/savedReports       — Full diagnostic reports per user
 *   users/{uid}/weatherLogs        — Historical weather per user
 *   images/{docId}                 — Image metadata (global)
 *   community/{docId}              — Community posts (global)
 */

window.DBService = (function () {

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _db() {
        if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return null;
        try { return firebase.firestore(); } catch (e) { return null; }
    }

    function _uid() {
        try {
            const user = firebase.auth().currentUser;
            if (user) return user.uid;
        } catch (e) {}
        // Fallback: try cached user
        const cached = localStorage.getItem('agritech_user_cache');
        if (cached) return JSON.parse(cached).uid || null;
        return null;
    }

    function _serverTimestamp() {
        try { return firebase.firestore.FieldValue.serverTimestamp(); }
        catch (e) { return new Date().toISOString(); }
    }

    function _increment(n) {
        try { return firebase.firestore.FieldValue.increment(n); }
        catch (e) { return n; }
    }

    // LS fallback — store array under given key
    function _lsGet(key) {
        try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    }
    function _lsPush(key, item) {
        const arr = _lsGet(key);
        arr.unshift({ ...item, id: Date.now().toString() });
        localStorage.setItem(key, JSON.stringify(arr.slice(0, 100))); // cap at 100
    }
    function _lsDelete(key, id) {
        const arr = _lsGet(key).filter(i => i.id !== id);
        localStorage.setItem(key, JSON.stringify(arr));
    }

    function _ready() {
        return !!_db() && !!_uid();
    }

    // ─── 1. USERS ─────────────────────────────────────────────────────────────
    const users = {

        /**
         * Create or update a user profile document.
         * Called on signup or first Google login.
         */
        async createProfile(userData) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) {
                localStorage.setItem('agritech_user_profile', JSON.stringify({ ...userData, uid }));
                return;
            }
            const ref = db.collection('users').doc(uid);
            const snap = await ref.get();
            if (!snap.exists) {
                await ref.set({
                    uid,
                    displayName: userData.displayName || 'User',
                    email:       userData.email || '',
                    photoURL:    userData.photoURL || null,
                    role:        'farmer',
                    createdAt:   _serverTimestamp(),
                    totalScans:  0,
                    totalPosts:  0
                });
            }
            console.log('DBService: User profile created/verified.');
        },

        /** Get the current user's profile document. */
        async getProfile() {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return JSON.parse(localStorage.getItem('agritech_user_profile') || '{}');
            const snap = await db.collection('users').doc(uid).get();
            return snap.exists ? { id: snap.id, ...snap.data() } : {};
        },

        /** Update specific fields on the user profile. */
        async updateProfile(updates) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return;
            await db.collection('users').doc(uid).update({ ...updates, updatedAt: _serverTimestamp() });
        }
    };

    // ─── 2. DISEASE HISTORY ───────────────────────────────────────────────────
    const diseaseHistory = {

        LS_KEY: () => `agritech_disease_history_${_uid() || 'guest'}`,

        /**
         * Add a new disease scan entry.
         * @param {Object} entry — { disease, confidence, cropName, location, imageCacheKey, weatherSnapshot }
         */
        async addEntry(entry) {
            const db = _db(); const uid = _uid();
            const doc = {
                ...entry,
                uid:       uid || 'guest',
                timestamp: _serverTimestamp(),
                syncedAt:  new Date().toISOString()
            };

            // Always save to localStorage for instant offline access
            _lsPush(this.LS_KEY(), { ...doc, timestamp: new Date().toISOString() });

            if (!db || !uid) { console.log('DBService: diseaseHistory saved to localStorage.'); return; }

            const ref = await db.collection('users').doc(uid).collection('diseaseHistory').add(doc);
            // Increment total scan counter
            db.collection('users').doc(uid).update({ totalScans: _increment(1) });
            console.log('DBService: Disease history entry saved:', ref.id);
            return ref.id;
        },

        /** Get all disease history for the current user (newest first). */
        async getAll(limitN = 50) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return _lsGet(this.LS_KEY());

            const snap = await db.collection('users').doc(uid)
                .collection('diseaseHistory')
                .orderBy('timestamp', 'desc')
                .limit(limitN)
                .get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },

        /** Delete a single entry by its Firestore document ID. */
        async deleteEntry(docId) {
            const db = _db(); const uid = _uid();
            _lsDelete(this.LS_KEY(), docId);
            if (!db || !uid) return;
            await db.collection('users').doc(uid).collection('diseaseHistory').doc(docId).delete();
        }
    };

    // ─── 3. SAVED REPORTS ─────────────────────────────────────────────────────
    const savedReports = {

        LS_KEY: () => `agritech_saved_reports_${_uid() || 'guest'}`,

        /**
         * Save a complete diagnostic report.
         * @param {Object} report — { disease, confidence, symptoms, causes, organicTreatment, chemicalTreatment, prevention, weatherAtScan, notes }
         */
        async saveReport(report) {
            const db = _db(); const uid = _uid();
            const doc = {
                ...report,
                uid:       uid || 'guest',
                timestamp: _serverTimestamp(),
                savedAt:   new Date().toISOString()
            };

            _lsPush(this.LS_KEY(), { ...doc, timestamp: new Date().toISOString() });

            if (!db || !uid) { console.log('DBService: Report saved to localStorage.'); return; }

            const ref = await db.collection('users').doc(uid).collection('savedReports').add(doc);
            console.log('DBService: Report saved:', ref.id);
            return ref.id;
        },

        /** Get all saved reports for the current user. */
        async getAll(limitN = 50) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return _lsGet(this.LS_KEY());

            const snap = await db.collection('users').doc(uid)
                .collection('savedReports')
                .orderBy('timestamp', 'desc')
                .limit(limitN)
                .get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        },

        /** Delete a saved report. */
        async deleteReport(docId) {
            const db = _db(); const uid = _uid();
            _lsDelete(this.LS_KEY(), docId);
            if (!db || !uid) return;
            await db.collection('users').doc(uid).collection('savedReports').doc(docId).delete();
        }
    };

    // ─── 4. WEATHER LOGS ─────────────────────────────────────────────────────
    const weatherLogs = {

        LS_KEY: () => `agritech_weather_logs_${_uid() || 'guest'}`,

        /**
         * Log a weather snapshot.
         * @param {Object} data — { temp, humidity, rainChance, windSpeed, city, country, condition }
         */
        async logWeather(data) {
            const db = _db(); const uid = _uid();
            const doc = {
                ...data,
                uid:       uid || 'guest',
                timestamp: _serverTimestamp(),
                loggedAt:  new Date().toISOString()
            };

            _lsPush(this.LS_KEY(), { ...doc, timestamp: new Date().toISOString() });

            if (!db || !uid) return;

            await db.collection('users').doc(uid).collection('weatherLogs').add(doc);
            console.log('DBService: Weather logged for', data.city);
        },

        /** Get the most recent N weather log entries. */
        async getRecent(limitN = 7) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return _lsGet(this.LS_KEY()).slice(0, limitN);

            const snap = await db.collection('users').doc(uid)
                .collection('weatherLogs')
                .orderBy('timestamp', 'desc')
                .limit(limitN)
                .get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    };

    // ─── 5. IMAGES (metadata) ─────────────────────────────────────────────────
    const images = {

        LS_KEY: 'agritech_image_meta',

        /**
         * Save image metadata (NOT the actual image — use Firebase Storage for that).
         * @param {Object} meta — { uid, localCacheKey, relatedDiseaseId, disease, timestamp }
         */
        async saveImageMeta(meta) {
            const db = _db(); const uid = _uid();
            const doc = {
                ...meta,
                uid:       uid || 'guest',
                timestamp: _serverTimestamp(),
                savedAt:   new Date().toISOString()
            };

            _lsPush(this.LS_KEY, { ...doc, timestamp: new Date().toISOString() });

            if (!db || !uid) return;

            const ref = await db.collection('images').add(doc);
            console.log('DBService: Image metadata saved:', ref.id);
            return ref.id;
        },

        /** Get all image metadata for the current user. */
        async getByUser(limitN = 50) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return _lsGet(this.LS_KEY).filter(i => i.uid === uid);

            const snap = await db.collection('images')
                .where('uid', '==', uid)
                .orderBy('timestamp', 'desc')
                .limit(limitN)
                .get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    };

    // ─── 6. COMMUNITY POSTS ───────────────────────────────────────────────────
    const community = {

        LS_KEY: 'agritech_community_posts',

        /**
         * Create a new community post.
         * @param {Object} post — { title, body, tags[], imageURL }
         */
        async createPost(post) {
            const db = _db(); const uid = _uid();
            const cached = JSON.parse(localStorage.getItem('agritech_user_cache') || '{}');
            const doc = {
                ...post,
                uid:         uid || 'guest',
                authorName:  cached.displayName || 'Farmer',
                authorPhoto: cached.photoURL || null,
                likes:       0,
                likedBy:     [],
                timestamp:   _serverTimestamp(),
                createdAt:   new Date().toISOString()
            };

            _lsPush(this.LS_KEY, { ...doc, id: Date.now().toString(), timestamp: new Date().toISOString() });

            if (!db || !uid) { console.log('DBService: Post saved to localStorage.'); return; }

            const ref = await db.collection('community').add(doc);
            // Increment user post count
            db.collection('users').doc(uid).update({ totalPosts: _increment(1) });
            console.log('DBService: Community post created:', ref.id);
            return ref.id;
        },

        /**
         * Get community posts in real-time.
         * @param {Function} callback — called with posts array on every update
         * @returns {Function} unsubscribe function
         */
        getPosts(callback, limitN = 30) {
            const db = _db();
            if (!db) {
                // Fallback: return localStorage posts once
                callback(_lsGet(this.LS_KEY).slice(0, limitN));
                return () => {};
            }

            const unsubscribe = db.collection('community')
                .orderBy('timestamp', 'desc')
                .limit(limitN)
                .onSnapshot(snap => {
                    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    callback(posts);
                }, err => {
                    console.error('DBService: Community stream error:', err);
                    callback(_lsGet(this.LS_KEY));
                });
            return unsubscribe;
        },

        /** Toggle like on a post. */
        async likePost(postId) {
            const db = _db(); const uid = _uid();
            if (!db || !uid) return;

            const ref = db.collection('community').doc(postId);
            const snap = await ref.get();
            if (!snap.exists) return;

            const data = snap.data();
            const likedBy = data.likedBy || [];
            const alreadyLiked = likedBy.includes(uid);

            await ref.update({
                likes:   _increment(alreadyLiked ? -1 : 1),
                likedBy: alreadyLiked
                    ? firebase.firestore.FieldValue.arrayRemove(uid)
                    : firebase.firestore.FieldValue.arrayUnion(uid)
            });
        },

        /** Delete a post (only the author can do this). */
        async deletePost(postId) {
            const db = _db(); const uid = _uid();
            _lsDelete(this.LS_KEY, postId);
            if (!db || !uid) return;
            const ref = db.collection('community').doc(postId);
            const snap = await ref.get();
            if (snap.exists && snap.data().uid === uid) {
                await ref.delete();
                db.collection('users').doc(uid).update({ totalPosts: _increment(-1) });
            }
        }
    };

    // ─── Public API ───────────────────────────────────────────────────────────
    return {
        isReady:        _ready,
        users,
        diseaseHistory,
        savedReports,
        weatherLogs,
        images,
        community,

        /** Enable Firestore offline persistence (call once on app load). */
        async enableOffline() {
            const db = _db();
            if (!db) return;
            try {
                await db.enablePersistence({ synchronizeTabs: true });
                console.log('DBService: Offline persistence enabled.');
            } catch (e) {
                if (e.code === 'failed-precondition') {
                    console.warn('DBService: Persistence failed — multiple tabs open.');
                } else if (e.code === 'unimplemented') {
                    console.warn('DBService: Persistence not supported in this browser.');
                }
            }
        }
    };

})();
