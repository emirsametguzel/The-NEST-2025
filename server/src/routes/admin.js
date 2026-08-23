// =============================================================================
// server/src/routes/admin.js
// Tüm rotalar requireAdmin ile korunur (yalnızca role='admin' erişebilir).
//
// Kullanıcı Yönetimi:
//   GET    /api/admin/users                  -> tüm kullanıcıları listele
//   PATCH  /api/admin/users/:id/role         -> rol güncelle (member/admin)
//   PATCH  /api/admin/users/:id/status       -> hesap dondur / aktifleştir (is_active)
//   POST   /api/admin/users/:id/reset-password -> yönetici şifre sıfırlama
//   DELETE /api/admin/users/:id              -> kullanıcı sil
//
// İçerik Yönetimi:
//   GET    /api/admin/content                -> içerikleri listele (?type=&category=)
//   POST   /api/admin/content                -> yeni içerik oluştur
//   PATCH  /api/admin/content/:id            -> içerik güncelle
//   DELETE /api/admin/content/:id            -> içerik sil
//
// Takım Başvuruları:
//   GET    /api/admin/applications           -> başvuruları listele
//   PATCH  /api/admin/applications/:id/status -> durum güncelle (pending/approved/rejected)
//   DELETE /api/admin/applications/:id       -> başvuru sil
//
// Site Ayarları:
//   GET    /api/admin/settings               -> tüm ayarları getir
//   PUT    /api/admin/settings               -> ayarları güncelle
// =============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { requireAdmin } = require("../middleware/requireAuth");
const {
    adminUpdateRoleValidationRules,
    adminResetPasswordValidationRules,
    contentValidationRules,
} = require("../utils/validators");

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// =============================================================================
// ÖZEL VE BAĞIMSIZ ADMİN GİRİŞ / DURUM ROTALARI (Herkese Açık / Kimlik Doğrulamalı)
// =============================================================================

// GET /api/admin/me -> Admin oturum durumu kontrolü
router.get("/me", (req, res) => {
    if (req.session && req.session.userId && req.session.role === "admin") {
        const user = db.prepare("SELECT id, username, email, display_name, role FROM users WHERE id = ?").get(req.session.userId);
        if (user && user.role === "admin") {
            return res.json({
                authenticated: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    display_name: user.display_name,
                    role: user.role
                }
            });
        }
    }
    return res.status(401).json({ authenticated: false, error: "Yetkili yönetici oturumu bulunamadı." });
});

// Aşağıdaki TÜM rotalar admin yetkisi gerektirir.
router.use(requireAdmin);

// -----------------------------------------------------------------------------
// Yardımcı: başlıktan URL-dostu, benzersiz bir slug üretir.
// -----------------------------------------------------------------------------
function slugify(title) {
    const trMap = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
    const base = title
        .split("")
        .map((ch) => trMap[ch] || ch)
        .join("")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || "icerik";
}

function uniqueSlug(title, excludeId = null) {
    const base = slugify(title);
    let slug = base;
    let n = 1;
    while (true) {
        const existing = excludeId
            ? db.prepare("SELECT id FROM content_items WHERE slug = ? AND id != ?").get(slug, excludeId)
            : db.prepare("SELECT id FROM content_items WHERE slug = ?").get(slug);
        if (!existing) return slug;
        n += 1;
        slug = `${base}-${n}`;
    }
}

// =============================================================================
// KULLANICI YÖNETİMİ
// =============================================================================

// GET /api/admin/users
router.get("/users", (req, res) => {
    const users = db
        .prepare(
            `SELECT id, username, email, display_name, role, is_active, created_at, last_login_at
             FROM users ORDER BY created_at DESC`
        )
        .all();
    return res.json({ users });
});

// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", verifyCsrfToken, adminUpdateRoleValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const targetId = Number(req.params.id);
    const { role } = req.body;

    if (targetId === req.userId) {
        return res.status(400).json({ error: "Kendi rolünüzü değiştiremezsiniz." });
    }

    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    db.prepare(
        `UPDATE users SET role = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(role, targetId);

    const updated = db
        .prepare("SELECT id, username, email, display_name, role, is_active FROM users WHERE id = ?")
        .get(targetId);
    return res.json({ message: "Kullanıcı rolü güncellendi.", user: updated });
});

// PATCH /api/admin/users/:id/status (Hesap Dondur / Aktifleştir)
router.patch("/users/:id/status", verifyCsrfToken, (req, res) => {
    const targetId = Number(req.params.id);
    const { isActive } = req.body;

    if (targetId === req.userId) {
        return res.status(400).json({ error: "Kendi hesabınızı donduramazsınız." });
    }

    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    const newStatus = isActive ? 1 : 0;
    db.prepare(
        `UPDATE users SET is_active = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(newStatus, targetId);

    return res.json({
        message: newStatus === 1 ? "Hesap aktifleştirildi." : "Hesap donduruldu.",
        isActive: newStatus === 1,
    });
});

