import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Copy, Check, ExternalLink, X, Code2, Zap, Bug, Lightbulb } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore } from "../store";
import type { GitHubContext, Message } from "@/shared/types";

interface Props {
  context: GitHubContext;
}

const SUGGESTED_QUESTIONS = [
  "How does the authentication system work?",
  "What are the main components of this codebase?",
  "Explain the data flow in this application",
  "What design patterns are used here?",
  "Find potential bugs or issues",
  "Suggest performance improvements",
];

const QUICK_ACTIONS = [
  { id: "explain", label: "Explain Code", icon: Lightbulb, prompt: "Explain this code in detail:" },
  { id: "bugs", label: "Find Bugs", icon: Bug, prompt: "Find potential bugs or issues in this code:" },
  { id: "improve", label: "Improve", icon: Zap, prompt: "Suggest improvements for this code:" },
];

export default function Chat({ context }: Props) {
  const { messages, addMessage, isQuerying, setIsQuerying, selectedCode, selectedCodeFile, setSelectedCode } = useStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const repoId = `${context.owner}/${context.repo}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + "px";
    }
  }, [input]);

  const handleSubmit = async (question: string = input, includeCode: boolean = true) => {
    if (!question.trim() || isQuerying) return;

    // Format message to include selected code context
    let displayContent = question.trim();
    if (includeCode && selectedCode) {
      displayContent = `${question.trim()}\n\n\`\`\`\n${selectedCode.slice(0, 200)}${selectedCode.length > 200 ? '...' : ''}\n\`\`\``;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: displayContent,
      timestamp: Date.now(),
    };

    addMessage(userMessage);
    setInput("");
    setIsQuerying(true);

    try {
      const response = await chrome.runtime.sendMessage({
        type: "QUERY",
        payload: {
          repoId,
          question: question.trim(),
          context: {
            currentFile: selectedCodeFile || context.path,
            selectedCode: includeCode ? selectedCode : undefined,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.answer,
        sources: response.sources,
        timestamp: Date.now(),
      };

      addMessage(assistantMessage);
      
      // Clear selected code after successful query
      if (selectedCode) {
        setSelectedCode(null, null);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Sorry, I encountered an error: ${(error as Error).message}`,
        timestamp: Date.now(),
      };
      addMessage(errorMessage);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleQuickAction = (prompt: string) => {
    if (selectedCode) {
      handleSubmit(prompt, true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-6">
            {/* Welcome */}
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-github-accent/20 via-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Sparkles className="w-8 h-8 text-github-accent" />
              </div>
              <h3 className="font-semibold text-lg text-white mb-2">
                Ask about this codebase
              </h3>
              <p className="text-sm text-gray-400 max-w-xs mx-auto">
                I can help you understand how the code works, find bugs, and suggest improvements
              </p>
            </div>

            {/* Suggested Questions */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider px-1">
                Suggested questions
              </p>
              <div className="grid gap-2">
                {SUGGESTED_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSubmit(q)}
                    className="text-left px-4 py-3 bg-github-surface/50 border border-github-border/50 rounded-xl text-sm hover:border-github-accent/50 hover:bg-github-surface transition-all group"
                  >
                    <span className="text-gray-300 group-hover:text-white transition-colors">
                      {q}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} context={context} />
            ))}
            {isQuerying && (
              <div className="flex items-center gap-3 p-4 bg-github-surface/30 rounded-xl">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-github-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-github-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-github-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-sm text-gray-400">Analyzing code...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selected Code Preview */}
      {selectedCode && (
        <div className="px-4 py-3 border-t border-github-border bg-gradient-to-r from-github-surface/50 to-github-bg">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-github-accent/10 rounded-lg">
                <Code2 className="w-4 h-4 text-github-accent" />
              </div>
              <div>
                <span className="text-xs font-medium text-white">Selected Code</span>
                {selectedCodeFile && (
                  <span className="text-xs text-gray-500 ml-2 truncate">• {selectedCodeFile.split('/').pop()}</span>
                )}
              </div>
            </div>
            <button 
              onClick={() => setSelectedCode(null, null)}
              className="p-1 hover:bg-github-surface rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          </div>
          
          {/* Code Preview */}
          <div className="bg-github-bg border border-github-border rounded-lg p-2 mb-3 max-h-24 overflow-y-auto">
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap break-all">
              {selectedCode.slice(0, 300)}{selectedCode.length > 300 ? '...' : ''}
            </pre>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2 flex-wrap">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={isQuerying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-github-surface/80 border border-github-border/50 text-xs font-medium text-gray-300 rounded-lg hover:bg-github-accent/10 hover:border-github-accent/30 hover:text-white transition-all disabled:opacity-50"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-github-border bg-gradient-to-t from-github-bg to-transparent">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedCode ? "Ask about the selected code..." : "Ask about the code..."}
            rows={1}
            className="flex-1 bg-github-surface border border-github-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-github-accent focus:ring-1 focus:ring-github-accent/50 transition-all"
            style={{ minHeight: "44px" }}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={(!input.trim() && !selectedCode) || isQuerying}
            className="p-3 bg-gradient-to-r from-github-accent to-blue-500 text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-github-accent/20"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Message Bubble Component
function MessageBubble({ message, context }: { message: Message; context: GitHubContext }) {
  const isUser = message.role === "user";
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-2xl ${
          isUser
            ? "bg-gradient-to-r from-github-accent to-blue-500 text-white px-4 py-3"
            : "bg-github-surface border border-github-border px-4 py-3"
        }`}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Code blocks with copy button
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const codeString = String(children).replace(/\n$/, "");
                  const isInline = !match && !codeString.includes("\n");

                  if (isInline) {
                    return (
                      <code className="px-1.5 py-0.5 bg-github-bg rounded text-github-accent text-xs font-mono" {...props}>
                        {children}
                      </code>
                    );
                  }

                  return (
                    <div className="relative group my-3">
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyToClipboard(codeString)}
                          className="p-1.5 bg-github-border rounded hover:bg-github-accent/20 transition-colors"
                          title="Copy code"
                        >
                          {copiedCode === codeString ? (
                            <Check className="w-3.5 h-3.5 text-green-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                          )}
                        </button>
                      </div>
                      {match && (
                        <div className="absolute top-2 left-3 text-xs text-gray-500 font-mono">
                          {match[1]}
                        </div>
                      )}
                      <pre className="bg-github-bg rounded-lg p-4 pt-8 overflow-x-auto text-xs">
                        <code className={`${className} font-mono`} {...props}>
                          {children}
                        </code>
                      </pre>
                    </div>
                  );
                },
                // Links
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-github-accent hover:underline inline-flex items-center gap-1"
                    >
                      {children}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  );
                },
                // Lists
                ul({ children }) {
                  return <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>;
                },
                // Paragraphs
                p({ children }) {
                  return <p className="my-2 leading-relaxed">{children}</p>;
                },
                // Headings
                h1({ children }) {
                  return <h1 className="text-lg font-bold my-3 text-white">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="text-base font-semibold my-2 text-white">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="text-sm font-medium my-2 text-white">{children}</h3>;
                },
                // Blockquotes
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-2 border-github-accent pl-3 my-2 italic text-gray-400">
                      {children}
                    </blockquote>
                  );
                },
                // Tables
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-3">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return (
                    <th className="border border-github-border px-3 py-2 bg-github-bg text-left font-medium">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return <td className="border border-github-border px-3 py-2">{children}</td>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-github-border/50">
            <p className="text-xs text-gray-500 mb-2">Sources:</p>
            <div className="flex flex-wrap gap-2">
              {message.sources.slice(0, 4).map((source, i) => {
                // Sanitize file path - remove leading slashes
                const rawFilePath = (source.file || '').replace(/^\/+/, '');
                // URL-encode each path segment to handle special chars like [documentId]
                const encodedFilePath = rawFilePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
                // Extract start line number
                const startLine = source.lines?.split('-')[0] || '1';
                // Construct proper GitHub URL with encoded path
                const url = `https://github.com/${context.owner}/${context.repo}/blob/${context.branch}/${encodedFilePath}#L${startLine}`;
                
                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 bg-github-bg rounded-lg text-xs text-github-accent hover:bg-github-accent/10 transition-colors"
                  >
                    <span className="truncate max-w-[120px]">{rawFilePath.split("/").pop()}</span>
                    <span className="text-gray-500">:{source.lines}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
