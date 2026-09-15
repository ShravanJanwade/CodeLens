
import httpx
import os
import asyncio
from typing import List, Optional
import base64

class GitClient:
    """Client for fetching repository data from GitHub API"""

    def __init__(self):
        self.token = os.getenv("GITHUB_TOKEN")
        self.base_url = "https://api.github.com"
        self.raw_base_url = "https://raw.githubusercontent.com"
        self.max_retries = 3
        self.retry_delay = 1.0  # seconds
        
        if self.token:
            print(f"✅ GitHub token configured (length: {len(self.token)})")
        else:
            print("⚠️ No GitHub token - rate limits will apply (60 req/hr)")

    def _get_headers(self) -> dict:
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "CodeLens-AI",
        }
        if self.token:
            headers["Authorization"] = f"token {self.token}"
        return headers

    async def _request_with_retry(
        self, 
        client: httpx.AsyncClient, 
        url: str, 
        method: str = "GET"
    ) -> httpx.Response:
        """Make HTTP request with retry logic for transient failures"""
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                if method == "GET":
                    response = await client.get(url, headers=self._get_headers())
                else:
                    response = await client.request(method, url, headers=self._get_headers())
                
                # Don't retry on 4xx errors (except 429 rate limit)
                if response.status_code == 429:
                    # Rate limited - wait and retry
                    wait_time = int(response.headers.get("Retry-After", 60))
                    print(f"⏳ Rate limited. Waiting {wait_time}s...")
                    await asyncio.sleep(min(wait_time, 60))
                    continue
                
                return response
                
            except (httpx.ConnectError, httpx.TimeoutException) as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_delay * (2 ** attempt)
                    print(f"⚠️ Request failed, retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                continue
        
        raise Exception(f"Request failed after {self.max_retries} attempts: {last_error}")

    async def get_repo_files(
        self, owner: str, repo: str, branch: str = "main"
    ) -> tuple[list[str], str]:
        """Get list of all files in a repository. Returns (files, actual_branch)"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Use tree API with recursive flag
            url = f"{self.base_url}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
            print(f"📂 Fetching repo tree from: {url}")
            
            response = await self._request_with_retry(client, url)
            
            if response.status_code == 404:
                # Try 'master' branch if 'main' fails
                if branch == "main":
                    print(f"⚠️ 'main' branch not found for {owner}/{repo}, trying 'master'...")
                    return await self.get_repo_files(owner, repo, "master")
                print(f"❌ Repository not found: {owner}/{repo}")
                raise Exception(f"Repository not found: {owner}/{repo}. Make sure the repository exists and is public (or you have access).")
            
            if response.status_code == 401:
                print(f"❌ GitHub authentication failed - token may be invalid")
                raise Exception("GitHub authentication failed - check your GITHUB_TOKEN is valid")
            
            if response.status_code == 403:
                error_msg = response.json().get("message", response.text)
                print(f"❌ GitHub API access denied: {error_msg}")
                raise Exception(f"GitHub API access denied: {error_msg}. This may be due to rate limits or repository access restrictions.")
            
            if response.status_code != 200:
                print(f"❌ GitHub API error ({response.status_code}): {response.text}")
                raise Exception(f"GitHub API error: {response.status_code} - {response.text}")
                
            data = response.json()

            # Extract file paths (only blobs, not trees)
            files = [
                item["path"]
                for item in data.get("tree", [])
                if item["type"] == "blob"
            ]
            
            print(f"📦 Found {len(files)} files in {owner}/{repo} (branch: {branch})")

            return files, branch

    async def get_file_content(
        self, owner: str, repo: str, branch: str, path: str
    ) -> Optional[str]:
        """Fetch content of a single file"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            # URL-encode the path to handle special chars like [documentId]
            from urllib.parse import quote
            encoded_path = '/'.join(quote(segment, safe='') for segment in path.split('/'))
            
            # Use raw content URL
            url = f"{self.raw_base_url}/{owner}/{repo}/{branch}/{encoded_path}"
            
            try:
                response = await self._request_with_retry(client, url)
                
                if response.status_code == 200:
                    return response.text
                elif response.status_code == 404:
                    # Try without encoding as fallback
                    fallback_url = f"{self.raw_base_url}/{owner}/{repo}/{branch}/{path}"
                    fallback_response = await client.get(fallback_url, headers=self._get_headers())
                    if fallback_response.status_code == 200:
                        return fallback_response.text
                    print(f"  ⚠️ {path}: file not found (404)")
                else:
                    print(f"  ⚠️ {path}: HTTP {response.status_code}")
            except Exception as e:
                print(f"  ⚠️ {path}: {type(e).__name__}: {e}")
            
            return None

    async def get_repo_info(self, owner: str, repo: str) -> dict:
        """Get repository metadata"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{self.base_url}/repos/{owner}/{repo}"
            response = await self._request_with_retry(client, url)
            if response.status_code != 200:
                raise Exception(f"Failed to get repo info: {response.status_code}")
            return response.json()


