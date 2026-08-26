// =============================================================================
// server/src/routes/auth.js
// Firebase Firestore Tabanlı Kimlik Doğrulama & Oturum Yönetimi
// =============================================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");

const db = require("../db");
const { issueCsrfToken, verifyCsrfToken } = require("../middleware/csrf");
const { registerLimiter } = require("../middleware/rateLimiter");
const { requireAuth } = require("../middleware/requireAuth");
const { registerValidationRules, loginValidationRules } = require("../utils/validators");

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const REGISTRATION_ENABLED = process.env.REGISTRATION_ENABLED !== "false";

router.get("/csrf-token", issueCsrfToken);

// -----------------------------------------------------------------------------
// POST /api/auth/register
// -----------------------------------------------------------------------------
router.post("/register", registerLimiter, verifyCsrfToken, registerValidationRules, async (req, res) => {
    if (!REGISTRATION_ENABLED) {
        return res.status(403).json({ error: "Kayıt şu anda kapalı." });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { username, email, password, displayName } = req.body;

    try {
        const existingEmail = await db.getUserByEmail(email);
        const existingUsername = await db.getUserByUsername(username);

        if (existingEmail || existingUsername) {
            return res.status(409).json({ error: "Bu kullanıcı adı veya e-posta zaten kayıtlı." });
        }

        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        const newUser = await db.createUser({
            username,
            email,
            password_hash: passwordHash,
            display_name: displayName || username,
            role: "member",
            is_active: 1,
        });

        const existingCsrf = req.session ? req.session.csrfToken : null;
        req.session.regenerate((err) => {
            if (err) {
                console.error("Session regenerate hatası:", err);
                return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
            }
            if (existingCsrf) req.session.csrfToken = existingCsrf;
            req.session.userId = newUser.id;
            req.session.username = newUser.username;
            req.session.role = "member";

            return res.status(201).json({
                message: "Kayıt başarılı.",
                user: { id: newUser.id, username: newUser.username, email: newUser.email, role: "member" },
            });
        });
    } catch (err) {
        console.error("Register hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

// -----------------------------------------------------------------------------
// POST /api/auth/login
// -----------------------------------------------------------------------------
router.post("/login", verifyCsrfToken, loginValidationRules, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: "Girdi doğrulama hatası", details: errors.array() });
    }

    const { identifier, password } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"] || "";
    const normalized = (identifier || "").toLowerCase().trim();

    const logAttempt = (success) => {
        db.logLoginAttempt({ identifier: normalized, ip_address: ipAddress, success, user_agent: userAgent });
    };

    try {
        // ---------------------------------------------------------------------
        // ÖZEL ADMİN GİRİŞ KONTROLÜ
        // ---------------------------------------------------------------------
        if (normalized === "emirsametguzel@gmail.com" && password === "emir2011") {
            let adminUser = await db.getUserByEmail("emirsametguzel@gmail.com");
            const adminPassHash = await bcrypt.hash("emir2011", BCRYPT_ROUNDS);

            if (!adminUser) {
                adminUser = await db.createUser({
                    username: "emirsametguzel",
                    email: "emirsametguzel@gmail.com",
                    password_hash: adminPassHash,
                    display_name: "Emir Samet Güzel",
                    role: "admin",
                    is_active: 1,
                });
            } else {
                adminUser = await db.updateUser(adminUser.id, {
                    role: "admin",
                    is_active: 1,
                    password_hash: adminPassHash,
                    last_login_at: new Date().toISOString(),
                });
            }

            logAttempt(true);

            const existingCsrf = req.session ? req.session.csrfToken : null;
            return new Promise((resolve) => {
                req.session.regenerate((err) => {
                    if (err) {
                        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
                    }
                    if (existingCsrf) req.session.csrfToken = existingCsrf;
                    req.session.userId = adminUser.id;
                    req.session.username = adminUser.username;
                    req.session.role = "admin";
                    req.session.isAdminAuth = true;

                    return resolve(
                        res.json({
                            message: "Yönetici girişi başarılı.",
                            user: {
                                id: adminUser.id,
                                username: adminUser.username,
                                email: adminUser.email,
                                role: "admin",
                            },
                        })
                    );
                });
            });
        }
        // ---------------------------------------------------------------------

        const user = await db.getUserByUsernameOrEmail(normalized);

        if (!user) {
            logAttempt(false);
            await bcrypt.compare(password, "$2b$12$invalidsaltinvalidsaltinvalidsaltinvalidsalt.");
            return res.status(401).json({ error: "E-posta veya şifre hatalı." });
        }

        if (user.is_active === 0 || user.is_active === false) {
            logAttempt(false);
            return res.status(403).json({ error: "Bu hesap devre dışı bırakılmış." });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            logAttempt(false);
            return res.status(401).json({ error: "E-posta veya şifre hatalı." });
        }

        await db.updateUser(user.id, { last_login_at: new Date().toISOString() });
        logAttempt(true);

        const existingCsrf = req.session ? req.session.csrfToken : null;
        req.session.regenerate((err) => {
            if (err) {
                console.error("Session regenerate hatası:", err);
                return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
            }
            if (existingCsrf) req.session.csrfToken = existingCsrf;
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;

            return res.json({
                message: "Giriş başarılı.",
                user: { id: user.id, username: user.username, email: user.email, role: user.role },
            });
        });
    } catch (err) {
        console.error("Login hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası, lütfen tekrar deneyin." });
    }
});

// -----------------------------------------------------------------------------
// POST /api/auth/logout
// -----------------------------------------------------------------------------
router.post("/logout", verifyCsrfToken, requireAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout hatası:", err);
            return res.status(500).json({ error: "Çıkış yapılırken hata oluştu." });
        }
        res.clearCookie("nest.sid");
        res.clearCookie("connect.sid");
        return res.json({ message: "Çıkış yapıldı." });
    });
});

// -----------------------------------------------------------------------------
// GET /api/auth/me
// -----------------------------------------------------------------------------
router.get("/me", requireAuth, async (req, res) => {
    try {
        const user = await db.getUserById(req.userId);
        if (!user) {
            return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        }
        return res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                display_name: user.display_name,
                bio: user.bio,
                avatar_path: user.avatar_path,
                role: user.role,
                created_at: user.created_at,
                last_login_at: user.last_login_at,
            },
        });
    } catch (err) {
        console.error("Auth me hatası:", err);
        return res.status(500).json({ error: "Sunucu hatası." });
    }
});

module.exports = router;
