const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 80
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    passwordHash: {
        type: String,
        default: ""
    },
    authProviders: {
        type: [{
            type: String,
            enum: ["password", "google"]
        }],
        default: () => ["password"]
    }
}, {
    timestamps: true,
    toJSON: {
        transform(doc, ret) {
            delete ret.passwordHash;
            delete ret.googleId;
            delete ret.__v;
            return ret;
        }
    }
});

module.exports = mongoose.model("User", userSchema);
