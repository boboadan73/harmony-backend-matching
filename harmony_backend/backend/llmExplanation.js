require("dotenv").config();
const fs = require("fs");
const { CosmosClient } = require("@azure/cosmos");

/* ------------------ COSMOS ------------------ */

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("participants");

async function loadParticipants() {
  const query = { query: "SELECT * FROM c" };
  const { resources } = await container.items.query(query).fetchAll();
  return resources;
}
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
const EXPLANATION_MAX_TOKENS = 120;
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

async function explainPair(targetId, matchId) {
  const key = cacheKey(targetId, matchId);
  const cache = readCache();
  if (cache[key]) return cache[key];

  // ✅ Load from Cosmos
  const participants = await loadParticipants();

  // ✅ IMPORTANT: Cosmos IDs are "p401"
  const a = participants.find(p => p.id === `p${targetId}`);
  const b = participants.find(p => p.id === `p${matchId}`);

  if (!a || !b) {
    throw new Error("Participants not found in Cosmos");
  }

  // ✅ Use embeddings from Cosmos (NOT CSV)
  const fieldScores = {
    jobTitle: cosineSimilarity(a.job_embedding || [], b.job_embedding || []),
    academic: cosineSimilarity(a.academic_embedding || [], b.academic_embedding || []),
    professional: cosineSimilarity(a.professional_embedding || [], b.professional_embedding || []),
    personal: cosineSimilarity(a.personal_embedding || [], b.personal_embedding || []),
  };

  // Rank fields
  const ranked = Object.entries(fieldScores)
    .sort((x, y) => y[1] - x[1])
    .map(([field, score]) => ({ field, score }));

  const bestField = ranked[0].field;

  function getFieldText(p, field) {
  const map = {
    jobTitle: p["Job Title"],
    academic: p["Academic Resume"],
    professional: p["Professional Resume"],
    personal: p["Personal Resume"]
  };
  return (map[field] || "").trim();
}
  // ✅ Use TEXT directly from Cosmos
 const aVal = getFieldText(a, bestField);
const bVal = getFieldText(b, bestField);

  const topFields = ranked.slice(0, 2);

  const reasons = topFields.map(r => ({
  field: r.field,
  fieldLabel: normalizeFieldLabel(r.field),
  score: r.score,
  aText: getFieldText(a, r.field),
  bText: getFieldText(b, r.field),
}));

  // ✅ Cross-field similarity
  const crossField = computeCrossFieldSimilarities(
    {
      jobTitle_emb: a.job_embedding,
      academic_emb: a.academic_embedding,
      professional_emb: a.professional_embedding,
      personal_emb: a.personal_embedding,
    },
    {
      jobTitle_emb: b.job_embedding,
      academic_emb: b.academic_embedding,
      professional_emb: b.professional_embedding,
      personal_emb: b.personal_embedding,
    }
  );

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
${b.name}

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
  const rawMatchName = (b.name || '').trim();
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
    target: { id: a.id, name: a.name },
    match: { id: b.id, name: b.name },
    fieldScores,
    rankedFields: ranked,
    reasons,
    explanation: {
      ar: llmExplanation,
      en: llmExplanation_en,
      he: llmExplanation_he
    },
    match_name: {
      original: rawMatchName,
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

