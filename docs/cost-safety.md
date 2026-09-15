# Cost and abuse safety

The application defaults to `AI_PROVIDER=demo`; it does not send prompts or code to a commercial service. Optional Ollama calls stay on the local machine.

| Limit | Default | Purpose |
| --- | ---: | --- |
| Repository size | 25 MB | Bound storage and parsing work |
| Files per analysis | 500 | Bound worker runtime |
| Agent steps per run | 25 | Bound orchestration work |
| Tool calls per run | 30 | Prevent loops |
| Telemetry events/minute | 500 | Provide backpressure |
| API requests/minute | 60 | Limit unauthenticated demo abuse |

The values live in `.env.example` and `DEFAULT_LIMITS` in `@codelens/shared`. The API enforces its request limit and the analyzer enforces a public-GitHub-only URL policy, 500-file ceiling, 1 MB per source-file ceiling, clone timeout, and temporary-workspace cleanup. The public demo should reject repository uploads and real mutating tools; its isolated scenario approval is the sole exception and changes only demo records.
