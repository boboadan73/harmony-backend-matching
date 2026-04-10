import os
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI()

model = None

class TextRequest(BaseModel):
    texts: List[str]

def get_model():
    global model
    if model is None:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(
            "rayanmahmoud/harmony_model",
            token=os.getenv("HF_TOKEN")
        )
        print("Model loaded successfully")
    return model

@app.post("/embed")
def embed_texts(req: TextRequest):
    model_instance = get_model()
    embeddings = model_instance.encode(req.texts, normalize_embeddings=True).tolist()
    return {"embeddings": embeddings}
