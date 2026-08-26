// =============================================================================
// server/src/db.js
// Firebase Firestore Veritabanı Katmanı & Yönetici Fonksiyonları (Admin v14+)
// =============================================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Firebase Admin SDK Başlatma
if (!getApps().length) {
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            let serviceAccount;
            try {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            } catch (pErr) {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, "\n"));
            }
            initializeApp({
                credential: cert(serviceAccount),
                projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
            });
            console.log("🔥 Firebase Admin (Service Account ile) başlatıldı.");
        } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            initializeApp({
                credential: cert({
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                    projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
                }),
                projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
            });
            console.log("🔥 Firebase Admin (Env Credentials ile) başlatıldı.");
        } else {
            // Standart Proje ID ile başlat
            initializeApp({
                projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
            });
            console.log("🔥 Firebase Admin (Project ID ile) başlatıldı.");
        }
    } catch (initErr) {
        console.error("Firebase Admin başlatma uyarısı:", initErr.message);
        try {
            initializeApp({
                projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
            });
        } catch (_) {}
    }
}

const firestore = getFirestore();
try {
    firestore.settings({ ignoreUndefinedProperties: true });
} catch (_) {}

// Koleksiyon Referansları
const usersCol = firestore.collection("users");
const contentCol = firestore.collection("content_items");
const settingsCol = firestore.collection("site_settings");
const applicationsCol = firestore.collection("team_applications");
const loginAttemptsCol = firestore.collection("login_attempts");

// =============================================================================
// KULLANICI İŞLEMLERİ (USERS)
// =============================================================================

