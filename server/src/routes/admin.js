// =============================================================================
// server/src/routes/admin.js
// Firebase Firestore Tabanlı Yönetici Paneli API Servisi
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
// ADMİN OTURUM DURUMU KONTROLÜ
// =============================================================================
router.get("/me", async (req, res) => {
    if (req.session && req.session.userId && req.session.role === "admin") {
        try {
            const user = await db.getUserById(req.session.userId);
            if (user && user.role === "admin") {
                return res.json({
                    authenticated: true,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        display_name: user.display_name,
                        role: user.role,
                    },
                });
            }
        } catch (err) {
            console.error("Admin me error:", err);
        }
    }
    return res.status(401).json({ authenticated: false, error: "Yetkili yönetici oturumu bulunamadı." });
});

// Aşağıdaki TÜM rotalar requireAdmin gerektirir.
router.use(requireAdmin);

// -----------------------------------------------------------------------------
// Yardımcı: slug üretici
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

async function uniqueSlug(title, excludeId = null) {
    const base = slugify(title);
    let slug = base;
    let n = 1;
    while (await db.slugExists(slug, excludeId)) {
        n += 1;
        slug = `${base}-${n}`;
    }
    return slug;
}

// =============================================================================
// KULLANICI YÖNETİMİ
// =============================================================================

// GET /api/admin/users
router.get("/users", async (req, res) => {
    try {
        const users = await db.getAllUsers();
        const safeUsers = users.map((u) => {
            const copy = { ...u };
            delete copy.password_hash;
            return copy;
        });
        return res.json({ users: safeUsers });
    } catch (err) {
        console.error("Admin get users error:", err);
        return res.status(500).json({ error: "Kullanıcılar getirilemedi." });
    }
});

// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", verifyCsrfToken, adminUpdateRoleValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const targetId = req.params.id;
    const { role } = req.body;

    if (String(targetId) === String(req.userId)) {
        return res.status(400).json({ error: "Kendi rolünüzü değiştiremezsiniz." });
    }

    try {
        const target = await db.getUserById(targetId);
        if (!target) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        const updated = await db.updateUser(targetId, { role });
        delete updated.password_hash;
        return res.json({ message: "Kullanıcı rolü güncellendi.", user: updated });
    } catch (err) {
        console.error("Update role error:", err);
        return res.status(500).json({ error: "Rol güncellenemedi." });
    }
});

// PATCH /api/admin/users/:id/status (Hesap Dondur / Aktifleştir)
router.patch("/users/:id/status", verifyCsrfToken, async (req, res) => {
    const targetId = req.params.id;
    const { isActive } = req.body;

    if (String(targetId) === String(req.userId)) {
        return res.status(400).json({ error: "Kendi hesabınızı donduramazsınız." });
    }

    try {
        const target = await db.getUserById(targetId);
        if (!target) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        const newStatus = isActive ? 1 : 0;
        await db.updateUser(targetId, { is_active: newStatus });

        return res.json({
            message: newStatus === 1 ? "Hesap aktifleştirildi." : "Hesap donduruldu.",
            isActive: newStatus === 1,
        });
    } catch (err) {
        console.error("Update status error:", err);
        return res.status(500).json({ error: "Hesap durumu güncellenemedi." });
    }
});

// POST /api/admin/users/:id/reset-password
router.post("/users/:id/reset-password", verifyCsrfToken, adminResetPasswordValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const targetId = req.params.id;
    const { newPassword } = req.body;

    try {
        const target = await db.getUserById(targetId);
        if (!target) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await db.updateUser(targetId, { password_hash: hash });

        return res.json({ message: `"${target.username}" kullanıcısının şifresi başarıyla güncellendi.` });
    } catch (err) {
        console.error("Reset password error:", err);
        return res.status(500).json({ error: "Şifre sıfırlanamadı." });
    }
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", verifyCsrfToken, async (req, res) => {
    const targetId = req.params.id;

    if (String(targetId) === String(req.userId)) {
        return res.status(400).json({ error: "Kendi hesabınızı silemezsiniz." });
    }

    try {
        const target = await db.getUserById(targetId);
        if (!target) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }

        await db.deleteUser(targetId);
        return res.json({ message: "Kullanıcı silindi." });
    } catch (err) {
        console.error("Delete user error:", err);
        return res.status(500).json({ error: "Kullanıcı silinemedi." });
    }
});

// =============================================================================
// İÇERİK YÖNETİMİ (Makale / Ders / Sunum / Obje / Haber / Duyuru)
// =============================================================================

// GET /api/admin/content
router.get("/content", async (req, res) => {
    try {
        const { type, category } = req.query;
        const items = await db.getContentItems({
            type: type || undefined,
            category: category || undefined,
            onlyPublished: false,
        });
        return res.json({ items });
    } catch (err) {
        console.error("Admin content error:", err);
        return res.status(500).json({ error: "İçerikler alınamadı." });
    }
});

