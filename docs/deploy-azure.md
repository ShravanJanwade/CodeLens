# Deploying CodeLens to Azure Container Apps

CodeLens runs as one container on Azure Container Apps. It sleeps when nobody
is using it and wakes on the next visit, which keeps a year of hosting well
inside the $100 Azure for Students credit, shared with FluxDB.

- **Sleeps after 30 idle minutes.** Zero replicas cost nothing. The next visit
  starts it again; the first page load waits about a minute while the image is
  pulled, the database is restored and the demo is re-seeded.
- **Keeps its data.** SQLite stays on the container's local disk, where it is
  fast and safe, and `deploy/azure/persist-sqlite.sh` copies it to an Azure
  Files share every minute when something changed and again on every stop. The
  next start restores the newest copy.
- **Deploys itself.** Every push to `master` builds the image, publishes it to
  GitHub Container Registry and updates the app.

## What it costs

| Resource | Why | Cost |
| --- | --- | --- |
| Container Apps environment `cae-portfolio` | Shared with FluxDB. No dedicated plan and no Log Analytics workspace. | $0 |
| Container app `codelens` (0.5 vCPU, 1 GiB) | Billed per second, only while running. | $0 for the first ~100 running hours a month (free grant), then about $0.05/hour |
| Storage account + 5 GiB `codelens-data` share | Database snapshots. Billed for the few MB used. | a few cents a month |
| GitHub Container Registry | Holds the image. Free for public images. | $0 (Azure Container Registry would be ~$5/month) |
| Managed identity, budget alert | Deploy sign-in and spend emails. | $0 |

The monthly free grant (180,000 vCPU-seconds and 360,000 GiB-seconds per
subscription) is shared by both apps. A few visits a day keeps both inside it;
even both apps awake eight hours every day would cost roughly $4–14 a month.
Running both around the clock would be about $16 a month while idle and $50
while busy, which is why nothing here is always on. (Prices are East US list
prices and vary a little by region.)

`apps/web/public/robots.txt` asks search crawlers not to crawl the demo, since
every crawler visit would wake it for half an hour.

## Step 1 — Get this on `master`

The deploy workflow only runs from `master`. Merge the pull request that added
`deploy/azure/` and `.github/workflows/deploy-azure.yml`.

## Step 2 — Run the setup script in Azure Cloud Shell

1. Sign in at <https://portal.azure.com> with the account that has Azure for
   Students, and open **Cloud Shell** (the `>_` icon in the top bar). Choose
   **Bash**. If it asks about storage, pick **No storage account required**.
2. Optional but convenient: run `gh auth login` and follow the prompts. The
   script then sets the GitHub variables and starts the first deploy itself.
3. Run:

   ```bash
   git clone https://github.com/ShravanJanwade/CodeLens.git
   bash CodeLens/deploy/azure/setup.sh
   ```

It takes about five minutes and is safe to run again. It creates (or reuses,
if you already ran the FluxDB one) the resource group `rg-portfolio`, the
environment, the storage account and share, the managed identity GitHub
Actions signs in as, and a monthly budget that emails you. The last lines print
the address CodeLens will have, of the form
`https://codelens.<random-name>.<region>.azurecontainerapps.io`.

Northeastern's Azure tenant refuses a resource group without three tags, so the
script puts them on everything it creates: `Owner` (your sign-in email),
`Cost Center` (`Azure for Students`, since the rule only checks that the tag
exists) and `IaC managed` (this repository). To use other values, prefix the
command, for example `TAG_COST_CENTER=12345 bash CodeLens/deploy/azure/setup.sh`.
If a policy asks for a tag the script doesn't set, add it with
`EXTRA_TAGS='Name=value'`, separating several with `;`.

## Step 3 — Repository variables

Skip this if the script said it set them. Otherwise open
**Settings → Secrets and variables → Actions → Variables** on the repository and
add the six values the script printed:

| Variable | Example |
| --- | --- |
| `AZURE_CLIENT_ID` | `00000000-0000-0000-0000-000000000000` |
| `AZURE_TENANT_ID` | `00000000-0000-0000-0000-000000000000` |
| `AZURE_SUBSCRIPTION_ID` | `00000000-0000-0000-0000-000000000000` |
| `AZURE_RESOURCE_GROUP` | `rg-portfolio` |
| `AZURE_CONTAINERAPPS_ENVIRONMENT` | `cae-portfolio` |
| `AZURE_TAGS` | `{"Owner":"you@northeastern.edu","Cost Center":"Azure for Students","IaC managed":"ShravanJanwade/CodeLens"}` |

