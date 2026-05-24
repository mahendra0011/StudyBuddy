const mongoose = require("mongoose");

const playlistSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        default: "custom",
        trim: true
    },
    notes: {
        type: String,
        default: "",
        trim: true,
        maxlength: 240
    },
    thumbnail: {
        type: String,
        default: ""
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Playlist", playlistSchema);
