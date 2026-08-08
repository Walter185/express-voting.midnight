# Demo checklist — Express Voting.Midnight

## Before judges arrive

```bash
cd ~/proyectos/votexpress-integration
npm run proof:up
npm run api:preview
```

Wait until `/health` reports `walletReady: true`, then in another terminal:

```bash
npm run app:dev
```

Open two tabs:

```text
http://localhost:3000/admin
http://localhost:3000
```

## What to say

- The voter does **not** need a wallet; the election platform owns the Preview wallet.
- The DNI is used with a private per-voter secret to derive a commitment; the raw DNI is not stored on-chain.
- The selected candidate is committed with a random salt; the public chain sees the commitment, not the plaintext choice.
- The nullifier enforces one voting right per voter/election without publishing the DNI.
- Admin operations require both Firebase authentication at the API and a private admin witness inside Compact.
- The wallet transaction pipeline runs in a separate process so expensive Preview proving/finalization cannot freeze the web API.

## Live sequence

1. Admin sets a short future voting window.
2. Public page changes from `SIN_CONFIGURAR` / `PROGRAMADA` to `ABIERTA`.
3. Scan voter A and cast a vote.
4. Show `Votos emitidos` increasing and the ballot commitment.
5. Try voter A again and show the nullifier rejection.
6. Vote with voter B if time allows.
7. Admin closes election; public page shows total votes and participation only.

## Fallback

If Preview is slow, do **not** repeatedly click mutation buttons. The panel shows an operation-in-progress message and keeps polling the ledger. Check:

```bash
curl -sS http://127.0.0.1:8789/health
curl -sS http://127.0.0.1:8789/election
```

The API can remain responsive even while the wallet worker is busy.
