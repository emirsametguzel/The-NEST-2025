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
    body("type").isIn(["makale", "ders", "duyuru", "sunum", "obje", "haber"]).withMessage("Geçersiz içerik türü."),
    body("category").optional({ checkFalsy: true }).trim().isLength({ max: 100 }).escape(),
    body("title").trim().isLength({ min: 2, max: 255 }).withMessage("Başlık 2-255 karakter arasında olmalı.").escape(),
    body("summary").optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
    body("body").optional({ checkFalsy: true }).trim().isLength({ max: 50000 }),
    body("imageUrl").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
    body("fileUrl").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
    body("isPublished").optional().isBoolean().withMessage("isPublished true/false olmalı."),
];

const adminResetPasswordValidationRules = [
    body("newPassword")
        .isLength({ min: 6, max: 128 })
        .withMessage("Yeni şifre en az 6 karakter olmalıdır."),
];

const teamApplicationValidationRules = [
    body("name").trim().isLength({ min: 2, max: 100 }).withMessage("İsim en az 2 karakter olmalıdır.").escape(),
    body("className").trim().isLength({ min: 1, max: 50 }).withMessage("Sınıf bilgisi gereklidir.").escape(),
    body("email").trim().isEmail().withMessage("Geçerli bir e-posta girin.").normalizeEmail(),
    body("phone").trim().isLength({ min: 7, max: 20 }).withMessage("Geçerli bir telefon numarası girin.").escape(),
    body("department").trim().isLength({ min: 2, max: 100 }).withMessage("Departman seçiniz.").escape(),
    body("motivation").trim().isLength({ min: 5, max: 2000 }).withMessage("Motivasyon metni en az 5 karakter olmalıdır.").escape(),
    body("experience").optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
    body("tools").optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).escape(),
];

module.exports = {
    registerValidationRules,
    loginValidationRules,
    profileUpdateValidationRules,
    forgotPasswordValidationRules,
    resetPasswordValidationRules,
    adminUpdateRoleValidationRules,
    adminResetPasswordValidationRules,
    contentValidationRules,
    teamApplicationValidationRules,
};