async function getUserByEmail(email) {
    if (!email) return null;
    try {
        const snap = await usersCol.where("email", "==", email.toLowerCase().trim()).limit(1).get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (err) {
        console.error("getUserByEmail hatası:", err.message);
        return null;
    }
}

async function getUserByUsername(username) {
    if (!username) return null;
    try {
        const snap = await usersCol.where("username", "==", username.toLowerCase().trim()).limit(1).get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (err) {
        console.error("getUserByUsername hatası:", err.message);
        return null;
    }
}

async function getUserByUsernameOrEmail(identifier) {
    if (!identifier) return null;
    const clean = identifier.toLowerCase().trim();
    let user = await getUserByEmail(clean);
    if (!user) {
        user = await getUserByUsername(clean);
    }
    return user;
}

async function getUserById(id) {
    if (!id) return null;
    try {
        const doc = await usersCol.doc(String(id)).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    } catch (err) {
        console.error("getUserById hatası:", err.message);
        return null;
    }
}

async function createUser(userData) {
    const now = new Date().toISOString();
    const docRef = usersCol.doc();
    const newUser = {
        id: docRef.id,
        username: (userData.username || "").toLowerCase().trim(),
        email: (userData.email || "").toLowerCase().trim(),
        password_hash: userData.password_hash || "",
        display_name: userData.display_name || userData.username || "",
        bio: userData.bio || "",
        avatar_path: userData.avatar_path || null,
        role: userData.role || "member",
        is_active: userData.is_active !== undefined ? (userData.is_active ? 1 : 0) : 1,
        created_at: now,
        updated_at: now,
        last_login_at: null,
    };
    await docRef.set(newUser);
    return newUser;
}

async function updateUser(id, updates) {
    if (!id) return null;
    const cleanUpdates = { ...updates, updated_at: new Date().toISOString() };
    delete cleanUpdates.id;
    await usersCol.doc(String(id)).set(cleanUpdates, { merge: true });
    return await getUserById(id);
}

async function deleteUser(id) {
    if (!id) return false;
    await usersCol.doc(String(id)).delete();
    return true;
}

async function getAllUsers() {
    try {
        const snap = await usersCol.get();
        let users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        users.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return users;
    } catch (err) {
        console.error("getAllUsers hatası:", err.message);
        return [];
    }
}

// =============================================================================
// İÇERİK İŞLEMLERİ (CONTENT ITEMS)
// =============================================================================

async function getContentItems({ type, category, onlyPublished = false } = {}) {
    try {
        let query = contentCol;
        if (onlyPublished) {
            query = query.where("is_published", "==", 1);
        }
        if (type) {
            query = query.where("type", "==", type);
        }
        if (category) {
            query = query.where("category", "==", category);
        }

        const snap = await query.get();
        let items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        items.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return items;
    } catch (err) {
        console.error("getContentItems hatası:", err.message);
        return [];
    }
}

async function getContentItemBySlugOrId(slugOrId) {
    if (!slugOrId) return null;
    try {
        const doc = await contentCol.doc(String(slugOrId)).get();
        if (doc.exists) {
            return { id: doc.id, ...doc.data() };
        }
        const snap = await contentCol.where("slug", "==", String(slugOrId)).limit(1).get();
        if (!snap.empty) {
            const itemDoc = snap.docs[0];
            return { id: itemDoc.id, ...itemDoc.data() };
        }
    } catch (err) {
        console.error("getContentItemBySlugOrId hatası:", err.message);
    }
    return null;
}

async function slugExists(slug, excludeId = null) {
    try {
        const snap = await contentCol.where("slug", "==", slug).limit(2).get();
        if (snap.empty) return false;
        if (!excludeId) return true;
        return snap.docs.some((d) => d.id !== String(excludeId));
    } catch (err) {
        return false;
    }
}

async function createContentItem(itemData) {
    const now = new Date().toISOString();
    const docRef = contentCol.doc();
    const newItem = {
        id: docRef.id,
        type: itemData.type || "makale",
        category: itemData.category || "Mekanik",
        title: itemData.title || "",
        slug: itemData.slug || docRef.id,
        summary: itemData.summary || "",
        body: itemData.body || "",
        image_url: itemData.image_url || null,
        file_url: itemData.file_url || null,
        author_id: itemData.author_id || null,
        author_username: itemData.author_username || "The Nest Ekibi",
        author_display_name: itemData.author_display_name || "The Nest",
        is_published: itemData.is_published !== undefined ? (itemData.is_published ? 1 : 0) : 1,
        created_at: now,
        updated_at: now,
    };
    await docRef.set(newItem);
    return newItem;
}

async function updateContentItem(id, updates) {
    if (!id) return null;
    const cleanUpdates = { ...updates, updated_at: new Date().toISOString() };
    delete cleanUpdates.id;
    await contentCol.doc(String(id)).set(cleanUpdates, { merge: true });
    return await getContentItemBySlugOrId(id);
}

async function deleteContentItem(id) {
    if (!id) return false;
    await contentCol.doc(String(id)).delete();
    return true;
}

// =============================================================================
// SİTE AYARLARI (SITE SETTINGS)
// =============================================================================

async function getSiteSettings() {
    try {
        const snap = await settingsCol.get();
        const settings = {};
        snap.docs.forEach((doc) => {
            const data = doc.data();
            settings[doc.id] = data.value !== undefined ? data.value : data;
        });
        return settings;
    } catch (err) {
        console.error("getSiteSettings hatası:", err.message);
        return {};
    }
}

async function updateSiteSettings(settingsObj) {
    const now = new Date().toISOString();
    const batch = firestore.batch();
    for (const [key, value] of Object.entries(settingsObj)) {
        const ref = settingsCol.doc(key);
        batch.set(ref, { key, value: String(value), updated_at: now }, { merge: true });
    }
    await batch.commit();
    return await getSiteSettings();
}

// =============================================================================
// TAKIM BAŞVURULARI (TEAM APPLICATIONS)
// =============================================================================

async function createTeamApplication(data) {
    const now = new Date().toISOString();
    const docRef = applicationsCol.doc();
    const newApp = {
        id: docRef.id,
        name: data.name || "Anonim",
        class_name: data.class_name || "Lise",
        email: data.email || "",
        phone: data.phone || "—",
        experience: data.experience || "—",
        department: data.department || "Genel",
        tools: data.tools || "—",
        motivation: data.motivation || "Takıma katılmak istiyorum.",
        status: "pending",
        created_at: now,
    };
    await docRef.set(newApp);
    return newApp;
}

async function getTeamApplications() {
    try {
        const snap = await applicationsCol.get();
        let apps = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        apps.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return apps;
    } catch (err) {
        console.error("getTeamApplications hatası:", err.message);
        return [];
    }
}

async function updateTeamApplicationStatus(id, status) {
    if (!id) return false;
    await applicationsCol.doc(String(id)).set({ status, updated_at: new Date().toISOString() }, { merge: true });
    return true;
}

async function deleteTeamApplication(id) {
    if (!id) return false;
    await applicationsCol.doc(String(id)).delete();
    return true;
}

// =============================================================================
// GİRİŞ LOGLARI (LOGIN ATTEMPTS)
// =============================================================================

async function logLoginAttempt({ identifier, ip_address, success, user_agent }) {
    try {
        await loginAttemptsCol.add({
            identifier: (identifier || "").toLowerCase().trim(),
            ip_address: ip_address || "",
            success: success ? 1 : 0,
            user_agent: user_agent || "",
            created_at: new Date().toISOString(),
        });
    } catch (_) {}
}

module.exports = {
    firestore,
    usersCol,
    contentCol,
    settingsCol,
    applicationsCol,
    loginAttemptsCol,
    // Kullanıcı Metotları
    getUserByEmail,
    getUserByUsername,
    getUserByUsernameOrEmail,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getAllUsers,
    // İçerik Metotları
    getContentItems,
    getContentItemBySlugOrId,
    slugExists,
    createContentItem,
    updateContentItem,
    deleteContentItem,
    // Ayar Metotları
    getSiteSettings,
    updateSiteSettings,
    // Başvuru Metotları
    createTeamApplication,
    getTeamApplications,
    updateTeamApplicationStatus,
    deleteTeamApplication,
    // Log Metotları
    logLoginAttempt,
};
