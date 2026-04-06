require("dotenv").config();
const xlsx = require("xlsx");
const crypto = require("crypto");
const { CosmosClient } = require("@azure/cosmos");

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database(process.env.COSMOS_DATABASE);
const container = database.container(process.env.COSMOS_CONTAINER);

async function importExcel() {
  try {
    const workbook = xlsx.readFile("Harmony Network.xlsx");

    const sheetName = "Volunteers - Dec25";
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`Sheet '${sheetName}' not found`);
    }

    const rows = xlsx.utils.sheet_to_json(worksheet);

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];

      const participant = {
        id: crypto.randomUUID(),
        eventId: row["eventId"] || "",
        rowNumber: index + 1,
        name: row["الاسم الكامل"] || row["الاسم"] || "",
        phoneNumber: String(
          row["phone"] || row["Phone"] || row["رقم الهاتف"] || ""
        ).replace(/[^\d]/g, ""),
        jobTitle: row["تعريف مهني"] || row["Job Title"] || "",
        academicResume: row["السيرة الأكاديمية"] || row["Academic Resume"] || "",
        professionalResume: row["السيرة المهنية"] || row["Professional Resume"] || "",
        personalResume: row["السيرة الشخصية"] || row["Personal Resume"] || "",
        iWantToMeet: row["تود التعارف مع"] || row["I Want To Meet"] || "",
        photoUrl: row["thumbnail_url"] || row["Unnamed: 1"] || "",
        rawData: row,
      };

      await container.items.upsert(participant);
    }

    console.log(`Imported ${rows.length} participants successfully`);
  } catch (error) {
    console.error("Import failed:", error.message);
  }
}

importExcel();