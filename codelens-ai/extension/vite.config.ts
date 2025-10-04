import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-extension-files",
      writeBundle() {
        const distDir = resolve(__dirname, "dist");
        const assetsDir = resolve(distDir, "assets");
        
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        
        // Copy manifest.json
        copyFileSync(
          resolve(__dirname, "public/manifest.json"),
          resolve(distDir, "manifest.json")
        );
        
        // Copy content.css from assets to root (find the hashed file)
        if (existsSync(assetsDir)) {
          const files = readdirSync(assetsDir);
          const contentCss = files.find(f => f.startsWith("content-") && f.endsWith(".css"));
          if (contentCss) {
            copyFileSync(
              resolve(assetsDir, contentCss),
              resolve(distDir, "content.css")
            );
          }
        }
        
        // Also copy the content styles.css if it exists
        const contentStylesPath = resolve(__dirname, "src/content/styles.css");
        if (existsSync(contentStylesPath)) {
          copyFileSync(
            contentStylesPath,
            resolve(distDir, "content.css")
          );
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === "background" || chunkInfo.name === "content"
            ? "[name].js"
            : "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          // Keep content CSS at a predictable location
          if (assetInfo.name && assetInfo.name.includes("content")) {
            return "assets/[name]-[hash].[ext]";
          }
          return "assets/[name]-[hash].[ext]";
        },
      },
    },
    sourcemap: process.env.NODE_ENV === "development",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
  },
});
