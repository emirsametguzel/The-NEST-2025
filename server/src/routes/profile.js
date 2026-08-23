// =============================================================================
// server/src/routes/profile.js
// Profil güncelleme (display_name, bio) ve avatar yükleme.
// PHP'deki nest_store_avatar() mantığı multer + sharp ile karşılanır.
//
//   PATCH /api/profile           -> display_name / bio güncelle
//   POST  /api/profile/avatar    -> avatar yükle (JPEG/PNG/WebP, max 2MB, 512px'e küçültülür)
// =============================================================================

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { requireAuth } = require("../middleware/requireAuth");
const { profileUpdateValidationRules } = require("../utils/validators");

const router = express.Router();

const AVATAR_DIR = path.join(__dirname, "..", "..", "..", "uploads", "avatars");
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB (PHP config.avatar.max_bytes ile aynı)
const MAX_AVATAR_PX = 512; // PHP config.avatar.max_px ile aynı

// Bellekte tutup sharp ile işleyeceğiz; diske ham haliyle yazmıyoruz
// (yalnızca doğrulanmış + yeniden boyutlandırılmış JPEG diske yazılır).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AVATAR_BYTES },
    fileFilter: (req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error("Yalnızca JPEG, PNG veya WebP kabul edilir."));
        }
        cb(null, true);
    },
});

// -----------------------------------------------------------------------------
// PATCH /api/profile
// -----------------------------------------------------------------------------
router.patch("/", verifyCsrfToken, requireAuth, profileUpdateValidationRules, (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { displayName, bio } = req.body;

    try {
        db.prepare(
            `UPDATE users SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio),
             updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
        ).run(displayName ?? null, bio ?? null, req.userId);

        const user = db
            .prepare("SELECT id, username, email, display_name, bio, avatar_path, role FROM users WHERE id = ?")
            .get(req.userId);

        return res.json({ message: "Profil güncellendi.", user });
    } catch (err) {
        console.error("Profil güncelleme hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

// -----------------------------------------------------------------------------
// POST /api/profile/avatar
// -----------------------------------------------------------------------------
router.post("/avatar", verifyCsrfToken, requireAuth, upload.single("avatar"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Dosya seçilmedi." });
    }

    try {
        const fs = require("fs");
        fs.mkdirSync(AVATAR_DIR, { recursive: true });

        // Eski avatarı bul (yeni yükleme başarılı olursa diskten silinecek —
        // aksi halde uploads/avatars klasörü sınırsız büyür).
        const current = db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(req.userId);

        // sharp: gerçek görsel içeriğini doğrular (sahte uzantı/mime saldırılarına
        // karşı PHP'deki getimagesize() kontrolüyle aynı amaç), 512px'e küçültür,
        // her zaman güvenli tek bir formata (JPEG) yeniden kodlar.
        const filename = `${crypto.randomBytes(16).toString("hex")}.jpg`;
        const destPath = path.join(AVATAR_DIR, filename);

        await sharp(req.file.buffer)
            .resize(MAX_AVATAR_PX, MAX_AVATAR_PX, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toFile(destPath);

        const avatarPath = `uploads/avatars/${filename}`;
        db.prepare(
            `UPDATE users SET avatar_path = ?, updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
        ).run(avatarPath, req.userId);

        // Eski dosyayı sil (varsa). Yeni yol farklı isimde olduğu için çakışma yok;
        // silme başarısız olsa bile işlemi durdurmuyoruz (log yeterli).
        if (current?.avatar_path) {
            const oldAbsPath = path.join(__dirname, "..", "..", "..", current.avatar_path);
            fs.unlink(oldAbsPath, (err) => {
                if (err) console.warn("Eski avatar silinemedi:", oldAbsPath, err.message);
            });
        }

        return res.json({ message: "Avatar güncellendi.", avatarPath });
    } catch (err) {
        console.error("Avatar yükleme hatası:", err);
        return res.status(400).json({ error: "Görsel işlenemedi: " + err.message });
    }
});

module.exports = router;

// -----------------------------------------------------------------------------
// Multer'a özel hata yakalayıcı (dosya boyutu/tipi hataları burada anlamlı
// bir JSON'a çevrilir; aksi halde app.js'teki genel handler'a düşüp
// kullanıcıya "Sunucu hatası" gibi belirsiz bir mesaj gösterirdi).
// -----------------------------------------------------------------------------
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `Dosya çok büyük (maksimum ${MAX_AVATAR_BYTES / 1024 / 1024}MB).` });
    }
    if (err) {
        return res.status(400).json({ error: err.message || "Dosya yüklenemedi." });
    }
    next();
});
