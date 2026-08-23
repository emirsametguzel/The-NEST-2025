// =============================================================================
// server/src/routes/admin.js
// Tüm rotalar requireAdmin ile korunur (yalnızca role='admin' erişebilir).
//
//   GET    /api/admin/users              -> tüm kullanıcıları listele
//   PATCH  /api/admin/users/:id/role     -> kullanıcı rolünü güncelle (member/admin)
//   DELETE /api/admin/users/:id          -> kullanıcı sil
//
//   GET    /api/admin/content            -> içerikleri listele (?type= ile filtrelenebilir)
//   POST   /api/admin/content            -> yeni içerik oluştur
//   PATCH  /api/admin/content/:id        -> içerik güncelle
//   DELETE /api/admin/content/:id        -> içerik sil
//
// Not: DB'de rol değerleri 'member' / 'admin' olarak saklanır (mevcut şemayla
// tutarlılık için). Panelde "Üye" / "Yönetici" olarak gösterilir.
// =============================================================================

const express = require("express");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { requireAdmin } = require("../middleware/requireAuth");
const { adminUpdateRoleValidationRules, contentValidationRules } = require("../utils/validators");

const router = express.Router();

// Bu router'daki HER rota admin gerektirir.
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
    // Aynı slug'a sahip başka bir kayıt varsa sonuna -2, -3... eklenir.
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

// -----------------------------------------------------------------------------
// GET /api/admin/users
// -----------------------------------------------------------------------------
router.get("/users", (req, res) => {
    const users = db
        .prepare(
            `SELECT id, username, email, display_name, role, is_active, created_at, last_login_at
             FROM users ORDER BY created_at DESC`
        )
        .all();
    return res.json({ users });
});

// -----------------------------------------------------------------------------
// PATCH /api/admin/users/:id/role
// -----------------------------------------------------------------------------
router.patch("/users/:id/role", verifyCsrfToken, adminUpdateRoleValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const targetId = Number(req.params.id);
    const { role } = req.body;

    if (targetId === req.userId) {
        // Bir adminin kendi rolünü düşürüp sistemden kendini kilitlemesini önle.
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
    return res.json({ message: "Rol güncellendi.", user: updated });
});

// -----------------------------------------------------------------------------
// DELETE /api/admin/users/:id
// -----------------------------------------------------------------------------
router.delete("/users/:id", verifyCsrfToken, (req, res) => {
    const targetId = Number(req.params.id);

    if (targetId === req.userId) {
        return res.status(400).json({ error: "Kendi hesabınızı bu panelden silemezsiniz." });
    }

    const target = db.prepare("SELECT id FROM users WHERE id = ?").get(targetId);
    if (!target) {
        return res.status(404).json({ error: "Kullanıcı bulunamadı." });
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    return res.json({ message: "Kullanıcı silindi." });
});

// =============================================================================
// İÇERİK YÖNETİMİ (Makaleler / Dersler / Duyurular)
// =============================================================================

// -----------------------------------------------------------------------------
// GET /api/admin/content?type=makale|ders|duyuru (opsiyonel filtre)
// -----------------------------------------------------------------------------
router.get("/content", (req, res) => {
    const { type } = req.query;
    let items;
    if (type && ["makale", "ders", "duyuru"].includes(type)) {
        items = db
            .prepare(
                `SELECT ci.*, u.username AS author_username FROM content_items ci
                 LEFT JOIN users u ON u.id = ci.author_id
                 WHERE ci.type = ? ORDER BY ci.created_at DESC`
            )
            .all(type);
    } else {
        items = db
            .prepare(
                `SELECT ci.*, u.username AS author_username FROM content_items ci
                 LEFT JOIN users u ON u.id = ci.author_id
                 ORDER BY ci.created_at DESC`
            )
            .all();
    }
    return res.json({ items });
});

// -----------------------------------------------------------------------------
// POST /api/admin/content
// -----------------------------------------------------------------------------
router.post("/content", verifyCsrfToken, contentValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { type, title, summary, body, isPublished } = req.body;
    const slug = uniqueSlug(title);

    const result = db
        .prepare(
            `INSERT INTO content_items (type, title, slug, summary, body, author_id, is_published)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(type, title, slug, summary || null, body || null, req.userId, isPublished === false ? 0 : 1);

    const created = db.prepare("SELECT * FROM content_items WHERE id = ?").get(result.lastInsertRowid);
    return res.status(201).json({ message: "İçerik oluşturuldu.", item: created });
});

// -----------------------------------------------------------------------------
// PATCH /api/admin/content/:id
// -----------------------------------------------------------------------------
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

    const { type, title, summary, body, isPublished } = req.body;
    const slug = title !== existing.title ? uniqueSlug(title, itemId) : existing.slug;

    // Not: PATCH'te bir alan hiç gönderilmezse (veya boşsa) mevcut değeri korur
    // — gönderilmediği için içerik sıfırlanmaz (true partial-update semantiği).
    const finalSummary = summary || existing.summary;
    const finalBody = body || existing.body;

    db.prepare(
        `UPDATE content_items SET type = ?, title = ?, slug = ?, summary = ?, body = ?, is_published = ?,
         updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    ).run(type, title, slug, finalSummary, finalBody, isPublished === false ? 0 : 1, itemId);

    const updated = db.prepare("SELECT * FROM content_items WHERE id = ?").get(itemId);
    return res.json({ message: "İçerik güncellendi.", item: updated });
});

// -----------------------------------------------------------------------------
// DELETE /api/admin/content/:id
// -----------------------------------------------------------------------------
router.delete("/content/:id", verifyCsrfToken, (req, res) => {
    const itemId = Number(req.params.id);
    const existing = db.prepare("SELECT id FROM content_items WHERE id = ?").get(itemId);
    if (!existing) {
        return res.status(404).json({ error: "İçerik bulunamadı." });
    }
    db.prepare("DELETE FROM content_items WHERE id = ?").run(itemId);
    return res.json({ message: "İçerik silindi." });
});

module.exports = router;
