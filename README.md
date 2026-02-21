# Verifiable Code Reports

Cryptographically signed trust reports for applications running on [EigenCloud](https://eigencloud.xyz).

Two AI models — Claude (via AWS Bedrock) and Codex (via OpenAI) — independently analyze each build's source code and produce a trust assumptions report: what users are actually trusting when they interact with the application.

Reports are ECDSA-signed and verifiable without trusting the database, the API, or us.

## Why

EigenCloud apps run inside Trusted Execution Environments (TEEs). The hardware protects keys and isolates memory — but the **code** still does what it does. Users need to know:

- Can the code move my funds without my consent?
- What data leaves the TEE boundary?
- What happens if the TEE goes down — can I still withdraw?
- Are there hidden admin functions or backdoors?
- Does the deployed code match the source?

This service answers those questions for every build, automatically.

## How it works

1. **Register** an EigenCloud app by its on-chain address
2. The service scans every `AppUpgraded` event from the [AppController](https://etherscan.io/address/0xc38d35Fc995e75342A21CBd6D770305b142Fbe67) contract
3. For each build with verified provenance (repo URL + git ref from EigenCloud's build system):
   - **Claude** orchestrates 7 specialized sub-agents for deep category analysis
   - **Codex** performs a full independent analysis from scratch
   - Both run in parallel against the same codebase
4. The combined report is signed with ECDSA and stored in PostgreSQL
5. A poller checks for new builds every 5 minutes — new releases get analyzed automatically

### Analysis categories

| Category | What it checks |
|---|---|
| **Admin Privileges** | Privileged roles, access control, admin functions |
| **Upgrade Mechanisms** | Proxy patterns, upgradeable contracts, mutable config |
| **Data Access** | What data leaves the TEE boundary via APIs, events, logs |
| **Fund Control** | How the code handles money, tokens, payments |
| **Kill Switches** | What happens if the TEE goes down |
| **Backdoors** | Hidden endpoints, obfuscated code, covert functionality |
| **Disclosure Level** | Open source status, attestation, verifiability |

All analysis is TEE-aware. It understands that the operator cannot access keys, call arbitrary functions, modify code at runtime, or read enclave memory — so it focuses on what the **code itself** does.

### Trust labels

| Label | Meaning |
|---|---|
| **SAFE TO USE** | TEE protects keys, code does what it says, user funds protected with on-chain exit paths |
| **GENERALLY SAFE** | Strong protection with minor design tradeoffs users should know about |
| **USE WITH CAUTION** | Notable trust assumptions — code paths that could disadvantage users |
| **UNSAFE** | Code actively harms users, leaks keys, or circumvents TEE protections |

When Claude and Codex disagree on the label, both are shown.

## API

### Register an app

```
POST /api/eigencloud/register
Content-Type: application/json

{ "appAddress": "0x530fb7f224774b4887f689e4a4ffe9ebb3317bd8" }
```

Validates the app exists on-chain, scans full build history, and queues verifiable builds for analysis.

### Get latest report

```
GET /api/eigencloud/report/:appAddress
```

### Get report for a specific build

```
GET /api/eigencloud/report/:appAddress/:imageDigest
```

### List all reports

```
GET /api/eigencloud/reports/:appAddress?limit=20&offset=0
```

### List builds

```
GET /api/eigencloud/builds/:appAddress
```

Build statuses: `complete` | `analyzing` | `pending` | `failed` | `unverifiable`

### Agent logs (on-demand)

Logs are not included in report responses. Fetch them separately:

```
GET /api/eigencloud/report/:appAddress/logs
GET /api/eigencloud/report/:appAddress/:imageDigest/logs
```

Returns `{ logs, logsHash }` — the `logsHash` matches the attestation for verification.

### Health

```
GET /health
```

### Example response

```json
{
  "report": {
    "version": "2.0.0",
    "trustLabel": "GENERALLY SAFE",
    "trustLabelReason": "TEE protects the mnemonic, users can withdraw on-chain...",
    "codeType": "mixed",
    "executiveSummary": "...",
    "categories": {
      "fundControl": { "summary": "...", "trustAssumptions": [...] },
      "adminPrivileges": { "summary": "...", "trustAssumptions": [...] }
    },
    "codexAnalysis": {
      "trustLabel": "USE WITH CAUTION",
      "agrees": false,
      "executiveSummary": "...",
      "categories": { ... }
    }
  },
  "attestation": {
    "reportHash": "0xc20c...",
    "contentHash": "0xb135...",
    "logsHash": "0xf9b8...",
    "timestamp": 1771630187,
    "signerAddress": "0x5e32...",
    "appAddress": "0x530F...",
    "imageDigest": "sha256:d8440c...",
    "provenanceVerified": true
  },
  "signature": "0x38d9..."
}
```

## Report verification

The database is just a cache. Anyone can verify a report independently:

```typescript
import { keccak256, toBytes, encodePacked, verifyMessage } from "viem";

const { report, attestation, signature } = await fetch(
  "/api/eigencloud/report/0x530f..."
).then((r) => r.json());

const { logs } = await fetch(
  "/api/eigencloud/report/0x530f.../logs"
).then((r) => r.json());

// 1. Verify report content
const contentHash = keccak256(toBytes(JSON.stringify(report)));
assert(contentHash === attestation.contentHash);

// 2. Verify logs
const logsHash = keccak256(toBytes(JSON.stringify(logs)));
assert(logsHash === attestation.logsHash);

// 3. Reconstruct signed payload
const packTypes = ["bytes32", "bytes32", "uint256", "address"];
const packValues = [
  contentHash,
  attestation.logsHash,
  BigInt(attestation.timestamp),
  attestation.signerAddress,
];

if (attestation.appAddress) {
  packTypes.push("address");
  packValues.push(attestation.appAddress);
}
if (attestation.imageDigest) {
  packTypes.push("bytes32");
  packValues.push(keccak256(toBytes(attestation.imageDigest)));
}

const reportHash = keccak256(encodePacked(packTypes, packValues));
assert(reportHash === attestation.reportHash);

// 4. Verify signature
const valid = await verifyMessage({
  address: attestation.signerAddress,
  message: { raw: toBytes(reportHash) },
  signature,
});
assert(valid); // report is authentic
```

## Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.2
- PostgreSQL
- AWS Bedrock access (for Claude) or an Anthropic API key
- OpenAI API key (for Codex)

### Install and run

```bash
bun install
cp .env.example .env
# Edit .env with your keys

createdb vcr

bun run dev
```

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `MNEMONIC` | Yes | 12-word BIP-39 mnemonic for ECDSA signing identity |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | OpenAI API key for Codex analysis |
| `CLAUDE_CODE_USE_BEDROCK` | No | Set to `1` to use AWS Bedrock |
| `AWS_BEARER_TOKEN_BEDROCK` | If Bedrock | AWS Bedrock bearer token |
| `ANTHROPIC_API_KEY` | If not Bedrock | Direct Anthropic API key |
| `ETH_RPC_URL` | No | Ethereum RPC (default: `https://eth.llamarpc.com`) |
| `MAX_CONCURRENT` | No | Parallel analyses (default: `3`) |
| `POLL_INTERVAL` | No | Seconds between poll cycles (default: `300`) |
| `PORT` | No | Server port (default: `3000`) |

### Docker

```bash
docker build -t vcr .
docker run -p 3000:3000 --env-file .env vcr
```

## Architecture

```
src/
  index.ts                    Entry point — migrations, server, poller
  config.ts                   Environment config
  server.ts                   Express routes

  db/
    client.ts                 Bun.SQL + migration runner
    migrations/001_init.sql   PostgreSQL schema

  eigencloud/
    contract.ts               Viem reads against AppController
    user-api.ts               EigenCloud User API client
    poller.ts                 Background monitoring loop
    pipeline.ts               Concurrency-limited analysis queue

  analysis/
    orchestrator.ts           Claude Agent SDK orchestration (1M context)
    codex-analyzer.ts         Independent Codex analysis
    agents.ts                 7 specialized sub-agent definitions
    report-builder.ts         Combines dual analyses into Report
    prompts/                  Category-specific analysis prompts

  report/
    schema.ts                 Zod schemas (Report v2.0.0)
    markdown.ts               Human-readable report renderer

  repo/
    clone.ts                  Git clone at specific ref

  signing/
    signer.ts                 ECDSA signing with provenance attestation

  lib/
    sanitize.ts               Input validation
```

## License

MIT
