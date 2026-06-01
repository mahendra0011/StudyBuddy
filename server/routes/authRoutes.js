const bcrypt = require("bcryptjs");
const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const { requireDatabase } = require("../config/database");
const { requireAuth, signToken } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();
const googleClient = new OAuth2Client();

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function publicUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email
    };
}

function getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
}

function getProviderList(user, provider) {
    const providers = Array.isArray(user.authProviders) ? user.authProviders : [];
    return providers.includes(provider) ? providers : [...providers, provider];
}

router.post("/signup", requireDatabase, async (req, res, next) => {
    try {
        const name = String(req.body?.name || "").trim();
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");

        if (name.length < 2) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Name is required." });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Valid email is required." });
        }

        if (password.length < 6) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Password must be at least 6 characters." });
        }

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ status: "EMAIL_EXISTS", message: "This email is already registered." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, passwordHash, authProviders: ["password"] });

        return res.status(201).json({
            token: signToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/login", requireDatabase, async (req, res, next) => {
    try {
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");
        const user = await User.findOne({ email });

        if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({
                status: "INVALID_LOGIN",
                message: "Email or password is incorrect."
            });
        }

        return res.json({
            token: signToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        return next(error);
    }
});

router.post("/google", requireDatabase, async (req, res, next) => {
    try {
        const clientId = getGoogleClientId();
        const credential = String(req.body?.credential || "");

        if (!clientId) {
            return res.status(500).json({
                status: "GOOGLE_AUTH_NOT_CONFIGURED",
                message: "Google login is not configured on the server."
            });
        }

        if (!credential) {
            return res.status(400).json({
                status: "BAD_REQUEST",
                message: "Google credential is required."
            });
        }

        let payload;
        try {
            const ticket = await googleClient.verifyIdToken({
                idToken: credential,
                audience: clientId
            });
            payload = ticket.getPayload();
        } catch (error) {
            return res.status(401).json({
                status: "INVALID_GOOGLE_TOKEN",
                message: "Google login could not be verified."
            });
        }

        const email = normalizeEmail(payload?.email);
        const googleId = String(payload?.sub || "");
        const name = String(payload?.name || payload?.given_name || email.split("@")[0] || "Student").trim();

        if (!email || payload?.email_verified !== true || !googleId) {
            return res.status(401).json({
                status: "INVALID_GOOGLE_ACCOUNT",
                message: "Google account email could not be verified."
            });
        }

        let user = await User.findOne({ googleId });

        if (!user) {
            user = await User.findOne({ email });
        }

        if (user) {
            user.googleId = user.googleId || googleId;
            user.authProviders = getProviderList(user, "google");
            if (!user.name && name.length >= 2) {
                user.name = name;
            }
            await user.save();
        } else {
            user = await User.create({
                name: name.length >= 2 ? name : "Student",
                email,
                googleId,
                authProviders: ["google"]
            });
        }

        return res.json({
            token: signToken(user),
            user: publicUser(user)
        });
    } catch (error) {
        return next(error);
    }
});

router.get("/me", requireDatabase, requireAuth, (req, res) => {
    return res.json({ user: publicUser(req.user) });
});

module.exports = router;
