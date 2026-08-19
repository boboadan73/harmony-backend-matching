import os
import threading
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

class TextRequest(BaseModel):
    texts: List[str]

model = None
model_lock = threading.Lock()

def get_model():
    global model
    if model is None:
        with model_lock:
            if model is None:
                from sentence_transformers import SentenceTransformer
                model = SentenceTransformer(
                    "rayanmahmoud/harmony_model_working",
                    token=os.getenv("HF_TOKEN")
                )
                print("Model loaded successfully")
    return model

def warmup():
    try:
        get_model()
    except Exception as e:
        print("Warmup failed:", e)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=warmup, daemon=True).start()

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/embed")
def embed_texts(req: TextRequest):
    model_instance = get_model()
    embeddings = model_instance.encode(
        req.texts,
        normalize_embeddings=True
    ).tolist()
    return {"embeddings": embeddings}
