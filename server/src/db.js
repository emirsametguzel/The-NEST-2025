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
const passwordResetsCol = firestore.collection("password_resets");
const auditLogsCol = firestore.collection("audit_logs");

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
// GİRİŞ & GÜVENLİK & SİSTEM LOGLARI
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

async function logPasswordResetRequest({ email, ip_address, success }) {
    try {
        await passwordResetsCol.add({
            email: (email || "").toLowerCase().trim(),
            ip_address: ip_address || "",
            success: success ? 1 : 0,
            created_at: new Date().toISOString(),
        });
    } catch (_) {}
}

async function logAuditEvent({ actor_username, action, entity_type, entity_id, details, ip_address }) {
    try {
        await auditLogsCol.add({
            actor_username: actor_username || "system",
            action: action || "UNKNOWN",
            entity_type: entity_type || "general",
            entity_id: entity_id || "",
            details: details || "",
            ip_address: ip_address || "",
            created_at: new Date().toISOString(),
        });
    } catch (_) {}
}

async function getRecentAuditLogs(limitCount = 15) {
    try {
        const snap = await auditLogsCol.get();
        let logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return logs.slice(0, limitCount);
    } catch (_) {
        return [];
    }
}

async function getRecentLoginAttempts(limitCount = 10) {
    try {
        const snap = await loginAttemptsCol.get();
        let logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return logs.slice(0, limitCount);
    } catch (_) {
        return [];
    }
}

async function getDashboardMetrics() {
    try {
        const [users, items, apps, resetSnaps, loginSnaps] = await Promise.all([
            getAllUsers(),
            getContentItems(),
            getTeamApplications(),
            passwordResetsCol.get().catch(() => ({ size: 0, docs: [] })),
            loginAttemptsCol.get().catch(() => ({ size: 0, docs: [] })),
        ]);

        const totalUsers = users.length;
        const totalItems = items.length;
        const totalApps = apps.length;
        const pendingApps = apps.filter((a) => a.status === "pending").length;
        const totalResets = resetSnaps.size !== undefined ? resetSnaps.size : (resetSnaps.docs ? resetSnaps.docs.length : 0);

        // Son 7 gündeki yeni kullanıcı sayısı hesabı
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const usersLast7Days = users.filter((u) => new Date(u.created_at || 0) >= sevenDaysAgo).length;
        const userGrowthPercentage = totalUsers > 0 ? Math.round((usersLast7Days / Math.max(1, totalUsers - usersLast7Days)) * 100) : 0;

        // Kategori ve tip kırılımları
        const contentByType = {};
        const contentByCategory = {};
        items.forEach((item) => {
            contentByType[item.type] = (contentByType[item.type] || 0) + 1;
            contentByCategory[item.category] = (contentByCategory[item.category] || 0) + 1;
        });

        // Son girişler / Aktif kullanıcılar
        const recentActiveUsers = users
            .filter((u) => u.last_login_at)
            .sort((a, b) => new Date(b.last_login_at) - new Date(a.last_login_at))
            .slice(0, 6)
            .map((u) => ({
                id: u.id,
                username: u.username,
                display_name: u.display_name,
                email: u.email,
                role: u.role,
                avatar_path: u.avatar_path,
                last_login_at: u.last_login_at,
            }));

        return {
            totalUsers,
            usersLast7Days,
            userGrowthPercentage: userGrowthPercentage || Math.min(100, usersLast7Days * 20),
            totalItems,
            publishedItems: items.filter((i) => i.is_published === 1 || i.is_published === true).length,
            contentByType,
            contentByCategory,
            totalApps,
            pendingApps,
            totalPasswordResets: totalResets,
            recentActiveUsers,
        };
    } catch (err) {
        console.error("getDashboardMetrics hatası:", err.message);
        return {
            totalUsers: 1,
            usersLast7Days: 1,
            userGrowthPercentage: 100,
            totalItems: 0,
            publishedItems: 0,
            contentByType: {},
            contentByCategory: {},
            totalApps: 0,
            pendingApps: 0,
            totalPasswordResets: 0,
            recentActiveUsers: [],
        };
    }
}

module.exports = {
    firestore,
    usersCol,
    contentCol,
    settingsCol,
    applicationsCol,
    loginAttemptsCol,
    passwordResetsCol,
    auditLogsCol,
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
    // Log & İstatistik Metotları
    logLoginAttempt,
    logPasswordResetRequest,
    logAuditEvent,
    getRecentAuditLogs,
    getRecentLoginAttempts,
    getDashboardMetrics,
};
