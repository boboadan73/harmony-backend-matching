require("dotenv").config();

const { CosmosClient } = require("@azure/cosmos");
const OpenAI = require("openai");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("eventParticipants");

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRANSLATION_BATCH_SIZE = 10;
const TRANSLATION_BATCH_DELAY_MS = 300;

function getJobTitle(participant) {
  return cleanText(
    participant.jobTitle ||
    participant.job ||
    participant.rawData?.jobTitle ||
    participant.rawData?.JobTitle ||
    participant.rawData?.["Job Title"] ||
    ""
  );
}

function needsTranslation(participant) {
  const name = cleanText(participant.name);
  const jobTitle = getJobTitle(participant);

  const translated = participant.translated || {};

  const nameNeedsUpdate =
    name &&
    (
      !translated.name ||
      translated.name.original !== name ||
      !translated.name.ar ||
      !translated.name.en ||
      !translated.name.he
    );

  const jobTitleNeedsUpdate =
    jobTitle &&
    (
      !translated.jobTitle ||
      translated.jobTitle.original !== jobTitle ||
      !translated.jobTitle.ar ||
      !translated.jobTitle.en ||
      !translated.jobTitle.he
    );

  return nameNeedsUpdate || jobTitleNeedsUpdate;
}

async function translateParticipantFields(participant) {
  const name = cleanText(participant.name);
  const jobTitle = getJobTitle(participant);

  const systemMessage = `
You translate/transliterate participant display fields into Arabic, English, and Hebrew.

You will receive:
- name: a personal name
- jobTitle: a professional title

Very important rules for personal names:
- Personal names must be transliterated phonetically, not translated by meaning.
- Never shorten a name.
- Never simplify a name into a common word.
- Never remove vowels or important sounds.
- Preserve the order of name parts exactly.
- Do not add titles, jobs, nicknames, prefixes, or explanations.
- If the name is already written in the target language, return it as-is.
- If the original name is written in Latin letters, keep name.en exactly as the original input.
- If the original name is written in Arabic, keep name.ar exactly as the original input.
- If the original name is written in Hebrew, keep name.he exactly as the original input.
- For Hebrew transliteration, write the name according to pronunciation, not meaning.
- Example: "SARRE" should be transliterated to Hebrew as "שארי", not "שר".
- Example: "Maram Wattad" should be transliterated to Hebrew as "מראם ותד", not translated.
- Example: "عازر غنطوس" should be transliterated to English as "Azar Gantus", not changed by meaning.

Rules for jobTitle:
- Translate jobTitle naturally into Arabic, English, and Hebrew.
- Job titles may be translated by meaning.
- Keep job titles short and professional.

Return JSON only.
Do not add explanations.
Do not add any text outside the JSON.

Required JSON structure:
{
  "name": {
    "original": "original name",
    "ar": "Arabic name",
    "en": "English name",
    "he": "Hebrew name"
  },
  "jobTitle": {
    "original": "original job title",
    "ar": "Arabic job title",
    "en": "English job title",
    "he": "Hebrew job title"
  }
}
`.trim();

  const payload = {
    name,
    jobTitle,
  };

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0,
      max_tokens: 220,
      response_format: { type: "json_object" },
    });

    const text = completion?.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("Empty translation response");
    }

    const parsed = JSON.parse(text);

    return {
      name: {
        original: name || null,
        ar: cleanText(parsed?.name?.ar) || name || null,
        en: cleanText(parsed?.name?.en) || name || null,
        he: cleanText(parsed?.name?.he) || name || null,
      },
      jobTitle: {
        original: jobTitle || null,
        ar: cleanText(parsed?.jobTitle?.ar) || jobTitle || null,
        en: cleanText(parsed?.jobTitle?.en) || jobTitle || null,
        he: cleanText(parsed?.jobTitle?.he) || jobTitle || null,
      },
    };
  } catch (err) {
    console.error(`Translation failed for participant ${participant.id}:`, err.message);

    return {
      name: {
        original: name || null,
        ar: name || null,
        en: name || null,
        he: name || null,
      },
      jobTitle: {
        original: jobTitle || null,
        ar: jobTitle || null,
        en: jobTitle || null,
        he: jobTitle || null,
      },
    };
  }
}

async function translateMissingParticipantFields(resources, eventId) {
  if (!Array.isArray(resources) || resources.length === 0) {
    console.log("No participants to translate.");
    return;
  }

  const participantsToTranslate = resources.filter(needsTranslation);

  console.log(
    `Translation started: ${participantsToTranslate.length}/${resources.length} participants need translation`
  );

  const batchSize = TRANSLATION_BATCH_SIZE;
  const delayMs = TRANSLATION_BATCH_DELAY_MS;

  for (let start = 0; start < participantsToTranslate.length; start += batchSize) {
    const batch = participantsToTranslate.slice(start, start + batchSize);

    await Promise.all(
      batch.map(async (participant) => {
        const translatedFields = await translateParticipantFields(participant);

        const updatedDoc = {
          ...participant,
          translated: {
            ...(participant.translated || {}),
            name: translatedFields.name,
            jobTitle: translatedFields.jobTitle,
          },
        };

        await container.items.upsert(updatedDoc, {
          partitionKey: participant.eventId || eventId,
        });

        Object.assign(participant, updatedDoc);


      })
    );
    console.log(
      `Translation batch completed: ${Math.min(start + batch.length, participantsToTranslate.length)}/${participantsToTranslate.length}`
    );

    if (start + batchSize < participantsToTranslate.length) {
      await sleep(delayMs);
    }
  }

  console.log("Done translating participant names and job titles.");
}

module.exports = {
  translateMissingParticipantFields,
};
