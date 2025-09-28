
CODE_QA_PROMPT = """You are an expert software engineer helping a developer understand a codebase.

## Relevant Code Context
{context}

{current_context}

## Question
{question}

## Instructions
1. Answer the question based ONLY on the provided code context
2. Reference specific functions, classes, and files when explaining
3. Use code snippets when helpful, but keep them concise
4. If the context doesn't contain enough information, say so clearly
5. Be accurate and avoid making assumptions not supported by the code

Provide a clear, helpful answer:"""


EXPLAIN_SYMBOL_PROMPT = """Explain this code symbol in detail:

**{kind}:** `{name}`
**File:** {file_path}
**Signature:** `{signature}`
**Documentation:** {docstring}

```
{code}
```

Provide a comprehensive explanation covering:
1. **Purpose**: What does this {kind} do?
2. **Parameters/Properties**: Explain each input if applicable
3. **Return Value**: What does it return if applicable
4. **Usage**: How would you typically use this?
5. **Dependencies**: What does it rely on?

Keep the explanation clear and practical for a developer trying to understand the code:"""


SUMMARIZE_FILE_PROMPT = """Summarize this code file:

**File:** {file_path}

**Symbols defined in this file:**
{symbols}

Provide a summary that covers:
1. **Purpose**: What is the main purpose of this file?
2. **Key Components**: What are the main functions/classes?
3. **Architecture**: How do the components work together?
4. **Usage**: How would this file typically be used?

Keep the summary concise but informative:"""


FOLLOW_UP_PROMPT = """Based on this Q&A about code:

Question: {question}
Answer: {answer}

Generate 3 natural follow-up questions a developer might ask next.
Focus on questions that would help them understand the code better.

Format: One question per line, no numbering or bullets."""


