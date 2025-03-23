import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from src.LLM.LMStudioInterface import analyze_post

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows requests from all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all HTTP methods
    allow_headers=["*"],  # Allows all headers
)

class PostURL(BaseModel):
    url: str

@app.post("/analyze/")
async def analyze_social_post(post_url: PostURL):
    try:
        result = await analyze_post(post_url.url)  # Use `await` here
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("backend:app", host="127.0.0.1", port=8000, log_level="info")