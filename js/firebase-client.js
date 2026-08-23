// =============================================================================
// js/firebase-client.js
// Firebase Client SDK Entegrasyonu (Şifre Sıfırlama ve İstemci Kimlik Doğrulama)
// =============================================================================

(function () {
    let firebaseAuth = null;
    let initPromise = null;

    async function initFirebaseClient() {
        if (firebaseAuth) return firebaseAuth;
        if (initPromise) return initPromise;

        initPromise = (async () => {
            let config = window.FIREBASE_CONFIG;
            if (!config) {
                try {
                    const res = await fetch('/api/config/firebase');
                    if (res.ok) {
                        config = await res.json();
                    }
                } catch (e) {
                    console.warn('[Firebase Client] Config getirilemedi:', e);
                }
            }

            // Varsayılan config
            config = config || {
                apiKey: "AIzaSyDummyKeyForResetPassword",
                authDomain: "the-nest-2025.firebaseapp.com",
                projectId: "the-nest-2025",
            };

            if (typeof firebase !== 'undefined') {
                if (!firebase.apps || !firebase.apps.length) {
                    try {
                        firebase.initializeApp(config);
                    } catch (err) {
                        console.warn('[Firebase Client] Initialized with existing or error:', err.message);
                    }
                }
                firebaseAuth = firebase.auth();
            }

            return firebaseAuth;
        })();

        return initPromise;
    }

    /**
     * Firebase Client SDK kullanarak şifre sıfırlama e-postası gönderir.
     * @param {string} email
     */
    async function sendClientPasswordResetEmail(email) {
        if (!email) throw new Error('E-posta adresi gereklidir.');

        const auth = await initFirebaseClient();
        if (auth && typeof auth.sendPasswordResetEmail === 'function') {
            return await auth.sendPasswordResetEmail(email);
        }

        // Eğer Firebase script yüklenemediyse veya SDK hazır değilse
        console.warn('[Firebase Client] Firebase Auth SDK hazır değil.');
    }

    window.FirebaseClient = {
        init: initFirebaseClient,
        getAuth: () => firebaseAuth,
        sendPasswordResetEmail: sendClientPasswordResetEmail,
    };

    // Sayfa açıldığında arka planda hazırla
    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            initFirebaseClient().catch(() => {});
        });
    }
})();
