// Auth middleware
function requireAuth(req, res, next) {
    const user = req.session?.user; // Safe access to user object

    if (!user) {
        return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }

    next();
}

module.exports = requireAuth;
