import torch
from torch import nn
import torch.nn.functional as F


class WeightedContrastiveLoss(nn.Module):
    def __init__(self, model, old_weight=1.0, new_positive_weight=1.0, new_negative_weight=1.0, margin=0.5):
        super().__init__()

        self.model = model
        self.old_weight = old_weight
        self.new_positive_weight = new_positive_weight
        self.new_negative_weight = new_negative_weight
        self.margin = margin

    def forward(self, sentence_features, labels):
        embeddings = [
            self.model(sentence_feature)["sentence_embedding"]
            for sentence_feature in sentence_features
        ]

        emb1, emb2 = embeddings

        labels = labels.float()

        cosine_similarity = F.cosine_similarity(emb1, emb2)
        distance = 1 - cosine_similarity

        positive_loss = labels * torch.pow(distance, 2)

        negative_loss = (1 - labels) * torch.pow(
            torch.clamp(self.margin - distance, min=0.0),
            2
        )

        loss = positive_loss + negative_loss

        return loss.mean()