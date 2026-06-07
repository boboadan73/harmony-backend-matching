require("dotenv").config();

const { CosmosClient } = require("@azure/cosmos");
const express = require("express");

const axios = require("axios");
const verifyAdminToken = require("./middleware/verifyAdminToken");
const app = express();
const cors = require("cors");

app.use(cors({
  origin: [
    "https://harmony-frontend-iota.vercel.app",
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// ===== COSMOS =====
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("eventParticipants");
const eventsContainer = database.container("events");
// ------ CACHE (REDIS) ------
const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL,
});

redis.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

let redisReady = false;

let redisConnectPromise = null;

async function ensureRedisConnected() {
  if (redis.isOpen) return;

  if (!redisConnectPromise) {
    redisConnectPromise = redis.connect()
      .then(() => {
        console.log("Redis connected");
      })
      .catch((err) => {
        redisConnectPromise = null;
        throw err;
      });
  }

  await redisConnectPromise;
}




function matchCacheKey(eventId, targetId) {
  return `match:${eventId}:${targetId}`;
}


async function setMatchCache(eventId, targetId, matches, ttlSeconds = 60 * 60 * 48) {
  const key = matchCacheKey(eventId, targetId);

  const payload = {
    targetId,
    matches,
  };

  try {
    await ensureRedisConnected();
    await redis.set(key, JSON.stringify(payload), {
      EX: ttlSeconds,
    });
  } catch (err) {
    console.error("setMatchCache failed:", err.message);

    redisConnectPromise = null;

    await ensureRedisConnected();
    await redis.set(key, JSON.stringify(payload), {
      EX: ttlSeconds,
    });
  }
}

async function getMatchCache(eventId, targetId) {
  await ensureRedisConnected();

  const key = matchCacheKey(eventId, targetId);
  const raw = await redis.get(key);

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to parse match cache:", err);
    return null;
  }
}
async function enrichMatchesWithOnlineStatus(eventId, cachedMatches) {
  const matches = Array.isArray(cachedMatches?.matches)
    ? cachedMatches.matches
    : [];

  if (!matches.length) return cachedMatches;

  const ids = matches
    .map((m) => String(m.matchId || m.id || "").trim())
    .filter(Boolean);

  const querySpec = {
    query: `
      SELECT c.id, c.isOnline, c.lastSeenAt
      FROM c
      WHERE c.eventId = @eventId
      AND ARRAY_CONTAINS(@ids, c.id)
    `,
    parameters: [
      { name: "@eventId", value: eventId },
      { name: "@ids", value: ids },
    ],
  };

  const { resources } = await container.items
    .query(querySpec, { enableCrossPartitionQuery: true })
    .fetchAll();

  const onlineMap = new Map(
    resources.map((p) => [
      String(p.id),
      {
        isOnline: Boolean(p.isOnline),
        lastSeenAt: p.lastSeenAt || null,
      },
    ])
  );

  return {
    ...cachedMatches,
    matches: matches.map((m) => {
      const id = String(m.matchId || m.id || "");
      const onlineData = onlineMap.get(id) || {
        isOnline: false,
        lastSeenAt: null,
      };

      return {
        ...m,
        isOnline: onlineData.isOnline,
        lastSeenAt: onlineData.lastSeenAt,
      };
    }),
  };
}

async function deleteMatchCache(eventId, targetId) {
  await ensureRedisConnected();

  const key = `match:${eventId}:${targetId}`;
  await redis.del(key);

  console.log("Cache deleted:", key);
}


// =====================================
// ROUTES
// =====================================


// health
// app.get("/", (req, res) => {
//   res.send("Backend is running");
// });

// // ✅ COSMOS PARTICIPANTS
// app.get("/api/participants", async (req, res) => {
//   try {
//     const { resources } = await container.items.readAll().fetchAll();
//     res.json(resources);
//     console.log("🔥 DATA SOURCE: COSMOS DB");
// console.log("Total participants:", resources.length);
//   } catch (err) {
//     console.error("Cosmos ERROR:", err);
//     res.status(500).json({ error: "Failed to fetch from Cosmos" });
//   }
// });


// MATCHING
const { handleParticipant } = require("./similarity");
const { handleParticipantMatchesOnly } = require("./similarity");
const { AllEmbeddings } = require("./generateEmbeddings");




// =====================================
// 1) Rebuild matches for ALL participants
// -------------------------------------
// Use this route when you want to recalculate embeddings/matches
// for the entire participants table.
// Typical use case:
// - model was retrained
// - matching logic changed
// - full system refresh is needed
// =====================================
// app.post("/api/match/admin/rebuild-all/:eventId",verifyAdminToken,  async (req, res) => {
  
// try {
//     const eventId = req.params.eventId;
//     const adminId = req.adminAuth.providerUserId;
//     const { resource: event } = await eventsContainer.item(eventId, eventId).read();

// if (!event) {
//   return res.status(404).json({ error: "Event not found" });
// }

// if (event.createdByAdminId !== adminId) {
//   return res.status(403).json({ error: "Forbidden" });
// }


// const querySpec = {
//       query: "SELECT * FROM c WHERE c.eventId = @eventId",
//       parameters: [{ name: "@eventId", value: eventId }],
//     };

// const { resources } = await container.items.query(querySpec).fetchAll();

// if (!resources || resources.length === 0) {
//       return res.status(404).json({ error: "No participants found for this event" });
//     }



// // Stop if any participant is already being processed
// const alreadyProcessing = resources.find((p) => p.status === "processing");
// if (alreadyProcessing) {
//       return res.status(409).json({
//         error: `Participant ${alreadyProcessing.id} is already being processed`,
//       });
//     }

// // Mark all participants in this event as processing
// // await Promise.all(
// //   resources.map(async (participant) => {
// //     participant.status = "processing";
// //     await container.items.upsert(participant);
// //   })
// // );

// // Mark all participants in this event as processing
// const BatchSize = 30;

// for (let start = 0; start < resources.length; start += BatchSize) {
//   const batch = resources.slice(start, start + BatchSize);

//   await Promise.all(
//     batch.map(async (participant) => {
//       participant.status = "processing";
//       await container.items.upsert(participant);
//     })
//   );
// }

// // Rebuild embeddings for this event
// await AllEmbeddings(resources, eventId);

// // Compute matches for each participant, save to cache, and mark as ready
// const participantBatchSize = 30;

// for (let start = 0; start < resources.length; start += participantBatchSize) {
//   const batch = resources.slice(start, start + participantBatchSize);

//   await Promise.all(
//     batch.map(async (participant) => {
//       const matches = await handleParticipantMatchesOnly(participant, resources, 5);
//       await setMatchCache(eventId, participant.id, matches);

//       participant.status = "ready";
//       await container.items.upsert(participant);
//     })
//   );
// }

// res.json({
//       message: "all participants were processed successfully",
//       eventId,
//       totalParticipants: resources.length,
//     });
//   } catch (err) {
//     console.error("rebuild-all error:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

app.post("/api/match/admin/rebuild-all/:eventId", verifyAdminToken, async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const adminId = req.adminAuth.providerUserId;

    const { resource: event } = await eventsContainer.item(eventId, eventId).read();

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.createdByAdminId !== adminId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId",
      parameters: [{ name: "@eventId", value: eventId }],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "No participants found for this event" });
    }

    const alreadyProcessing = resources.find((p) => p.status === "processing");
    if (alreadyProcessing) {
      return res.status(409).json({
        error: `Participant ${alreadyProcessing.id} is already being processed`,
      });
    }

    res.status(202).json({
      message: "Rebuild started successfully",
      eventId,
      totalParticipants: resources.length,
    });

    runRebuildAll(eventId, resources).catch((err) => {
      console.error("background rebuild error:", err);
    });
  } catch (err) {
    console.error("rebuild-all error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function runRebuildAll(eventId, resources) {
  // Mark all participants in this event as processing
  const batchSize = 30;

  for (let start = 0; start < resources.length; start += batchSize) {
    const batch = resources.slice(start, start + batchSize);

    await Promise.all(
      batch.map(async (participant) => {
        participant.status = "processing";
        await container.items.upsert(participant);
      })
    );
  }

  // Rebuild embeddings for this event
  await AllEmbeddings(resources, eventId);

  // Compute matches for each participant, save to cache, and mark as ready
  const participantBatchSize = 25;

  for (let start = 0; start < resources.length; start += participantBatchSize) {
    const batch = resources.slice(start, start + participantBatchSize);

    await Promise.all(
      batch.map(async (participant) => {
        const matches = await handleParticipantMatchesOnly(participant, resources, 5);
        await setMatchCache(eventId, participant.id, matches);

        participant.status = "ready";
        await container.items.upsert(participant);
      })
    );
  }

  // Update event matching status to completed
  const { resource: event } = await eventsContainer.item(eventId, eventId).read();

  if (event) {
    event.matchingStatus = "completed";
    await eventsContainer.items.upsert(event);
  }
}
// =====================================
// Update existing participant
// -------------------------------------
// Use this route when an existing participant was edited.
// Since old matching data may already exist, we must first remove:
// - profile_text
// - profile_embedding
//
// This prevents using stale embeddings based on outdated profile data.
// After cleanup, the participant can be marked for recalculation.
// =====================================

//add deleting from cache????????????????????????

app.post("/api/match/admin/update/:eventId/:id", verifyAdminToken, async (req, res) => {
  try {
    const eventId = req.params.eventId;   // keep as raw string
    const targetId = req.params.id;       // keep raw ID format, e.g. "p12"
    const adminId = req.adminAuth.providerUserId;
    const { resource: event } = await eventsContainer.item(eventId, eventId).read();

   if (!event) {
      return res.status(404).json({ error: "Event not found" });
}

 if (event.createdByAdminId !== adminId) {
     return res.status(403).json({ error: "Forbidden" });
}

    // Find the participant in Cosmos by BOTH eventId and id
    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: targetId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = resources[0];

    // Remove old matching fields if they exist
    delete participant.job_clean;
    delete participant.academic_clean;
    delete participant.professional_clean;
    delete participant.personal_clean;
    delete participant.profile_text;
    delete participant.profile_embedding;
    delete participant.job_embedding;
    delete participant.academic_embedding;
    delete participant.professional_embedding;
    delete participant.personal_embedding;
    //await deleteMatchCache(eventId, participant.id); // delete cache for this participant

    await deleteMatchCache(eventId, participant.id); // delete cache for this participant

    // Mark participant as needing recalculation
    participant.status = "pending";

    // Save updated participant back to Cosmos
    await container.items.upsert(participant);

    // Reuse the same shared flow
    const matches = await handleParticipant(participant, eventId);
    await setMatchCache(eventId, participant.id, matches);

    participant.status = "ready";
    await container.items.upsert(participant);
    return res.status(200).json({
        message: "Matches calculated and saved successfully.",
        participantId: participant.id,
        status: participant.status,
        matches,
      });
  } catch (err) {
    console.error("update participant match error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/match/update/:eventId/:id", async (req, res) => {
  try {
    const eventId = req.params.eventId;   // keep as raw string
    const targetId = req.params.id;       // keep raw ID format, e.g. "p12"

    // Find the participant in Cosmos by BOTH eventId and id
    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: targetId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = resources[0];
  

    // Remove old matching fields if they exist
   
    delete participant.job_clean;
    delete participant.academic_clean;
    delete participant.professional_clean;
    delete participant.personal_clean;
    delete participant.profile_text;
    delete participant.profile_embedding;
    delete participant.job_embedding;
    delete participant.academic_embedding;
    delete participant.professional_embedding;
    delete participant.personal_embedding;
    //await deleteMatchCache(eventId, participant.id); // delete cache for this participant

    await deleteMatchCache(eventId, participant.id); // delete cache for this participant

    // Mark participant as needing recalculation
    participant.status = "pending";

    // Save updated participant back to Cosmos
    await container.items.upsert(participant);

    // Reuse the same shared flow
    const matches = await handleParticipant(participant, eventId);
    await setMatchCache(eventId, participant.id, matches);

    participant.status = "ready";
    await container.items.upsert(participant);
    return res.status(200).json({
        message: "Matches calculated and saved successfully.",
        participantId: participant.id,
        status: participant.status,
        matches,
      });
  } catch (err) {
    console.error("update participant match error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/match/update/:eventId/:id", async (req, res) => {
  try {
    const eventId = req.params.eventId
    const targetId = req.params.id

    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: targetId },
      ],
    }

    const { resources } = await container.items.query(querySpec).fetchAll()

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "Participant not found" })
    }

    const participant = resources[0]

    delete participant.job_clean
    delete participant.academic_clean
    delete participant.professional_clean
    delete participant.personal_clean
    delete participant.profile_text
    delete participant.profile_embedding
    delete participant.job_embedding
    delete participant.academic_embedding
    delete participant.professional_embedding
    delete participant.personal_embedding

    await deleteMatchCache(eventId, participant.id)

    participant.status = "pending"
    await container.items.upsert(participant)

    const matches = await handleParticipant(participant, eventId)
    await setMatchCache(eventId, participant.id, matches)

    participant.status = "ready"
    await container.items.upsert(participant)

    return res.status(200).json({
      message: "Matches calculated and saved successfully.",
      participantId: participant.id,
      status: participant.status,
      matches,
    })
  } catch (err) {
    console.error("update participant match error:", err)
    res.status(500).json({ error: err.message })
  }
})

// =====================================
// Add new participant
// -------------------------------------
// Use this route when a new participant is added to the system.
// A new participant does not yet have profile_text/profile_embedding,
// so there is nothing to delete.
// The participant is simply prepared for future matching calculation.
// =====================================
app.post("/api/match/admin/add/:eventId/:id", verifyAdminToken, async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const targetId = req.params.id;
     const adminId = req.adminAuth.providerUserId;
    const { resource: event } = await eventsContainer.item(eventId, eventId).read();

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
}

   if (event.createdByAdminId !== adminId) {
     return res.status(403).json({ error: "Forbidden" });
}

    // Find the participant in Cosmos by eventId + id
    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: targetId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = resources[0];

    const matches = await handleParticipant(participant, eventId);
    await setMatchCache(eventId, participant.id, matches);

    participant.status = "ready";
    await container.items.upsert(participant);
    return res.status(200).json({
        message: "Matches calculated and saved successfully.",
        participantId: participant.id,
        status: participant.status,
        matches,
      });
  } catch (err) {
    console.error("add participant match error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/match/add/:eventId/:id", async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const targetId = req.params.id;

    // Find the participant in Cosmos by eventId + id
    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: targetId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = resources[0];

    const matches = await handleParticipant(participant, eventId);
    await setMatchCache(eventId, participant.id, matches);

    participant.status = "ready";
    await container.items.upsert(participant);
    return res.status(200).json({
        message: "Matches calculated and saved successfully.",
        participantId: participant.id,
        status: participant.status,
        matches,
      });
  } catch (err) {
    console.error("add participant match error:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================================
// 4) Fallback / exceptional case route
// ------------------------------------
// This route is used when saved matches do NOT exist,
// or when the system must calculate matches on demand.
//
// In other words:
// - no stored matches were found
// - match cache is missing
// - temporary recovery/fallback flow is needed
//
// This route calls getTopMatches(...), which means it computes
// similarity dynamically at request time instead of only reading
// precomputed results.
// =====================================
app.get("/api/match/:eventId/:id", async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const targetId = req.params.id;

    // Find participant by eventId + id
    const querySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: targetId },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();

    if (!resources || resources.length === 0) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const participant = resources[0];

    // Case 1: matches are already ready
    if (participant.status === "ready") {
    const cachedMatches = await getMatchCache(eventId, targetId);

    if (cachedMatches) {
  const enrichedMatches = await enrichMatchesWithOnlineStatus(
    eventId,
    cachedMatches
  );

  return res.status(200).json(enrichedMatches);
}

  return res.status(404).json({
    error: "Participant is marked ready but no cached matches were found.",
    participantId: participant.id,
    status: participant.status,
  });
}
    // Case 2: calculation is already running
    if (participant.status === "processing") {
      return res.status(409).json({
        error: "Matching is already in progress for this participant",
      });
    }

    // Case 3: participant needs recalculation
    if (participant.status === "pending") {
      const matches = await handleParticipant(participant, eventId);
      await setMatchCache(eventId, participant.id, matches);

      participant.status = "ready";
      await container.items.upsert(participant);

      return res.status(200).json({
        message: "Matches calculated and saved successfully.",
        participantId: participant.id,
        status: participant.status,
        matches,
      });
    }

    return res.status(400).json({
      error: `Unsupported participant status: ${participant.status}`,
    });
  } catch (err) {
    console.error("get participant matches error:", err);
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

async function getParticipantDocByRouteId(userId, eventId) {
  const docId = toParticipantDocId(userId);

  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.eventId = @eventId",
    parameters: [
      { name: "@id", value: docId },
      { name: "@eventId", value: eventId },
    ],
  };

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources[0] || null;
}


/* ========================
   MIDDLEWARE
======================== */

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

app.post("/api/eventParticipants/:id/save/:targetId", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.saved = resource.saved || [];
    const targetId = String(req.params.targetId);

    if (!resource.saved.map(String).includes(targetId)) {
      resource.saved.push(targetId);
    }

    const { resource: updated } = await container
      .item(resource.id, resource.eventId)
      .replace(resource);

    res.json({ saved: updated.saved || [] });
  } catch (error) {
    res.status(500).json({ message: "Save failed", error: error.message });
  }
});
app.delete("/api/eventParticipants/:id/save/:targetId", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.saved = (resource.saved || []).filter(
      (id) => String(id) !== String(req.params.targetId)
    );

    const { resource: updated } = await container
      .item(resource.id, resource.eventId)
      .replace(resource);

    res.json({ saved: updated.saved || [] });
  } catch (error) {
    res.status(500).json({ message: "Unsave failed", error: error.message });
  }
});

