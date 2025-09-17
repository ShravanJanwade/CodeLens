
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import asyncio
from contextlib import asynccontextmanager

from .parser import MultiLanguageParser
from .embeddings import CodeEmbedder
from .git_client import GitClient

# Store for indexing jobs (use Redis in production)
indexing_jobs: dict = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Indexer service starting...")
    yield
    # Shutdown
    print("👋 Indexer service shutting down...")

app = FastAPI(
    title="CodeLens Indexer Service",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
parser = MultiLanguageParser()
embedder = CodeEmbedder()
git_client = GitClient()


# ============================================================
# Models
# ============================================================

class IndexRequest(BaseModel):
    owner: str
    repo: str
    branch: str = "main"
    force: bool = False


class IndexStatus(BaseModel):
    repoId: str
    status: str  # pending, processing, completed, failed
    progress: float = 0.0
    filesProcessed: int = 0
    totalFiles: int = 0
    symbolsIndexed: int = 0
    error: Optional[str] = None


# ============================================================
# Endpoints
# ============================================================

@app.get("/health")
async def health():
    return {"status": "ok", "service": "indexer"}


@app.post("/index")
async def start_indexing(request: IndexRequest, background_tasks: BackgroundTasks):
    repo_id = f"{request.owner}/{request.repo}"
    job_id = f"{repo_id}:{request.branch}"

    # Check if already indexing
    if job_id in indexing_jobs and indexing_jobs[job_id]["status"] == "processing":
        if not request.force:
            return {"jobId": job_id, "message": "Already indexing", "status": "processing"}
        print(f"⚠️ Force re-indexing {repo_id} (previous status: processing)")

    # Initialize job status
    indexing_jobs[job_id] = {
        "repoId": repo_id,
        "status": "pending",
        "progress": 0,
        "filesProcessed": 0,
        "totalFiles": 0,
        "symbolsIndexed": 0,
        "error": None,
    }

    # Start background indexing
    background_tasks.add_task(
        index_repository,
        request.owner,
        request.repo,
        request.branch,
        job_id,
    )

    return {"jobId": job_id, "message": "Indexing started", "status": "pending"}


@app.get("/status/{repo_id:path}")
async def get_status(repo_id: str):
    # 1. Check in-memory jobs first (for active or recent jobs)
    for job_id, job in indexing_jobs.items():
        if job["repoId"] == repo_id:
            return IndexStatus(**job)
    
    # 2. Check ChromaDB for persistent status
    stats = embedder.get_collection_stats(repo_id)
    if stats["name"] is not None:
        return IndexStatus(
            repoId=repo_id,
            status="completed",
            progress=1.0,
            filesProcessed=0, # We don't store this persistently yet
            totalFiles=0,
            symbolsIndexed=stats["count"]
        )

    # 3. Return a default "not_indexed" status
    return IndexStatus(
        repoId=repo_id,
        status="not_indexed",
        progress=0.0,
        filesProcessed=0,
        totalFiles=0,
        symbolsIndexed=0
    )


@app.get("/symbols/{repo_id:path}")
async def get_symbols(repo_id: str, limit: int = 100):
    try:
        symbols = embedder.get_symbols(repo_id, limit)
        return symbols
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/index/{repo_id:path}")
async def delete_index(repo_id: str):
    try:
        embedder.delete_collection(repo_id)
        # Remove from jobs
        to_remove = [k for k in indexing_jobs if indexing_jobs[k]["repoId"] == repo_id]
        for k in to_remove:
            del indexing_jobs[k]
        return {"message": "Index deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Background Indexing Task
# ============================================================

async def index_repository(owner: str, repo: str, branch: str, job_id: str):
    """Background task to index a repository"""
    repo_id = f"{owner}/{repo}"

    try:
        indexing_jobs[job_id]["status"] = "processing"

        # 1. Fetch repository file list (returns actual branch used)
        print(f"📂 Fetching file list for {repo_id}...")
        files, actual_branch = await git_client.get_repo_files(owner, repo, branch)
        
        # Use the actual branch for file fetching (handles main->master fallback)
        branch = actual_branch
        
        # Filter to only code files
        code_files = [f for f in files if parser.is_supported(f)]
        indexing_jobs[job_id]["totalFiles"] = len(code_files)

        if not code_files:
            error_msg = f"No supported code files found in {repo_id}. Check repository content or access permissions."
            print(f"⚠️ {error_msg}")
            indexing_jobs[job_id]["status"] = "failed"
            indexing_jobs[job_id]["error"] = error_msg
            indexing_jobs[job_id]["progress"] = 0.0
            return

        # 2. Parse each file and extract symbols
        all_symbols = []
        parsed_count = 0
        failed_count = 0
        
        for i, file_path in enumerate(code_files):
            try:
                # Fetch file content
                content = await git_client.get_file_content(owner, repo, branch, file_path)
                
                if content:
                    # Parse and extract symbols
                    symbols = parser.parse_file(content, file_path)
                    if symbols:
                        all_symbols.extend(symbols)
                        parsed_count += 1
                        if len(symbols) > 0:
                            print(f"  📄 {file_path}: {len(symbols)} symbols")
                    else:
                        print(f"  ⚪ {file_path}: no symbols found")
                else:
                    print(f"  ⚠️ {file_path}: failed to fetch content")

                indexing_jobs[job_id]["filesProcessed"] = i + 1
                indexing_jobs[job_id]["progress"] = (i + 1) / len(code_files)

            except Exception as e:
                failed_count += 1
                print(f"⚠️ Error parsing {file_path}: {e}")
                continue
        
        print(f"📊 Parse summary: {parsed_count} parsed, {failed_count} failed, {len(all_symbols)} total symbols")

        # 3. Generate embeddings and store
        print(f"🧠 Generating embeddings for {len(all_symbols)} symbols...")
        indexed_count = embedder.index_symbols(all_symbols, repo_id)

        # 4. Update final status
        indexing_jobs[job_id]["symbolsIndexed"] = indexed_count
        indexing_jobs[job_id]["status"] = "completed"
        indexing_jobs[job_id]["progress"] = 1.0

        print(f"✅ Indexing complete for {repo_id}: {indexed_count} symbols")

    except Exception as e:
        print(f"❌ Indexing failed for {repo_id}: {e}")
        indexing_jobs[job_id]["status"] = "failed"
        indexing_jobs[job_id]["error"] = str(e)
