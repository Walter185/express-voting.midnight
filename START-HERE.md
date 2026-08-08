# START HERE — final hackathon build

The final demo path is **Midnight Preview + platform wallet + local proof server + local web app**. Voters do not connect a wallet.

## 1. Keep these existing private files on your machine

Do not commit or share them:

```text
.env.preview
private/firebase-admin.json
private/voters.json
private/voter-commitments.json
```

The handoff ZIP intentionally contains the demo voter registry files but not the wallet mnemonic, admin secret, Firebase service account, or `.env.preview`. `private/` remains ignored by Git.

## 2. Quick checks

```bash
npm run check:source
npm run check:server
```

## 3. Start Preview demo

```bash
npm run proof:up
```

Terminal 1:

```bash
npm run api:preview
```

Wait for `/health` to report `walletReady: true`:

```bash
curl -sS http://127.0.0.1:8789/health
```

Terminal 2:

```bash
npm run app:dev
```

Open:

```text
http://localhost:3000/admin
http://localhost:3000
```

## 4. Submission checklist

- Public GitHub repository
- Apache-2.0 `LICENSE`
- GitHub topic `midnightntwrk`
- `contract/src/express-voting.compact`
- all generated five-circuit assets under `contract/src/managed/express-voting/`
- no `.env.preview`, mnemonic, admin secret, Firebase service account, or `private/` files committed
- README / demo video / pitch deck ready

See `DEMO.md` for the judge sequence.
