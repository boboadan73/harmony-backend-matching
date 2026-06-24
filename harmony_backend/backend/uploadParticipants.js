require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");
const XLSX = require("xlsx");

console.log("RUNNING uploadParticipants.js");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT || process.env.COSMOS_URI,
  key: process.env.COSMOS_KEY,
});

const database = client.database("harmony-db");
const container = database.container("participants");

const PARTICIPANTS_FILE = "Harmony Network.xlsx";

function normalizeExcelId(value) {
  if (value === undefined || value === null || value === "") return null;

  let raw = String(value).trim();

  if (!raw) return null;

  if (raw.endsWith(".0")) {
    raw = raw.slice(0, -2);
  }

  raw = raw.replace(/[^a-zA-Z0-9_-]/g, "");

  if (!raw) return null;

  if (raw.toLowerCase().startsWith("p")) return raw;

  return `p${raw}`;
}

function readExcelRows(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet);
}

function buildProfileText(row) {
  const profileColumns = [
    "تعريف مهني",
    "السيرة المهنية",
    "السيرة الأكاديمية",
    "السيرة الشخصية",
    "معلومة مثيرة",
    "تود التعارف مع",
  ];

  return profileColumns
    .map((col) => {
      const value = row[col];
      if (!value) return null;
      return `${col}: ${String(value).trim()}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function main() {
  try {
    const rows = readExcelRows(PARTICIPANTS_FILE);

    console.log(`Read ${rows.length} participants from Excel`);
    console.log("Excel columns:", Object.keys(rows[0]));

    let uploaded = 0;
    let skipped = 0;

    for (const row of rows) {
      const personId = normalizeExcelId(row["id"]);

      if (!personId) {
        skipped++;
        continue;
      }

      const doc = {
        ...row,
        id: personId,
        docType: "participant_profile",
        personId,
        profile_text: buildProfileText(row),
      };

      await container.items.upsert(doc);
      uploaded++;
    }

    console.log(`✅ Uploaded ${uploaded} participant profiles`);
    console.log(`⚠️ Skipped ${skipped} rows without id`);
  } catch (error) {
    console.error("Error while uploading participants:", error);
  }
}

main();