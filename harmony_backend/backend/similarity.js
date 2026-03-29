const fs = require('fs');              // File system module for reading CSV files
const csv = require('csv-parser');     // CSV parser to read rows from CSV streams

// Computes cosine similarity between two numeric vectors
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;   // Guard: inputs must be arrays
  if (a.length === 0 || b.length === 0) return 0;         // Guard: empty vectors
  if (a.length !== b.length) return 0;                    // Guard: vectors must be same length

  let dot = 0, normA = 0, normB = 0;

  // Compute dot product and L2 norms
  for (let i = 0; i < a.length; i++) {
    const x = Number(a[i]);
    const y = Number(b[i]);

    // Guard: invalid numeric values
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;

    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0; // Guard: avoid division by zero

  const score = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Number.isFinite(score) ? score : 0; // Return valid cosine similarity score
}

// Defines relative importance of each profile field in the final score
const WEIGHTS = {
  job: 0.05,
  professional: 0.35,
  academic: 0.40,
  personal: 0.20,
};

// Safely parses embedding vectors stored as JSON strings in CSV
function safeParseEmbedding(val) {
  try {
    if (!val) return [];
    return JSON.parse(val);
  } catch {
    return [];
  }
}

// Returns top-K most similar participants to the given target participant
function getTopMatches(targetId, k = 5) {
  console.log("WEIGHTS NOW:", WEIGHTS); // Debug log to verify current weighting scheme

  return new Promise((resolve, reject) => {
    const participants = [];

    // Read precomputed field-level embeddings from CSV
    fs.createReadStream('data/field_embeddings.csv')
      .pipe(csv())
      .on('data', (row) => {
        // Load embeddings for each participant by field
        participants.push({
          id: parseInt(row.id),
          name: row.name,
          jobEmb: safeParseEmbedding(row.jobTitle_embedding),
          acadEmb: safeParseEmbedding(row.academic_embedding),
          profEmb: safeParseEmbedding(row.professional_embedding),
          persEmb: safeParseEmbedding(row.personal_embedding),
          globEmb: safeParseEmbedding(row.profile_embedding)
        });
      })
      .on('end', () => {
        // Find the target participant by ID
        const target = participants.find(p => p.id === targetId);
        if (!target) return reject(new Error('Target not found'));

        // Compute similarity score against all other participants
        const results = participants
          .filter(p => p.id !== targetId)   // Exclude self
          .map(p => {
            // Compute cosine similarity per field
            const sGlobal = cosineSimilarity(target.globEmb, p.globEmb);
            const sJob  = cosineSimilarity(target.jobEmb,  p.jobEmb);
            const sProf = cosineSimilarity(target.profEmb, p.profEmb);
            const sAcad = cosineSimilarity(target.acadEmb, p.acadEmb);
            const sPers = cosineSimilarity(target.persEmb, p.persEmb);

            // Weighted aggregation into a single similarity score
            //const score =
              //WEIGHTS.job * sJob +
              //WEIGHTS.professional * sProf +
            //  WEIGHTS.academic * sAcad +
            //  WEIGHTS.personal * sPers;

              const sFields =
               WEIGHTS.job          * sJob  +
               WEIGHTS.professional * sProf +
               WEIGHTS.academic     * sAcad +
               WEIGHTS.personal     * sPers;

               const score = sFields;

            return {
              id: p.id,
              name: p.name, 
              score,
              breakdown: {
                global: sGlobal,
                fields: {
                  job: sJob,
                  professional: sProf,
                  academic: sAcad,
                  personal: sPers
                }
              }
            };
            })

          .sort((a, b) => b.score - a.score) // Rank by highest similarity
          .slice(0, k);                      // Keep top-K matches

        resolve(results);
      })
      .on('error', reject); // Handle file or parsing errors
  });
}
function loadParticipantsFromEmbeddingsCsv() {
  return new Promise((resolve, reject) => {
    const participants = [];

    fs.createReadStream('data/field_embeddings.csv')
      .pipe(csv())
      .on('data', (row) => {
        participants.push({
          id: String(row.id),
          name: row.name,
          jobEmb: safeParseEmbedding(row.jobTitle_embedding),
          acadEmb: safeParseEmbedding(row.academic_embedding),
          profEmb: safeParseEmbedding(row.professional_embedding),
          persEmb: safeParseEmbedding(row.personal_embedding),
          globEmb: safeParseEmbedding(row.profile_embedding)
        });
      })
      .on('end', () => resolve(participants))
      .on('error', reject);
  });
}

function scoreAgainstParticipants(target, participants, k = 5) {
  const results = participants
    .filter(p => String(p.id) !== String(target.id))
    .map(p => {
      const sGlobal = cosineSimilarity(target.globEmb, p.globEmb);
      const sJob  = cosineSimilarity(target.jobEmb,  p.jobEmb);
      const sProf = cosineSimilarity(target.profEmb, p.profEmb);
      const sAcad = cosineSimilarity(target.acadEmb, p.acadEmb);
      const sPers = cosineSimilarity(target.persEmb, p.persEmb);

      const sFields =
        WEIGHTS.job          * sJob  +
        WEIGHTS.professional * sProf +
        WEIGHTS.academic     * sAcad +
        WEIGHTS.personal     * sPers;

      const score = sFields;

      return {
        id: p.id,
        name: p.name,
        score,
        breakdown: {
          global: sGlobal,
          fields: {
            job: sJob,
            professional: sProf,
            academic: sAcad,
            personal: sPers
          }
        }
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return results;
}

async function getTopMatchesForExternalTarget(target, k = 5) {
  const participants = await loadParticipantsFromEmbeddingsCsv();
  return scoreAgainstParticipants(target, participants, k);
}

// Export matching function for use in API routes
module.exports = {
  getTopMatches,
  getTopMatchesForExternalTarget
};