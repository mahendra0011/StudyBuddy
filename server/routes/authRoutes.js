const bcrypt = require("bcryptjs");
const express = require("express");
const { requireDatabase } = require("../config/database");
const { requireAuth, signToken } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

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
        const user = await User.create({ name, email, passwordHash });

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

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
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

router.get("/me", requireDatabase, requireAuth, (req, res) => {
    return res.json({ user: publicUser(req.user) });
});

module.exports = router;
