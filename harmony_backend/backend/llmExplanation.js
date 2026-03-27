const fs = require('fs');                // File system module for reading and writing files
const csv = require('csv-parser');       // CSV parser for streaming CSV rows
require("dotenv").config();

/* ------------------ Math ------------------ */

// Computes cosine similarity between two numeric vectors
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ------------------ Cache ------------------ */

// Ensures that the data directory exists before reading/writing files
function ensureDataDir() {
  if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });
}

// Generates a stable cache key for an unordered pair of participant IDs
function cacheKey(a, b) {
  const x = Math.min(a, b);
  const y = Math.max(a, b);
  return `${x}-${y}`;
}

// Loads cached LLM explanations from disk if available
function readCache() {
  try {
    ensureDataDir();
    return JSON.parse(fs.readFileSync('data/llm_explanations_cache.json', 'utf8'));
  } catch {
    return {};
  }
}

// Writes updated explanation cache back to disk
function writeCache(cache) {
  ensureDataDir();
  fs.writeFileSync(
    'data/llm_explanations_cache.json',
    JSON.stringify(cache, null, 2),
    'utf8'
  );
}

/* ------------------ Data Loading ------------------ */

// Loads field-level embeddings (job, academic, professional, personal) from CSV
function loadFieldEmbeddings() {
  return new Promise((resolve, reject) => {
    const participants = [];

    fs.createReadStream('data/field_embeddings.csv', { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (row) => {
        try {
          participants.push({
            id: parseInt(row.id),
            name: row.name || '',
            jobTitle_emb: JSON.parse(row.jobTitle_embedding || '[]'),
            academic_emb: JSON.parse(row.academic_embedding || '[]'),
            professional_emb: JSON.parse(row.professional_embedding || '[]'),
            personal_emb: JSON.parse(row.personal_embedding || '[]'),
          });
        } catch (e) {
          // Skip rows with malformed embeddings
        }
      })
      .on('end', () => resolve(participants))
      .on('error', reject);
  });
}

// Loads raw participant text fields used for explanation generation
function loadParticipantTexts() {
  return new Promise((resolve, reject) => {
    const participants = [];
    let idx = 0;

    fs.createReadStream('data/participants.csv', { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (row) => {
        participants.push({
          id: idx++, // ID based on CSV row order (must match embedding generation)
          jobTitle: (row['Job Title'] || '').toString(),
          academic: (row['Academic Resume'] || '').toString(),
          professional: (row['Professional Resume'] || '').toString(),
          personal: (row['Personal Resume'] || '').toString(),
          name: (row['الاسم'] || '').toString(),
        });
      })
      .on('end', () => resolve(participants))
      .on('error', reject);
  });
}

/* ------------------ LLM ------------------ */

const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function extractText(choice) {
  return (
    choice?.message?.content ??
    choice?.message?.reasoning ??
    choice?.delta?.content ??
    null
  );
}

// Limits
const EXPLANATION_MAX_TOKENS = 250;
const TRANSLATION_MAX_TOKENS = 400;
const NAME_TRANSLATION_MAX_TOKENS = 40;

/**
 * Sends a prompt to an LLM and returns text.
 * maxTokens is REQUIRED to prevent truncation in translations.
 */
async function callLLM(systemMessage, prompt, maxTokens) {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: maxTokens
  });

  const text = extractText(completion?.choices?.[0]);
  console.log("LLM RAW:", JSON.stringify(text));

  return text
    ? text
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : null;
}

/* ------------------ Translation ------------------ */

// Arabic -> English (strict translation)
async function translateToEnglish(arabicText) {
  const systemMessage = `
You are a professional translator.
Your task is to translate Arabic text into clear, natural English.

Rules:
- Translation ONLY.
- Do NOT add, remove, or rephrase content.
- Do NOT explain.
- Keep the same meaning and tone.
- Keep names and organizations exactly as written.
- Return ONLY the translation.
-read the name correctly.
`.trim();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: arabicText }
    ],
    temperature: 0.2,
    max_tokens: TRANSLATION_MAX_TOKENS
  });

  const text = extractText(completion?.choices?.[0]);
  return text && text.trim() ? text.trim() : null;
}

