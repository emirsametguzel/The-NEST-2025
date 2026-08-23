// =============================================================================
// server/src/utils/validators.js
// express-validator ile girdi doğrulama/temizleme.
// - .trim()/.escape(): XSS'e karşı ilk savunma hattı (HTML özel karakterlerini
//   encode eder, veritabanına script enjekte edilmesini engeller)
// - SQL Injection zaten better-sqlite3'ün PARAMETRELİ SORGULARIYLA
//   (prepared statements) engellenir; bu katman ek bir güvenlik seviyesidir.
// =============================================================================

const { body } = require("express-validator");

const registerValidationRules = [
    body("username")
        .trim()
        .isLength({ min: 3, max: 32 })
        .withMessage("Kullanıcı adı 3-32 karakter arasında olmalı.")
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage("Kullanıcı adı yalnızca harf, rakam ve alt çizgi (_) içerebilir.")
        .escape(),

    body("email")
        .trim()
        .isEmail()
        .withMessage("Geçerli bir e-posta adresi girin.")
        .normalizeEmail(),

    body("password")
        .isLength({ min: 8, max: 128 })
        .withMessage("Şifre en az 8 karakter olmalı.")
        .matches(/[A-Z]/)
        .withMessage("Şifre en az bir büyük harf içermeli.")
        .matches(/[0-9]/)
        .withMessage("Şifre en az bir rakam içermeli."),

    body("displayName")
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ max: 64 })
        .escape(),
];

const loginValidationRules = [
    body("identifier")
        .trim()
        .notEmpty()
        .withMessage("Kullanıcı adı veya e-posta gerekli.")
        .isLength({ max: 255 })
        .escape(),

    body("password")
        .notEmpty()
        .withMessage("Şifre gerekli.")
        .isLength({ max: 256 }),
];

const profileUpdateValidationRules = [
    body("displayName").optional({ checkFalsy: true }).trim().isLength({ max: 64 }).escape(),
    body("bio").optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape(),
];

const forgotPasswordValidationRules = [
    body("email").trim().isEmail().withMessage("Geçerli bir e-posta adresi girin.").normalizeEmail(),
];

const resetPasswordValidationRules = [
    body("email").trim().isEmail().withMessage("Geçerli bir e-posta adresi girin.").normalizeEmail(),

    body("otp")
        .trim()
        .isLength({ min: 6, max: 6 })
        .withMessage("Doğrulama kodu 6 haneli olmalı.")
        .isNumeric()
        .withMessage("Doğrulama kodu yalnızca rakam içermeli."),

    // Kayıt formuyla aynı şifre kuralı: en az 8 karakter, 1 büyük harf, 1 rakam.
    body("newPassword")
        .isLength({ min: 8, max: 128 })
        .withMessage("Şifre en az 8 karakter olmalı.")
        .matches(/[A-Z]/)
        .withMessage("Şifre en az bir büyük harf içermeli.")
        .matches(/[0-9]/)
        .withMessage("Şifre en az bir rakam içermeli."),
];

const adminUpdateRoleValidationRules = [
    body("role").isIn(["member", "admin"]).withMessage("Rol yalnızca 'member' veya 'admin' olabilir."),
];

const contentValidationRules = [
    body("type").isIn(["makale", "ders", "duyuru"]).withMessage("Geçersiz içerik türü."),
    body("title").trim().isLength({ min: 3, max: 200 }).withMessage("Başlık 3-200 karakter arasında olmalı.").escape(),
    body("summary").optional({ checkFalsy: true }).trim().isLength({ max: 500 }).escape(),
    body("body").optional({ checkFalsy: true }).trim().isLength({ max: 20000 }).escape(),
    body("isPublished").optional().isBoolean().withMessage("isPublished true/false olmalı."),
];

module.exports = {
    registerValidationRules,
    loginValidationRules,
    profileUpdateValidationRules,
    forgotPasswordValidationRules,
    resetPasswordValidationRules,
    adminUpdateRoleValidationRules,
    contentValidationRules,
};
