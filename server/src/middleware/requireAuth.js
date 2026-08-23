// =============================================================================
// server/src/middleware/requireAuth.js
// Oturum gerektiren rotaları korur.
// =============================================================================

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: "Bu işlem için giriş yapmanız gerekiyor." });
    }
    req.userId = req.session.userId;
    next();
}

/** role='admin' olan kullanıcılar için — /api/admin/* rotalarını korur. */
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: "Bu işlem için giriş yapmanız gerekiyor." });
    }
    if (req.session.role !== "admin") {
        return res.status(403).json({ error: "Bu işlem için yönetici yetkisi gerekiyor." });
    }
    req.userId = req.session.userId;
    next();
}

module.exports = { requireAuth, requireAdmin };
