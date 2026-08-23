// =============================================================================
// server/src/utils/firebaseAdmin.js
// Firebase Admin SDK Entegrasyonu (Kimlik Doğrulama ve Yönetim)
// =============================================================================

const { getApps, initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

let firebaseApp = null;
let isInitialized = false;

function initFirebaseAdmin() {
    const currentApps = getApps();
    if (currentApps.length > 0) {
        firebaseApp = currentApps[0];
        isInitialized = true;
        return firebaseApp;
    }

    try {
        const {
            FIREBASE_PROJECT_ID,
            FIREBASE_CLIENT_EMAIL,
            FIREBASE_PRIVATE_KEY,
            FIREBASE_SERVICE_ACCOUNT_JSON,
            GOOGLE_APPLICATION_CREDENTIALS,
        } = process.env;

        let credential = null;

        // 1. JSON string olarak tanımlanmış Service Account
        if (FIREBASE_SERVICE_ACCOUNT_JSON) {
            try {
                const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
                credential = cert(serviceAccount);
            } catch (jsonErr) {
                console.error("⚠️ [FIREBASE ADMIN] FIREBASE_SERVICE_ACCOUNT_JSON parse edilemedi:", jsonErr.message);
            }
        }

        // 2. Ayrı ortam değişkenleri olarak tanımlanmışsa (Private Key, Client Email, Project ID)
        if (!credential && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
            const formattedPrivateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
            credential = cert({
                projectId: FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
                clientEmail: FIREBASE_CLIENT_EMAIL,
                privateKey: formattedPrivateKey,
            });
        }

        // 3. Google Default Application Credentials veya Proje ID Fallback
        if (!credential) {
            if (FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || GOOGLE_APPLICATION_CREDENTIALS) {
                credential = applicationDefault();
            }
        }

        if (credential) {
            firebaseApp = initializeApp(
                {
                    credential,
                    projectId: FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
                },
                "the-nest-admin"
            );
            isInitialized = true;
            console.log("┌────────────────────────────────────────────────────────┐");
            console.log("│ 🔥 [FIREBASE ADMIN] SDK BAŞARIYLA BAŞLATILDI           │");
            console.log(`│ Proje ID : ${(FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "Default").padEnd(44)}│`);
            console.log("└────────────────────────────────────────────────────────┘");
        } else {
            console.log("ℹ️ [FIREBASE ADMIN] Firebase sunucu kimlik bilgileri isteğe bağlıdır.");
        }
    } catch (err) {
        console.warn("⚠️ [FIREBASE ADMIN] Başlatma uyarısı:", err.message);
        firebaseApp = null;
        isInitialized = false;
    }

    return firebaseApp;
}

// Uygulama başlarken bir kez başlatmayı dene
initFirebaseAdmin();

module.exports = {
    initFirebaseAdmin,
    isFirebaseAdminReady: () => isInitialized,
    getAuth: () => (firebaseApp ? getAuth(firebaseApp) : null),
};
