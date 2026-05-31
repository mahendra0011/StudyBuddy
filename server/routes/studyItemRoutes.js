const express = require("express");
const { requireDatabase } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const { ALLOWED_TYPES, StudyItem } = require("../models/StudyItem");

const router = express.Router();
const NOTE_TYPES = ["note", "pdf", "youtube"];

router.use(requireDatabase, requireAuth);

function cleanText(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function getRequestedTypes(value) {
    const types = String(value || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    if (!types.length) {
        return [];
    }

    return types.filter(type => ALLOWED_TYPES.includes(type));
}

function cleanMetadata(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    return value;
}

function defaultTitleForType(type, content) {
    if (type === "goal") {
        return "Today study goal";
    }

    if (type === "task") {
        return cleanText(content, 80) || "Study task";
    }

    if (type === "pdf") {
        return "PDF summary";
    }

    if (type === "youtube") {
        return "YouTube summary";
    }

    return "Generated notes";
}

function normalizePayload(body = {}) {
    const type = cleanText(body.type || "note", 20);
    const content = cleanText(body.content, 60000);
    const title = cleanText(body.title, 180) || defaultTitleForType(type, content);

    return {
        type,
        title,
        content,
        prompt: cleanText(body.prompt, 40000),
        category: cleanText(body.category || "General", 80) || "General",
        sourceUrl: cleanText(body.sourceUrl, 2000),
        metadata: cleanMetadata(body.metadata),
        done: Boolean(body.done)
    };
}

router.get("/", async (req, res, next) => {
    try {
        const requestedTypes = getRequestedTypes(req.query.type);
        const query = { user: req.user._id };

        if (requestedTypes.length) {
            query.type = requestedTypes.length === 1 ? requestedTypes[0] : { $in: requestedTypes };
        }

        const limit = Math.min(Math.max(Number(req.query.limit) || 80, 1), 120);
        const items = await StudyItem.find(query).sort({ createdAt: -1 }).limit(limit);

        return res.json({ items });
    } catch (error) {
        return next(error);
    }
});

router.post("/", async (req, res, next) => {
    try {
        const payload = normalizePayload(req.body);

        if (!ALLOWED_TYPES.includes(payload.type)) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Use a valid study item type." });
        }

        if (payload.type === "task" && !payload.content) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Task text is required." });
        }

        if (NOTE_TYPES.includes(payload.type) && !payload.content) {
            return res.status(400).json({ status: "BAD_REQUEST", message: "Generated content is required." });
        }

        if (payload.type === "goal") {
            const item = await StudyItem.findOneAndUpdate(
                { user: req.user._id, type: "goal" },
                { ...payload, user: req.user._id },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
            return res.status(200).json({ item });
        }

        const item = await StudyItem.create({
            ...payload,
            user: req.user._id
        });

        return res.status(201).json({ item });
    } catch (error) {
        return next(error);
    }
});

router.patch("/:id", async (req, res, next) => {
    try {
        const updates = {};
        const allowedFields = ["title", "content", "prompt", "category", "sourceUrl", "metadata", "done"];

        allowedFields.forEach(field => {
            if (!Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
                return;
            }

            if (field === "done") {
                updates.done = Boolean(req.body.done);
                return;
            }

            if (field === "metadata") {
                updates.metadata = cleanMetadata(req.body.metadata);
                return;
            }

            const limits = {
                title: 180,
                content: 60000,
                prompt: 40000,
                category: 80,
                sourceUrl: 2000
            };
            updates[field] = cleanText(req.body[field], limits[field]);
        });

        const item = await StudyItem.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            updates,
            { new: true, runValidators: true }
        );

        if (!item) {
            return res.status(404).json({ status: "NOT_FOUND", message: "Study item was not found." });
        }

        return res.json({ item });
    } catch (error) {
        return next(error);
    }
});

router.delete("/:id", async (req, res, next) => {
    try {
        const item = await StudyItem.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!item) {
            return res.status(404).json({ status: "NOT_FOUND", message: "Study item was not found." });
        }

        return res.json({ ok: true });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
