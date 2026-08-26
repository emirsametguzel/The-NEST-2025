// =============================================================================
// server/src/routes/content.js
// Herkese açık içerik, duyuru ve ayar rotaları (Firestore)
// =============================================================================

const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/content?type=...&category=...
router.get("/content", async (req, res) => {
    try {
        const { type, category } = req.query;
        const items = await db.getContentItems({
            type: type || undefined,
            category: category || undefined,
            onlyPublished: true,
        });
        return res.json({ items });
    } catch (err) {
        console.error("Content listeleme hatası:", err);
        return res.status(500).json({ error: "İçerikler yüklenemedi." });
    }
});

// GET /api/content/:slugOrId
router.get("/content/:slugOrId", async (req, res) => {
    try {
        const { slugOrId } = req.params;
        const item = await db.getContentItemBySlugOrId(slugOrId);

        if (!item || item.is_published === 0 || item.is_published === false) {
            return res.status(404).json({ error: "İçerik bulunamadı." });
        }

        return res.json({ item });
    } catch (err) {
        console.error("Content detay hatası:", err);
        return res.status(500).json({ error: "İçerik yüklenemedi." });
    }
});

// GET /api/settings (Açık site ayarları: duyuru vb.)
router.get("/settings", async (req, res) => {
    try {
        const settings = await db.getSiteSettings();
        return res.json({ settings });
    } catch (err) {
        console.error("Settings getirme hatası:", err);
        return res.status(500).json({ error: "Site ayarları alınamadı." });
    }
});

module.exports = router;
