"""
Code Embeddings Module
Generates and manages embeddings for code symbols using lightweight API-based embeddings and ChromaDB
"""

import os
import hashlib
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.config import Settings

from .embedding_client import get_embedding_client


class CodeEmbedder:
    """
    Handles code embedding generation and vector storage.
    Uses lightweight API-based embeddings and ChromaDB for storage.
    """

    def __init__(self):
        # Initialize lightweight embedding client (no large models)
        print("🔄 Initializing embedding client...")
        self.embedding_client = get_embedding_client()
        
        # Initialize ChromaDB
        chroma_path = os.getenv("CHROMA_PATH", "./chroma_data")
        self.chroma = chromadb.PersistentClient(
            path=chroma_path,
            settings=Settings(anonymized_telemetry=False)
        )
        
        print("✅ Embedder initialized")

    def _get_collection_name(self, repo_id: str) -> str:
        """Convert repo_id to a valid collection name"""
        # ChromaDB collection names must be 3-63 chars, alphanumeric with underscores
        safe_name = repo_id.replace('/', '_').replace('-', '_').lower()
        if len(safe_name) > 63:
            # Use hash for long names
            safe_name = safe_name[:55] + '_' + hashlib.md5(repo_id.encode()).hexdigest()[:7]
        return safe_name

    def _get_or_create_collection(self, repo_id: str):
        """Get or create a collection for a repository"""
        collection_name = self._get_collection_name(repo_id)
        return self.chroma.get_or_create_collection(
            name=collection_name,
            metadata={"repo_id": repo_id}
        )

    def get_symbols(self, repo_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get indexed symbols for a repository"""
        try:
            collection = self.chroma.get_collection(self._get_collection_name(repo_id))
            results = collection.get(
                limit=limit,
                include=["metadatas"]
            )
            
            symbols = []
            for i, id_ in enumerate(results['ids']):
                metadata = results['metadatas'][i] if results['metadatas'] else {}
                symbols.append({
                    "id": id_,
                    "name": metadata.get("name", ""),
                    "kind": metadata.get("kind", ""),
                    "filePath": metadata.get("file_path", ""),
                    "startLine": metadata.get("start_line", 0),
                    "endLine": metadata.get("end_line", 0),
                    "signature": metadata.get("signature", ""),
                    "language": metadata.get("language", ""),
                })
            
            return symbols
        except Exception as e:
            print(f"⚠️ Failed to get symbols for {repo_id}: {e}")
            return []

    def index_symbols(self, symbols: List[Any], repo_id: str) -> int:
        """
        Index a list of code symbols.
        Returns the number of symbols indexed.
        Accepts both CodeSymbol dataclass objects and dictionaries.
        """
        # Always create/get the collection first - ensures collection exists even with 0 symbols
        collection = self._get_or_create_collection(repo_id)
        
        if not symbols:
            return 0
        
        # Prepare data for embedding
        documents = []
        metadatas = []
        ids = []

        for symbol in symbols:
            # Handle both dataclass objects and dictionaries
            # Try dataclass attribute access first, fall back to dict
            def get_attr(obj, key, default=""):
                if hasattr(obj, key):
                    val = getattr(obj, key, default)
                    return val if val is not None else default
                elif hasattr(obj, 'get'):
                    val = obj.get(key, default)
                    return val if val is not None else default
                return default
            
            # Create a rich text representation for embedding
            doc_text = self._create_embedding_text_from_symbol(symbol, get_attr)
            documents.append(doc_text)
            
            # Store metadata
            metadatas.append({
                "name": str(get_attr(symbol, "name", "")),
                "kind": str(get_attr(symbol, "kind", "")),
                "file_path": str(get_attr(symbol, "file_path", "")),
                "start_line": int(get_attr(symbol, "start_line", 0) or 0),
                "end_line": int(get_attr(symbol, "end_line", 0) or 0),
                "signature": str(get_attr(symbol, "signature", "")),
                "docstring": str(get_attr(symbol, "docstring", "") or ""),
                "language": str(get_attr(symbol, "language", "")),
            })
            
            # Create unique ID
            symbol_id = f"{get_attr(symbol, 'file_path', '')}:{get_attr(symbol, 'name', '')}:{get_attr(symbol, 'start_line', 0)}"
            ids.append(hashlib.md5(symbol_id.encode()).hexdigest())

        # Generate embeddings using lightweight API client
        print(f"  📊 Generating embeddings for {len(documents)} symbols...")
        embeddings = self.embedding_client.embed(documents)
        print(f"  ✅ Embeddings generated successfully")

        # Add to collection (upsert to handle re-indexing)
        print(f"  💾 Storing in ChromaDB...")
        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=documents,
            metadatas=metadatas,
        )
        print(f"  ✅ Stored {len(symbols)} symbols in ChromaDB")

        return len(symbols)

    def _create_embedding_text_from_symbol(self, symbol, get_attr) -> str:
        """Create a text representation of the symbol for embedding"""
        parts = []
        
        # Include kind and name
        kind = get_attr(symbol, "kind", "unknown")
        name = get_attr(symbol, "name", "")
        parts.append(f"{kind} {name}")
        
        # Include signature if available
        signature = get_attr(symbol, "signature", "")
        if signature:
            parts.append(signature)
        
        # Include docstring if available
        docstring = get_attr(symbol, "docstring", "")
        if docstring:
            parts.append(docstring)
        
        # Include truncated body for context
        body = get_attr(symbol, "body", "")
        if body:
            # Take first 500 chars of body
            parts.append(body[:500])
        
        return "\n".join(parts)

    def _create_embedding_text(self, symbol: Dict[str, Any]) -> str:
        """Create a text representation of the symbol for embedding (dict version)"""
        parts = []
        
        # Include kind and name
        kind = symbol.get("kind", "unknown")
        name = symbol.get("name", "")
        parts.append(f"{kind} {name}")
        
        # Include signature if available
        if symbol.get("signature"):
            parts.append(symbol["signature"])
        
        # Include docstring if available
        if symbol.get("docstring"):
            parts.append(symbol["docstring"])
        
        # Include truncated body for context
        body = symbol.get("body", "")
        if body:
            # Take first 500 chars of body
            parts.append(body[:500])
        
        return "\n".join(parts)

    def search(
        self,
        repo_id: str,
        query: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search for symbols matching a query"""
        try:
            collection = self.chroma.get_collection(self._get_collection_name(repo_id))
        except Exception:
            return []

        # Generate query embedding using lightweight API client
        query_embedding = self.embedding_client.embed_query(query)

        # Search
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=limit,
            include=["documents", "metadatas", "distances"]
        )

        # Format results
        matches = []
        if results and results['ids'] and results['ids'][0]:
            for i, id_ in enumerate(results['ids'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                distance = results['distances'][0][i] if results['distances'] else 1.0
                
                matches.append({
                    "id": id_,
                    "name": metadata.get("name", ""),
                    "kind": metadata.get("kind", ""),
                    "filePath": metadata.get("file_path", ""),
                    "startLine": metadata.get("start_line", 0),
                    "endLine": metadata.get("end_line", 0),
                    "signature": metadata.get("signature", ""),
                    "relevance": 1 - distance,  # Convert distance to relevance
                })

        return matches

    def delete_collection(self, repo_id: str):
        """Delete the collection for a repository"""
        collection_name = self._get_collection_name(repo_id)
        try:
            self.chroma.delete_collection(collection_name)
            print(f"🗑️ Deleted collection for {repo_id}")
        except Exception as e:
            print(f"⚠️ Failed to delete collection for {repo_id}: {e}")

    def collection_exists(self, repo_id: str) -> bool:
        """Check if a collection exists for a repository"""
        collection_name = self._get_collection_name(repo_id)
        try:
            self.chroma.get_collection(collection_name)
            return True
        except Exception:
            return False

    def get_collection_stats(self, repo_id: str) -> Dict[str, Any]:
        """Get statistics for a collection"""
        try:
            collection = self.chroma.get_collection(self._get_collection_name(repo_id))
            return {
                "count": collection.count(),
                "name": collection.name,
            }
        except Exception:
            return {"count": 0, "name": None}

# Refactored on 2026-01-15