# Local observability profile

Run the full local observability profile with:

```bash
docker compose --profile observability up --build
```

Prometheus scrapes the API's `/metrics` endpoint. Grafana and Jaeger are included as local inspection tools; no hosted monitoring account is required. The deterministic simulator persists trace-shaped evidence and trace IDs, while full OpenTelemetry exporter instrumentation is the next integration point for independently deployed services.
