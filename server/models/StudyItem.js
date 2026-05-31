const mongoose = require("mongoose");

const ALLOWED_TYPES = ["note", "pdf", "youtube", "task", "goal"];

const studyItemSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ALLOWED_TYPES,
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 180
    },
    content: {
        type: String,
        default: "",
        maxlength: 60000
    },
    prompt: {
        type: String,
        default: "",
        maxlength: 40000
    },
    category: {
        type: String,
        default: "General",
        trim: true,
        maxlength: 80
    },
    sourceUrl: {
        type: String,
        default: "",
        trim: true,
        maxlength: 2000
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({})
    },
    done: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

studyItemSchema.index({ user: 1, type: 1, createdAt: -1 });
studyItemSchema.index(
    { user: 1, type: 1 },
    { unique: true, partialFilterExpression: { type: "goal" } }
);

module.exports = {
    ALLOWED_TYPES,
    StudyItem: mongoose.model("StudyItem", studyItemSchema)
};
