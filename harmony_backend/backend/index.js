const { CosmosClient } = require("@azure/cosmos");


const key = process.env.COSMOS_KEY; //from cosmos
const endpoint = process.env.COSMOS_ENDPOINT;

const client = new CosmosClient({ endpoint, key });
const database = client.database("harmony-db");
const container = database.container("participants");

const express = require('express');

const fs = require('fs');
const csv = require('csv-parser'); // read CSV files row by row
const axios = require('axios'); // used to send HTTP requests to FastAPI
require("dotenv").config();



console.log("GROQ_API_KEY =", process.env.GROQ_API_KEY);


/* =========================================================
   LOAD PARTICIPANT IMAGES FROM CSV (ONCE)
   ========================================================= */
const imagesById = new Map();

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


/* ---------- EMBEDDING CLIENT ---------- */

async function getEmbeddings(texts) {
  const response = await axios.post(
    'http://localhost:8000/embed',
    { texts }
  );
  return response.data.embeddings;
}

async function getEmbeddingsBatched(texts, batchSize = 50) {
  const all = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`Embedding batch ${i}–${i + batch.length}`);

    const emb = await getEmbeddings(batch);
    all.push(...emb);
  }

  return all;
}

/* ---------- TEXT BUILDING ---------- */
// Normalize spaces/newlines
function normalizeText(t) {
  return (t || '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Common generic words to remove
const STOPWORDS_AR = [
  'مهندس','شهادة','لقب','اول','ثاني','بكالوريوس','ماجستير',
  'خبرة','دورة','متدرب','حاصل','مهندسة','مستشار','متدربة','حاصلة'
];

const PHRASES_AR = [
  'يتطوّع في مجتمع “هارموني” ضمن',
  'تتطوّع في مجتمع “هارموني” ضمن'
];

// Remove stopwords by regex
function removeStopwords(text) {
  if (!text) return '';

  let t = text;
  t = t.replace(/[“”]/g, '"');

  for (const ph of PHRASES_AR) {
    const phNorm = ph.replace(/[“”]/g, '"');
    t = t.replaceAll(phNorm, ' ');
  }

  t = t.replace(/\s+/g, ' ').trim();

  const tokens = t.split(' ').map(tok => {
    tok = tok.replace(/[.,;:!?()"'\[\]{}<>،؛ـ]/g, '');
    if (tok.startsWith('ال')) tok = tok.slice(2);
    return tok.trim();
  });

  const filtered = tokens.filter(tok => tok && !STOPWORDS_AR.includes(tok));
  return filtered.join(' ').replace(/\s+/g, ' ').trim();
}

/* ---------- SAVE CLEAN CSV (BEFORE EMBEDDINGS) ---------- */
function saveCleanParticipantsCSV(participants) {
  if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });

  const header = 'id,name,jobTitle_clean,academic_clean,professional_clean,personal_clean\n';

  const rows = participants.map(p =>
    `${p.id},"${p.name}","${p.jobTitleText}","${p.academicText}","${p.professionalText}","${p.personalText}"`
  );

  fs.writeFileSync('data/participants_clean.csv', header + rows.join('\n'), 'utf8');
}

/* ---------- SAVE FIELD EMBEDDINGS (SEPARATE) ---------- */
function saveFieldEmbeddingsToCSV(participants) {
  const header = 'id,name,jobTitle_embedding,academic_embedding,professional_embedding,personal_embedding,profile_embedding\n';

  const rows = participants.map(p =>
    `${p.id},"${p.name}","${JSON.stringify(p.jobTitle_embedding)}","${JSON.stringify(p.academic_embedding)}","${JSON.stringify(p.professional_embedding)}","${JSON.stringify(p.personal_embedding)}","${JSON.stringify(p.profile_embedding)}"`
  );

  fs.writeFileSync('data/field_embeddings.csv', header + rows.join('\n'), 'utf8');
}

/* ---------- ROUTES ---------- */
// Health check route

app.get('/', (req, res) => {
  res.send('Backend is running');
});

/* ✅ NOW USING COSMOS DB */
app.get('/api/participants', async (req, res) => {
  try {
    const { resources } = await container.items.readAll().fetchAll();

    const results = resources.map((row, index) => {
      const cleanedJob  = removeStopwords(normalizeText(row.job));
      const cleanedAcad = removeStopwords(normalizeText(row.academic));
      const cleanedProf = removeStopwords(normalizeText(row.professional));
      const cleanedPers = removeStopwords(normalizeText(row.personal));

      return {
        id: index,
        name: row.name || '',
        jobTitleText: cleanedJob,
        academicText: cleanedAcad,
        professionalText: cleanedProf,
        personalText: cleanedPers,

        profileText: [
          cleanedAcad,
          cleanedProf,
          cleanedPers
        ].filter(Boolean).join(' ')
      };
    });

    saveCleanParticipantsCSV(results);

    const jobTexts = results.map(p => p.jobTitleText);
    const academicTexts = results.map(p => p.academicText);
    const professionalTexts = results.map(p => p.professionalText);
    const personalTexts = results.map(p => p.personalText);
    const profileTexts = results.map(p => p.profileText);

    const allTexts = [...jobTexts, ...academicTexts, ...professionalTexts, ...personalTexts, ...profileTexts];

    const embeddings = await getEmbeddingsBatched(allTexts, 40);

    const n = results.length;

    results.forEach((p, i) => {
      p.jobTitle_embedding = embeddings[i];
      p.academic_embedding = embeddings[i + n];
      p.professional_embedding = embeddings[i + 2*n];
      p.personal_embedding = embeddings[i + 3*n];
      p.profile_embedding = embeddings[i + 4*n];
    });

    saveFieldEmbeddingsToCSV(results);

    res.json(results);

  } catch (err) {
    console.error('Cosmos FULL ERROR:', err.message);
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch from Cosmos' });
  }
});

//const { explainPair } = require('./llmExplanation');
const { getTopMatches } = require('./similarity');

app.get('/api/match/:id', async (req, res) => {
  const targetId = Number(req.params.id);

  try {
    const matches = await getTopMatches(targetId, 5);

    const explained = await Promise.all(
      matches.map(async (m) => {
        //const exp = await explainPair(targetId, m.id);
        const exp = {};

        return {
          id: m.id,
          name: m.name,
          score: m.score,
          breakdown: m.breakdown,
          reason: exp.explanation?.ar || null
        };
      })
    );

    res.json(explained);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});