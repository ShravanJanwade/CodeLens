
import os
import httpx
from typing import Optional


class LLMClient:
    """
    LLM client supporting multiple free providers:
    1. Groq API (free tier: 30 req/min, Llama 3.1 70B)
    2. Ollama (local, unlimited)
    """

    def __init__(self):
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.model = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
        
        # Determine which provider to use
        if self.groq_api_key:
            self.provider = "groq"
            print(f"✅ Using Groq API with model: {self.model}")
        else:
            self.provider = "ollama"
            self.model = os.getenv("OLLAMA_MODEL", "llama3.1")
            print(f"✅ Using Ollama with model: {self.model}")

    async def generate(
        self,
        prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.3,
    ) -> str:
        """Generate response from LLM"""
        if self.provider == "groq":
            return await self._generate_groq(prompt, max_tokens, temperature)
        else:
            return await self._generate_ollama(prompt, max_tokens, temperature)

    async def _generate_groq(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using Groq API (free tier available)"""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.groq_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are an expert software engineer helping developers understand codebases. Provide clear, accurate, and helpful explanations."
                            },
                            {
                                "role": "user",
                                "content": prompt
                            }
                        ],
                        "max_tokens": max_tokens,
                        "temperature": temperature,
                    },
                )
                
                if response.status_code != 200:
                    error_text = response.text
                    print(f"❌ Groq API error (status {response.status_code}): {error_text}")
                    try:
                        error_msg = response.json().get("error", {}).get("message", error_text)
                    except:
                        error_msg = error_text
                    raise Exception(f"Groq API error: {error_msg}")
                
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"❌ LLM generation failed: {str(e)}")
            raise

    async def _generate_ollama(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Generate using local Ollama (completely free)"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.post(
                    f"{self.ollama_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "num_predict": max_tokens,
                            "temperature": temperature,
                        },
                    },
                )
                
                if response.status_code != 200:
                    raise Exception(f"Ollama error: {response.text}")
                
                data = response.json()
                return data.get("response", "")
                
            except httpx.ConnectError:
                raise Exception(
                    "Cannot connect to Ollama. Make sure Ollama is running: "
                    "https://ollama.ai/download"
                )
