import os
import threading
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

class TextRequest(BaseModel):
    texts: List[str]

model = None
model_loading = False

def load_model_once():
    global model, model_loading
    if model is None and not model_loading:
        model_loading = True
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(
            "rayanmahmoud/harmony_model",
            token=os.getenv("HF_TOKEN")
        )
        model_loading = False
        print("✅ Model loaded successfully")

def warmup_model():
    try:
        load_model_once()
    except Exception as e:
        print("❌ Warmup failed:", e)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=warmup_model, daemon=True).start()

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/embed")
def embed_texts(req: TextRequest):
    load_model_once()
    embeddings = model.encode(
        req.texts,
        normalize_embeddings=True
    ).tolist()
    return {"embeddings": embeddings}
