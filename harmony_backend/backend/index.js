require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { database, container } = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const participantRoutes = require("./routes/participants.routes");

const app = express();
function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d]/g, "").trim();
}

function toParticipantDocId(userId) {
  const s = String(userId || "").trim();
  return s.startsWith("p") ? s : `p${s}`;
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

// Auth routes
app.use("/api/auth", authRoutes);

// Participant routes
app.use("/api/participants", participantRoutes);

// Test routes - אפשר למחוק אחר כך
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

    res.json({
      message: "Test save worked",
      saved: updated.saved,
    });
  } catch (error) {
    res.status(500).json({
      message: "Test save failed",
      error: error.message,
    });
  }
});

app.get("/test-unsave", async (req, res) => {
  try {
    const { resource } = await container.item("p1", "event1").read();

    resource.saved = (resource.saved || []).filter((item) => item !== "p2");

    const { resource: updated } = await container
      .item("p1", "event1")
      .replace(resource);

    res.json({
      message: "Test unsave worked",
      saved: updated.saved,
    });
  } catch (error) {
    res.status(500).json({
      message: "Test unsave failed",
      error: error.message,
    });
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

    res.json({
      message: "Test met worked",
      met: updated.met,
    });
  } catch (error) {
    res.status(500).json({
      message: "Test met failed",
      error: error.message,
    });
  }
});

app.get("/test-unmet", async (req, res) => {
  try {
    const { resource } = await container.item("p1", "event1").read();

    resource.met = (resource.met || []).filter((item) => item !== "p2");

    const { resource: updated } = await container
      .item("p1", "event1")
      .replace(resource);

    res.json({
      message: "Test unmet worked",
      met: updated.met,
    });
  } catch (error) {
    res.status(500).json({
      message: "Test unmet failed",
      error: error.message,
    });
  }
});
// ===== SAVE =====
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
    res.status(500).json({
      message: "Save failed",
      error: error.message,
    });
  }
});

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
    res.status(500).json({
      message: "Met failed",
      error: error.message,
    });
  }
});
app.post('/api/participants', async (req, res) => {
  try {
    const body = req.body

    const newParticipant = {
      id: `p${Date.now()}`,
      name: body.name || '',
      phone: body.phone || '',
      job: body.job || '',
      academic: body.academic || '',
      professional: body.professional || '',
      personal: body.personal || '',
      image: body.image || '',
      hidden: false,
    }

    await container.items.create(newParticipant)

    res.status(201).json({ participant: newParticipant })
  } catch (error) {
    res.status(500).json({
      message: 'Create participant failed',
      error: error.message,
    })
  }
})

app.get("/api/saved/:id", async (req, res) => {
  try {
    const resource = await getParticipantDocByRouteId(req.params.id);

    if (!resource) {
      return res.json([]);
    }

    res.json(resource.saved || []);
  } catch (error) {
    res.status(500).json({
      message: "Fetch saved failed",
      error: error.message,
    });
  }
});

app.get("/api/met/:id", async (req, res) => {
  try {
    const resource = await getParticipantDocByRouteId(req.params.id);

    if (!resource) {
      return res.json([]);
    }

    res.json(resource.met || []);
  } catch (error) {
    res.status(500).json({
      message: "Fetch met failed",
      error: error.message,
    });
  }
});
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
      participantId: toRouteParticipantId(user.id), // למשל "2"
      docId: user.id, // למשל "p2"
      phone: user.phone,
    });
  } catch (error) {
    res.status(500).json({
      message: "Phone login failed",
      error: error.message,
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});