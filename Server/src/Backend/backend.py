import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from src.LLM.LMStudioInterface import analyze_post

app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

class PostURL(BaseModel):
    url: str

@app.post("/analyze/")
async def analyze_social_post(post_url: PostURL):
    try:
        result = await analyze_post(post_url.url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))