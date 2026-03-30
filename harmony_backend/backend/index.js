require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const axios = require("axios");
const { CosmosClient } = require("@azure/cosmos");

const app = express();
const { explainPair } = require('./llmExplanation');
const { getTopMatches } = require('./similarity');

// Returns top-K most similar participants (NO explanation)
app.get('/api/match/:id', async (req, res) => {
  const targetId = Number(req.params.id);

  if (Number.isNaN(targetId)) {
    return res.status(400).json({ error: 'Invalid participant ID' });
  }

  try {
    console.log('Requested match for ID:', targetId);

    const matches = await getTopMatches(targetId, 5);
    console.log(
  'Image for first match:',
  matches[0]?.id,
  imagesById.get(String(matches[0]?.id))
);

    const explainedMatches = await Promise.all(
      matches.map(async (m) => {
        const exp = await explainPair(targetId, m.id);

                return {
          id: m.id,
          name: m.name,
          score: m.score,
          breakdown: m.breakdown,

          reason: exp.explanation?.ar || null,
          reason_en: exp.explanation?.en || null,
          reason_he: exp.explanation?.he || null,

          // 🔹 חדש – שם מתורגם בנפרד
          match_name: exp.match_name || null,


          imageUrl: imagesById.get(String(m.id)) || null
        };

      })
    );

    res.json(explainedMatches);
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------- START SERVER ---------- */

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