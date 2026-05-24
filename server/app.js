const cors = require("cors");
const express = require("express");
const fs = require("fs");
const path = require("path");
const aiRoutes = require("./routes/aiRoutes");
const authRoutes = require("./routes/authRoutes");
const playlistRoutes = require("./routes/playlistRoutes");

const app = express();
const clientDistPath = path.join(__dirname, "..", "client", "dist");
const clientIndexPath = path.join(clientDistPath, "index.html");

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "StudyBuddy API"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api", aiRoutes);

if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));

    app.get("*", (req, res) => {
        res.sendFile(clientIndexPath);
    });
} else {
    app.get("*", (req, res) => {
        res.status(404).json({
            status: "CLIENT_NOT_BUILT",
            message: "Run npm run build to create the React production bundle."
        });
    });
}

app.use((error, req, res, next) => {
    console.error(error);
    return res.status(500).json({
        status: "SERVER_ERROR",
        message: "Something went wrong on the server."
    });
});

module.exports = app;
