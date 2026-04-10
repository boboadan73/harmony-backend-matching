import os
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List

app = FastAPI()

model = None

@app.on_event("startup")
def load_model():
    global model
    model = SentenceTransformer(
        "rayanmahmoud/harmony_model",
        token=os.getenv("HF_TOKEN")
    )
    print("Model loaded successfully")


class TextRequest(BaseModel):
    texts: List[str]

@app.post("/embed")
def embed_texts(req: TextRequest):
    embeddings = model.encode(req.texts, normalize_embeddings=True).tolist()
    return {"embeddings": embeddings}
