// =============================================================================
// server/src/routes/profile.js
// Profil güncelleme (display_name, bio) ve avatar yükleme (Firestore)
// =============================================================================

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const { validationResult } = require("express-validator");

const db = require("../db");
const { verifyCsrfToken } = require("../middleware/csrf");
const { requireAuth } = require("../middleware/requireAuth");
const { profileUpdateValidationRules } = require("../utils/validators");

const router = express.Router();

const AVATAR_DIR = path.join(__dirname, "..", "..", "..", "uploads", "avatars");
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_AVATAR_PX = 512;

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
router.patch("/", verifyCsrfToken, requireAuth, profileUpdateValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { displayName, bio } = req.body;

    try {
        const updates = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (bio !== undefined) updates.bio = bio;

        const updatedUser = await db.updateUser(req.userId, updates);
        if (!updatedUser) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı veya hesap silinmiş." });
        }

        return res.json({
            message: "Profil güncellendi.",
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                email: updatedUser.email,
                display_name: updatedUser.display_name,
                bio: updatedUser.bio,
                avatar_path: updatedUser.avatar_path,
                role: updatedUser.role,
            },
        });
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
        fs.mkdirSync(AVATAR_DIR, { recursive: true });

        const currentUser = await db.getUserById(req.userId);

        const filename = `${crypto.randomBytes(16).toString("hex")}.jpg`;
        const destPath = path.join(AVATAR_DIR, filename);

        await sharp(req.file.buffer)
            .resize(MAX_AVATAR_PX, MAX_AVATAR_PX, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 88 })
            .toFile(destPath);

        const avatarPath = `uploads/avatars/${filename}`;
        await db.updateUser(req.userId, { avatar_path: avatarPath });

        if (currentUser?.avatar_path) {
            const oldAbsPath = path.join(__dirname, "..", "..", "..", currentUser.avatar_path);
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

router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `Dosya çok büyük (maksimum ${MAX_AVATAR_BYTES / 1024 / 1024}MB).` });
    }
    if (err) {
        return res.status(400).json({ error: err.message || "Dosya yüklenemedi." });
    }
    next();
});
