require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");
/* ------------------ COSMOS ------------------ */

// const client = new CosmosClient({
//   endpoint: process.env.COSMOS_ENDPOINT,
//   key: process.env.COSMOS_KEY,
// });

// const database = client.database("harmony-db");
// const container = database.container("participants");

// async function loadParticipants() {
//   const query = { query: "SELECT * FROM c" };
//   const { resources } = await container.items.query(query).fetchAll();
//   return resources;
// }



// Computes cosine similarity between two numeric vectors
function cosineSimilarity(a, b) {
  if (!a.length || !b.length) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ------------------ LLM ------------------ */

const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

function extractText(choice) {
  return (
    choice?.message?.content ??
    choice?.delta?.content ??
    null
  );
}

async function callLLM(systemMessage, prompt, maxTokens = 2000) {
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

  return text
    ? text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
    : null;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error("JSON parse failed - message:", err.message);
    console.error("JSON parse failed - raw text:", text);
    console.error("JSON parse failed - raw as json:", JSON.stringify(text));
    return null;
  }
}

/* ------------------ Helpers ------------------ */

function normalizeReasonLabel(field) {
  const map = {
    jobTitle: 'Job Title',
    academic: 'Academic Resume',
    professional: 'Professional Resume',
    personal: 'Personal Resume'
  };
  return map[field] || field;
}

function getFieldText(person, field) {
  const map = {
    jobTitle: person.jobTitle || "",
    academic: person.academicResume || "",
    professional: person.professionalResume || "",
    personal: person.personalResume || "",
  };

  return (map[field] || "").trim();
}

/* ------------------ MAIN ------------------ */

async function explainMatches(participant, matches) {
  if (!participant) throw new Error("Participant not provided");
  if (!Array.isArray(matches)) throw new Error("Matches must be an array");

  const results = [];

  for (const match of matches) {
    if (!match) continue;

    const fieldScores = {
      jobTitle_to_jobTitle: cosineSimilarity(participant.job_embedding || [], match.job_embedding || []),
      academic_to_academic: cosineSimilarity(participant.academic_embedding || [], match.academic_embedding || []),
      professional_to_professional: cosineSimilarity(participant.professional_embedding || [], match.professional_embedding || []),
      personal_to_personal: cosineSimilarity(participant.personal_embedding || [], match.personal_embedding || []),

      academic_to_professional: cosineSimilarity(participant.academic_embedding || [], match.professional_embedding || []),
      academic_to_personal: cosineSimilarity(participant.academic_embedding || [], match.personal_embedding || []),

      professional_to_academic: cosineSimilarity(participant.professional_embedding || [], match.academic_embedding || []),
      professional_to_personal: cosineSimilarity(participant.professional_embedding || [], match.personal_embedding || []),

      personal_to_academic: cosineSimilarity(participant.personal_embedding || [], match.academic_embedding || []),
      personal_to_professional: cosineSimilarity(participant.personal_embedding || [], match.professional_embedding || []),
    };

    const ranked = Object.entries(fieldScores)
      .map(([fieldPair, score]) => {
        const [fromField, toField] = fieldPair.split("_to_");

        return {
          fromField,
          toField,
          score,
          participantText: getFieldText(participant, fromField),
          matchText: getFieldText(match, toField),
        };
      })
      .sort((a, b) => b.score - a.score);

    const topReasons = ranked.slice(0, 2);
    const primaryReason = topReasons[0];
    const secondaryReason = topReasons[1];

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

إخراج إضافي (مهم جدًا):
- بعد كتابة الشرح بالعربية، قم بإرجاع نفس الشرح مترجمًا إلى:
  - الإنجليزية (en)
  - العبرية (he)
- أرجع النتيجة بصيغة JSON فقط بالشكل التالي:

{
  "explanation": {
    "ar": "...",
    "en": "...",
    "he": "..."
  },
  "target_name": {
    "ar": "...",
    "en": "...",
    "he": "..."
  },
  "match_name": {
    "ar": "...",
    "en": "...",
    "he": ".
}

- ممنوع كتابة أي نص خارج JSON
`.trim();

    const prompt = `
المشارك المقترح:
${match.name || ""}

السبب الأقوى:
- المجال عندك: ${normalizeReasonLabel(primaryReason?.fromField || "")}
- المجال عند المشارك المقترح: ${normalizeReasonLabel(primaryReason?.toField || "")}
- معلوماتك: ${primaryReason?.participantText || ""}
- معلومات المشارك المقترح: ${primaryReason?.matchText || ""}


اسم المشارك الأساسي الذي يجب إرجاعه أيضًا داخل target_name.original:
${participant.name || ""}

اسم المشارك المقترح الذي يجب إرجاعه أيضًا داخل match_name.original:
${match.name || ""}

اكتب الشرح وفق التعليمات أعلاه.
`.trim();

const llmRaw = await callLLM(systemMessage, prompt, 5000);

// console.log("llmRaw type:", typeof llmRaw);
// console.log("llmRaw:", llmRaw);
// console.log("llmRaw as json:", JSON.stringify(llmRaw));

const parsed = llmRaw ? safeJsonParse(llmRaw) : null;

const explanation = parsed?.explanation
  ? {
      ar: parsed.explanation.ar || null,
      en: parsed.explanation.en || null,
      he: parsed.explanation.he || null,
    }
  : {
      ar: null,
      en: null,
      he: null,
    };

const targetName = parsed?.target_name
  ? {
      ar: parsed.target_name.original || participant.name || null,
      en: parsed.target_name.en || null,
      he: parsed.target_name.he || null,
    }
  : {
      ar: participant.name || null,
      en: null,
      he: null,
    };

const matchName = parsed?.match_name
  ? {
      ar: parsed.match_name.original || match.name || null,
      en: parsed.match_name.en || null,
      he: parsed.match_name.he || null,
    }
  : {
      ar: match.name || null,
      en: null,
      he: null,
    };

  results.push({
    matchId: match.id,
    score: typeof match.score === "number" ? match.score : (primaryReason?.score ?? null),
    explanation,
    target_name: targetName,
    match_name: matchName,
  });
  }

  return results;
}

// Export explanation function for use in API routes
module.exports = { explainMatches };

