const fs = require('fs');                // File system module for reading and writing files
const csv = require('csv-parser');       // CSV parser for streaming CSV rows
require("dotenv").config();

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

/**
 * Sends a prompt to an LLM and returns a short textual explanation.
 */
async function callLLM(systemMessage, prompt) {
    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: systemMessage
            },
            {
                role: "user",
                content: prompt
            }
        ],
        temperature: 0.7,
        max_tokens: 180
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

async function translateToEnglish(arabicText) {
    if (!arabicText) return null;

    const systemMessage = `
You are a professional translator.
Translate the Arabic text into clear, natural English.

Rules:
- Translation only.
- Do not add information.
- Do not remove information.
- Do not explain.
- Keep names as they are if needed.
- Return only the translated text.
`.trim();

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: arabicText }
        ],
        temperature: 0.2,
        max_tokens: 300
    });

    const text = extractText(completion?.choices?.[0]);
    return text ? text.trim() : null;
}

async function translateToHebrew(englishText) {
    if (!englishText) return null;

    const systemMessage = `
אתה מתרגם מקצועי.
תרגם את הטקסט מאנגלית לעברית.

כללים:
- תרגום בלבד.
- אין להוסיף מידע.
- אין להסיר מידע.
- אין להסביר.
- שמור על שמות כפי שהם אם צריך.
- החזר רק את התרגום.
`.trim();

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: englishText }
        ],
        temperature: 0.2,
        max_tokens: 300
    });

    const text = extractText(completion?.choices?.[0]);
    return text ? text.trim() : null;
}

async function translateNameToEnglish(nameText) {
    if (!nameText) return null;

    const systemMessage = `
You transliterate or translate personal names into English.

Rules:
- Return only the name.
- No explanations.
- No extra words.
- Keep the same order of the name parts.
`.trim();

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: nameText }
        ],
        temperature: 0,
        max_tokens: 40
    });

    const text = extractText(completion?.choices?.[0]);
    return text ? text.trim() : null;
}

async function translateNameToHebrew(nameText) {
    if (!nameText) return null;

    const systemMessage = `
אתה מתרגם או מתעתק שמות לעברית.

כללים:
- החזר שם בלבד.
- ללא הסברים.
- ללא תוספות.
- שמור על סדר חלקי השם.
`.trim();

    const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: nameText }
        ],
        temperature: 0,
        max_tokens: 40
    });

    const text = extractText(completion?.choices?.[0]);
    return text ? text.trim() : null;
}

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

    let llmExplanation = await callLLM(systemMessage, prompt);
    console.log("LLM FINAL:", llmExplanation);

    if (!llmExplanation) {
        console.warn("LLM returned EMPTY output for", targetId, matchId);
        llmExplanation = null;
    }

    let llmExplanation_en = null;
    let llmExplanation_he = null;

    if (llmExplanation) {
        llmExplanation_en = await translateToEnglish(llmExplanation);

        if (!llmExplanation_en) {
            llmExplanation_en = llmExplanation;
        }

        llmExplanation_he = await translateToHebrew(llmExplanation_en);

        if (!llmExplanation_he) {
            llmExplanation_he = llmExplanation_en;
        }
    }

    const rawMatchName = (bText.name || '').trim();
    let match_name_en = null;
    let match_name_he = null;

    if (rawMatchName) {
        match_name_en = await translateNameToEnglish(rawMatchName);
        match_name_he = await translateNameToHebrew(rawMatchName);

        if (!match_name_en) {
            match_name_en = rawMatchName;
        }

        if (!match_name_he) {
            match_name_he = rawMatchName;
        }
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