// English -> Hebrew (strict translation)
// NOTE: You are calling this with llmExplanation_en, so the source is English.
async function translateToHebrew(englishText) {
  const systemMessage = `
אתה מתרגם מקצועי.

המשימה שלך היא לתרגם את הטקסט הנתון מאנגלית לעברית באופן נאמן ומדויק.

כללים מחייבים:
- אין לשנות משמעות.
- אין להוסיף מידע.
- אין להסיר מידע.
- אין לנסח מחדש.
- אין לסכם.
- אין לשנות גוף, זמן או נקודת מבט.
- שמור על מבנה המשפטים והזרימה המקורית ככל האפשר.
- שמור במדויק על שמות פרטיים, שמות חברות, מוסדות ומונחים מקצועיים.
- אם מופיע טקסט באנגלית שאין לתרגם (כגון שמות), השאר אותו כפי שהוא.
-תשים לב לזכר ונקבה , תכתוב בניסוח נכון.
פלט:
- החזר תרגום בלבד.
- ללא הסברים, הערות או טקסט נוסף.
`.trim();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: englishText }
    ],
    temperature: 0.2,
    max_tokens: TRANSLATION_MAX_TOKENS
  });

  const text = extractText(completion?.choices?.[0]);
  return text && text.trim() ? text.trim() : null;
}

/* --------- NEW: Name translation (separate fields) --------- */

// Arabic (or any) -> English name (transliteration/translation). Returns ONLY the name.
async function translateNameToEnglish(nameText) {
  const systemMessage = `
You transliterate/translate personal names into English.

Rules:
- Output ONLY the name (no extra words).
- Do not add titles or explanations.
- Keep the same order of name parts.
- If the name is already in Latin letters, return it as-is.
`.trim();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: nameText }
    ],
    temperature: 0,
    max_tokens: NAME_TRANSLATION_MAX_TOKENS
  });

  const text = extractText(completion?.choices?.[0]);
  return text && text.trim() ? text.trim() : null;
}

// Arabic (or any) -> Hebrew name (transliteration/translation). Returns ONLY the name.
async function translateNameToHebrew(nameText) {
  const systemMessage = `
אתה מתמחה בתעתיק/תרגום שמות לעברית.

כללים:
- החזר/י שם בלבד (ללא משפטים, ללא תוספות).
- אין להוסיף תארים/כינויים/מקצוע.
- שמור/י על סדר רכיבי השם כפי שמופיע במקור.
- אם השם כבר בעברית, החזר/י אותו כפי שהוא.
`.trim();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: nameText }
    ],
    temperature: 0,
    max_tokens: NAME_TRANSLATION_MAX_TOKENS
  });

  const text = extractText(completion?.choices?.[0]);
  return text && text.trim() ? text.trim() : null;
}

/* ------------------ Similarity Helpers ------------------ */

// Maps internal field keys to user-friendly labels
function normalizeFieldLabel(field) {
  const map = {
    jobTitle: 'Job Title',
    academic: 'Academic Resume',
    professional: 'Professional Resume',
    personal: 'Personal Resume'
  };
  return map[field] || field;
}

const crossFieldPairs = [
  ["academic", "personal"],
  ["academic", "professional"],
  ["professional", "personal"],
  ["jobTitle", "professional"]
];

