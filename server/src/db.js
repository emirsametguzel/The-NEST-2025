// =============================================================================
// server/src/db.js
// Birleşik Veritabanı Katmanı (SQLite / better-sqlite3 & Firebase Firestore)
// =============================================================================

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// SQLite Veritabanı Dosyası
const DB_DIR = path.join(__dirname, "..", "db");
const DB_PATH = path.join(DB_DIR, "the_nest.db");

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// SQLite Tablolarını Oluştur
sqlite.exec(`
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    bio             TEXT,
    avatar_path     TEXT,
    role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at      TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_login_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (email);

CREATE TABLE IF NOT EXISTS content_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL CHECK (type IN ('makale', 'ders', 'duyuru', 'sunum', 'obje', 'haber')),
    category     TEXT DEFAULT 'Mekanik',
    title        TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    summary      TEXT,
    body         TEXT,
    image_url    TEXT,
    file_url     TEXT,
    author_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    author_username TEXT DEFAULT 'The Nest Ekibi',
    author_display_name TEXT DEFAULT 'The Nest',
    is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
    created_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_content_type ON content_items (type, created_at);
CREATE INDEX IF NOT EXISTS idx_content_slug ON content_items (slug);

CREATE TABLE IF NOT EXISTS team_applications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    class_name   TEXT NOT NULL,
    email        TEXT NOT NULL,
    phone        TEXT NOT NULL,
    experience   TEXT,
    department   TEXT NOT NULL,
    tools        TEXT,
    motivation   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS site_settings (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL,
    updated_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier   TEXT,
    ip_address   TEXT NOT NULL,
    success      INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
    user_agent   TEXT,
    created_at   TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL,
    ip_address  TEXT NOT NULL,
    success     INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_username  TEXT,
    action          TEXT NOT NULL,
    entity_type     TEXT DEFAULT 'general',
    entity_id       TEXT,
    details         TEXT,
    ip_address      TEXT,
    created_at      TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`);

// Firebase Admin (Opsiyonel Bulut Entegrasyonu)
let firestore = null;
try {
    const { initializeApp, getApps, cert } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");

    if (!getApps().length) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            let serviceAccount;
            try {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
            } catch (_) {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON.replace(/\\n/g, "\n"));
            }
            initializeApp({
                credential: cert(serviceAccount),
                projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
            });
            firestore = getFirestore();
            firestore.settings({ ignoreUndefinedProperties: true });
        } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
            initializeApp({
                credential: cert({
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
                    projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
                }),
                projectId: process.env.FIREBASE_PROJECT_ID || "the-nest-c38fc",
            });
            firestore = getFirestore();
            firestore.settings({ ignoreUndefinedProperties: true });
        }
    } else {
        firestore = getFirestore();
    }
} catch (_) {}

// =============================================================================
// KULLANICI İŞLEMLERİ (USERS)
// =============================================================================

async function getUserByEmail(email) {
    if (!email) return null;
    const clean = email.toLowerCase().trim();
    const row = sqlite.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(clean);
    return row ? { ...row, id: String(row.id) } : null;
}

async function getUserByUsername(username) {
    if (!username) return null;
    const clean = username.toLowerCase().trim();
    const row = sqlite.prepare("SELECT * FROM users WHERE LOWER(username) = ?").get(clean);
    return row ? { ...row, id: String(row.id) } : null;
}

async function getUserByUsernameOrEmail(identifier) {
    if (!identifier) return null;
    const clean = identifier.toLowerCase().trim();
    const row = sqlite.prepare("SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?").get(clean, clean);
    return row ? { ...row, id: String(row.id) } : null;
}

async function getUserById(id) {
    if (!id) return null;
    const row = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return row ? { ...row, id: String(row.id) } : null;
}

