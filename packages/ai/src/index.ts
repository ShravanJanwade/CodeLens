// ============================================================
// AI Provider Abstraction
// ============================================================
// Supports Ollama (local) and DemoProvider (deployed demo).
// Use environment variable AI_PROVIDER to switch: 'ollama' | 'demo'
// ============================================================

import { GeminiProvider } from './gemini';
export interface LLMProvider {
  /** Generate a completion from a prompt */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;

  /** Stream a completion token by token */
  stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string>;

  /** Generate structured JSON output */
  structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T>;

  /** Execute a tool call based on LLM reasoning */
  toolCall(prompt: string, tools: ToolDefinition[], options?: GenerateOptions): Promise<ToolCallResult>;

  /** Provider name for logging/evaluation */
  readonly name: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  stop?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  type: 'read_only' | 'mutating';
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolCallResult {
  toolName: string;
  arguments: Record<string, unknown>;
  reasoning: string;
}

// ============================================================
// Ollama Provider — Local open-source LLM
// ============================================================

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = options?.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = options?.model || process.env.OLLAMA_MODEL || 'qwen2.5:7b';
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
        stream: false,
        options: {
          temperature: options?.temperature ?? 0.3,
          num_predict: options?.maxTokens ?? 2048,
          stop: options?.stop,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { response: string };
    return data.response;
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.3,
          num_predict: options?.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter(Boolean)) {
        try {
          const data = JSON.parse(line) as { response: string; done: boolean };
          if (data.response) yield data.response;
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  async structuredOutput<T>(prompt: string, schema: object, options?: GenerateOptions): Promise<T> {
    const structuredPrompt = `${prompt}\n\nRespond with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n\nJSON response:`;
    const result = await this.generate(structuredPrompt, { ...options, temperature: 0.1 });

    // Extract JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to extract JSON from LLM response');
    return JSON.parse(jsonMatch[0]) as T;
  }

  async toolCall(
    prompt: string,
    tools: ToolDefinition[],
    options?: GenerateOptions,
  ): Promise<ToolCallResult> {
    const toolsDescription = tools
      .map((t) => `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(t.parameters)}`)
      .join('\n');

    const toolPrompt = `${prompt}\n\nAvailable tools:\n${toolsDescription}\n\nSelect the best tool and provide arguments. Respond with JSON:\n{"toolName": "...", "arguments": {...}, "reasoning": "..."}`;

    return this.structuredOutput<ToolCallResult>(toolPrompt, {}, options);
  }
}

// ============================================================
// Demo Provider — Deterministic responses for public demo
// ============================================================
// This provider does NOT use any LLM. It returns pre-scripted
// responses that demonstrate the system's capabilities honestly.
// Clearly labeled as demo mode in the UI.
// ============================================================

export class DemoProvider implements LLMProvider {
  readonly name = 'demo';

  private responses: Map<string, string> = new Map([
    [
      'root_cause',
      'Payment service v1.8.3 introduced a database connection leak in the retry logic. Connection pool utilization increased from 41% to 96% within 47 seconds of deployment. 86% of failing requests involve the payment repository database call. The previous version (v1.8.2) shows normal connection utilization patterns.',
    ],
    [
      'remediation',
      'Recommended action: Rollback payment-service from v1.8.3 to v1.8.2. This is the safest remediation because v1.8.2 has a proven healthy baseline and the regression is clearly localized to the new deployment.',
    ],
    [
      'investigation',
      'I am analyzing the incident by examining metrics, logs, traces, and deployment history to identify the root cause.',
    ],
    [
      'hypothesis',
      'Based on the evidence, the most likely root cause is a database connection pool exhaustion caused by the v1.8.3 deployment. Supporting evidence: 1) Connection pool at 96% 2) Error rate spike correlated with deployment 3) Rollback of similar issue in v1.8.1 was successful.',
    ],
  ]);

  async generate(prompt: string, _options?: GenerateOptions): Promise<string> {
    // Match prompt to pre-scripted responses
    const lower = prompt.toLowerCase();

    if (lower.includes('root cause') || lower.includes('diagnos')) {
      return this.responses.get('root_cause')!;
    }
    if (lower.includes('remediat') || lower.includes('rollback') || lower.includes('fix')) {
      return this.responses.get('remediation')!;
    }
    if (lower.includes('investigat') || lower.includes('analyz')) {
      return this.responses.get('investigation')!;
    }
    if (lower.includes('hypothes')) {
      return this.responses.get('hypothesis')!;
    }

    return '[Demo Mode] This is a deterministic demo response. In production, this would be generated by a local LLM via Ollama.';
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncGenerator<string> {
    const response = await this.generate(prompt, options);
    // Simulate streaming by yielding word by word with slight delays
    for (const word of response.split(' ')) {
      yield word + ' ';
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  async structuredOutput<T>(prompt: string, _schema: object, _options?: GenerateOptions): Promise<T> {
    // Return deterministic structured output based on context
    const lower = prompt.toLowerCase();

    if (lower.includes('tool') || lower.includes('select')) {
      return {
        toolName: 'get_service_metrics',
        arguments: { service: 'payment-service', window: '5m' },
        reasoning: '[Demo] Selecting metrics tool to investigate payment service degradation',
      } as T;
    }

    return { result: 'demo_response' } as T;
  }

  async toolCall(
    prompt: string,
    tools: ToolDefinition[],
    _options?: GenerateOptions,
  ): Promise<ToolCallResult> {
    // Deterministic tool selection based on investigation stage
    const lower = prompt.toLowerCase();

    if (lower.includes('metric')) {
      const tool = tools.find((t) => t.name.includes('metric'));
      return {
        toolName: tool?.name || 'get_service_metrics',
        arguments: { service: 'payment-service', window: '5m' },
        reasoning: '[Demo] Querying metrics to assess service health',
      };
    }

    if (lower.includes('log')) {
      const tool = tools.find((t) => t.name.includes('log'));
      return {
        toolName: tool?.name || 'query_logs',
        arguments: { service: 'payment-service', level: 'error', limit: 50 },
        reasoning: '[Demo] Querying error logs for failure patterns',
      };
    }

    if (lower.includes('deploy')) {
      const tool = tools.find((t) => t.name.includes('deploy'));
      return {
        toolName: tool?.name || 'get_recent_deployments',
        arguments: { service: 'payment-service' },
        reasoning: '[Demo] Checking recent deployments for correlation',
      };
    }

    // Default: first read-only tool
    const readTool = tools.find((t) => t.type === 'read_only') || tools[0];
    return {
      toolName: readTool.name,
      arguments: {},
      reasoning: '[Demo] Default tool selection for investigation',
    };
  }
}

// ============================================================
// Provider Factory
// ============================================================

export function createLLMProvider(provider?: string): LLMProvider {
  const providerType = provider || process.env.AI_PROVIDER || 'demo';

  switch (providerType) {
    case 'gemini':
      return new GeminiProvider();
    case 'ollama':
      return new OllamaProvider();
    case 'demo':
      return new DemoProvider();
    default:
      console.warn(`Unknown AI provider "${providerType}", falling back to demo`);
      return new DemoProvider();
  }
}

export { type ToolDefinition as AgentTool };
