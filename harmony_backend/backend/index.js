const express = require('express');
const cors = require('cors');
const app = express();
const fs = require('fs');
const csv = require('csv-parser'); // read CSV files row by row
const axios = require('axios'); // used to send HTTP requests to FastAPI
require("dotenv").config();
console.log("✅ INDEX SAVED CHECK 123");

app.use(cors({
  origin: ['https://harmony-frontend-iota.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

console.log("GROQ_API_KEY =", process.env.GROQ_API_KEY);
console.log("RUNNING THIS INDEX:new");

/* =========================================================
   LOAD PARTICIPANT IMAGES FROM CSV (ONCE)
   ========================================================= */
const imagesById = new Map();

function loadImagesFromParticipantsCsv() {
  return new Promise((resolve, reject) => {
    let index = 0;

    fs.createReadStream('data/participants.csv', { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (row) => {
        if (index === 0) {
          console.log('CSV columns:', Object.keys(row));
        }

        // same row-based id logic used in /api/participants
        const id = String(index++).trim();

        // ⚠️ Update column name if needed
        const imageUrl = String(
          row[''] ||
          row['imageUrl'] ||
          row['image_url'] ||
          row['image'] ||
          row['photo'] ||
          row['avatar'] ||
          row['תמונה'] ||
          row['קישור לתמונה'] ||
          ''
        ).trim();

        if (imageUrl) imagesById.set(id, imageUrl);
      })
      .on('end', () => {
        console.log(`✅ Loaded ${imagesById.size} participant images`);
        resolve();
      })
      .on('error', reject);
  });
}

/* ---------- EMBEDDING CLIENT ---------- */

async function getEmbeddings(texts) {
  const response = await axios.post(
    'https://harmony-ml.onrender.com/embed',
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
function saveCleanParticipantsCSV(participants) { // Export cleaned text for QA/debug
  if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });

  const header = [
    'id',
    'name',
    'jobTitle_clean',
    'academic_clean',
    'professional_clean',
    'personal_clean'
  ].join(',') + '\n';

  const lines = participants.map(p => {
    const safeName = String(p.name || '').replace(/"/g, '""');
    const jt = String(p.jobTitleText || '').replace(/"/g, '""');
    const ac = String(p.academicText || '').replace(/"/g, '""');
    const pr = String(p.professionalText || '').replace(/"/g, '""');
    const pe = String(p.personalText || '').replace(/"/g, '""');

    return `${p.id},"${safeName}","${jt}","${ac}","${pr}","${pe}"`;
  });

  fs.writeFileSync('data/participants_clean.csv', header + lines.join('\n'), 'utf8');
}

/* ---------- SAVE FIELD EMBEDDINGS (SEPARATE) ---------- */
function saveFieldEmbeddingsToCSV(participants) {
  const header = 'id,name,jobTitle_embedding,academic_embedding,professional_embedding,personal_embedding,profile_embedding\n';

  const rows = participants.map(p => {
    const safeName = String(p.name || '').replace(/"/g, '""');
    const jt = JSON.stringify(p.jobTitle_embedding || []).replace(/"/g, '""');
    const ac = JSON.stringify(p.academic_embedding || []).replace(/"/g, '""');
    const pr = JSON.stringify(p.professional_embedding || []).replace(/"/g, '""');
    const pe = JSON.stringify(p.personal_embedding || []).replace(/"/g, '""');
    const glob = JSON.stringify(p.profile_embedding || []).replace(/"/g, '""');

    return `${p.id},"${safeName}","${jt}","${ac}","${pr}","${pe}","${glob}"`;
  });

  const content = header + rows.join('\n');

  fs.writeFileSync(
    'data/field_embeddings.csv',
    content,
    { encoding: 'utf8', flag: 'w' }
  );
}

/* ---------- ROUTES ---------- */
// Health check route
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Reads participants from CSV, builds profile text, computes embeddings, saves them, and returns the result
app.get('/api/participants', async (req, res) => {
  const results = [];
  let index = 0;

  fs.createReadStream('data/participants.csv', { encoding: 'utf8' })
    .pipe(csv())
    .on('data', (row) => {
      const cleanedJob  = removeStopwords(normalizeText(row['Job Title']));
      const cleanedAcad = removeStopwords(normalizeText(row['Academic Resume']));
      const cleanedProf = removeStopwords(normalizeText(row['Professional Resume']));
      const cleanedPers = removeStopwords(normalizeText(row['Personal Resume']));

      results.push({
        id: index++, // Stable row-based ID
        name: row['الاسم'] || '',
        jobTitleText: cleanedJob,
        academicText: cleanedAcad,
        professionalText: cleanedProf,
        personalText: cleanedPers,

        // global profile text
        profileText: [
          cleanedAcad,
          cleanedProf,
          cleanedPers
        ].filter(Boolean).join(' ')
      });
    })
    .on('end', async () => {
      try {
        // Save cleaned CSV BEFORE embeddings
        saveCleanParticipantsCSV(results);

        // Prepare texts
        const jobTexts          = results.map(p => p.jobTitleText);
        const academicTexts     = results.map(p => p.academicText);
        const professionalTexts = results.map(p => p.professionalText);
        const personalTexts     = results.map(p => p.personalText);
        const profileTexts      = results.map(p => p.profileText);

        // One embedding call for all fields + global
        const allFieldTexts = [
          ...jobTexts,
          ...academicTexts,
          ...professionalTexts,
          ...personalTexts,
          ...profileTexts
        ].map(t => (t && t.trim()) ? t : ' ');

        console.log("ABOUT TO CALL EMBEDDINGS:", allFieldTexts.length);
        const allFieldEmbeddings = await getEmbeddingsBatched(allFieldTexts, 40);

        console.log("EMBEDDINGS RETURNED");

        // Split embeddings
        const n = results.length;
        const jobEmb  = allFieldEmbeddings.slice(0, n);
        const acadEmb = allFieldEmbeddings.slice(n, 2 * n);
        const profEmb = allFieldEmbeddings.slice(2 * n, 3 * n);
        const persEmb = allFieldEmbeddings.slice(3 * n, 4 * n);
        const globEmb = allFieldEmbeddings.slice(4 * n, 5 * n);

        results.forEach((p, i) => {
          p.jobTitle_embedding     = jobEmb[i];
          p.academic_embedding     = acadEmb[i];
          p.professional_embedding = profEmb[i];
          p.personal_embedding     = persEmb[i];
          p.profile_embedding      = globEmb[i];
        });

        // Save embeddings CSV
        saveFieldEmbeddingsToCSV(results);

        res.json(results);
      } catch (err) {
        console.error('Embedding error:', err);
        res.status(500).json({ error: 'Embedding failed' });
      }
    });
});

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
loadImagesFromParticipantsCsv().catch(err => {
  console.error('❌ Failed to load images from participants.csv:', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});