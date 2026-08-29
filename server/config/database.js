const dns = require("dns");
const mongoose = require("mongoose");

if (process.platform === "win32") {
    try {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
    } catch {}
}

async function connectDatabase() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.warn("MONGODB_URI is not configured. Auth and playlists will return a database setup error.");
        return false;
    }

    if (mongoose.connection.readyState === 1) {
        return true;
    }

    await mongoose.connect(uri);
    console.log("MongoDB connected");
    return true;
}

function requireDatabase(req, res, next) {
    if (mongoose.connection.readyState === 1) {
        return next();
    }

    return res.status(503).json({
        status: "DATABASE_NOT_CONFIGURED",
        message: "MongoDB is not connected. Add MONGODB_URI in environment variables."
    });
}

module.exports = {
    connectDatabase,
    requireDatabase
};
