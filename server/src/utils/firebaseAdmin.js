// =============================================================================
// server/src/utils/firebaseAdmin.js
// Firebase Admin SDK Entegrasyonu (Şifre Sıfırlama ve Kimlik Doğrulama)
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
            console.log("ℹ️ [FIREBASE ADMIN] Firebase kimlik bilgileri tanımlanmamış.");
            console.log("   Şifre sıfırlama geliştirme/simülasyon modunda çalışacak.");
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

/**
 * Kullanıcı için Firebase şifre sıfırlama bağlantısı üretir.
 * @param {string} email 
 * @returns {Promise<{ success: boolean, link?: string, dev?: boolean, error?: string }>}
 */
async function generatePasswordResetLink(email) {
    if (!email) {
        return { success: false, error: "E-posta adresi gereklidir." };
    }

    // Firebase Admin aktif ise
    if (isInitialized && firebaseApp) {
        try {
            const auth = getAuth(firebaseApp);

            // Kullanıcı Firebase Auth içinde yoksa oluşturmayı dene
            try {
                await auth.getUserByEmail(email);
            } catch (userErr) {
                if (userErr.code === "auth/user-not-found") {
                    console.log(`ℹ️ [Firebase Auth] ${email} kullanıcısı Firebase Auth'da oluşturuluyor...`);
                    await auth.createUser({ email, emailVerified: true });
                }
            }

            const resetLink = await auth.generatePasswordResetLink(email);

            console.log("╔══════════════════════════════════════════════════════╗");
            console.log("║ 🔥 [FIREBASE ŞİFRE SIFIRLAMA BAĞLANTISI ÜRETİLDİ]    ║");
            console.log(`║ Alıcı: ${email.padEnd(46)}║`);
            console.log(`║ Link : ${resetLink.slice(0, 46).padEnd(46)}║`);
            console.log("╚══════════════════════════════════════════════════════╝");

            return {
                success: true,
                link: resetLink,
                dev: false,
            };
        } catch (err) {
            console.error("❌ [Firebase Admin Reset Link Hatası]:", err.message);
            const devLink = `https://the-nest.firebaseapp.com/__/auth/action?mode=resetPassword&email=${encodeURIComponent(email)}`;
            logDevResetLink(email, devLink, "Firebase Admin Hatası: " + err.message);
            return {
                success: true,
                link: devLink,
                dev: true,
                error: err.message,
            };
        }
    }

    // Geliştirme / Yerel Simülasyon
    const devLink = `https://the-nest.firebaseapp.com/__/auth/action?mode=resetPassword&email=${encodeURIComponent(email)}`;
    logDevResetLink(email, devLink, "Geliştirme / Test Modu");
    return {
        success: true,
        link: devLink,
        dev: true,
    };
}

function logDevResetLink(email, link, reason) {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log(`║ 🔑 [FIREBASE RESET LINK] (${(reason || "Dev").slice(0, 24).padEnd(24)}) ║`);
    console.log(`║ Alıcı: ${email.padEnd(46)}║`);
    console.log(`║ Link : ${link.slice(0, 46).padEnd(46)}║`);
    console.log("╚══════════════════════════════════════════════════════╝");
}

module.exports = {
    initFirebaseAdmin,
    generatePasswordResetLink,
    isFirebaseAdminReady: () => isInitialized,
    getAuth: () => (firebaseApp ? getAuth(firebaseApp) : null),
};
