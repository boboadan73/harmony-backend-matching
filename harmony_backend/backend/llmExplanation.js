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
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
function extractText(choice) {
  return (
    choice?.message?.content ??
    choice?.delta?.content ??
    null
  );
}async function callLLM(systemMessage, prompt, maxTokens) {
  try {
  console.log("🚀 Sending request...");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: prompt }
    ],
    max_tokens: maxTokens,
  
  }, );

  console.log("✅ Response received!");

  const text = extractText(completion?.choices?.[0]);

  return text
    ? text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
    : null;

} catch (err) {
  console.error("❌ ERROR:", err.message);
  return null;
}}
 

// const Groq = require("groq-sdk");

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY
// });


// async function callLLM(systemMessage, prompt, maxTokens = 2000) {
//   const completion = await groq.chat.completions.create({
//     model: "llama-3.3-70b-versatile",
//     messages: [
//       { role: "system", content: systemMessage },
//       { role: "user", content: prompt }
//     ],
//     temperature: 0.3,
//     max_tokens: maxTokens
//   });

//   const text = extractText(completion?.choices?.[0]);

//   return text
//     ? text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
//     : null;
// }

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    try {
      // 🔥 ניסיון שני (JSON בתוך string)
      return JSON.parse(JSON.parse(text));
    } catch (err) {
      console.error("JSON parse failed:", err.message);
      return null;
    }
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
- استخدم تفاصيل حقيقية من النص (مثل: مكان العمل، اسم شركة، مجال دقيق، نوع خبرة).
- إذا كان هناك نفس المجال (مثل الطب، القانون، الهندسة)، وضّح الفرق أو التكامل:
  (مثال: أنت تدرس الطب وهو يعمل في شركة طبية، أو أنت تركز على الجانب الأكاديمي وهو يعمل في التطبيق العملي).
- اربط بينكما بطريقة تُظهر كيف يمكن أن تستفيد منه أو تتعاون معه.
- تجنب العبارات العامة مثل "تشتركان في نفس المجال" بدون تفاصيل.
- اجعل كل جملة تحمل قيمة حقيقية ومعلومة ملموسة.
مثال (مهم جدًا):

المعطيات:
- أنت تدرس الطب وتهتم بالبحث الأكاديمي.
- الشخص الآخر يعمل في شركة طبية ويملك خبرة عملية في المجال.

الإخراج المطلوب:

{
  "explanation": "أنت تدرس الطب وتركز على الجانب الأكاديمي، بينما يعمل هذا الشخص في شركة طبية، مما يمنحك فرصة لفهم التطبيق العملي لما تتعلمه. خبرته المهنية يمكن أن تساعدك على ربط المعرفة النظرية بالتجربة الواقعية وتوسيع فهمك للمجال."
}

التزم بنفس الأسلوب، نفس مستوى التفاصيل، ونفس العمق.

- أرجع النتيجة بصيغة JSON فقط بالشكل التالي:
- يجب ترجمة/تحويل الاسم إلى الإنجليزية والعبرية بشكل صحيح.
- لا يجوز ترك الاسم كما هو في جميع اللغات.
- إذا كان الاسم عربي، قم بتحويله إلى:
  - الإنجليزية (حروف لاتينية)
  - العبرية (حروف عبرية)

{
  "explanation": "...",
  "target_name": {
    "ar": "...",
    "en": "...",
    "he": "..."
  },
  "match_name": {
    "ar": "...",
    "en": "...",
    "he": "..."
  },
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


السبب الثانوي:
- المجال عندك: ${normalizeReasonLabel(secondaryReason?.fromField || "")}
- المجال عند المشارك المقترح: ${normalizeReasonLabel(secondaryReason?.toField || "")}
- معلوماتك: ${secondaryReason?.participantText || ""}
- معلومات المشارك المقترح: ${secondaryReason?.matchText || ""}



اسم المشارك الأساسي الذي يجب إرجاعه أيضًا داخل target_name.original:
${participant.name || ""}

اسم المشارك المقترح الذي يجب إرجاعه أيضًا داخل match_name.original:
${match.name || ""}

اكتب الشرح وفق التعليمات أعلاه.
`.trim();


const llmRaw = await callLLM(systemMessage, prompt, 200);
const parsed = llmRaw ? safeJsonParse(llmRaw) : null;
console.log("RAW:", llmRaw);
console.log("PARSED:", parsed);

let arabicExplanation = parsed?.explanation || null;


// 🔥 fallback
if (!arabicExplanation) {
  arabicExplanation = llmRaw;
}


const targetName = parsed?.target_name || {
      ar: participant.name,
      en: participant.name,
      he: participant.name,
    };

const matchName = parsed?.match_name || {
      ar: match.name,
      en: match.name,
      he: match.name,
    };

let englishExplanation = null;
let hebrewExplanation = null;

if (arabicExplanation) {
      [englishExplanation, hebrewExplanation] = await Promise.all([
        translateToEnglish(arabicExplanation),
        translateToHebrew(arabicExplanation)
      ]);
    }

    const explanation = {
      ar: arabicExplanation,
      en: englishExplanation,
      he: hebrewExplanation,
    };
     results.push({
      matchId: match.id,
      score: primaryReason?.score ?? null,
      explanation,
      target_name: targetName,
      match_name: matchName,
    });
    }

  return results;
}


//--------------------------translations--------------------------

async function translateToEnglish(text) {
const systemMessage = `
You are a professional translator from Arabic to English.

Rules:
- Translate the text accurately into natural English
- Preserve the original meaning
- Do not add or remove information
- Keep names, organizations, and technical terms exactly as they appear
- Do not explain anything

Output:
- Return ONLY the English translation
- No extra text
`.trim();

 try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 150
    });

    const result = extractText(completion?.choices?.[0]); // ✅ שינוי שם

    return result
      ? result.replace(/\n+/g, " ").trim()
      : null;

  } catch (err) {
    console.error("❌ English translation error:", err.message);
    return text;
  }
}

async function translateToHebrew(text) {
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
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 150
    });

    const result = extractText(completion?.choices?.[0]); // ✅ שינוי שם

    return result
      ? result.replace(/\n+/g, " ").trim()
      : null;

  } catch (err) {
    console.error("❌ Translation error:", err.message);
    return text;
  }


}


// Export explanation function for use in API routes
module.exports = { explainMatches };
