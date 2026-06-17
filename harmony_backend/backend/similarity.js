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
const container = database.container("eventParticipants");


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




const { generateProfileEmbedding,  } = require("./generateEmbeddings");
const { explainMatches,  } = require("./llmExplanation");

async function handleParticipantMatchesOnly(participant, resources, k, excludedIds = []) {
  let target;

  try {
    if (!resources || resources.length === 0) {
      throw new Error("No participants found");
    }

    const limit = Number(k);

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("Invalid matches limit");
    }

    const excluded = new Set(
      excludedIds.map(id => String(id))
    );

    excluded.add(String(participant.id));

    // Keep only participants with valid embeddings
    const participants = resources.filter(
      (p) => Array.isArray(p.profile_embedding) && p.profile_embedding.length > 0
    );


    const matches = participants
      .filter(p => !excluded.has(String(p.id)))
      .map((p) => {
        const score = cosineSimilarity(
          participant.profile_embedding,
          p.profile_embedding
        );

       return {
        ...p,   // 🔥 כל השדות של המשתתף
        score
      };
        
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log(`Computed ${matches.length} matches for participant ${participant.id}`);
    console.log("========== DEBUG ==========");
    console.log("Participant:", participant.id);
    console.log("Matches length:", matches.length);
    console.log("===========================");

    const result = await explainMatches(participant, matches);

    return result;
  } catch (err) {
    // If something fails, release the lock
    participant.status = "pending";
    await container.items.upsert(participant);
    throw err;
  }
}

async function handleParticipant(participant, eventId, k = 10) {
  // 1) Validate input participant
  if (!participant || !participant.id) {
    throw new Error("Participant object is missing or invalid");
  }

  // 2) Prevent duplicate processing
  if (participant.status === "processing") {
    throw new Error(`Participant ${participant.id} is already being processed`);
  }

  // 3) Mark as processing
  participant.status = "processing";
  await container.items.upsert(participant);

  try {
    // 4) Generate and save profile_text + profile_embedding for target participant
    await generateProfileEmbedding(participant);

    // 5) Reload target participant after embedding was saved
    const updatedTargetQuerySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId AND c.id = @id",
      parameters: [
        { name: "@eventId", value: eventId },
        { name: "@id", value: participant.id },
      ],
    };

    const { resources: updatedResources } = await container.items
      .query(updatedTargetQuerySpec)
      .fetchAll();

    if (!updatedResources || updatedResources.length === 0) {
      throw new Error(`Participant ${participant.id} not found after embedding update`);
    }

    const target = updatedResources[0];

    if (
      !Array.isArray(target.profile_embedding) ||
      target.profile_embedding.length === 0
    ) {
      throw new Error(`Target participant ${participant.id} has no profile embedding`);
    }

    // 6) Load only participants from the same event
    const sameEventQuerySpec = {
      query: "SELECT * FROM c WHERE c.eventId = @eventId",
      parameters: [{ name: "@eventId", value: eventId }],
    };

    const { resources: allParticipants } = await container.items
      .query(sameEventQuerySpec)
      .fetchAll();
    console.log(allParticipants);

    // 7) Compute similarity only against participants in the same event
    //    who already have embeddings
    const matches = allParticipants
      .filter((p) => {
        return (
          p.id !== target.id &&
          Array.isArray(p.profile_embedding) &&
          p.profile_embedding.length > 0
        );
      })
      .map((p) => {
        const score = cosineSimilarity(
          target.profile_embedding,
          p.profile_embedding
        );

        return {
          ...p,
          score,
          linkedInUrl: p.linkedInUrl || p.linkedinUrl || p.rawData?.LinkedIn || '',
          linkedinUrl: p.linkedInUrl || p.linkedinUrl || p.rawData?.LinkedIn || '',
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    const result = await explainMatches(target, matches);
    return result;
  } catch (err) {
    // If something fails, release the lock
    participant.status = "pending";
    await container.items.upsert(participant);
    throw err;
  }
}


module.exports = { handleParticipant, handleParticipantMatchesOnly,cosineSimilarity,};