/* ========================
   MET
======================== */

app.post("/api/eventParticipants/:id/met/:targetId", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.met = resource.met || [];
    const targetId = String(req.params.targetId);

    if (!resource.met.map(String).includes(targetId)) {
      resource.met.push(targetId);
    }

    const { resource: updated } = await container
      .item(resource.id, resource.eventId)
      .replace(resource);

    res.json({ met: updated.met || [] });
  } catch (error) {
    res.status(500).json({ message: "Met failed", error: error.message });
  }
});
app.delete("/api/eventParticipants/:id/met/:targetId", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.met = (resource.met || []).filter(
      (id) => String(id) !== String(req.params.targetId)
    );

    const { resource: updated } = await container
      .item(resource.id, resource.eventId)
      .replace(resource);

    res.json({ met: updated.met || [] });
  } catch (error) {
    res.status(500).json({ message: "Unmet failed", error: error.message });
  }
});
app.post("/api/eventParticipants/:id/skipped/:targetId", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.skipped = resource.skipped || [];
    const targetId = String(req.params.targetId);

    if (!resource.skipped.map(String).includes(targetId)) {
      resource.skipped.push(targetId);
    }

    const { resource: updated } = await container
      .item(resource.id, resource.eventId)
      .replace(resource);

    res.json({ skipped: updated.skipped || [] });
  } catch (error) {
    res.status(500).json({ message: "Skip failed", error: error.message });
  }
});
app.delete("/api/eventParticipants/:id/skipped/:targetId", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "User document not found" });
    }

    resource.skipped = (resource.skipped || []).filter(
      (id) => String(id) !== String(req.params.targetId)
    );

    const { resource: updated } = await container
      .item(resource.id, resource.eventId)
      .replace(resource);

    res.json({ skipped: updated.skipped || [] });
  } catch (error) {
    res.status(500).json({ message: "Unskip failed", error: error.message });
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
   FETCH SAVED / MET / skipped
======================== */

app.get("/api/eventParticipants/:id/saved", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "Participant not found" });
    }

    res.json({ saved: resource.saved || [] });
  } catch (error) {
    res.status(500).json({ message: "Fetch saved failed", error: error.message });
  }
});