// POST /api/admin/content
router.post("/content", verifyCsrfToken, contentValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { type, category, title, summary, body, imageUrl, fileUrl, isPublished } = req.body;

    try {
        const currentUser = await db.getUserById(req.userId);
        const slug = await uniqueSlug(title);

        const created = await db.createContentItem({
            type,
            category: category || "Mekanik",
            title,
            slug,
            summary: summary || "",
            body: body || "",
            image_url: imageUrl || null,
            file_url: fileUrl || null,
            author_id: req.userId,
            author_username: currentUser?.username || "admin",
            author_display_name: currentUser?.display_name || "Yönetici",
            is_published: isPublished === false ? 0 : 1,
        });

        return res.status(201).json({ message: "İçerik oluşturuldu.", item: created });
    } catch (err) {
        console.error("Create content error:", err);
        return res.status(500).json({ error: "İçerik kaydedilemedi." });
    }
});

// PATCH /api/admin/content/:id
router.patch("/content/:id", verifyCsrfToken, contentValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const itemId = req.params.id;

    try {
        const existing = await db.getContentItemBySlugOrId(itemId);
        if (!existing) {
            return res.status(404).json({ error: "İçerik bulunamadı." });
        }

        const { type, category, title, summary, body, imageUrl, fileUrl, isPublished } = req.body;
        const slug = title && title !== existing.title ? await uniqueSlug(title, existing.id) : existing.slug;

        const updated = await db.updateContentItem(existing.id, {
            type: type || existing.type,
            category: category !== undefined ? category : existing.category,
            title: title || existing.title,
            slug,
            summary: summary !== undefined ? summary : existing.summary,
            body: body !== undefined ? body : existing.body,
            image_url: imageUrl !== undefined ? imageUrl : existing.image_url,
            file_url: fileUrl !== undefined ? fileUrl : existing.file_url,
            is_published: isPublished !== undefined ? (isPublished ? 1 : 0) : existing.is_published,
        });

        return res.json({ message: "İçerik güncellendi.", item: updated });
    } catch (err) {
        console.error("Update content error:", err);
        return res.status(500).json({ error: "İçerik güncellenemedi." });
    }
});

// DELETE /api/admin/content/:id
router.delete("/content/:id", verifyCsrfToken, async (req, res) => {
    const itemId = req.params.id;

    try {
        const existing = await db.getContentItemBySlugOrId(itemId);
        if (!existing) {
            return res.status(404).json({ error: "İçerik bulunamadı." });
        }
        await db.deleteContentItem(existing.id);
        return res.json({ message: "İçerik silindi." });
    } catch (err) {
        console.error("Delete content error:", err);
        return res.status(500).json({ error: "İçerik silinemedi." });
    }
});

// =============================================================================
// TAKIM BAŞVURULARI
// =============================================================================

// GET /api/admin/applications
router.get("/applications", async (req, res) => {
    try {
        const applications = await db.getTeamApplications();
        return res.json({ applications });
    } catch (err) {
        console.error("Admin applications error:", err);
        return res.status(500).json({ error: "Başvurular alınamadı." });
    }
});

// PATCH /api/admin/applications/:id/status
router.patch("/applications/:id/status", verifyCsrfToken, async (req, res) => {
    const appId = req.params.id;
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ error: "Geçersiz başvuru durumu." });
    }

    try {
        await db.updateTeamApplicationStatus(appId, status);
        return res.json({ message: "Başvuru durumu güncellendi." });
    } catch (err) {
        console.error("Update app status error:", err);
        return res.status(500).json({ error: "Başvuru durumu güncellenemedi." });
    }
});

// DELETE /api/admin/applications/:id
router.delete("/applications/:id", verifyCsrfToken, async (req, res) => {
    const appId = req.params.id;
    try {
        await db.deleteTeamApplication(appId);
        return res.json({ message: "Başvuru silindi." });
    } catch (err) {
        console.error("Delete app error:", err);
        return res.status(500).json({ error: "Başvuru silinemedi." });
    }
});

// =============================================================================
// SİTE AYARLARI
// =============================================================================

// GET /api/admin/settings
router.get("/settings", async (req, res) => {
    try {
        const settings = await db.getSiteSettings();
        return res.json({ settings });
    } catch (err) {
        console.error("Admin settings error:", err);
        return res.status(500).json({ error: "Site ayarları alınamadı." });
    }
});

// PUT /api/admin/settings
router.put("/settings", verifyCsrfToken, async (req, res) => {
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") {
        return res.status(400).json({ error: "Geçersiz ayar verisi." });
    }

    try {
        const updated = await db.updateSiteSettings(settings);
        return res.json({ message: "Site ayarları başarıyla kaydedildi.", settings: updated });
    } catch (err) {
        console.error("Save settings error:", err);
        return res.status(500).json({ error: "Ayar kaydedilemedi." });
    }
});

module.exports = router;
