from build_dataset import build_dataset
from sentence_transformers import SentenceTransformer, losses
from torch.utils.data import DataLoader

train_data, val_data = build_dataset()

model = SentenceTransformer("models/base_model")

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
