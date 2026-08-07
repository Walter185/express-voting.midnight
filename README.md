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

[A COMPLETAR]

## License

Distributed under the Apache 2.0 License. See `LICENSE` for more information.
