# ============================================================
# CodeLens AI - Complete Project Setup Script
# ============================================================
# Run this script to create the entire project structure
# ============================================================

#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Creating CodeLens AI Project Structure...${NC}"

# Create root directory
mkdir -p codelens-ai
cd codelens-ai

# ============================================================
# 1. EXTENSION SETUP (TypeScript + React + Vite)
# ============================================================
echo -e "${YELLOW}📦 Setting up Chrome Extension...${NC}"

mkdir -p extension
cd extension

# Create package.json
cat > package.json << 'EOF'
{
  "name": "codelens-ai-extension",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "watch": "vite build --watch",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.7",
    "lucide-react": "^0.294.0",
    "clsx": "^2.0.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.254",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.3.6",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}
EOF

# Create vite.config.ts
cat > vite.config.ts << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
EOF

# Create tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

# Create tsconfig.node.json
cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

# Create tailwind.config.js
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.html",
  ],
  theme: {
    extend: {
      colors: {
        github: {
          bg: '#0d1117',
          surface: '#161b22',
          border: '#30363d',
          text: '#c9d1d9',
          accent: '#58a6ff',
        },
      },
    },
  },
  plugins: [],
};
EOF

# Create postcss.config.js
cat > postcss.config.js << 'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF

# Create directory structure
mkdir -p src/{background,content,sidepanel/{components,hooks,store},popup,shared/{types,utils,api}}
mkdir -p public/icons

# Create manifest.json
cat > public/manifest.json << 'EOF'
{
  "manifest_version": 3,
  "name": "CodeLens AI",
  "version": "1.0.0",
  "description": "AI-powered code understanding for GitHub repositories",
  "permissions": [
    "activeTab",
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "https://github.com/*",
    "https://api.github.com/*",
    "http://localhost:8080/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://github.com/*"],
      "js": ["content.js"],
      "css": ["content.css"]
    }
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_popup": "popup.html",
    "default_title": "CodeLens AI",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
EOF

# Create HTML files
cat > popup.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeLens AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/popup/index.tsx"></script>
  </body>
</html>
EOF

cat > sidepanel.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeLens AI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/sidepanel/index.tsx"></script>
  </body>
</html>
EOF

cd ..

# ============================================================
# 2. GO GATEWAY SETUP
# ============================================================
echo -e "${YELLOW}🔧 Setting up Go Gateway...${NC}"

mkdir -p gateway
cd gateway

# Initialize Go module
cat > go.mod << 'EOF'
module github.com/codelens-ai/gateway

go 1.21

require (
	github.com/gofiber/fiber/v2 v2.51.0
	github.com/gofiber/websocket/v2 v2.2.1
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/google/uuid v1.5.0
	github.com/rs/zerolog v1.31.0
	golang.org/x/time v0.5.0
)
EOF

# Create directory structure
mkdir -p cmd/server
mkdir -p internal/{config,middleware,handlers,websocket,circuit,cache,proxy,models}

cd ..

# ============================================================
# 3. PYTHON SERVICES SETUP
# ============================================================
echo -e "${YELLOW}🐍 Setting up Python Services...${NC}"

mkdir -p services/{indexer,query}/{app,tests}

# Indexer requirements
cat > services/indexer/requirements.txt << 'EOF'
fastapi==0.108.0
uvicorn[standard]==0.25.0
tree-sitter==0.20.4
tree-sitter-python==0.20.4
tree-sitter-javascript==0.20.3
tree-sitter-typescript==0.20.3
chromadb==0.4.22
sentence-transformers==2.2.2
gitpython==3.1.40
httpx==0.26.0
pydantic==2.5.3
python-dotenv==1.0.0
EOF

# Query requirements  
cat > services/query/requirements.txt << 'EOF'
fastapi==0.108.0
uvicorn[standard]==0.25.0
langchain==0.1.0
langchain-community==0.0.10
chromadb==0.4.22
sentence-transformers==2.2.2
groq==0.4.1
httpx==0.26.0
pydantic==2.5.3
python-dotenv==1.0.0
EOF

# ============================================================
# 4. DOCKER COMPOSE
# ============================================================
echo -e "${YELLOW}🐳 Creating Docker Compose...${NC}"

cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  gateway:
    build: 
      context: ./gateway
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - INDEXER_URL=http://indexer:8001
      - QUERY_URL=http://query:8002
      - JWT_SECRET=your-secret-key-change-in-production
    depends_on:
      - indexer
      - query

  indexer:
    build:
      context: ./services/indexer
      dockerfile: Dockerfile
    ports:
      - "8001:8001"
    environment:
      - CHROMA_PATH=/data/chroma
      - GITHUB_TOKEN=${GITHUB_TOKEN:-}
    volumes:
      - indexer_data:/data

  query:
    build:
      context: ./services/query
      dockerfile: Dockerfile
    ports:
      - "8002:8002"
    environment:
      - CHROMA_PATH=/data/chroma
      - GROQ_API_KEY=${GROQ_API_KEY}
    volumes:
      - indexer_data:/data

volumes:
  indexer_data:
EOF

# ============================================================
# 5. ENV TEMPLATE
# ============================================================
cat > .env.example << 'EOF'
# GitHub Token (optional, increases rate limit from 60 to 5000 req/hr)
GITHUB_TOKEN=ghp_your_github_token

# Groq API Key (free tier: https://console.groq.com)
GROQ_API_KEY=gsk_your_groq_api_key

# Gateway settings
JWT_SECRET=change-this-to-a-secure-random-string
PORT=8080
EOF

# ============================================================
# 6. README
# ============================================================
cat > README.md << 'EOF'
# CodeLens AI

AI-powered code understanding for GitHub repositories.

## Tech Stack

- **Extension**: TypeScript, React, Tailwind CSS
- **Gateway**: Go (Fiber)
- **ML Services**: Python (FastAPI, LangChain)
- **Vector DB**: ChromaDB (free, local)
- **LLM**: Groq API (free tier) or Ollama (local)

## Quick Start

### 1. Get API Keys (Free)

- **Groq API**: https://console.groq.com (free, 30 req/min)
- **GitHub Token** (optional): https://github.com/settings/tokens

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run Services

```bash
# Terminal 1: Go Gateway
cd gateway && go run cmd/server/main.go

# Terminal 2: Python Indexer
cd services/indexer && pip install -r requirements.txt && uvicorn app.main:app --port 8001

# Terminal 3: Python Query
cd services/query && pip install -r requirements.txt && uvicorn app.main:app --port 8002

# Terminal 4: Extension
cd extension && npm install && npm run dev
```

### 4. Load Extension

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/dist` folder

## Project Structure

```
codelens-ai/
├── extension/          # Chrome Extension
├── gateway/            # Go API Gateway
├── services/
│   ├── indexer/        # Python indexing service
│   └── query/          # Python RAG query service
├── docker-compose.yml
└── README.md
```
EOF

echo -e "${GREEN}✅ Project structure created!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. cd codelens-ai"
echo "2. Get free Groq API key from https://console.groq.com"
echo "3. Copy .env.example to .env and add your keys"
echo "4. Run the setup commands from README.md"