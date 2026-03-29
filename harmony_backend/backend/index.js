const express = require('express');
console.log("MATCH BACKEND NEW VERSION");
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
const { getTopMatchesForExternalTarget } = require('./similarity');
// Returns top-K most similar participants (NO explanation)

app.get('/api/match/:pid', async (req, res) => {
  try {
    const pid = String(req.params.pid).trim();

    if (!pid) {
      return res.status(400).json({ error: 'Invalid participant ID' });
    }

    const userRes = await axios.get(
      `https://harmony-system-backend-1.onrender.com/api/participants/${pid}`
    );

    const participant = userRes.data?.participant || userRes.data;

    if (!participant) {
      return res.status(404).json({ error: 'User not found in system backend' });
    }

    const texts = [
      participant.job || '',
      participant.academic || '',
      participant.professional || '',
      participant.personal || '',
      `${participant.job || ''} ${participant.academic || ''} ${participant.professional || ''} ${participant.personal || ''}`
    ];

    const embedRes = await axios.post('http://localhost:8000/embed', { texts });
    const embeddings = embedRes.data?.embeddings || [];

    const target = {
      id: String(participant.id),
      name: participant.name || '',
      jobEmb: embeddings[0] || [],
      acadEmb: embeddings[1] || [],
      profEmb: embeddings[2] || [],
      persEmb: embeddings[3] || [],
      globEmb: embeddings[4] || []
    };

    const matches = await getTopMatchesForExternalTarget(target, 5);

    res.json(matches);
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