app.get("/api/eventParticipants/:id/met", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "Participant not found" });
    }

    res.json({ met: resource.met || [] });
  } catch (error) {
    res.status(500).json({ message: "Fetch met failed", error: error.message });
  }
});
app.get("/api/eventParticipants/:id/skipped", async (req, res) => {
  try {
    const eventId = String(req.query.eventId || "").trim();
    const resource = await getParticipantDocByRouteId(req.params.id, eventId);

    if (!resource) {
      return res.status(404).json({ message: "Participant not found" });
    }

    res.json({ skipped: resource.skipped || [] });
  } catch (error) {
    res.status(500).json({ message: "Fetch skipped failed", error: error.message });
  }
});

/* ========================
   PHONE LOGIN
======================== */

app.post("/api/auth/phone-login", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const eventId = String(req.body.eventId || "").trim();

    if (!phone) {
      return res.status(400).json({ message: "Phone is required" });
    }

    if (!eventId) {
      return res.status(400).json({ message: "eventId is required" });
    }

    const querySpec = {
      query: "SELECT TOP 1 c.id, c.phone, c.eventId FROM c WHERE c.phone = @phone AND c.eventId = @eventId",
      parameters: [
        { name: "@phone", value: phone },
        { name: "@eventId", value: eventId },
      ],
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
      eventId: user.eventId,
    });
  } catch (error) {
    res.status(500).json({
      message: "Phone login failed",
      error: error.message,
    });
  }
});



// =====================================
// START SERVER
// =====================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
