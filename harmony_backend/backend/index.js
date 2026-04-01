require("dotenv").config();

const { CosmosClient } = require("@azure/cosmos");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();

// ===== COSMOS =====
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("participants");

// ===== MIDDLEWARE =====
app.use(cors({
  origin: ['https://harmony-frontend-iota.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']

}));

app.options('*', cors());
console.log("✅ Server starting...");

// =====================================
// EMBEDDINGS
// =====================================
async function getEmbeddings(texts) {
  const response = await axios.post(
    'https://harmony-ml.onrender.com/embed',
    { texts }
  );
  return response.data.embeddings;
}


// =====================================
// ROUTES
// =====================================

// health
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// ✅ COSMOS PARTICIPANTS
app.get("/api/participants", async (req, res) => {
  try {
    const { resources } = await container.items.readAll().fetchAll();
    res.json(resources);
    console.log("🔥 DATA SOURCE: COSMOS DB");
console.log("Total participants:", resources.length);
  } catch (err) {
    console.error("Cosmos ERROR:", err);
    res.status(500).json({ error: "Failed to fetch from Cosmos" });
  }
});
// MATCHING
const { getTopMatches } = require("./similarity");

app.get("/api/match/:id", async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    const matches = await getTopMatches(targetId, 5);

    res.json(matches);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});








/* ========================
   HELPERS
======================== */

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "").trim();
}

function toParticipantDocId(userId) {
  const s = String(userId || "").trim();
  return s.startsWith("p") ? s : `p${s}`; // ✅ FIXED
}

function toRouteParticipantId(docId) {
  const s = String(docId || "").trim();
  return s.startsWith("p") ? s.slice(1) : s;
}

async function getParticipantDocByRouteId(userId) {
  const docId = toParticipantDocId(userId);

  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: docId }],
  };

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources[0] || null;
}

/* ========================
   MIDDLEWARE
======================== */

app.use(cors());
app.use(express.json());

/* ========================
   BASIC ROUTES
======================== */

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ========================
   DB TEST
======================== */

