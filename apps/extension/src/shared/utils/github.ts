import type { GitHubContext } from "../types";

export function parseGitHubUrl(url: string): GitHubContext | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname !== "github.com") return null;

    const pathname = urlObj.pathname;
    const parts = pathname.split("/").filter(Boolean);

    if (parts.length < 2) return null;

    const [owner, repo, ...rest] = parts;

    const context: GitHubContext = {
      owner,
      repo: repo.replace(".git", ""),
      branch: "main",
      path: "",
      type: "repo",
      url,
    };

    if (rest.length === 0) {
      return context;
    }

    const [action, ...actionParts] = rest;

    switch (action) {
      case "blob": {
        const [branch, ...pathParts] = actionParts;
        context.branch = branch || "main";
        context.path = pathParts.join("/");
        context.type = "file";
        break;
      }
      case "tree": {
        const [branch, ...pathParts] = actionParts;
        context.branch = branch || "main";
        context.path = pathParts.join("/");
        context.type = "directory";
        break;
      }
      case "pull": {
        context.type = "pr";
        context.path = actionParts[0] || "";
        break;
      }
      case "commit": {
        context.type = "commit";
        context.path = actionParts[0] || "";
        break;
      }
    }

    return context;
  } catch {
    return null;
  }
}

export function getRepoId(context: GitHubContext): string {
  return `${context.owner}/${context.repo}`;
}

export function isCodeFile(filePath: string): boolean {
  const codeExtensions = [
    ".py",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".go",
    ".rs",
    ".java",
    ".cpp",
    ".c",
  ];
  return codeExtensions.some((ext) => filePath.endsWith(ext));
}

export function getLanguageFromPath(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    py: "python",
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    go: "go",
    rs: "rust",
    java: "java",
  };
  return ext ? langMap[ext] || null : null;
}
