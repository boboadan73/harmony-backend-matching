import sys
import os
from build_dataset import build_dataset
from sentence_transformers import SentenceTransformer, losses
from torch.utils.data import DataLoader
from dotenv import load_dotenv
from huggingface_hub import login
from weighted_contrastive_loss import WeightedContrastiveLoss

#train_data, val_data = build_dataset()

event_id = None

if len(sys.argv) > 1:
    event_id = sys.argv[1]

print("Training for event_id:", event_id)

train_data, val_data = build_dataset(event_id=event_id)


old_train = sum(1 for ex in train_data if ex.source == "old")
new_train = sum(1 for ex in train_data if ex.source == "new")

new_positive_train = sum(1 for ex in train_data if ex.source == "new" and ex.label == 2.0)
new_negative_train = sum(1 for ex in train_data if ex.source == "new" and ex.label == -1.0)

old_positive_train = sum(1 for ex in train_data if ex.source == "old" and ex.label == 1.0)
old_negative_train = sum(1 for ex in train_data if ex.source == "old" and ex.label == 0.0)

print("Old train pairs:", old_train)
print("New train pairs:", new_train)

print("Old positive train pairs:", old_positive_train)
print("Old negative train pairs:", old_negative_train)

print("New positive train pairs:", new_positive_train)
print("New negative train pairs:", new_negative_train)

new_positive_weight = 1.0

if new_negative_train > 0:
    new_negative_weight = new_positive_train / new_negative_train
    new_negative_weight = min(new_negative_weight, 10.0)
else:
    new_negative_weight = 1.0

print("New positive weight:", new_positive_weight)
print("New negative weight:", new_negative_weight)

load_dotenv()

# HF_TOKEN = os.getenv("HF_TOKEN")
# HF_REPO_ID = os.getenv("HF_REPO_ID", "rayanmahmoud/harmony_model")

# if HF_TOKEN:
#     login(token=HF_TOKEN)

# print("Using Hugging Face repo:", HF_REPO_ID)

# # # model = SentenceTransformer("models/base_model")
# # model = SentenceTransformer("rayanmahmoud/harmony_model")
# model = SentenceTransformer(HF_REPO_ID)

HF_TOKEN = os.getenv("HF_TOKEN")
HF_BASE_REPO_ID = os.getenv("HF_BASE_REPO_ID", "rayanmahmoud/harmony_model")
HF_WORKING_REPO_ID = os.getenv("HF_WORKING_REPO_ID", "rayanmahmoud/harmony_model_working")

if HF_TOKEN:
    login(token=HF_TOKEN)

print("Base model repo:", HF_BASE_REPO_ID)
print("Working model repo:", HF_WORKING_REPO_ID)

try:
    model = SentenceTransformer(HF_WORKING_REPO_ID)
    print("Loaded existing working model")
except Exception:
    model = SentenceTransformer(HF_BASE_REPO_ID)
    print("Working model not found, loaded base model")

train_dataloader = DataLoader(
    train_data,
    shuffle=True,
    batch_size=16
)

# train_loss = losses.ContrastiveLoss(model=model)
train_loss = WeightedContrastiveLoss(
    model=model,
    old_weight=1.0,
    new_positive_weight=new_positive_weight,
    new_negative_weight=new_negative_weight
)

model.fit(
    train_objectives=[(train_dataloader, train_loss)],
    epochs=3,
    warmup_steps=50,
    output_path="models/harmony_model",
    show_progress_bar=True
)

print("Pushing updated model to Hugging Face...")

model.push_to_hub(
    repo_id=HF_WORKING_REPO_ID,
    token=HF_TOKEN,
    exist_ok=True
)

print("Model pushed successfully to:", HF_WORKING_REPO_ID)
