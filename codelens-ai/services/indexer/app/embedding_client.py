"""
Lightweight Embedding Client using Groq/OpenAI-compatible API
Replaces heavy sentence-transformers library to reduce Docker image size
"""

import os
import httpx
from typing import List, Union

# Default embedding model - Groq uses OpenAI-compatible models
DEFAULT_MODEL = "text-embedding-3-small"
DEFAULT_API_URL = "https://api.openai.com/v1/embeddings"


class EmbeddingClient:
    """
    Lightweight embedding client that calls remote APIs.
    Supports OpenAI and compatible endpoints (Azure, etc.)
    
    Note: Groq doesn't have embeddings API as of late 2024,
    so we use OpenAI's embedding API which is very cheap.
    Alternatively, use a free embedding service like Voyage AI free tier.
    """

    def __init__(self):
        # Try multiple API keys in order of preference
        self.api_key = os.getenv("EMBEDDING_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.api_url = os.getenv("EMBEDDING_API_URL", DEFAULT_API_URL)
        self.model = os.getenv("EMBEDDING_MODEL", DEFAULT_MODEL)
        
        if not self.api_key:
            # Fall back to using a free embedding service or local calculation
            print("⚠️ No EMBEDDING_API_KEY or OPENAI_API_KEY found")
            print("   Using lightweight local embeddings as fallback")
            self._use_local = True
        else:
            self._use_local = False
            print(f"✅ Embedding client configured for model: {self.model}")

    def embed(self, texts: Union[str, List[str]]) -> List[List[float]]:
        """
        Generate embeddings for one or more texts.
        Returns a list of embedding vectors.
        """
        if isinstance(texts, str):
            texts = [texts]
        
        if not texts:
            return []
        
        if self._use_local:
            return self._local_embed(texts)
        
        return self._api_embed(texts)

    def _api_embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings via API call"""
        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "input": texts,
                    },
                )
                
                if response.status_code != 200:
                    print(f"❌ Embedding API error ({response.status_code}): {response.text}")
                    # Fall back to local on error
                    return self._local_embed(texts)
                
                data = response.json()
                # Sort by index to ensure correct order
                embeddings = sorted(data["data"], key=lambda x: x["index"])
                return [e["embedding"] for e in embeddings]
                
        except Exception as e:
            print(f"❌ Embedding API call failed: {e}")
            return self._local_embed(texts)

    def _local_embed(self, texts: List[str]) -> List[List[float]]:
        """
        Simple local embedding using character/word hashing.
        This is a fallback that doesn't require any ML libraries.
        Quality is lower but functional for basic similarity.
        """
        import hashlib
        
        embeddings = []
        dim = 384  # Match all-MiniLM-L6-v2 dimension for compatibility
        
        for text in texts:
            # Create a deterministic embedding from text
            embedding = [0.0] * dim
            
            # Process words
            words = text.lower().split()
            for i, word in enumerate(words):
                # Hash each word to get position and value
                word_hash = hashlib.md5(word.encode()).digest()
                for j, byte in enumerate(word_hash):
                    pos = (j + i * 16) % dim
                    embedding[pos] += (byte - 128) / 128.0
            
            # Normalize
            magnitude = sum(x*x for x in embedding) ** 0.5
            if magnitude > 0:
                embedding = [x / magnitude for x in embedding]
            
            embeddings.append(embedding)
        
        return embeddings

    def embed_query(self, query: str) -> List[float]:
        """Embed a single query text"""
        results = self.embed([query])
        return results[0] if results else [0.0] * 384


# Singleton instance
_client = None


def get_embedding_client() -> EmbeddingClient:
    """Get or create the global embedding client"""
    global _client
    if _client is None:
        _client = EmbeddingClient()
    return _client
