
import os
import chromadb
from chromadb.config import Settings
import hashlib

def get_collection_name(repo_id: str) -> str:
    safe_name = repo_id.replace('/', '_').replace('-', '_').lower()
    if len(safe_name) > 63:
        safe_name = safe_name[:55] + '_' + hashlib.md5(repo_id.encode()).hexdigest()[:7]
    return safe_name

def inspect_chroma():
    chroma_path = os.getenv("CHROMA_PATH", "./chroma_data")
    if not os.path.exists(chroma_path):
        # Check relative to root as well
        chroma_path = os.path.join(os.getcwd(), "services", "indexer", "chroma_data")
        if not os.path.exists(chroma_path):
             chroma_path = "./services/indexer/chroma_data"
    
    print(f"🔍 Inspecting ChromaDB at: {chroma_path}")
    
    try:
        client = chromadb.PersistentClient(
            path=chroma_path,
            settings=Settings(anonymized_telemetry=False)
        )
        
        collections = client.list_collections()
        print(f"📦 Found {len(collections)} collections:")
        
        for coll in collections:
            count = coll.count()
            print(f"  - {coll.name}: {count} items")
            if count > 0:
                # Peek at the first item
                peek = coll.peek(limit=1)
                if peek['metadatas']:
                    print(f"    Sample metadata: {peek['metadatas'][0]}")
    
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    inspect_chroma()