async function createUser(userData) {
    const now = new Date().toISOString();
    const stmt = sqlite.prepare(`
        INSERT INTO users (username, email, password_hash, display_name, bio, avatar_path, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
        (userData.username || "").toLowerCase().trim(),
        (userData.email || "").toLowerCase().trim(),
        userData.password_hash || "",
        userData.display_name || userData.username || "",
        userData.bio || "",
        userData.avatar_path || null,
        userData.role || "member",
        userData.is_active !== undefined ? (userData.is_active ? 1 : 0) : 1,
        now,
        now
    );

    return await getUserById(info.lastInsertRowid);
}

async function updateUser(id, updates) {
    if (!id) return null;
    const cleanId = String(id);
    const existing = await getUserById(cleanId);
    if (!existing) return null;

    const fields = [];
    const values = [];

    for (const [key, val] of Object.entries(updates)) {
        if (key === "id") continue;
        fields.push(`${key} = ?`);
        values.push(val);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(cleanId);

    const query = `UPDATE users SET ${fields.join(", ")} WHERE id = ?`;
    sqlite.prepare(query).run(...values);

    return await getUserById(cleanId);
}

async function deleteUser(id) {
    if (!id) return false;
    const info = sqlite.prepare("DELETE FROM users WHERE id = ?").run(id);
    return info.changes > 0;
}

async function getAllUsers() {
    const rows = sqlite.prepare("SELECT * FROM users ORDER BY created_at DESC").all();
    return rows.map((r) => ({ ...r, id: String(r.id) }));
}

// =============================================================================
// İÇERİK İŞLEMLERİ (CONTENT ITEMS)
// =============================================================================

async function getContentItems({ type, category, onlyPublished = false } = {}) {
    let query = "SELECT * FROM content_items WHERE 1=1";
    const params = [];

    if (onlyPublished) {
        query += " AND is_published = 1";
    }
    if (type) {
        query += " AND type = ?";
        params.push(type);
    }
    if (category) {
        query += " AND category = ?";
        params.push(category);
    }

    query += " ORDER BY created_at DESC";
    const rows = sqlite.prepare(query).all(...params);
    return rows.map((r) => ({ ...r, id: String(r.id) }));
}

async function getContentItemBySlugOrId(slugOrId) {
    if (!slugOrId) return null;
    const row = sqlite.prepare("SELECT * FROM content_items WHERE slug = ? OR id = ?").get(String(slugOrId), String(slugOrId));
    return row ? { ...row, id: String(row.id) } : null;
}

async function slugExists(slug, excludeId = null) {
    if (!slug) return false;
    if (excludeId) {
        const row = sqlite.prepare("SELECT id FROM content_items WHERE slug = ? AND id != ?").get(slug, excludeId);
        return !!row;
    }
    const row = sqlite.prepare("SELECT id FROM content_items WHERE slug = ?").get(slug);
    return !!row;
}

async function createContentItem(itemData) {
    const now = new Date().toISOString();
    const stmt = sqlite.prepare(`
        INSERT INTO content_items (
            type, category, title, slug, summary, body, image_url, file_url,
            author_id, author_username, author_display_name, is_published, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
        itemData.type || "makale",
        itemData.category || "Mekanik",
        itemData.title || "",
        itemData.slug || `item-${Date.now()}`,
        itemData.summary || "",
        itemData.body || "",
        itemData.image_url || null,
        itemData.file_url || null,
        itemData.author_id || null,
        itemData.author_username || "The Nest Ekibi",
        itemData.author_display_name || "The Nest",
        itemData.is_published !== undefined ? (itemData.is_published ? 1 : 0) : 1,
        now,
        now
    );

    return await getContentItemBySlugOrId(info.lastInsertRowid);
}

async function updateContentItem(id, updates) {
    if (!id) return null;
    const existing = await getContentItemBySlugOrId(id);
    if (!existing) return null;

    const fields = [];
    const values = [];

    for (const [key, val] of Object.entries(updates)) {
        if (key === "id") continue;
        fields.push(`${key} = ?`);
        values.push(val);
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(existing.id);

    const query = `UPDATE content_items SET ${fields.join(", ")} WHERE id = ?`;
    sqlite.prepare(query).run(...values);

    return await getContentItemBySlugOrId(existing.id);
}

async function deleteContentItem(id) {
    if (!id) return false;
    const existing = await getContentItemBySlugOrId(id);
    if (!existing) return false;
    const info = sqlite.prepare("DELETE FROM content_items WHERE id = ?").run(existing.id);
    return info.changes > 0;
}

// =============================================================================
// SİTE AYARLARI (SITE SETTINGS)
// =============================================================================

async function getSiteSettings() {
    const rows = sqlite.prepare("SELECT key, value FROM site_settings").all();
    const settings = {};
    rows.forEach((r) => {
        settings[r.key] = r.value;
    });
    return settings;
}

async function updateSiteSettings(settingsObj) {
    const now = new Date().toISOString();
    const stmt = sqlite.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const updateMany = sqlite.transaction((entries) => {
        for (const [k, v] of entries) {
            stmt.run(k, String(v), now);
        }
    });

    updateMany(Object.entries(settingsObj));
    return await getSiteSettings();
}

// =============================================================================
// TAKIM BAŞVURULARI (TEAM APPLICATIONS)
// =============================================================================

async function createTeamApplication(data) {
    const now = new Date().toISOString();
    const stmt = sqlite.prepare(`
        INSERT INTO team_applications (
            name, class_name, email, phone, experience, department, tools, motivation, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
        data.name || "Anonim",
        data.class_name || "Lise",
        data.email || "",
        data.phone || "—",
        data.experience || "—",
        data.department || "Genel",
        data.tools || "—",
        data.motivation || "Takıma katılmak istiyorum.",
        "pending",
        now
    );

    const row = sqlite.prepare("SELECT * FROM team_applications WHERE id = ?").get(info.lastInsertRowid);
    return row ? { ...row, id: String(row.id) } : null;
}

async function getTeamApplications() {
    const rows = sqlite.prepare("SELECT * FROM team_applications ORDER BY created_at DESC").all();
    return rows.map((r) => ({ ...r, id: String(r.id) }));
}

async function updateTeamApplicationStatus(id, status) {
    if (!id) return false;
    const info = sqlite.prepare("UPDATE team_applications SET status = ?, updated_at = ? WHERE id = ?").run(
        status,
        new Date().toISOString(),
        id
    );
    return info.changes > 0;
}

async function deleteTeamApplication(id) {
    if (!id) return false;
    const info = sqlite.prepare("DELETE FROM team_applications WHERE id = ?").run(id);
    return info.changes > 0;
}

// =============================================================================
// GİRİŞ & GÜVENLİK & SİSTEM LOGLARI
// =============================================================================

async function logLoginAttempt({ identifier, ip_address, success, user_agent }) {
    try {
        sqlite.prepare(`
            INSERT INTO login_attempts (identifier, ip_address, success, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            (identifier || "").toLowerCase().trim(),
            ip_address || "",
            success ? 1 : 0,
            user_agent || "",
            new Date().toISOString()
        );
    } catch (_) {}
}

async function logPasswordResetRequest({ email, ip_address, success }) {
    try {
        sqlite.prepare(`
            INSERT INTO password_resets (email, ip_address, success, created_at)
            VALUES (?, ?, ?, ?)
        `).run(
            (email || "").toLowerCase().trim(),
            ip_address || "",
            success ? 1 : 0,
            new Date().toISOString()
        );
    } catch (_) {}
}

async function logAuditEvent({ actor_username, action, entity_type, entity_id, details, ip_address }) {
    try {
        sqlite.prepare(`
            INSERT INTO audit_logs (actor_username, action, entity_type, entity_id, details, ip_address, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            actor_username || "system",
            action || "UNKNOWN",
            entity_type || "general",
            String(entity_id || ""),
            details || "",
            ip_address || "",
            new Date().toISOString()
        );
    } catch (_) {}
}

async function getRecentAuditLogs(limitCount = 15) {
    try {
        const rows = sqlite.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?").all(limitCount);
        return rows.map((r) => ({ ...r, id: String(r.id) }));
    } catch (_) {
        return [];
    }
}

async function getRecentLoginAttempts(limitCount = 10) {
    try {
        const rows = sqlite.prepare("SELECT * FROM login_attempts ORDER BY created_at DESC LIMIT ?").all(limitCount);
        return rows.map((r) => ({ ...r, id: String(r.id) }));
    } catch (_) {
        return [];
    }
}

async function getDashboardMetrics() {
    try {
        const users = await getAllUsers();
        const items = await getContentItems();
        const apps = await getTeamApplications();
        const resetCountRow = sqlite.prepare("SELECT COUNT(*) as count FROM password_resets").get();
        const totalResets = resetCountRow ? resetCountRow.count : 0;

        const totalUsers = users.length;
        const totalItems = items.length;
        const totalApps = apps.length;
        const pendingApps = apps.filter((a) => a.status === "pending").length;

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const usersLast7Days = users.filter((u) => new Date(u.created_at || 0) >= sevenDaysAgo).length;
        const userGrowthPercentage = totalUsers > 0 ? Math.round((usersLast7Days / Math.max(1, totalUsers - usersLast7Days)) * 100) : 0;

        const contentByType = {};
        const contentByCategory = {};
        items.forEach((item) => {
            contentByType[item.type] = (contentByType[item.type] || 0) + 1;
            contentByCategory[item.category] = (contentByCategory[item.category] || 0) + 1;
        });

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
    sqlite,
    firestore,
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