// POST /api/admin/users/:id/reset-password (Yönetici Tarafından Şifre Belirleme)
router.post("/users/:id/reset-password", verifyCsrfToken, adminResetPasswordValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const targetId = Number(req.params.id);
    const { newPassword } = req.body;

    const target = db.prepare("SELECT id, username FROM users WHERE id = ?").get(targetId);
    if (!target) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    db.prepare(
        `UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(hash, targetId);

    return res.json({ message: `"${target.username}" kullanıcısının şifresi başarıyla güncellendi.` });
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", verifyCsrfToken, (req, res) => {
    const targetId = Number(req.params.id);

    if (targetId === req.userId) {
        return res.status(400).json({ error: "Kendi hesabınızı silemezsiniz." });
    }

    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    return res.json({ message: "Kullanıcı silindi." });
});

// =============================================================================
// İÇERİK YÖNETİMİ (Makale / Ders / Sunum / Obje / Haber / Duyuru)
// =============================================================================

// GET /api/admin/content
router.get("/content", (req, res) => {
    const { type, category } = req.query;
    let query = `
        SELECT ci.*, u.username AS author_username
        FROM content_items ci
        LEFT JOIN users u ON u.id = ci.author_id
        WHERE 1=1
    `;
    const params = [];

    if (type) {
        query += ` AND ci.type = ?`;
        params.push(type);
    }
    if (category) {
        query += ` AND ci.category = ?`;
        params.push(category);
    }

    query += ` ORDER BY ci.created_at DESC`;

    const items = db.prepare(query).all(...params);
    return res.json({ items });
});

// POST /api/admin/content
router.post("/content", verifyCsrfToken, contentValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { type, category, title, summary, body, imageUrl, fileUrl, isPublished } = req.body;
    const slug = uniqueSlug(title);

    const result = db
        .prepare(
            `INSERT INTO content_items (type, category, title, slug, summary, body, image_url, file_url, author_id, is_published)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            type,
            category || "Mekanik",
            title,
            slug,
            summary || null,
            body || null,
            imageUrl || null,
            fileUrl || null,
            req.userId,
            isPublished === false ? 0 : 1
        );

    const created = db.prepare("SELECT * FROM content_items WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ message: "İçerik oluşturuldu.", item: created });
});

// PATCH /api/admin/content/:id
router.patch("/content/:id", verifyCsrfToken, contentValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const itemId = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM content_items WHERE id = ?").get(itemId);
    if (!existing) {
        return res.status(404).json({ error: "İçerik bulunamadı." });
    }

    const { type, category, title, summary, body, imageUrl, fileUrl, isPublished } = req.body;
    const slug = title !== existing.title ? uniqueSlug(title, itemId) : existing.slug;

    db.prepare(
        `UPDATE content_items
         SET type = ?, category = ?, title = ?, slug = ?, summary = ?, body = ?, image_url = ?, file_url = ?, is_published = ?,
             updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`
    ).run(
        type || existing.type,
        category !== undefined ? category : existing.category,
        title || existing.title,
        slug,
        summary !== undefined ? summary : existing.summary,
        body !== undefined ? body : existing.body,
        imageUrl !== undefined ? imageUrl : existing.image_url,
        fileUrl !== undefined ? fileUrl : existing.file_url,
        isPublished !== undefined ? (isPublished ? 1 : 0) : existing.is_published,
        itemId
    );

    const updated = db.prepare("SELECT * FROM content_items WHERE id = ?").get(itemId);
    return res.json({ message: "İçerik güncellendi.", item: updated });
});

// DELETE /api/admin/content/:id
router.delete("/content/:id", verifyCsrfToken, (req, res) => {
    const itemId = Number(req.params.id);
    const existing = db.prepare("SELECT id FROM content_items WHERE id = ?").get(itemId);
    if (!existing) {
        return res.status(404).json({ error: "İçerik bulunamadı." });
    }
    db.prepare("DELETE FROM content_items WHERE id = ?").run(itemId);
    return res.json({ message: "İçerik silindi." });
});

// =============================================================================
// TAKIM BAŞVURULARI
// =============================================================================

// GET /api/admin/applications
router.get("/applications", (req, res) => {
    const applications = db
        .prepare(`SELECT * FROM team_applications ORDER BY created_at DESC`)
        .all();
    return res.json({ applications });
});

// PATCH /api/admin/applications/:id/status
router.patch("/applications/:id/status", verifyCsrfToken, (req, res) => {
    const appId = Number(req.params.id);
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Geçersiz başvuru durumu." });
    }

    const existing = db.prepare("SELECT id FROM team_applications WHERE id = ?").get(appId);
    if (!existing) {
        return res.status(404).json({ error: "Başvuru bulunamadı." });
    }

    db.prepare(`UPDATE team_applications SET status = ? WHERE id = ?`).run(status, appId);
    return res.json({ message: "Başvuru durumu güncellendi." });
});

// DELETE /api/admin/applications/:id
router.delete("/applications/:id", verifyCsrfToken, (req, res) => {
    const appId = Number(req.params.id);
    const existing = db.prepare("SELECT id FROM team_applications WHERE id = ?").get(appId);
    if (!existing) {
        return res.status(404).json({ error: "Başvuru bulunamadı." });
    }
    db.prepare(`DELETE FROM team_applications WHERE id = ?`).run(appId);
    return res.json({ message: "Başvuru silindi." });
});

// =============================================================================
// SİTE AYARLARI
// =============================================================================

// GET /api/admin/settings
router.get("/settings", (req, res) => {
    const rows = db.prepare(`SELECT key, value, updated_at FROM site_settings`).all();
    const settings = {};
    for (const r of rows) {
        settings[r.key] = r.value;
    }
    return res.json({ settings });
});

// PUT /api/admin/settings
router.put("/settings", verifyCsrfToken, (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") {
        return res.status(400).json({ error: "Geçersiz ayar verisi." });
    }

    const upsert = db.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (?, ?, STRFTIME('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
    `);

    const updateMany = db.transaction((entries) => {
        for (const [key, value] of entries) {
            upsert.run(key, String(value));
        }
    });

    updateMany(Object.entries(settings));
    return res.json({ message: "Site ayarları başarıyla kaydedildi." });
});

module.exports = router;
