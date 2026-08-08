# Express Voting.Midnight

Privacy-preserving election prototype built for the Midnight Hack Buenos Aires 2026.

Express Voting lets a voter scan the PDF417 barcode on the back of an Argentine DNI, check membership in a private electoral registry, and cast one private ballot per election. The public Midnight ledger never stores the DNI or the selected candidate in plaintext.

> **Privacy scope:** the current hackathon backend receives the DNI and selected candidate in order to build the transaction. The privacy guarantee demonstrated by this MVP is **on-chain privacy**: identity and ballot choice are not published on the Midnight ledger. The DNI scanner reads the barcode; it does **not** authenticate the physical document against RENAPER.

## What is on Midnight

The Compact contract is `contract/src/express-voting.compact` and exposes five compiled circuits:

- `verifyVoter` — verifies Merkle membership and that the voting right has not been consumed.
- `castVote` — verifies eligibility, enforces the voting window, consumes a per-election nullifier, stores only a ballot commitment, and increments the public total vote count.
- `addVoter` — administrator-authorized insertion of a voter commitment before voting starts.
- `setVotingWindow` — administrator-authorized start/end configuration.
- `closeElection` — permanent administrator-authorized election closure.

Public ledger state includes the Merkle registry, commitment set, used nullifiers, ballot commitments, aggregate voter/vote counts, voting window, lifecycle flags, and the hash of the private administrator secret.

Private data includes DNI values, per-voter secrets, Merkle witness data, and the administrator secret.

## Architecture

```text
Voter browser (no wallet required)
        |
        | scan DNI PDF417 / choose candidate
        v
Next.js UI  http://localhost:3000
        |
        v
Express Voting API  http://localhost:8789
        |                         |
        | public reads            | transaction jobs
        v                         v
Midnight Preview Indexer     isolated Wallet worker
                                  |
                                  | platform-controlled Preview wallet
                                  | ZK proof server localhost:6300
                                  v
                            Midnight Preview
                                  |
                                  v
                       Express Voting Compact contract
```

The voter never has to install Lace or connect a wallet. The **platform wallet** signs/pays for transactions. The Preview worker uses `MidnightWalletProvider` from the official Midnight testkit stack, backed by the Wallet SDK components used for balancing/submission.

### Why the wallet runs in a worker process

Remote Preview transaction work can be CPU intensive while Midnight proves, balances, submits, and waits for finalization. The wallet is therefore isolated in `scripts/midnight-preview-worker.mjs`. The HTTP API reads public state directly from the Preview indexer and remains responsive while a transaction is being processed.

Transaction endpoints return a job immediately. The frontend polls `/jobs/:id`; the API also watches the ledger and can recognize confirmation from the resulting state even if the wallet call is still waiting for its finalization callback.

## Election lifecycle

```text
SIN_CONFIGURAR
      |
      | admin sets start/end
      v
PROGRAMADA
      |
      | start time reached
      v
ABIERTA
      |
      | end time reached OR admin closes
      v
FINALIZADA
```

The public UI shows the appropriate state, countdown, total votes, and participation. It does **not** publish candidate tallies.

## Private voter registry

`private/voters.json` contains demo voter credentials and is intentionally ignored by Git. Each record has a DNI and a random 32-byte secret. The public contract stores only:

```text
H("express-voting:voter" || DNI || voterSecret)
```

For one-vote-per-election protection, the circuit derives a nullifier from the voter secret plus the election ID. The nullifier is public only after the voting right is consumed; the DNI itself is not disclosed.

## Admin security

Administration has two independent controls:

1. **Web/API access:** Firebase Authentication ID token; only `FIREBASE_ADMIN_EMAIL` is accepted.
2. **On-chain authorization:** `MIDNIGHT_ADMIN_SECRET` is supplied as a private witness. Only its commitment is stored in the Compact ledger.

The Firebase service-account JSON, wallet mnemonic, voter registry, and admin secret must never be committed.

## Requirements

- Node.js 22.x
- Docker Engine
- Midnight-compatible Preview wallet mnemonic controlled by the platform
- tNIGHT/tDUST available for that wallet
- Firebase Authentication Email/Password enabled for the configured admin
- `private/voters.json` and `private/voter-commitments.json`
- compiled Compact artifacts in `contract/src/managed/express-voting/` (included in the hackathon handoff)

## Preview configuration

Copy the example and fill it locally:

```bash
cp .env.example .env.preview
chmod 600 .env.preview
```

Required values:

```dotenv
MIDNIGHT_PREVIEW_MNEMONIC='24 words ...'
PREVIEW_CONTRACT_ADDRESS='64 hex chars'
MIDNIGHT_ADMIN_SECRET='64 hex chars'
FIREBASE_ADMIN_EMAIL='admin@example.com'
GOOGLE_APPLICATION_CREDENTIALS='/absolute/path/to/private/firebase-admin.json'
MIDNIGHT_PROOF_SERVER='http://127.0.0.1:6300'
```

Never paste the mnemonic or Firebase private key into source code.

## Run the Preview demo

Install dependencies once:

```bash
npm ci
npm --prefix app ci
```

Start the proof server:

```bash
npm run proof:up
```

Terminal 1 — API + platform wallet worker:

```bash
npm run api:preview
```

The API starts immediately for public ledger reads while the background wallet synchronizes. Check:

```bash
curl -sS http://127.0.0.1:8789/health
curl -sS http://127.0.0.1:8789/election
```

Terminal 2 — frontend:

```bash
npm run app:dev
```

Open:

- Voter: `http://localhost:3000`
- Administrator: `http://localhost:3000/admin`

## API surface

Public:

```text
GET  /health
GET  /election
GET  /jobs/:id
POST /eligibility
POST /vote
```

Administrator (Firebase bearer token required):

```text
POST /admin/add-voter
POST /admin/schedule
POST /admin/close
```

`POST /vote` and the three admin mutation endpoints use asynchronous Midnight jobs so the HTTP service does not freeze during proof/transaction processing.

## Demo flow

1. Open `/admin` and sign in.
2. Configure a voting window.
3. Open `/` and wait for `VOTACIÓN ABIERTA`.
4. Scan an eligible DNI PDF417.
5. Choose Lista Verde or Lista Azul and emit the vote.
6. Show the on-chain vote commitment and total count.
7. Attempt to vote again with the same voter: the Compact nullifier check rejects it.
8. In admin, show total voters, votes, participation, and optionally close the election permanently.

## Important implementation notes

- Candidate choice is intentionally **not** stored as a public counter in this MVP. Only the ballot commitment and aggregate total are public.
- `/eligibility` is a fast private-registry lookup. The cryptographic Merkle membership and nullifier checks happen inside the real `castVote` Compact circuit when the ballot is submitted.
- The public status is derived from the on-chain window/closure state plus current server time; the Compact circuit itself enforces the actual block-time start/end conditions.
- CORS is not authentication. Administrative authorization is enforced by Firebase ID token plus the contract's private admin witness.
- A three-voter registry is for demonstration only and provides a very small anonymity set.

## Repository hygiene

The following are ignored and must stay private:

```text
.env*
private/
logs/
midnight-level-db/
app/out/
```

The repository is licensed under Apache 2.0 (`LICENSE`).
