
import os
from typing import Dict, Any, Optional, List

import chromadb
from chromadb.config import Settings

from .embedding_client import get_embedding_client
from .llm import LLMClient
from .prompts import (
    CODE_QA_PROMPT,
    EXPLAIN_SYMBOL_PROMPT,
    SUMMARIZE_FILE_PROMPT,
    FOLLOW_UP_PROMPT,
)


import logging

logger = logging.getLogger(__name__)

class CodeRAG:
    """
    Retrieval-Augmented Generation pipeline for code understanding.
    Retrieves relevant code context and generates answers using LLM.
    """

    def __init__(self):
        # Initialize lightweight embedding client (no large models)
        logger.info("🔄 Initializing embedding client...")
        try:
            self.embedding_client = get_embedding_client()
            logger.info("✅ Embedding client initialized")
        except Exception as e:
            logger.error(f"❌ Failed to initialize embedding client: {e}")
            raise

        # Initialize ChromaDB client (connects to same storage as indexer)
        chroma_path = os.getenv("CHROMA_PATH", "./chroma_data")
        logger.info(f"📁 Connecting to ChromaDB at: {chroma_path}")
        try:
            self.chroma = chromadb.PersistentClient(
                path=chroma_path,
                settings=Settings(anonymized_telemetry=False)
            )
            logger.info("✅ ChromaDB connected")
        except Exception as e:
            logger.error(f"❌ Failed to connect to ChromaDB: {e}")
            raise
        
        # Initialize LLM client
        logger.info("🤖 Initializing LLM client")
        try:
            self.llm = LLMClient()
            logger.info("✅ LLM client ready")
        except Exception as e:
            logger.error(f"❌ Failed to initialize LLM client: {e}")
            raise
        
        logger.info("✨ CodeRAG initialization complete")

    def _get_collection_name(self, repo_id: str) -> str:
        """Convert repo_id to collection name (must match indexer)"""
        import hashlib
        safe_name = repo_id.replace('/', '_').replace('-', '_').lower()
        if len(safe_name) > 63:
            safe_name = safe_name[:55] + '_' + hashlib.md5(repo_id.encode()).hexdigest()[:7]
        return safe_name

    def _get_collection(self, repo_id: str):
        """Get collection for a repository, returns None if not found"""
        collection_name = self._get_collection_name(repo_id)
        try:
            coll = self.chroma.get_collection(collection_name)
            logger.info(f"✅ Found collection {collection_name} with {coll.count()} items")
            return coll
        except Exception as e:
            logger.warning(f"❌ Collection not found for {repo_id} ({collection_name}): {e}")
            return None

    async def retrieve_context(
        self,
        query: str,
        repo_id: str,
        limit: int = 8,
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant code context for a query"""
        collection = self._get_collection(repo_id)
        
        # Return empty if collection doesn't exist
        if collection is None:
            logger.info(f"⚠️ Collection for {repo_id} not found, returning empty context.")
            return []
        
        # Generate query embedding using lightweight client
        # Query collection
        try:
            query_embedding = self.embedding_client.embed_query(query)
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=limit,
                include=["documents", "metadatas", "distances"]
            )
            
            if not results["documents"] or not results["documents"][0]:
                logger.info(f"⚠️ No matching documents found in collection for query: '{query}'")
                return []
                
            logger.info(f"✅ Found {len(results['documents'][0])} contexts for query")
        except Exception as e:
            logger.error(f"❌ Error querying ChromaDB for {repo_id}: {e}")
            return []
        
        # Format results
        contexts = []
        if results and results['ids'] and results['ids'][0]:
            for i, id_ in enumerate(results['ids'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                document = results['documents'][0][i] if results['documents'] else ""
                distance = results['distances'][0][i] if results['distances'] else 1.0
                
                contexts.append({
                    "id": id_,
                    "content": document,
                    "relevance": 1 - distance,
                    "name": metadata.get("name", ""),
                    "kind": metadata.get("kind", ""),
                    "file_path": metadata.get("file_path", ""),
                    "start_line": metadata.get("start_line", 0),
                    "end_line": metadata.get("end_line", 0),
                    "signature": metadata.get("signature", ""),
                    "docstring": metadata.get("docstring", ""),
                })
        
        return contexts

    def _format_context_for_llm(self, contexts: List[Dict[str, Any]]) -> str:
        """Format retrieved contexts for LLM prompt"""
        if not contexts:
            return "No relevant code found in the repository."
        
        formatted_parts = []
        for i, ctx in enumerate(contexts, 1):
            part = f"""
### Code Snippet {i}
**{ctx['kind'].title()}:** `{ctx['name']}`
**File:** {ctx['file_path']} (lines {ctx['start_line']}-{ctx['end_line']})
**Signature:** `{ctx['signature']}`
{f"**Description:** {ctx['docstring']}" if ctx.get('docstring') else ""}

```
{ctx['content'][:1000]}
```
"""
            formatted_parts.append(part.strip())
        
        return "\n\n---\n\n".join(formatted_parts)

    async def query(
        self,
        question: str,
        repo_id: str,
        context: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Answer a question about the codebase"""
        print(f"🔍 Processing query for {repo_id}: {question}")
        
        # 1. Retrieve relevant code context
        contexts = await self.retrieve_context(question, repo_id, limit=8)
        
        if not contexts:
            # Check if collection exists but is empty
            stats = {"count": 0, "name": None}
            try:
                collection_name = self._get_collection_name(repo_id)
                collection = self.chroma.get_collection(collection_name)
                stats = {"count": collection.count(), "name": collection_name}
            except Exception:
                pass
            
            if stats["name"] is None:
                msg = f"Repository '{repo_id}' has not been indexed yet. Please go to the 'Index' tab and click 'Index Repository'."
            elif stats["count"] == 0:
                msg = f"Repository '{repo_id}' is indexed but no code symbols were found. This might be because the repository contains no supported code files or the branch is empty."
            else:
                msg = "I couldn't find any code relevant to your question in the indexed repository. Try rephrasing your question or indexing a different branch."

            return {
                "answer": msg,
                "sources": [],
                "followUpQuestions": [],
            }
        
        # 2. Format context for LLM
        formatted_context = self._format_context_for_llm(contexts)
        
        # 3. Add user's current context if provided
        current_context = ""
        if context:
            if context.get("currentFile"):
                current_context += f"\nUser is currently viewing: {context['currentFile']}"
            if context.get("selectedCode"):
                current_context += f"\nSelected code:\n```\n{context['selectedCode'][:500]}\n```"
        
        # 4. Generate answer using LLM
        prompt = CODE_QA_PROMPT.format(
            context=formatted_context,
            current_context=current_context,
            question=question,
        )
        
        answer = await self.llm.generate(prompt)
        
        # 5. Generate follow-up questions
        follow_up_prompt = FOLLOW_UP_PROMPT.format(
            question=question,
            answer=answer[:500],
        )
        follow_up_response = await self.llm.generate(follow_up_prompt)
        follow_up_questions = self._parse_follow_up_questions(follow_up_response)
        
        # 6. Format sources
        sources = [
            {
                "file": ctx["file_path"],
                "symbol": ctx["name"],
                "lines": f"{ctx['start_line']}-{ctx['end_line']}",
                "relevance": round(ctx["relevance"], 3),
                "snippet": ctx["signature"],
            }
            for ctx in contexts[:5]  # Top 5 sources
        ]
        
        return {
            "answer": answer,
            "sources": sources,
            "followUpQuestions": follow_up_questions[:3],
        }

    async def explain_symbol(
        self,
        repo_id: str,
        symbol_name: str,
        file_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Explain a specific symbol in detail"""
        collection = self._get_collection(repo_id)
        
        # Return error if collection doesn't exist
        if collection is None:
            return {
                "explanation": f"Repository '{repo_id}' has not been indexed yet. Please index the repository first.",
                "symbol": None,
            }
        
        # Find the symbol
        where_filter = {"name": symbol_name}
        if file_path:
            where_filter = {
                "$and": [
                    {"name": symbol_name},
                    {"file_path": file_path}
                ]
            }
        
        results = collection.get(
            where=where_filter,
            limit=1,
            include=["documents", "metadatas"],
        )
        
        if not results or not results['ids']:
            return {
                "explanation": f"Symbol '{symbol_name}' not found in the indexed codebase.",
                "symbol": None,
            }
        
        metadata = results['metadatas'][0]
        document = results['documents'][0]
        
        # Generate explanation
        prompt = EXPLAIN_SYMBOL_PROMPT.format(
            name=metadata.get("name", symbol_name),
            kind=metadata.get("kind", "unknown"),
            file_path=metadata.get("file_path", "unknown"),
            signature=metadata.get("signature", ""),
            docstring=metadata.get("docstring", "No documentation"),
            code=document[:1500],
        )
        
        explanation = await self.llm.generate(prompt)
        
        return {
            "explanation": explanation,
            "symbol": {
                "name": metadata.get("name"),
                "kind": metadata.get("kind"),
                "filePath": metadata.get("file_path"),
                "startLine": metadata.get("start_line"),
                "endLine": metadata.get("end_line"),
                "signature": metadata.get("signature"),
            },
        }

    async def summarize_file(
        self,
        repo_id: str,
        file_path: str,
    ) -> Dict[str, Any]:
        """Summarize all symbols in a file"""
        collection = self._get_collection(repo_id)
        
        # Return error if collection doesn't exist
        if collection is None:
            return {
                "summary": f"Repository '{repo_id}' has not been indexed yet. Please index the repository first.",
                "symbols": [],
            }
        
        # Get all symbols in the file
        results = collection.get(
            where={"file_path": file_path},
            include=["documents", "metadatas"],
        )
        
        if not results or not results['ids']:
            return {
                "summary": f"No indexed symbols found in '{file_path}'",
                "symbols": [],
            }
        
        # Format symbols for summary
        symbols_info = []
        for i, id_ in enumerate(results['ids']):
            metadata = results['metadatas'][i]
            symbols_info.append(f"- {metadata.get('kind', 'unknown')} `{metadata.get('name', 'unknown')}`: {metadata.get('signature', '')}")
        
        symbols_text = "\n".join(symbols_info)
        
        prompt = SUMMARIZE_FILE_PROMPT.format(
            file_path=file_path,
            symbols=symbols_text,
        )
        
        summary = await self.llm.generate(prompt)
        
        return {
            "summary": summary,
            "symbols": [
                {
                    "name": m.get("name"),
                    "kind": m.get("kind"),
                    "signature": m.get("signature"),
                }
                for m in results['metadatas']
            ],
        }

    def _parse_follow_up_questions(self, response: str) -> List[str]:
        """Parse follow-up questions from LLM response"""
        questions = []
        for line in response.strip().split('\n'):
            line = line.strip()
            # Remove numbering and common prefixes
            for prefix in ['1.', '2.', '3.', '-', '*', '•']:
                if line.startswith(prefix):
                    line = line[len(prefix):].strip()
                    break
            if line and '?' in line and len(line) > 10:
                questions.append(line)
        return questions[:3]