app.get("/test-db", async (req, res) => {
  try {
    const { resource } = await database.read();

    res.json({
      ok: true,
      message: "Database connected successfully",
      databaseId: resource.id,
      containerId: container.id,
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

/* ========================
   ROUTES
======================== */

//app.use("/api/auth", authRoutes);
//app.use("/api/participants", participantRoutes);

/* ========================
   TEST ROUTES
======================== */

app.get("/test-save", async (req, res) => {
  try {
    const { resource } = await container.item("p1", "event1").read();

    resource.saved = resource.saved || [];

    if (!resource.saved.includes("p2")) {
      resource.saved.push("p2");
    }

    const { resource: updated } = await container
      .item("p1", "event1")
      .replace(resource);

    res.json({ message: "Test save worked", saved: updated.saved });
  } catch (error) {
    res.status(500).json({ message: "Test save failed", error: error.message });
  }
});

app.get("/test-unsave", async (req, res) => {
  try {
    const { resource } = await container.item("p1", "event1").read();

    resource.saved = (resource.saved || []).filter((item) => item !== "p2");

    const { resource: updated } = await container
      .item("p1", "event1")
      .replace(resource);

    res.json({ message: "Test unsave worked", saved: updated.saved });
  } catch (error) {
    res.status(500).json({ message: "Test unsave failed", error: error.message });
  }
});

app.get("/test-met", async (req, res) => {
  try {
    const { resource } = await container.item("p1", "event1").read();

    resource.met = resource.met || [];

    if (!resource.met.includes("p2")) {
      resource.met.push("p2");
    }

    const { resource: updated } = await container
      .item("p1", "event1")
      .replace(resource);

    res.json({ message: "Test met worked", met: updated.met });
  } catch (error) {
    res.status(500).json({ message: "Test met failed", error: error.message });
  }
});

app.get("/test-unmet", async (req, res) => {
  try {
    const { resource } = await container.item("p1", "event1").read();

    resource.met = (resource.met || []).filter((item) => item !== "p2");

    const { resource: updated } = await container
      .item("p1", "event1")
      .replace(resource);

    res.json({ message: "Test unmet worked", met: updated.met });
  } catch (error) {
    res.status(500).json({ message: "Test unmet failed", error: error.message });
  }
});

/* ========================
   SAVE
======================== */

app.post("/api/save", async (req, res) => {
  try {
    const { userId, targetId, remove } = req.body;

    const resource = await getParticipantDocByRouteId(userId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.saved = resource.saved || [];

    if (remove) {
      resource.saved = resource.saved.filter(
        (id) => String(id) !== String(targetId)
      );
    } else {
      if (!resource.saved.map(String).includes(String(targetId))) {
        resource.saved.push(String(targetId));
      }
    }

    const { resource: updated } = await container
      .item(resource.id, resource.event_id)
      .replace(resource);

    res.json({ saved: updated.saved || [] });
  } catch (error) {
    res.status(500).json({ message: "Save failed", error: error.message });
  }
});

/* ========================
   MET
======================== */

app.post("/api/met", async (req, res) => {
  try {
    const { userId, targetId, remove } = req.body;

    const resource = await getParticipantDocByRouteId(userId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.met = resource.met || [];

    if (remove) {
      resource.met = resource.met.filter(
        (id) => String(id) !== String(targetId)
      );
    } else {
      if (!resource.met.map(String).includes(String(targetId))) {
        resource.met.push(String(targetId));
      }
    }

    const { resource: updated } = await container
      .item(resource.id, resource.event_id)
      .replace(resource);

    res.json({ met: updated.met || [] });
  } catch (error) {
    res.status(500).json({ message: "Met failed", error: error.message });
  }
});

/* ========================
   CREATE PARTICIPANT
======================== */

app.post("/api/participants", async (req, res) => {
  try {
    const body = req.body;

    const newParticipant = {
      id: `p${Date.now()}`, // ✅ FIXED
      name: body.name || "",
      phone: body.phone || "",
      job: body.job || "",
      academic: body.academic || "",
      professional: body.professional || "",
      personal: body.personal || "",
      image: body.image || "",
      hidden: false,
    };

    await container.items.create(newParticipant);

    res.status(201).json({ participant: newParticipant });
  } catch (error) {
    res.status(500).json({
      message: "Create participant failed",
      error: error.message,
    });
  }
});

/* ========================
   FETCH SAVED / MET
======================== */

app.get("/api/saved/:id", async (req, res) => {
  try {
    const resource = await getParticipantDocByRouteId(req.params.id);
    res.json(resource?.saved || []);
  } catch (error) {
    res.status(500).json({ message: "Fetch saved failed", error: error.message });
  }
});

app.get("/api/met/:id", async (req, res) => {
  try {
    const resource = await getParticipantDocByRouteId(req.params.id);
    res.json(resource?.met || []);
  } catch (error) {
    res.status(500).json({ message: "Fetch met failed", error: error.message });
  }
});

/* ========================
   PHONE LOGIN
======================== */

app.post("/api/auth/phone-login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    const querySpec = {
      query: "SELECT TOP 1 c.id, c.phone FROM c WHERE c.phone = @phone",
      parameters: [{ name: "@phone", value: phone }],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    const user = resources[0];

    if (!user) {
      return res.status(404).json({ message: "Participant not found" });
    }

    res.json({
      ok: true,
      participantId: toRouteParticipantId(user.id),
      docId: user.id,
      phone: user.phone,
    });
  } catch (error) {
    res.status(500).json({
      message: "Phone login failed",
      error: error.message,
    });
  }
});
// =====================================
// ROUTES
// =====================================

// health
app.get("/", (req, res) => {
  res.send("Backend is running");
});
app.get("/test-data", async (req, res) => {
  try {
    const { resources } = await container.items.readAll().fetchAll();

    res.json({
      count: resources.length,
      firstItem: resources[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// ✅ ADD IT HERE
app.get("/test-db", async (req, res) => {
  try {
    const { resource } = await database.read();

    res.json({
      ok: true,
      message: "Database connected successfully",
      databaseId: resource.id,
      containerId: container.id,
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

// =====================================
// START SERVER
// =====================================
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});