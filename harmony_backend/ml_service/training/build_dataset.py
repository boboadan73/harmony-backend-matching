from azure.cosmos import CosmosClient
from dotenv import load_dotenv
import os
from sentence_transformers import InputExample
from sklearn.model_selection import train_test_split


def get_profile_text(p):
    text = p.get("profile_text", "")

    if not text:
        text = " ".join([
            str(p.get("academicResume", "")),
            str(p.get("professionalResume", "")),
            str(p.get("personalResume", "")),
            str(p.get("academic", "")),
            str(p.get("professional", "")),
            str(p.get("personal", "")),
            str(p.get("jobTitle", "")),
            str(p.get("iWantToMeet", ""))
        ])

    return text.strip()


def build_dataset(event_id=None):
    load_dotenv()

    COSMOS_URI = os.getenv("COSMOS_URI")
    COSMOS_KEY = os.getenv("COSMOS_KEY")

    DB_NAME = "harmony-db"

    client = CosmosClient(COSMOS_URI, credential=COSMOS_KEY)
    db = client.get_database_client(DB_NAME)

    old_container = db.get_container_client("participants")
    event_container = db.get_container_client("eventParticipants")

    participants = {}
    labels = []

    # =========================
    # LOAD OLD PARTICIPANTS
    # =========================
    query = "SELECT * FROM c WHERE c.docType = 'participant_profile'"

    for p in old_container.query_items(query=query, enable_cross_partition_query=True):
        participant_id = str(p.get("personId", p.get("id")))
        participants[participant_id] = get_profile_text(p)

    print("Old participants loaded:", len(participants))

    # =========================
    # LOAD OLD BALANCED LABELS
    # =========================
    query = "SELECT * FROM c WHERE c.docType = 'training_label'"

    for item in old_container.query_items(query=query, enable_cross_partition_query=True):
        p1 = str(item["person1Id"])
        p2 = str(item["person2Id"])
        label = item["label"]

        labels.append((p1, p2, label, "old"))

    print("Old labels loaded:", len(labels))

    # =========================
    # LOAD EVENT PARTICIPANTS
    # =========================
    if event_id:
        query = "SELECT * FROM c WHERE c.eventId = @eventId"
        parameters = [{"name": "@eventId", "value": event_id}]
    else:
        query = "SELECT * FROM c"
        parameters = []

    event_participants_count = 0

    for p in event_container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ):
        participants[str(p["id"])] = get_profile_text(p)
        event_participants_count += 1

    print("Event participants loaded:", event_participants_count)

    # =========================
    # LOAD NEW FEEDBACK FROM EVENT INTERACTIONS
    # =========================
    new_positive_count = 0
    new_negative_count = 0

    if event_id:
        query = """
        SELECT * FROM c
        WHERE c.eventId = @eventId
        AND IS_DEFINED(c.interactions)
        """
        parameters = [{"name": "@eventId", "value": event_id}]
    else:
        query = "SELECT * FROM c WHERE IS_DEFINED(c.interactions)"
        parameters = []

    for p in event_container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True
    ):
        chooser_id = str(p["id"])
        interactions = p.get("interactions", {})

        saved = interactions.get("saved", [])
        met = interactions.get("met", [])
        skipped = interactions.get("skipped", [])
        skipped_reasons = interactions.get("skippedReasons", {})

        for chosen_id in saved:
            labels.append((chooser_id, str(chosen_id), 1, "new"))
            new_positive_count += 1

        for chosen_id in met:
            labels.append((chooser_id, str(chosen_id), 1, "new"))
            new_positive_count += 1

        for skipped_id in skipped:
            skipped_id = str(skipped_id)
            reason_data = skipped_reasons.get(skipped_id, {})
            reason = reason_data.get("reason", "")

            if reason == "not_relevant":
                labels.append((chooser_id, skipped_id, 0, "new"))
                new_negative_count += 1

    print("New positive feedback pairs:", new_positive_count)
    print("New negative feedback pairs:", new_negative_count)
    print("Total labels:", len(labels))

    # =========================
    # BUILD TRAIN DATA
    # =========================
    pairs = []
    missing_pairs = 0

    for p1, p2, label, source in labels:
        if p1 in participants and p2 in participants:
            example = InputExample(
                texts=[participants[p1], participants[p2]],
                label=float(label)
            )

            example.source = source
            pairs.append(example)
        else:
            missing_pairs += 1

    print("Pairs:", len(pairs))
    print("Missing pairs:", missing_pairs)

    example_labels = [example.label for example in pairs]

    train_data, val_data = train_test_split(
        pairs,
        test_size=0.2,
        random_state=42,
        stratify=example_labels
    )

    return train_data, val_data


if __name__ == "__main__":
    train_data, val_data = build_dataset()