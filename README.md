# Express Voting.Midnight

Privacy-preserving voting built on Midnight.

## Concept

Express Voting allows eligible participants to cast a vote while protecting
their identity and keeping their individual choice private.

The system is designed to prove that:

- the voter is eligible;
- each eligible participant can vote only once;
- the ballot is valid;
- individual voter identity is not revealed;
- individual voting choices remain private;
- the final result is verifiable.

## Hackathon

Midnight Hack Buenos Aires 2026

## Built with

- Midnight
- Compact
- Midnight.js
- React
- TypeScript

## License

Apache 2.0

------------------------------

# Express Voting.Midnight

Privacy-preserving voting built on Midnight for the **Midnight Hack Buenos Aires 2026**.

## Concept

Express Voting allows eligible Argentinian citizens to cast a vote while protecting their identity, keeping their individual choice private, and ensuring the integrity of the electoral process. 

The system utilizes Zero-Knowledge Proofs (ZKP) to guarantee that:
* **Eligibility & Authenticity:** The voter holds a valid Argentinian DNI (scanned via PDF417 barcode/QR).
* **Anti-Double Voting:** Each citizen can vote only once.
* ** ballot Validity:** The vote cast corresponds to a valid candidate.
* **Anonymity (PII Protection):** Personally Identifiable Information (PII) from the DNI never touches the blockchain.
* **Privacy:** Individual voting choices remain entirely confidential.
* **Verifiability:** The final tally is auditable and publicly verifiable on-chain.

---

## System Architecture & ZK Workflow

To achieve true anonymity while preventing double voting, the application separates **Identity Verification** from **Vote Casting** using a two-contract architecture and a localized cryptographic bridge:

[ Frontend: Scan DNI (PDF417) ]
│
▼ (Off-chain Parse)
[ Generate Zero-Knowledge Proof + Unique Hash ] ──► [ DNI Registration Contract ]
│ (Validates Generate on Ledger)
▼ (Cryptographic Bridge)
[ Generate Anonymous Nullifier ]
│
▼ (Select Candidate)
[ Execute Circuit: emitirVoto(Nullifier, Candidate) ] ──► [ Voting/Urn Contract ]
(Public Tally Update)

### 1. 3-Stage Frontend Flow
1. **DNI Scanning:** The user scans their Argentinian DNI card. The frontend parses data off-chain (Name, DNI number, Tramite ID, etc.).
2. **Voting Booth:** The user is authenticated privately and selects their candidate of choice.
3. **Vote Cast:** The transaction is processed locally, generates the ZK Proof, and broadcasts the vote securely.

### 2. Smart Contracts Layout (Compact)
* **DNI Registry Contract:** Manages a public ledger of `dni_registrados` using an un-linkable cryptographic hash (e.g., Poseidon/Pedersen). It ensures that the specific physical document exists and hasn't been registered, without ever publishing (`disclose`) the raw PII.
* **Voting/Urn Contract:** Manages the `conteo_votos` ledger and tracks an anonymous **Nullifier** map (`votos_emitidos`). The Nullifier acts as a single-use token derived cryptographically from the DNI data, allowing the system to block double-voting without revealing *which* DNI generated *which* vote.

---

## Built With

* **Midnight** & **Compact (v0.23)** - Private smart contracts and ZK circuit compilation.
* **Midnight.js** - Client-side SDK for local proof generation (Proof Server interaction) and node communication.
* **React** & **TypeScript** - For the 3-stage user-friendly voting interface.


## Getting Started

Follow these steps to set up the development environment, compile the Compact smart contracts, and run the 3-stage voting frontend application locally.

### Prerequisites

Ensure you have the following installed on your machine:
* **Node.js** (v18 or higher) & **pnpm** (or npm/yarn)
* **Docker Desktop** (Required to run the Midnight Sandbox and Proof Server)
* **Midnight CLI & Compact Compiler** (Ensure `compact` is available in your PATH)

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd express-voting-midnight
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

### Running the Midnight Infrastructure

Midnight requires a local environment to fetch ledger states and generate Zero-Knowledge Proofs.

1. **Start the Midnight Sandbox & Proof Server:**
   Run the official Docker container provided by Midnight to start the network sandbox and the local proof engine (by default on port `6300`):
   ```bash
   docker run -d -p 6300:6300 --name midnight-sandbox-proof-server midnightnetwork/sandbox:latest
   ```

2. **Compile the Compact Smart Contracts:**
   Compile your `.compact` files to generate the TypeScript bindings and ZK circuits required by `midnight.js`:
   ```bash
   compact compile contracts/dni_registry.compact --contracts-dir ./src/managed
   compact compile contracts/voting_urn.compact --contracts-dir ./src/managed
   ```

### Running the Web Application

1. **Configure Environment Variables:**
   Create a `.env` file in the root of your project:
   ```env
   VITE_MIDNIGHT_PROOF_SERVER_URL=http://localhost:6300
   VITE_MIDNIGHT_INDEXER_URL=http://localhost:8080
   VITE_MIDNIGHT_NODE_URL=http://localhost:8081
   ```

2. **Start the Frontend Development Server:**
   ```bash
   pnpm dev
   ```
   Open `http://localhost:5173` in your browser to experience the 3-stage voting flow.

### Testing the Flow

To simulate a complete cycle during evaluation:
1. **Stage 1 (Scan):** Use a sample Argentinian DNI PDF417 string (provided in `src/utils/mockDniData.ts` for testing without a physical webcam/scanner). The UI will generate the ZK Proof and register the anonymized document hash.
2. **Stage 2 (Vote):** Choose your candidate. The frontend will calculate the anonymous *Nullifier* and prompt Midnight.js to generate the private voting proof.
3. **Stage 3 (Complete):** Submit the transaction to see the `conteo_votos` ledger increment on-chain without revealing who you voted for.


## License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.
