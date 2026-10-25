// ============================================================
// CodeLens on Azure Container Apps
// ============================================================
// Deployed by .github/workflows/deploy-azure.yml on every push to
// master. The shared environment, the Azure Files share and the
// deployment identity are created once by deploy/azure/setup.sh;
// this template only owns the container app.
//
// Cost model: the app scales to zero replicas 30 minutes after the
// last request and is billed nothing while it is at zero. The next
// visit starts it again, which takes about half a minute.
// ============================================================

@description('Container image to run, for example ghcr.io/owner/codelens:<commit sha>.')
param image string

@description('Name of the existing Container Apps environment.')
param environmentName string

@description('Region of that environment; the app must be in the same one.')
param location string = resourceGroup().location

@description('Name of the container app; also the first label of its public hostname.')
param appName string = 'codelens'

@description('Environment storage definition of the Azure Files share that holds database snapshots.')
param storageName string = 'codelens-data'

@description('Seconds without a request before the app scales to zero.')
@minValue(300)
param idleShutdownSeconds int = 1800

@description('Tags the subscription\'s policies require, set by setup.sh as the AZURE_TAGS repository variable.')
param tags object = {}

@secure()
param jwtSecret string

@secure()
@description('Encrypts stored GitHub tokens. Changing it requires reconnecting GitHub accounts.')
param tokenEncryptionKey string

@description('Optional GitHub OAuth app. Callback: <app URL>/api/v1/auth/github/callback')
param githubClientId string = ''

@secure()
param githubClientSecret string = ''

@allowed([
  'demo'
  'gemini'
])
param aiProvider string = 'demo'

@secure()
param geminiApiKey string = ''

param geminiModel string = ''

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' existing = {
  name: environmentName
}

// Known before the app exists, so APP_ORIGIN is right on the first deploy.
var origin = 'https://${appName}.${environment.properties.defaultDomain}'
var githubOAuth = !empty(githubClientId) && !empty(githubClientSecret)
var gemini = aiProvider == 'gemini'

var secrets = concat(
  [
    { name: 'jwt-secret', value: jwtSecret }
    { name: 'token-encryption-key', value: tokenEncryptionKey }
  ],
  githubOAuth ? [{ name: 'github-client-secret', value: githubClientSecret }] : [],
  gemini ? [{ name: 'gemini-api-key', value: geminiApiKey }] : []
)

var settings = concat(
  [
    { name: 'NODE_ENV', value: 'production' }
    { name: 'PORT', value: '4000' }
    { name: 'APP_ORIGIN', value: origin }
    // Local disk: SQLite must not run on the SMB share. persist-sqlite.sh
    // restores it from PERSIST_DIR on start and snapshots it back.
    { name: 'DATABASE_URL', value: '/data/codelens.db' }
    { name: 'PERSIST_DIR', value: '/persist' }
    { name: 'JWT_SECRET', secretRef: 'jwt-secret' }
    { name: 'TOKEN_ENCRYPTION_KEY', secretRef: 'token-encryption-key' }
    { name: 'AI_PROVIDER', value: aiProvider }
    { name: 'SEED_DEMO', value: 'true' }
  ],
  githubOAuth
    ? [
        { name: 'GITHUB_CLIENT_ID', value: githubClientId }
        { name: 'GITHUB_CLIENT_SECRET', secretRef: 'github-client-secret' }
      ]
    : [],
  gemini
    ? [
        { name: 'GEMINI_API_KEY', secretRef: 'gemini-api-key' }
        { name: 'GEMINI_MODEL', value: geminiModel }
      ]
    : []
)

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  tags: union(tags, { project: 'codelens' })
  properties: {
    environmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 3
      ingress: {
        external: true
        targetPort: 4000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: secrets
    }
    template: {
      // Room for the app to exit and the final database snapshot to upload.
      terminationGracePeriodSeconds: 60
      containers: [
        {
          name: 'codelens'
          image: image
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: settings
          volumeMounts: [
            {
              volumeName: 'persist'
              mountPath: '/persist'
            }
          ]
          probes: [
            {
              // Startup runs migrations, re-seeds the demo and scores the
              // diagnosis benchmark before the server listens.
              type: 'Startup'
              httpGet: {
                path: '/health'
                port: 4000
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              timeoutSeconds: 5
              failureThreshold: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 4000
              }
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 4000
              }
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        // One replica at most: SQLite has a single writer.
        minReplicas: 0
        maxReplicas: 1
        cooldownPeriod: idleShutdownSeconds
        pollingInterval: 30
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
      volumes: [
        {
          name: 'persist'
          storageType: 'AzureFile'
          storageName: storageName
          // The container runs as the image's `node` user (uid 1000).
          mountOptions: 'dir_mode=0777,file_mode=0777,uid=1000,gid=1000'
        }
      ]
    }
  }
}

output url string = origin
output latestRevision string = app.properties.latestRevisionName
