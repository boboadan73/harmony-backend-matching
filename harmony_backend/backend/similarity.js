require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");

// =========================
// COSMOS CONNECTION (INLINE)
// =========================
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("participants");


// =========================
// COSINE SIMILARITY
// =========================
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0, normA = 0, normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;

    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// =========================
// WEIGHTS
// =========================
const WEIGHTS = {
  job: 0.05,
  professional: 0.35,
  academic: 0.40,
  personal: 0.20,
};

// =========================
// MAIN FUNCTION (COSMOS)
// =========================
async function getTopMatches(targetId, k = 5) {
  console.log("🔍 Fetching participants from Cosmos...");

  // STEP 1: get all participants
  
  const { resources } = await container.items.readAll().fetchAll();

  if (!resources || resources.length === 0) {
    throw new Error("No participants found in DB");
  }

  // STEP 2: map participants
  const participants = resources.map((p) => ({
    id: parseInt(String(p.id).replace("p", "")), // ✅ FIXED ID
    name: p.name || "",

    jobEmb: p.job_embedding || [],
    acadEmb: p.academic_embedding || [],
    profEmb: p.professional_embedding || [],
    persEmb: p.personal_embedding || [],
  }));

  // STEP 3: find target
  const target = participants.find((p) => p.id === targetId);

  if (!target) {
    throw new Error(`Target ${targetId} not found`);
  }

  // DEBUG (optional)
  console.log("✅ Target found:", target.name);
  console.log("Vector size:", target.jobEmb.length);

  // STEP 4: compute similarity
  const results = participants
    .filter((p) => p.id !== targetId)
    .map((p) => {
      const sJob  = cosineSimilarity(target.jobEmb,  p.jobEmb);
      const sProf = cosineSimilarity(target.profEmb, p.profEmb);
      const sAcad = cosineSimilarity(target.acadEmb, p.acadEmb);
      const sPers = cosineSimilarity(target.persEmb, p.persEmb);

      const score =
        WEIGHTS.job * sJob +
        WEIGHTS.professional * sProf +
        WEIGHTS.academic * sAcad +
        WEIGHTS.personal * sPers;

      return {
        id: p.id,
        name: p.name,
        score,
        breakdown: {
          job: sJob,
          professional: sProf,
          academic: sAcad,
          personal: sPers,
        },
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return results;
}

module.exports = { getTopMatches };
