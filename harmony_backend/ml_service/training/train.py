from sentence_transformers import SentenceTransformer, losses
from torch.utils.data import DataLoader
from build_dataset import get_train_data

# =========================
# LOAD TRAINING DATA
# =========================
train_examples = get_train_data()

print(f"Total training samples: {len(train_examples)}")

if len(train_examples) == 0:
    raise ValueError(" No training data found. Check your dataset!")

# =========================
# LOAD BASE MODEL
# =========================
print("Loading base model...")
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# =========================
# CREATE DATALOADER
# =========================
train_dataloader = DataLoader(
    train_examples,
    shuffle=True,
    batch_size=16
)

# =========================
# LOSS FUNCTION (BEST CHOICE)
# =========================
# This automatically treats other samples in batch as negatives
train_loss = losses.MultipleNegativesRankingLoss(model)

# =========================
# TRAIN MODEL
# =========================
print("Starting training...")

model.fit(
    train_objectives=[(train_dataloader, train_loss)],
    epochs=4,               # Good starting point for your dataset
    warmup_steps=50,        # Helps stabilize training
    show_progress_bar=True
)

# =========================
# SAVE MODEL
# =========================
save_path = "../harmony_model"

model.save(save_path)

print(f"✅ Model saved at: {save_path}")