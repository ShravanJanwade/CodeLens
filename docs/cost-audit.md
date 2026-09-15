# Pre-deployment cost audit

**Expected monthly cost: $0.** No cloud deployment is currently configured.

| Service | Purpose | Free plan | Expected use | Overages / billing risk | Decision |
| --- | --- | --- | --- | --- | --- |
| Local Node, SQLite, Docker, Ollama | Full development stack | Open source / local | Developer machine | Hardware and electricity only | Use locally |
| DemoProvider | Public-demo AI behavior | In-process deterministic code | Low | None | Use by default |
| Cloud provider | Optional future static demo | Must be verified at deployment time | Low recruiter traffic | Policy/limit changes | Not selected yet |

An external service may be added only after its current terms are verified, the intended use is measured against permanent free limits, no card or paid plan is needed for the core flow, and a shutdown procedure is documented. Any high billing risk blocks deployment.
