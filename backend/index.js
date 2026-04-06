require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { database } = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const participantRoutes = require("./routes/participants.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/test-db", async (req, res) => {
  try {
    const { resource } = await database.read();

    res.json({
      ok: true,
      message: "Database connected successfully",
      databaseId: resource.id,
      containerId: process.env.COSMOS_CONTAINER,
    });
  } catch (error) {
    console.error("DB error:", error.message);

    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/eventParticipants", participantRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});