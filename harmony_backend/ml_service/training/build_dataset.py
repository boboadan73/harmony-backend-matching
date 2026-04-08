from azure.cosmos import CosmosClient
from dotenv import load_dotenv
import os
from sentence_transformers import InputExample
from sklearn.model_selection import train_test_split


def build_dataset():
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

    # # =========================
    # # BUILD TRAIN DATA
    # # =========================
    Pairs = []

    for p1, p2, label in labels:
        if p1 in participants and p2 in participants:
            Pairs.append(
                InputExample(
                    texts=[participants[p1], participants[p2]],
                    label=float(label)
                )
            )

    print("Pairs:", len(Pairs))
    # label_1_count = sum(1 for _, _, label in labels if float(label) == 1.0)
    # label_0_count = sum(1 for _, _, label in labels if float(label) == 0.0)

    # print("Label 1 pairs:", label_1_count)
    # print("Label 0 pairs:", label_0_count)

    example_labels = [example.label for example in Pairs]

    train_data, val_data = train_test_split(
        Pairs,
        test_size=0.2,
        random_state=42,
        stratify=example_labels
    )

    # print("Train size:", len(train_data))
    # print("Validation size:", len(val_data))

    # train_label_1 = sum(1 for ex in train_data if ex.label == 1.0)
    # train_label_0 = sum(1 for ex in train_data if ex.label == 0.0)

    # val_label_1 = sum(1 for ex in val_data if ex.label == 1.0)
    # val_label_0 = sum(1 for ex in val_data if ex.label == 0.0)

    # print("Train label 1:", train_label_1)
    # print("Train label 0:", train_label_0)
    # print("Validation label 1:", val_label_1)
    # print("Validation label 0:", val_label_0)

    return train_data, val_data


if __name__ == "__main__":
    train_data, val_data = build_dataset()
