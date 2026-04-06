require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");

// בדיקות כדי שלא יקרוס בשקט
if (!process.env.COSMOS_ENDPOINT) {
  throw new Error("Missing COSMOS_ENDPOINT in environment variables");
}

if (!process.env.COSMOS_KEY) {
  throw new Error("Missing COSMOS_KEY in environment variables");
}

if (!process.env.COSMOS_DATABASE) {
  throw new Error("Missing COSMOS_DATABASE in environment variables");
}

if (!process.env.COSMOS_CONTAINER) {
  throw new Error("Missing COSMOS_CONTAINER in environment variables");
}

const client = new CosmosClient({
  endpoint: process.env.COSMOS_ENDPOINT,
  key: process.env.COSMOS_KEY,
});

const database = client.database(process.env.COSMOS_DATABASE);
const container = database.container(process.env.COSMOS_CONTAINER);

console.log("✅ Cosmos DB initialized");

module.exports = { client, database, container };