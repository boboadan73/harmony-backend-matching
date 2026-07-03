import sys
import os
from build_dataset import build_dataset
from sentence_transformers import SentenceTransformer, losses
from torch.utils.data import DataLoader
from dotenv import load_dotenv
from huggingface_hub import login



##########ADD TOKEN TO ENV##############################

#train_data, val_data = build_dataset()

event_id = None

if len(sys.argv) > 1:
    event_id = sys.argv[1]

print("Training for event_id:", event_id)

train_data, val_data = build_dataset(event_id=event_id)

load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")
HF_REPO_ID = os.getenv("HF_REPO_ID", "rayanmahmoud/harmony_model")

if HF_TOKEN:
    login(token=HF_TOKEN)

print("Using Hugging Face repo:", HF_REPO_ID)

# # model = SentenceTransformer("models/base_model")
# model = SentenceTransformer("rayanmahmoud/harmony_model")
model = SentenceTransformer(HF_REPO_ID)

train_dataloader = DataLoader(
    train_data,
    shuffle=True,
    batch_size=16
)

train_loss = losses.ContrastiveLoss(model=model)

model.fit(
    train_objectives=[(train_dataloader, train_loss)],
    epochs=3,
    warmup_steps=50,
    output_path="models/harmony_model",
    show_progress_bar=True
)
