export interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  endLine: number;
}
export interface SourceFile {
  id: string;
  path: string;
  language: string;
  summary: string;
  imports: string[];
  symbols: SymbolInfo[];
  content?: string;
  revision?: string;
  contentHash?: string;
}
export interface IndexRun {
  id: string;
  branch: string;
  commitSha: string | null;
  status: string;
  progress: number;
  filesProcessed: number;
  totalFiles: number;
  symbolsIndexed: number;
  coverage: string;
  error: string | null;
  startedAt: string;
}
export interface Repository {
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  language: string | null;
  analysisRuns: IndexRun[];
  snapshot: IndexRun | null;
  files: SourceFile[];
  dependencyGraph: Array<{ id: string; sourcePath: string; targetPath: string }>;
  findings: Array<{
    id: string;
    title: string;
    filePath: string;
    line: number;
    severity: string;
    description: string;
    suggestion?: string | null;
  }>;
}
export interface Citation {
  path: string;
  startLine: number;
  endLine: number;
  revision: string;
  summary: string;
}