function computeCrossFieldSimilarities(aEmb, bEmb) {
  return crossFieldPairs
    .map(([from, to]) => {
      const v1 = aEmb[`${from}_emb`];
      const v2 = bEmb[`${to}_emb`];

      if (!v1 || !v2 || v1.length === 0 || v2.length === 0) return null;

      return {
        from,
        to,
        score: cosineSimilarity(v1, v2)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

/* ------------------ Explanation ------------------ */

// Generates and caches an explanation for why two participants are a good match
async function explainPair(targetId, matchId) {
  const key = cacheKey(targetId, matchId);
  const cache = readCache();
  if (cache[key]) return cache[key];

  const [embRows, textRows] = await Promise.all([
    loadFieldEmbeddings(),
    loadParticipantTexts()
  ]);

  const aEmb = embRows.find(p => p.id === targetId);
  const bEmb = embRows.find(p => p.id === matchId);
  if (!aEmb || !bEmb) {
    throw new Error('One or both participants not found in field_embeddings.csv');
  }

  const aText = textRows.find(p => p.id === targetId);
  const bText = textRows.find(p => p.id === matchId);
  if (!aText || !bText) {
    throw new Error('One or both participants not found in participants.csv (by row order id)');
  }

  const fieldScores = {
    jobTitle: cosineSimilarity(aEmb.jobTitle_emb, bEmb.jobTitle_emb),
    academic: cosineSimilarity(aEmb.academic_emb, bEmb.academic_emb),
    professional: cosineSimilarity(aEmb.professional_emb, bEmb.professional_emb),
    personal: cosineSimilarity(aEmb.personal_emb, bEmb.personal_emb),
  };

  const ranked = Object.entries(fieldScores)
    .sort((x, y) => y[1] - x[1])
    .map(([field, score]) => ({ field, score }));

  const bestField = ranked[0].field;
  const aVal = (aText[bestField] || "").trim();
  const bVal = (bText[bestField] || "").trim();

  const topFields = ranked.slice(0, 2);

  const reasons = topFields.map(r => ({
    field: r.field,
    fieldLabel: normalizeFieldLabel(r.field),
    score: r.score,
    aText: (aText[r.field] || '').trim(),
    bText: (bText[r.field] || '').trim(),
  }));

  const crossField = computeCrossFieldSimilarities(aEmb, bEmb);
  const topCross = crossField.slice(0, 1);

  // System message (Arabic-only explanation)
  const systemMessage = `
أنت تكتب شرحًا موجّهًا مباشرة إلى المستخدم نفسه.

لغة الإخراج:
- العربية فقط.
- ممنوع تمامًا استخدام أي كلمة إنجليزية أو حروف لاتينية.
- إذا ظهرت أي كلمة غير عربية، فالنتيجة خاطئة.

طريقة الكتابة (إلزامية):
- خاطب المستخدم بصيغة المخاطَب فقط: "أنت"، "لك"، "معك".
- لا تذكر اسم المستخدم نهائيًا.
- يُسمح بذكر اسم الشخص الآخر فقط.
- اكتب وكأنك تشرح للمستخدم لماذا هذا الشخص مناسب له شخصيًا.

قواعد صارمة جدًا:
- اكتب 2–3 جمل فقط.
- كل جملة يجب أن تشرح نقطة واحدة مشتركة أو مكمّلة بينك وبين الشخص الآخر.
- ممنوع وصف كل شخص لوحده.
- ممنوع ذكر معلومات غير مشتركة.
- ممنوع استخدام صيغ مثل:
  "فلان وفلان"، "كلاكما"، "الطرفين"، "الشخصين".
- ممنوع استخدام لغة عامة أو إنشائية.

إذا لم تستطع الالتزام بجميع القواعد،
اكتب فقط: "لا يوجد تشابه واضح يمكن شرحه."
`.trim();

  const prompt = `
المشارك المقترح:
${bText.name}

المجال المشترك:
${normalizeFieldLabel(bestField)}

معلوماتك:
${aVal}

معلومات المشارك المقترح:
${bVal}

اكتب الشرح وفق التعليمات أعلاه.
`.trim();

  // LLM call for Arabic explanation
  let llmExplanation = await callLLM(systemMessage, prompt, EXPLANATION_MAX_TOKENS);

  // Translations
  let llmExplanation_en = null;
  let llmExplanation_he = null;

  if (llmExplanation) {
    llmExplanation_en = await translateToEnglish(llmExplanation);
    if (llmExplanation_en) {
      llmExplanation_he = await translateToHebrew(llmExplanation_en);
    }
  }

  // NEW: Name translations (separate fields)
  const rawMatchName = (bText.name || '').trim();
  let match_name_en = null;
  let match_name_he = null;

  if (rawMatchName) {
    match_name_en = await translateNameToEnglish(rawMatchName);
    match_name_he = await translateNameToHebrew(rawMatchName);
  }

  console.log("LLM FINAL (AR):", llmExplanation);

  if (!llmExplanation) {
    console.warn("LLM returned EMPTY output for", targetId, matchId);
    llmExplanation = null;
  }

  const result = {
    target: { id: aEmb.id, name: aEmb.name },
    match: { id: bEmb.id, name: bEmb.name },
    fieldScores,
    rankedFields: ranked,
    reasons,
    explanation: {
      ar: llmExplanation,
      en: llmExplanation_en,
      he: llmExplanation_he
    },
    // NEW: translated match name returned separately
    match_name: {
      original: rawMatchName || null,
      en: match_name_en,
      he: match_name_he
    }
  };

  cache[key] = result;
  writeCache(cache);

  return result;
}

// Export explanation function for use in API routes
module.exports = { explainPair };
