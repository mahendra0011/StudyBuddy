const express = require("express");
const { requireDatabase } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const Playlist = require("../models/Playlist");
const { getYouTubeThumbnail } = require("../services/youtubeService");

const router = express.Router();

router.use(requireDatabase, requireAuth);

router.get("/", async (req, res, next) => {
    try {
        const playlists = await Playlist.find({ user: req.user._id }).sort({ createdAt: -1 });
        return res.json({ playlists });
    } catch (error) {
        return next(error);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const title = String(req.body?.title || "").trim();
        const rawUrl = String(req.body?.url || "").trim();
        const category = String(req.body?.category || "custom").trim() || "custom";
        const notes = String(req.body?.notes || "").trim();

        if (!title) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Playlist title is required." });
        }

        if (!rawUrl) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Playlist URL is required." });
        }

        const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
        const parsedUrl = new URL(normalizedUrl);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Use a valid playlist URL." });
        }

        const playlist = await Playlist.create({
            user: req.user._id,
            title,
            url: parsedUrl.toString(),
            category,
            notes,
            thumbnail: getYouTubeThumbnail(parsedUrl.toString())
        });

        return res.status(201).json({ playlist });
    } catch (error) {
        if (error instanceof TypeError) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Use a valid playlist URL." });
        }

        return next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const playlist = await Playlist.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!playlist) {
            return res.status(404).json({ status: "NOT_FOUND", message: "Playlist was not found." });
        }

        return res.json({ ok: true });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
