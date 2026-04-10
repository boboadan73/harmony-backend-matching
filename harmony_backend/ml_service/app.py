import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer

app = FastAPI()

class TextRequest(BaseModel):
    texts: List[str]

model = None

# 🚀 זה החלק החשוב
@app.on_event("startup")
def load_model():
    global model
    model = SentenceTransformer(
        "rayanmahmoud/harmony_model",
        token=os.getenv("HF_TOKEN")
    )
    print("✅ Model loaded at startup")

# (אופציונלי אבל חשוב)
@app.get("/health")
def health():
    return {"ok": True}

@app.post("/embed")
def embed_texts(req: TextRequest):
    embeddings = model.encode(
        req.texts,
        normalize_embeddings=True
    ).tolist()

    return {"embeddings": embeddings}
