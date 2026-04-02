from azure.cosmos import CosmosClient
from dotenv import load_dotenv
import os
from sentence_transformers import InputExample

load_dotenv()

COSMOS_URI = os.getenv("COSMOS_URI")
COSMOS_KEY = os.getenv("COSMOS_KEY")

DB_NAME = "harmony-db"
CONTAINER_NAME = "participants"

# ✅ Create client
client = CosmosClient(COSMOS_URI, credential=COSMOS_KEY)

# ✅ Get database
db = client.get_database_client(DB_NAME)

# ✅ Get container (THIS IS CRITICAL)
container = db.get_container_client(CONTAINER_NAME)

# =========================
# LOAD PARTICIPANTS
# =========================
participants = {}

query = "SELECT * FROM c WHERE NOT IS_DEFINED(c.docType)"

for p in container.query_items(query=query, enable_cross_partition_query=True):
    text = p.get("profile_text", "")

    if not text:
        text = " ".join([
            str(p.get("academic", "")),
            str(p.get("professional", "")),
            str(p.get("personal", ""))
        ])

    participants[p["id"]] = text

print("Participants loaded:", len(participants))

# =========================
# LOAD LABELS
# =========================
labels = []

query = "SELECT * FROM c WHERE c.docType = 'training_label'"

for item in container.query_items(query=query, enable_cross_partition_query=True):
    p1 = item["person1Id"]
    p2 = item["person2Id"]
    label = item["label"]

    labels.append((p1, p2, label))

print("Labels loaded:", len(labels))

# =========================
# BUILD TRAIN DATA
# =========================
train_examples = []

# ONLY POSITIVE (for ranking loss)
for p1, p2, label in labels:
    if label == 1 and p1 in participants and p2 in participants:
        train_examples.append(
            InputExample(
                texts=[participants[p1], participants[p2]]
            )
        )

print("Training pairs:", len(train_examples))


def get_train_data():
    return train_examples