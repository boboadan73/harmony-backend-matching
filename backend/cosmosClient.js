const { CosmosClient } = require('@azure/cosmos');

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DATABASE_ID || 'harmony-db';
const containerId = process.env.COSMOS_PARTICIPANTS_CONTAINER || 'participants';

if (!endpoint || !key) {
  throw new Error('Missing COSMOS_ENDPOINT or COSMOS_KEY in environment variables');
}

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);
const container = database.container(containerId);

async function getAllParticipants() {
  const querySpec = {
    query: 'SELECT * FROM c'
  };

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources;
}

module.exports = {
  getAllParticipants,
};