None of these are secrets. GitHub Actions signs in with OpenID Connect, so no
Azure password or key is stored in GitHub.

## Step 4 — Deploy

Open **Actions → Deploy to Azure → Run workflow** (skip if the script started
it). The first run takes about ten minutes.

**The first run will probably stop at "Check that Azure can pull the image".**
New GitHub packages are private, and Azure pulls the image without credentials.
Open the link in the error (or **your profile → Packages → codelens → Package
settings**), choose **Change visibility → Public**, then **Re-run jobs**. This
is a one-time step.

The JWT secret and token-encryption key are generated on the first deploy and
kept in the container app, so later deploys reuse them.

## Step 5 — Check it

```bash
curl https://codelens.<your-domain>/health
```

Then open the address in a browser and go to `/demo`. If you came back after
30 quiet minutes, the first load waits for the app to start; that is the
scale-to-zero working.

Logs are streamed rather than stored (storing them in Log Analytics is billed
per GB). While the app is running:

```bash
az containerapp logs show -n codelens -g rg-portfolio --follow --tail 200
```

Lines starting with `[persist]` come from the snapshot wrapper.

## Optional settings

Add these under **Settings → Secrets and variables → Actions**, then re-run the
workflow.

| Name | Kind | Effect |
| --- | --- | --- |
| `GH_OAUTH_CLIENT_ID`, `GH_OAUTH_CLIENT_SECRET` | secrets | Enable GitHub sign-in. Set the OAuth app's callback to `https://codelens.<your-domain>/api/v1/auth/github/callback`. |
| `GEMINI_API_KEY` | secret | Switches `AI_PROVIDER` from `demo` to `gemini`. |
| `GEMINI_MODEL` | variable | Model for Gemini, default `gemini-2.5-flash`. |
| `IDLE_SHUTDOWN_SECONDS` | variable | Idle time before scaling to zero, default `1800`, minimum `300`. |
| `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` | secrets | Override the generated values, for example to keep Render's. |

GitHub secret names cannot start with `GITHUB_`, hence `GH_OAUTH_…`.

## Step 6 — Retire the Render service

Once the Azure address works, update the links that point at
`codelens-96py.onrender.com` (this README, your resume, your portfolio), then
delete the Render service and its disk so the starter plan stops billing.

## Keeping an eye on the credit

- Remaining credit: <https://www.microsoftazuresponsorships.com/Balance>, or the
  **Education** page in the portal.
- Spend by resource: **Cost Management → Cost analysis**, scoped to
  `rg-portfolio`.
- The budget created by the setup script emails you at 50% and 100% of $8 a
  month, and when the forecast passes $8. Twelve months of $8 is the whole
  credit; normal use is far below it.
- To stop CodeLens completely: `az containerapp delete -n codelens -g rg-portfolio`.
  The snapshots stay in the file share, and the next deploy restores them.
- To remove everything for both projects: `az group delete -n rg-portfolio`.

## Troubleshooting

**`RequestDisallowedByPolicy` … "A tag named … is required".** A policy in your
organization wants tags the script didn't set or different values. Set the
values with `TAG_OWNER`, `TAG_COST_CENTER` or `TAG_IAC_MANAGED`, add missing tags
with `EXTRA_TAGS='Name=value'`, and re-run.

**The environment fails in one region with an Azure-side error** (for example
"There is not enough space on the disk"). The script removes the half-created
environment and tries the next allowed region on its own; re-running is safe.

**`RequestDisallowedByAzure` during setup.** Azure for Students only allows a
few regions. The script reads the allowed list and tries them in order; if it
still fails, find the list under **Policy → Assignments → Allowed resource
deployment regions** and run `LOCATION=<region> bash CodeLens/deploy/azure/setup.sh`.

**`AADSTS700213` / "No matching federated identity record" at Azure login.**
The identity only trusts workflows running on `master` of this repository. Run
the workflow from `master`, or re-run the setup script if the repository was
renamed.

**"The image is private".** See step 4.

**The app never becomes healthy.** Look at the logs (step 5). A configuration
error from `scripts/check-config.mjs` names the variable to fix. `az containerapp
revision list -n codelens -g rg-portfolio -o table` shows whether the newest
revision started.

**Data went back in time.** A snapshot is taken every minute while something
changes and on every graceful stop, so only a crash can lose writes, and at
most the last minute of them. During a deploy, writes that reach the old
version in its final seconds can also be lost.
