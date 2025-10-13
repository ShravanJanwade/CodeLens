import type {
  IndexStatus,
  QueryRequest,
  QueryResponse,
  CodeSymbol,
  HealthResponse,
} from "../types";

const DEFAULT_API_URL = "http://localhost:8080/api/v1";

class ApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl: string = DEFAULT_API_URL, timeout: number = 30000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async init() {
    // Load settings from storage if available
    if (typeof chrome !== 'undefined' && chrome.storage) {
      try {
        const result = await chrome.storage.local.get('codelens-storage');
        if (result['codelens-storage']?.state?.settings?.apiUrl) {
          this.setBaseUrl(result['codelens-storage'].state.settings.apiUrl);
        }
      } catch (error) {
        console.warn('Failed to load API URL from storage:', error);
      }
    }
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.endsWith("/api/v1") ? url : `${url}/api/v1`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const url = `${this.baseUrl}${endpoint}`;

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          message: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new Error(error.message || error.error || "Request failed");
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timeout");
      }
      throw error;
    }
  }

  // ============================================================
  // Index Endpoints
  // ============================================================

  async startIndex(
    owner: string,
    repo: string,
    branch: string = "main",
    force: boolean = false
  ): Promise<{ jobId: string; message: string }> {
    return this.request("/index", {
      method: "POST",
      body: JSON.stringify({ owner, repo, branch, force }),
    });
  }

  async getIndexStatus(repoId: string): Promise<IndexStatus> {
    return this.request(`/index/${encodeURIComponent(repoId)}`);
  }

  async deleteIndex(repoId: string): Promise<{ message: string }> {
    return this.request(`/index/${encodeURIComponent(repoId)}`, {
      method: "DELETE",
    });
  }

  // ============================================================
  // Query Endpoints
  // ============================================================

  async query(request: QueryRequest): Promise<QueryResponse> {
    return this.request("/query", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  async analyzeSymbol(
    repoId: string,
    symbolName: string,
    filePath: string
  ): Promise<{ explanation: string; symbol?: CodeSymbol }> {
    return this.request("/analyze", {
      method: "POST",
      body: JSON.stringify({ repoId, symbolName, filePath }),
    });
  }

  // ============================================================
  // Symbols Endpoints
  // ============================================================

  async getSymbols(repoId: string, limit: number = 100): Promise<CodeSymbol[]> {
    return this.request(
      `/symbols/${encodeURIComponent(repoId)}?limit=${limit}`
    );
  }

  async searchSymbols(repoId: string, query: string): Promise<CodeSymbol[]> {
    return this.request(
      `/symbols/${encodeURIComponent(repoId)}/search?q=${encodeURIComponent(
        query
      )}`
    );
  }

  // ============================================================
  // Health Endpoints
  // ============================================================

  async health(): Promise<HealthResponse> {
    const response = await this.request<{
      status: string;
      services: Record<string, boolean>;
      time: string;
    }>("/health");

    return {
      status: response.status as "ok" | "degraded" | "error",
      services: {
        gateway: true, // If we got a response, gateway is up
        indexer: response.services?.indexer ?? false,
        query: response.services?.query ?? false,
      },
      time: response.time,
    };
  }
}

// Export singleton instance
export const api = new ApiClient();

// Export class for testing
export { ApiClient };
