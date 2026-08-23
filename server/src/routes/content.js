// =============================================================================
// server/src/routes/content.js
// Herkese açık içerik, duyuru ve ayar rotaları
// =============================================================================

const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/content?type=...&category=...
router.get("/content", (req, res) => {
    const { type, category } = req.query;
    let query = `
        SELECT ci.id, ci.type, ci.category, ci.title, ci.slug, ci.summary, ci.body,
               ci.image_url, ci.file_url, ci.created_at, ci.updated_at,
               u.username AS author_username, u.display_name AS author_display_name
        FROM content_items ci
        LEFT JOIN users u ON u.id = ci.author_id
        WHERE ci.is_published = 1
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

// GET /api/content/:slugOrId
router.get("/content/:slugOrId", (req, res) => {
    const { slugOrId } = req.params;
    const isNumeric = /^\d+$/.test(slugOrId);

    const query = `
        SELECT ci.*, u.username AS author_username, u.display_name AS author_display_name
        FROM content_items ci
        LEFT JOIN users u ON u.id = ci.author_id
        WHERE ci.is_published = 1 AND (ci.slug = ? OR ci.id = ?)
        LIMIT 1
    `;
    const item = db.prepare(query).get(slugOrId, isNumeric ? Number(slugOrId) : -1);

    if (!item) {
        return res.status(404).json({ error: "İçerik bulunamadı." });
    }

    return res.json({ item });
});

// GET /api/settings (Açık site ayarları: duyuru vb.)
router.get("/settings", (req, res) => {
    const rows = db.prepare(`SELECT key, value FROM site_settings`).all();
    const settings = {};
    for (const r of rows) {
        settings[r.key] = r.value;
    }
    return res.json({ settings });
});

module.exports = router;
