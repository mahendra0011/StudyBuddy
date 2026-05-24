require("dotenv").config();

const app = require("./app");
const { connectDatabase } = require("./config/database");

const PORT = process.env.PORT || 4173;

connectDatabase()
    .catch(error => {
        console.error("MongoDB connection failed:", error.message);
    })
    .finally(() => {
        app.listen(PORT, () => {
            console.log(`StudyBuddy API running on port ${PORT}`);
        });
    });
