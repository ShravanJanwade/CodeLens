
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager

from .rag import CodeRAG
from .llm import LLMClient


import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize services
rag: Optional[CodeRAG] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag
    logger.info("🚀 Query service starting...")
    try:
        rag = CodeRAG()
        logger.info("✅ RAG pipeline initialized")
    except Exception as e:
        logger.error(f"❌ Failed to initialize RAG pipeline: {e}")
    yield
    logger.info("👋 Query service shutting down...")


app = FastAPI(
    title="CodeLens Query Service",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    import sys
    try:
        # Log request body for debugging
        body = await request.body()
        print(f"📝 Request: {request.method} {request.url}")
        print(f"📦 Body: {body.decode()}")
        
        response = await call_next(request)
        return response
    except Exception as e:
        import traceback
        print(f"❌ Middleware caught error: {str(e)}")
        traceback.print_exc(file=sys.stdout)
        return JSONResponse(
            status_code=500,
            content={"detail": str(e), "traceback": traceback.format_exc()}
        )


# ============================================================
# Models
# ============================================================

class QueryRequest(BaseModel):
    repoId: str
    question: str
    context: Optional[dict] = None


class QuerySource(BaseModel):
    file: str
    symbol: str
    lines: str
    relevance: float
    snippet: Optional[str] = None


class QueryResponse(BaseModel):
    answer: str
    sources: List[QuerySource]
    followUpQuestions: List[str]


class ExplainRequest(BaseModel):
    repoId: str
    symbolName: str
    filePath: Optional[str] = None


class ExplainResponse(BaseModel):
    explanation: str
    symbol: Optional[dict] = None


class SummarizeRequest(BaseModel):
    repoId: str
    filePath: str


# ============================================================
# Endpoints
# ============================================================

@app.get("/health")
async def health():
    return {"status": "ok", "service": "query"}


@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    """Answer a question about the codebase using RAG"""
    if not rag:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")
    
    try:
        result = await rag.query(
            question=request.question,
            repo_id=request.repoId,
            context=request.context,
        )
        return QueryResponse(**result)
    except Exception as e:
        import traceback
        print(f"❌ Query failed: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/explain", response_model=ExplainResponse)
async def explain_symbol(request: ExplainRequest):
    """Get detailed explanation of a specific symbol"""
    if not rag:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")
    
    try:
        result = await rag.explain_symbol(
            repo_id=request.repoId,
            symbol_name=request.symbolName,
            file_path=request.filePath,
        )
        return ExplainResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/summarize")
async def summarize_file(request: SummarizeRequest):
    """Summarize a file's purpose and structure"""
    if not rag:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")
    
    try:
        result = await rag.summarize_file(
            repo_id=request.repoId,
            file_path=request.filePath,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
