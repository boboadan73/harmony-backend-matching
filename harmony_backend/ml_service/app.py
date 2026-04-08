# from fastapi import FastAPI
# from pydantic import BaseModel
# from sentence_transformers import SentenceTransformer
# from typing import List

# # 1️⃣ Create FastAPI app
# app = FastAPI()

# # 2️⃣ Load pretrained multilingual embedding model
# model = SentenceTransformer(
#     "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
# )

# # 3️⃣ Define request schema
# class TextRequest(BaseModel):
#     texts: List[str]

# @app.post("/embed")
# def embed_texts(req: TextRequest):
#     embeddings = model.encode(req.texts).tolist()
#     return {"embeddings": embeddings}



import os
from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List

# Create FastAPI app
app = FastAPI()

model = SentenceTransformer(
    "rayanmahmoud/harmony_model",
    token=os.getenv("HF_TOKEN")
)

print("Model loaded successfully")
# Define request schema
class TextRequest(BaseModel):
    texts: List[str]

@app.post("/embed")
def embed_texts(req: TextRequest):
    embeddings = model.encode(req.texts, normalize_embeddings=True).tolist()
    return {"embeddings": embeddings}
