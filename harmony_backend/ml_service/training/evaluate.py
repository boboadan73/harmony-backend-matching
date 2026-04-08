from build_dataset import build_dataset
from sentence_transformers import SentenceTransformer
from sentence_transformers.evaluation import BinaryClassificationEvaluator

train_data, val_data = build_dataset()

model = SentenceTransformer("models/harmony_model")

sentences1 = [example.texts[0] for example in val_data]
sentences2 = [example.texts[1] for example in val_data]
labels = [int(example.label) for example in val_data]

evaluator = BinaryClassificationEvaluator(
    sentences1,
    sentences2,
    labels,
    name="harmony-val"
)

score = evaluator(model)
print("Final validation score:", score)
