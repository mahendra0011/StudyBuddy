const jwt = require("jsonwebtoken");
const User = require("../models/User");

function getJwtSecret() {
    return process.env.JWT_SECRET || "studybuddy-development-secret";
}

function signToken(user) {
    return jwt.sign(
        {
            id: user._id.toString(),
            email: user.email,
            name: user.name
        },
        getJwtSecret(),
        { expiresIn: "7d" }
    );
}

async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
        return res.status(401).json({
            status: "UNAUTHORIZED",
            message: "Login is required."
        });
    }

    try {
        const payload = jwt.verify(token, getJwtSecret());
        const user = await User.findById(payload.id);

        if (!user) {
            return res.status(401).json({
                status: "UNAUTHORIZED",
                message: "User account was not found."
            });
        }

        req.user = user;
        return next();
    } catch (error) {
        return res.status(401).json({
            status: "UNAUTHORIZED",
            message: "Session expired. Please log in again."
        });
    }
}

module.exports = {
    requireAuth,
    signToken
};
