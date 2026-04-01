require("dotenv").config();

const { CosmosClient } = require("@azure/cosmos");
const axios = require("axios");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("participants");

const STOPWORDS_AR = [
  "مهندس","شهادة","لقب","اول","ثاني","بكالوريوس","ماجستير",
  "خبرة","دورة","متدرب","حاصل","مهندسة","مستشار","متدربة","حاصلة"
];

const PHRASES_AR = [
  "يتطوّع في مجتمع “هارموني” ضمن",
  "تتطوّع في مجتمع “هارموني” ضمن"
];

function normalizeText(t) {
  return (t || "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}

function removeStopwords(text) {
  if (!text) return "";

  let t = text.replace(/[“”]/g, '"');

  for (const ph of PHRASES_AR) {
    const phNorm = ph.replace(/[“”]/g, '"');
    t = t.replaceAll(phNorm, " ");
  }

  t = t.replace(/\s+/g, " ").trim();

  const tokens = t.split(" ").map(tok => {
    tok = tok.replace(/[.,;:!?()"'\[\]{}<>،؛ـ]/g, "");
    if (tok.startsWith("ال")) tok = tok.slice(2);
    return tok.trim();
  });

  return tokens.filter(tok => tok && !STOPWORDS_AR.includes(tok)).join(" ");
}

async function getEmbeddings(texts) {
  const response = await axios.post(
    "http://127.0.0.1:8000/embed",
    { texts },
    { timeout: 60000 }
  );
  return response.data.embeddings;
}

async function getEmbeddingsBatched(texts, batchSize = 5) {
  const all = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`Embedding batch ${i}-${i + batch.length}`);
    const emb = await getEmbeddings(batch);
    all.push(...emb);
  }

  return all;
}

async function main() {
  const { resources } = await container.items.readAll().fetchAll();
  console.log(`Loaded ${resources.length} participants from Cosmos`);

  for (let idx = 0; idx < resources.length; idx++) {
    const p = resources[idx];

    const jobText = removeStopwords(normalizeText(p.job));
    const academicText = removeStopwords(normalizeText(p.academic));
    const professionalText = removeStopwords(normalizeText(p.professional));
    const personalText = removeStopwords(normalizeText(p.personal));
    const profileText = [academicText, professionalText, personalText]
      .filter(Boolean)
      .join(" ");

    const texts = [
      jobText || " ",
      academicText || " ",
      professionalText || " ",
      personalText || " ",
      profileText || " ",
    ];

    const embeddings = await getEmbeddingsBatched(texts, 5);

    const updatedDoc = {
      ...p,
      job_clean: jobText,
      academic_clean: academicText,
      professional_clean: professionalText,
      personal_clean: personalText,
      profile_text: profileText,
      job_embedding: embeddings[0],
      academic_embedding: embeddings[1],
      professional_embedding: embeddings[2],
      personal_embedding: embeddings[3],
      profile_embedding: embeddings[4],
    };

    //await container.item(p.id, p.event_id || undefined).replace(updatedDoc);
    await container.items.upsert(updatedDoc);
    console.log(`Updated ${idx + 1}/${resources.length}: ${p.id}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("generateEmbeddings failed:", err);
});
