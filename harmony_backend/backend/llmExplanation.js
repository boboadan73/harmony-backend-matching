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

const clientTranslatorName = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const clientTranslatorHe = new OpenAI({
  apiKey: process.env.OPENAI_API_NEW_KEY,
});

const clientExplanation = new OpenAI({
  apiKey: process.env.OPENAI_API_ADAN_KEY,
});

const clientTranslatorEN = new OpenAI({
  apiKey: process.env.OPENAI_API_LENA_KEY,
});





function extractText(choice) {
  return (
    choice?.message?.content ??
    choice?.delta?.content ??
    null
  );
}

async function callLLM(systemMessage, prompt, maxTokens) {
  try {
  console.log("🚀 Sending request...");

  const completion = await clientExplanation.chat.completions.create({
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

// function delayed(fn, ms) {
//   return new Promise(resolve =>
//     setTimeout(async () => resolve(await fn()), ms)
//   );
// }


/* ------------------ MAIN ------------------ */

async function explainMatches(participant, matches) {
if (!participant) throw new Error("Participant not provided");
if (!Array.isArray(matches)) throw new Error("Matches must be an array");

const results = [];

for (const match of matches) {
  if (!match) continue;

  const fieldScores = {
  // same-to-same
  // jobTitle_to_jobTitle: cosineSimilarity(participant.job_embedding || [], match.job_embedding || []),
  // academic_to_academic: cosineSimilarity(participant.academic_embedding || [], match.academic_embedding || []),
  professional_to_professional: cosineSimilarity(participant.professional_embedding || [], match.professional_embedding || []),
  personal_to_personal: cosineSimilarity(participant.personal_embedding || [], match.personal_embedding || []),

  // // participant jobTitle -> match fields
  // jobTitle_to_academic: cosineSimilarity(participant.job_embedding || [], match.academic_embedding || []),
  // jobTitle_to_professional: cosineSimilarity(participant.job_embedding || [], match.professional_embedding || []),
  // jobTitle_to_personal: cosineSimilarity(participant.job_embedding || [], match.personal_embedding || []),

  // // participant fields -> match jobTitle
  // academic_to_jobTitle: cosineSimilarity(participant.academic_embedding || [], match.job_embedding || []),
  // professional_to_jobTitle: cosineSimilarity(participant.professional_embedding || [], match.job_embedding || []),
  // personal_to_jobTitle: cosineSimilarity(participant.personal_embedding || [], match.job_embedding || []),

  // existing cross-field
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

const SECOND_REASON_THRESHOLD = 0.60;
const topReasons = ranked.slice(0, 2);
const primaryReason = topReasons[0];
const secondaryReason =
  topReasons[1] && topReasons[1].score >= SECOND_REASON_THRESHOLD
    ? topReasons[1]
    : null;
const reasonsCount = secondaryReason ? 2 : 1;

console.log("Reasons sent to LLM:", reasonsCount);
console.log("Reasons summary:", [
  {
    type: "primary",
    pair: `${primaryReason?.fromField}_to_${primaryReason?.toField}`,
    score: primaryReason?.score ?? null
  },
  ...(secondaryReason
    ? [{
        type: "secondary",
        pair: `${secondaryReason?.fromField}_to_${secondaryReason?.toField}`,
        score: secondaryReason?.score ?? null
      }]
    : [])
]);

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
-اكتب الشرح في نقطتين.
- النقطة الأولى: اذكر أوضح تفصيل مهني أو أكاديمي عن الشخص المقترح كحد اقصى 25كلمة.
- النقطة الثانية: اذكر تفصيلًا إضافيًا عن خبرته، مشروعه، تخصصه، أو بيئة عمله كحد أقصى 25كلمة.
- ركّز في تفسير الملاءمة على معلومات المشارك المقترح.
-مثال : تعمل في قسم العناية المكثفة في مستشفى إيخيلوف، ولديها خبرة مباشرة في التعامل مع الحالات الحرجة داخل بيئة سريرية مكثفة ,تحمل ماجستير في إدارة الأنظمة الصحية، إلى جانب خبرة في تنسيق العمل بين الطواقم الطبية وإدارة الحالات المعقدة.
- لا تكتب عبارات عامة مثل "خلفية قوية" أو "خبرة مميزة" .
- لا تذكر صفات عامة مثل: شغف، طموح، مميز، قويته، ناجح، خبير، متمكن، متفوق.
- ممنوع الادعاء بوجود خبرة أو معرفة مشتركة إذا لم تكن موجودة صراحة في البيانات.
- ممنوع استخدام صيغ مثل: "فلان وفلان"، "كلاكما"، "الطرفين"، "الشخصين".
- ممنوع استخدام لغة عامة أو إنشائية.
- ممنوع استخدام عبارات غير طبيعية أو حرفية مثل: أنت تعملين كطالبة، تتقاسم الاهتمام، لديكما نفس المجال، تجمع بينكما.
- ممنوع ذكر أسماء الحقول أو وصفها بصيغة تقنية، مثل: السيرة الأكاديمية، السيرة المهنية، السيرة الشخصية، المسمى الوظيفي.
- ممنوع الإشارة إلى النصوص بصياغات مثل: بحسب سيرتك، في ملفه، في المجال عندك، في المجال عنده.
-  "معلوماتك" لا تبنِ الشرح على إنجازات أو خبرات أو تفاصيل تخص المستخدم نفسه.
- ممنوع كتابة أي نص خارج الشرح المطلوب.
`.trim();

const prompt = `
المشارك المقترح:
${match.name || ""}

السبب الأقوى:
- المجال عندك: ${normalizeReasonLabel(primaryReason?.fromField || "")}
- المجال عند المشارك المقترح: ${normalizeReasonLabel(primaryReason?.toField || "")}
- معلوماتك: ${primaryReason?.participantText || ""}
- معلومات المشارك المقترح: ${primaryReason?.matchText || ""}

${
  secondaryReason
    ? `السبب الثانوي:
- المجال عندك: ${normalizeReasonLabel(secondaryReason?.fromField || "")}
- المجال عند المشارك المقترح: ${normalizeReasonLabel(secondaryReason?.toField || "")}
- معلوماتك: ${secondaryReason?.participantText || ""}
- معلومات المشارك المقترح: ${secondaryReason?.matchText || ""}`
    : ""
}

اسم المشارك الأساسي الذي يجب إرجاعه أيضًا داخل target_name.original:
${participant.name || ""}

اسم المشارك المقترح الذي يجب إرجاعه أيضًا داخل match_name.original:
${match.name || ""}

اكتب الشرح وفق التعليمات أعلاه.
`.trim();


// LLM call for Arabic explanation
let llmExplanation = await callLLM(systemMessage, prompt, 500);
// await new Promise(r => setTimeout(r, 300));

  // Translations
let llmExplanation_en = null;
let llmExplanation_he = null;

if (llmExplanation) {
   [llmExplanation_en, llmExplanation_he] = await Promise.all([
    translateToEnglish(llmExplanation),
    translateToHebrew(llmExplanation),
  ]);
}

  // NEW: Name translations (separate fields)
const rawMatchName = (match.name || '').trim();
let match_name_en = null;
let match_name_he = null;

// if (rawMatchName) {
//   match_name_en = await translateNameToEnglish(rawMatchName);
//   await new Promise(r => setTimeout(r, 300));

//   match_name_he = await translateNameToHebrew(rawMatchName);
// }

if (rawMatchName) {
  [match_name_en, match_name_he] = await Promise.all([
    translateNameToEnglish(rawMatchName),
    translateNameToHebrew(rawMatchName),
  ]);
}

console.log("LLM FINAL (AR):", llmExplanation);

if (!llmExplanation) {
    console.warn("LLM returned EMPTY output for", participant.id, match.id);
    llmExplanation = null;
  }

results.push({
    matchId: match.id,
    score: match.score ?? null,
    explanation: {
      ar: llmExplanation,
      en: llmExplanation_en,
      he: llmExplanation_he
    },
    match_name: {
      ar: rawMatchName || null,
      en: match_name_en,
      he: match_name_he
    },
    imageUrl: match.photoUrl || null
});

  
}
return results;
}


//--------------------------translations--------------------------

async function translateNameToHebrew(nameText) {
  const systemMessage = `
אתה מתמחה בתעתיק/תרגום שמות לעברית.

כללים:
- החזר/י שם בלבד (ללא משפטים, ללא תוספות).
- אין להוסיף תארים/כינויים/מקצוע.
- שמור/י על סדר רכיבי השם כפי שמופיע במקור.
- אם השם כבר בעברית, החזר/י אותו כפי שהוא.
`.trim();

  try {
    const completion = await clientTranslatorName.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: nameText }
      ],
      temperature: 0,
      max_tokens: 30
    });

    const text = extractText(completion?.choices?.[0]);

    return text && text.trim() ? text.trim() : null;

  } catch (err) {
    console.error("❌ Name translation error:", err.message);
    return nameText; // fallback
  }
}

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

  const completion = await clientTranslatorName.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: nameText }
    ],
    temperature: 0,
    max_tokens: 30
  });

  const text = extractText(completion?.choices?.[0]);
  return text && text.trim() ? text.trim() : null;
}

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
    const completion = await clientTranslatorEN.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 700
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
    const completion = await clientTranslatorHe.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 700
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
