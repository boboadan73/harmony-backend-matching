require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");
const XLSX = require("xlsx");

console.log("RUNNING UPDATED buildTrainingData.js");

// Create Cosmos DB client using environment variables
const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

// Connect to the existing database and container
const database = client.database("harmony-db");
const container = database.container("participants");

// Convert Excel ID format to Cosmos participant ID format
// Example: 408 -> p408
// If the value already starts with "p", keep it unchanged
function normalizeExcelId(value) {
  if (value === undefined || value === null || value === "") return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.toLowerCase().startsWith("p")) return raw;
  return `p${raw}`;
}

// Read the first sheet from an Excel file and return rows as JSON objects
function readExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet);
}

// Get all columns that store chosen participant IDs
// Example: chosen_1_id, chosen_2_id, chosen_3_id ...
function getChosenIdColumns(row) {
  return Object.keys(row).filter((key) => {
    const cleanKey = String(key).trim().toLowerCase();
    return cleanKey.startsWith("chosen_") && cleanKey.endsWith("_id");
  });
}

// Convert a directed pair into a canonical unordered pair
// This ensures that:
// p1 + p2  ===  p2 + p1
function buildOrderedPair(id1, id2) {
  const pair = [id1, id2].sort();
  return {
    person1Id: pair[0],
    person2Id: pair[1],
    pairKey: `${pair[0]}_${pair[1]}`
  };
}

// Build training-label documents from one Excel file
// label = 1 for positive pairs
// label = 0 for negative pairs
// seenPairs is used to prevent duplicate unordered pairs
async function buildLabelDocsFromFile(filePath, label, seenPairs) {
  const rows = readExcelRows(filePath);
  const docs = [];

  console.log(`Reading ${filePath}... total rows: ${rows.length}`);

  for (const row of rows) {
    const chooserExcelId = row["chooser_id"];
    const chooserCosmosId = normalizeExcelId(chooserExcelId);

    if (!chooserCosmosId) continue;

    const chosenIdColumns = getChosenIdColumns(row);

    for (const col of chosenIdColumns) {
      const candidateExcelId = row[col];
      const candidateCosmosId = normalizeExcelId(candidateExcelId);

      if (!candidateCosmosId) continue;

      // Skip self-pairs such as p408 with p408
      if (chooserCosmosId === candidateCosmosId) continue;

      const { person1Id, person2Id, pairKey } = buildOrderedPair(
        chooserCosmosId,
        candidateCosmosId
      );

      // Keep only the first appearance of the pair
      // If the pair already appeared before, ignore it
      if (seenPairs.has(pairKey)) {
        continue;
      }

      seenPairs.add(pairKey);

      docs.push({
        id: `label_${pairKey}`,
        docType: "training_label",
        person1Id,
        person2Id,
        label,
        sourceFile: filePath
      });
    }
  }

  return docs;
}

// Save all documents into the existing participants container
async function saveDocuments(docs) {
  for (const doc of docs) {
    await container.items.upsert(doc);
  }
}

// Main execution flow
async function main() {
  try {
    const seenPairs = new Set();

    console.log("Building positive labels...");
    const positiveDocs = await buildLabelDocsFromFile(
      "choices_positive.xlsx",
      1,
      seenPairs
    );
    console.log(`Built ${positiveDocs.length} positive labels`);

    console.log("Building negative labels...");
    const negativeDocs = await buildLabelDocsFromFile(
      "choices_negative.xlsx",
      0,
      seenPairs
    );
    console.log(`Built ${negativeDocs.length} negative labels`);

    const allDocs = [...positiveDocs, ...negativeDocs];

    console.log("Saving labels into participants container...");
    await saveDocuments(allDocs);

    console.log(`Done. Inserted ${allDocs.length} unique training labels.`);
  } catch (error) {
    console.error("Error while building labels:", error);
  }
}

main();
