# RegiEstateJapan — Security Token Dividend Distribution Demo

A Solana-based Security Token (ST) platform that demonstrates KYC-gated token issuance and on-chain pro-rata dividend distribution for Japanese real estate assets.

Built for the **Solana Colosseum Hackathon**.

🇯🇵 [日本語版はこちら (README_ja.md)](./README_ja.md)

---

## Overview

RegiEstateJapan issues a compliant Security Token (`REJST`) on Solana using Token-2022 extensions. Investors must pass KYC before they can hold or receive dividends. The issuer deposits SOL into an on-chain distributor, and each investor claims their pro-rata share in proportion to their token balance.

```
Issuer
  │─ KYC approve investor (ABL Gate allowlist)
  │─ Create ATA + permissionless thaw (Token ACL)
  │─ Mint REJST to investor
  │─ Initialize DividendDistributor
  └─ Deposit dividend (SOL)

Investor
  │─ Connect wallet → KYC status checked automatically
  └─ Claim dividend → payout = balance / totalSupply × dividendAmount
```

---

## Architecture

### Token Layer (Token-2022)

| Extension | Role |
|-----------|------|
| `DefaultAccountState = Frozen` | All new token accounts start frozen; KYC required to thaw |
| `MetadataPointer` | Points metadata to the mint itself |
| `TokenMetadata` | Stores `token_acl` field linking to the ABL Gate program |

### Compliance Layer

| Program | Address | Role |
|---------|---------|------|
| **Token ACL** | `TACLkU6CiCdkQN2MjoyDkVg2yAH9zkxiHDsiztQ52TP` | Permissionless thaw based on ABL Gate result |
| **ABL Gate** | `GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz` | KYC/AML allowlist + blocklist composite gate |

The Token ACL program intercepts thaw operations and checks the ABL Gate allowlist. An investor can only hold tokens after being added to the allowlist by the issuer.

### Dividend Program (Anchor)

**Program ID:** `BLpJKVjV8hm2TBFrmhbrLjnqs1FPSdWdbrMCmn1tW322`

| Instruction | Who | Description |
|-------------|-----|-------------|
| `initialize` | Issuer | Create `DistributorState` PDA |
| `deposit_dividend(amount, totalSupply)` | Issuer | Start new epoch, transfer SOL into PDA |
| `claim_dividend` | Investor | Receive pro-rata payout, create `ClaimRecord` |

**PDAs:**
- `DistributorState`: `["distributor", mint]`
- `ClaimRecord`: `["claim", distributor, investor, epoch_le_bytes]`

### On-chain Addresses (Devnet)

| Item | Address |
|------|---------|
| REJST Mint | `FkD73NkVGZmkHujFrGKKCT9iagHGpfnCisPsxR1VWJPF` |
| Dividend Distributor Program | `BLpJKVjV8hm2TBFrmhbrLjnqs1FPSdWdbrMCmn1tW322` |
| ABL Gate AllowList PDA | `3uxMTPpC29ygmP2Xwxw6bAEwRhCa2m51YrS3y9VA47Qd` |
| Token ACL MintConfig PDA | `58D2oPQQutcELTQXNg5FGb9ZHtZ98fjCBfYqYwbJJo7S` |

---

## Repository Structure

```
regi-estate-japan/
├── programs/
│   └── dividend-distributor/   # Anchor program (Rust)
├── scripts/                    # Setup & management CLI scripts
│   ├── 01-create-mint.ts       # Create Token-2022 mint
│   ├── 02-setup-token-acl.ts   # Configure Token ACL
│   ├── 03-setup-abl-gate.ts    # Create KYC/AML lists
│   ├── 04-kyc-approve.ts       # Approve investor
│   └── 05-create-ata-and-thaw.ts
├── clients/
│   └── js/                     # Codama-generated TypeScript client
├── tests/                      # Anchor integration tests
└── app/                        # Next.js 16 frontend
    ├── app/
    │   └── api/build-thaw/     # Server-side Token ACL instruction builder
    ├── components/
    │   ├── MintPanel.tsx        # Issuer: KYC + ATA + Mint
    │   ├── IssuerPanel.tsx      # Issuer: Initialize + Deposit Dividend
    │   ├── InvestorPanel.tsx    # Investor: Claim Dividend
    │   ├── TransferPanel.tsx    # Token transfer between wallets
    │   └── DistributorStatus.tsx
    └── lib/
        ├── config.ts            # On-chain addresses & PDA helpers
        └── idl/                 # Anchor IDL
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana Devnet |
| Token Standard | Token-2022 (SPL Token Extensions) |
| Compliance | Token ACL + ABL Gate |
| Smart Contract | Anchor 0.32.1 |
| Client Codegen | Codama |
| Frontend | Next.js 16 (Turbopack), Tailwind CSS |
| Wallet | @solana/wallet-adapter (Phantom, Solflare) |
| Kit SDK | @solana/kit v6.9.0 |

---

## Demo Walkthrough

### Prerequisites

- Phantom or Solflare wallet connected to **Solana Devnet**
- Some devnet SOL (use [Solana Faucet](https://faucet.solana.com))
- The **issuer wallet** must be the same keypair used when the mint was created (`~/.config/solana/id.json`)

### Issuer Flow

1. Connect the **issuer wallet**
2. **MintPanel — Step 1**: Enter the investor wallet address → click "KYC 承認" to add to ABL Gate allowlist
3. **MintPanel — Step 2**: Click "ATA 作成 + アンフリーズ" — calls the `/api/build-thaw` route to build a Token ACL permissionless thaw instruction
4. **MintPanel — Step 3**: Enter token amount → click "REJST をミント"
5. **IssuerPanel**: Click "Initialize" (first time only)
6. **IssuerPanel**: Enter dividend amount (SOL) and total supply snapshot → click "Deposit Dividend"

### Investor Flow

1. Connect the **investor wallet** (must have been KYC'd by issuer)
2. The panel automatically shows KYC status and estimated payout
3. Click "Claim Dividend" — receives SOL proportional to token balance

---

## Local Development

### Setup

```bash
# Install workspace dependencies
yarn install

# Build the Anchor program
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Run setup scripts
npx ts-node scripts/01-create-mint.ts
npx ts-node scripts/02-setup-token-acl.ts
npx ts-node scripts/03-setup-abl-gate.ts
```

### Frontend

```bash
cd app
npm install
npm run dev   # http://localhost:3000
```

### Client Codegen (optional)

```bash
npx ts-node scripts/codama.ts
```

---

## Key Design Decisions

**Why Token-2022 `DefaultAccountState = Frozen`?**  
Every new token account is frozen by default, preventing any investor from holding or receiving tokens without explicit KYC approval. This enforces compliance at the protocol level, not in application code.

**Why Token ACL permissionless thaw from a server API route?**  
The Token ACL permissionless thaw instruction requires resolving extra account metas from on-chain state (ABL Gate's thaw hook accounts). Building this instruction client-side in a browser requires Node.js-specific packages. The `/api/build-thaw` Next.js route runs server-side, builds the instruction using `@token-acl/sdk`, and returns it to the frontend for wallet signing.

**Why per-epoch `ClaimRecord` PDA?**  
The `ClaimRecord` PDA (seeded by `[distributor, investor, epoch]`) prevents double-claiming within an epoch. If an investor tries to claim twice, the account init will fail with `AccountAlreadyInitialized`.

---

## License

MIT
