# RegiEstateJapan — セキュリティトークン配当分配デモ

日本の不動産資産を対象とした、KYC（本人確認）ゲート付きトークン発行とオンチェーンの按分配当分配を実演する Solana ベースのセキュリティトークン（ST）プラットフォームです。

**Solana Colosseum ハッカソン** 出展作品。

🇺🇸 [English README](./README.md)

---

## 概要

RegiEstateJapan は、Token-2022 エクステンションを活用してコンプライアンス準拠のセキュリティトークン（`REJST`）を Solana 上で発行します。投資家はトークンを保有・受領する前に KYC 承認が必要です。発行体がオンチェーンのディストリビューターに SOL を入金すると、各投資家はトークン保有比率に応じた配当を請求できます。

```
発行体（Issuer）
  │─ 投資家を KYC 承認（ABL Gate allowlist に追加）
  │─ ATA 作成 + パーミッションレスアンフリーズ（Token ACL）
  │─ 投資家に REJST をミント
  │─ DividendDistributor を初期化
  └─ 配当を入金（SOL）

投資家（Investor）
  │─ ウォレット接続 → KYC 状態を自動確認
  └─ 配当請求 → 受取額 = 保有枚数 ÷ 総発行量 × 配当総額
```

---

## アーキテクチャ

### トークン層（Token-2022）

| エクステンション | 役割 |
|----------------|------|
| `DefaultAccountState = Frozen` | 全 ATA はデフォルト凍結。KYC 承認後にアンフリーズ |
| `MetadataPointer` | メタデータをミント自体に指向 |
| `TokenMetadata` | `token_acl` フィールドで ABL Gate プログラムを参照 |

### コンプライアンス層

| プログラム | アドレス | 役割 |
|-----------|---------|------|
| **Token ACL** | `TACLkU6CiCdkQN2MjoyDkVg2yAH9zkxiHDsiztQ52TP` | ABL Gate の結果に基づくパーミッションレスアンフリーズ |
| **ABL Gate** | `GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz` | KYC/AML 許可リスト・ブロックリストの複合ゲート |

Token ACL プログラムはアンフリーズ操作をインターセプトし、ABL Gate の許可リストを確認します。発行体がウォレットを許可リストに追加するまで、投資家はトークンを保有できません。

### 配当プログラム（Anchor）

**プログラム ID:** `BLpJKVjV8hm2TBFrmhbrLjnqs1FPSdWdbrMCmn1tW322`

| 命令 | 実行者 | 内容 |
|------|-------|------|
| `initialize` | 発行体 | `DistributorState` PDA を作成 |
| `deposit_dividend(amount, totalSupply)` | 発行体 | 新エポック開始・SOL を PDA に入金 |
| `claim_dividend` | 投資家 | 按分配当受取・`ClaimRecord` を作成 |

**PDA シード:**
- `DistributorState`: `["distributor", mint]`
- `ClaimRecord`: `["claim", distributor, investor, epoch_le_bytes]`

### オンチェーンアドレス（Devnet）

| 項目 | アドレス |
|------|---------|
| REJST ミント | `FkD73NkVGZmkHujFrGKKCT9iagHGpfnCisPsxR1VWJPF` |
| 配当ディストリビューター プログラム | `BLpJKVjV8hm2TBFrmhbrLjnqs1FPSdWdbrMCmn1tW322` |
| ABL Gate AllowList PDA | `3uxMTPpC29ygmP2Xwxw6bAEwRhCa2m51YrS3y9VA47Qd` |
| Token ACL MintConfig PDA | `58D2oPQQutcELTQXNg5FGb9ZHtZ98fjCBfYqYwbJJo7S` |

---

## リポジトリ構造

```
regi-estate-japan/
├── programs/
│   └── dividend-distributor/   # Anchor プログラム（Rust）
├── scripts/                    # セットアップ・管理用 CLI スクリプト
│   ├── 01-create-mint.ts       # Token-2022 ミント作成
│   ├── 02-setup-token-acl.ts   # Token ACL 設定
│   ├── 03-setup-abl-gate.ts    # KYC/AML リスト作成
│   ├── 04-kyc-approve.ts       # 投資家 KYC 承認
│   └── 05-create-ata-and-thaw.ts
├── clients/
│   └── js/                     # Codama 生成 TypeScript クライアント
├── tests/                      # Anchor 統合テスト
└── app/                        # Next.js 16 フロントエンド
    ├── app/
    │   └── api/build-thaw/     # サーバーサイド Token ACL 命令ビルダー
    ├── components/
    │   ├── MintPanel.tsx        # 発行体: KYC + ATA + ミント
    │   ├── IssuerPanel.tsx      # 発行体: 初期化 + 配当入金
    │   ├── InvestorPanel.tsx    # 投資家: 配当請求
    │   ├── TransferPanel.tsx    # ウォレット間トークン転送
    │   └── DistributorStatus.tsx
    └── lib/
        ├── config.ts            # オンチェーンアドレス・PDA ヘルパー
        └── idl/                 # Anchor IDL
```

---

## 技術スタック

| 層 | 技術 |
|----|------|
| ブロックチェーン | Solana Devnet |
| トークン規格 | Token-2022（SPL Token エクステンション） |
| コンプライアンス | Token ACL + ABL Gate |
| スマートコントラクト | Anchor 0.32.1 |
| クライアント生成 | Codama |
| フロントエンド | Next.js 16（Turbopack）、Tailwind CSS |
| ウォレット | @solana/wallet-adapter（Phantom、Solflare） |
| Kit SDK | @solana/kit v6.9.0 |

---

## デモ手順

### 前提条件

- Phantom または Solflare ウォレットを **Solana Devnet** に接続
- Devnet SOL が必要（[Solana Faucet](https://faucet.solana.com) で取得）
- **発行体ウォレット**はミント作成時に使用したキーペア（`~/.config/solana/id.json`）と同じであること

### 発行体の操作手順

1. **発行体ウォレット**を接続
2. **MintPanel — Step 1**: 投資家のウォレットアドレスを入力 → 「KYC 承認」クリック（ABL Gate 許可リストに追加）
3. **MintPanel — Step 2**: 「ATA 作成 + アンフリーズ」クリック — `/api/build-thaw` ルートが Token ACL のパーミッションレスアンフリーズ命令を構築
4. **MintPanel — Step 3**: ミント数量を入力 → 「REJST をミント」クリック
5. **IssuerPanel**: 「Initialize」クリック（初回のみ）
6. **IssuerPanel**: 配当額（SOL）と総発行量スナップショットを入力 → 「Deposit Dividend」クリック

### 投資家の操作手順

1. **投資家ウォレット**を接続（発行体による KYC 承認が必要）
2. パネルに KYC 状態と受取予定額が自動表示される
3. 「Claim Dividend」クリック — トークン保有比率に応じた SOL を受取

---

## ローカル開発

### セットアップ

```bash
# ワークスペース依存パッケージのインストール
yarn install

# Anchor プログラムのビルド
anchor build

# Devnet にデプロイ
anchor deploy --provider.cluster devnet

# セットアップスクリプトの実行
npx ts-node scripts/01-create-mint.ts
npx ts-node scripts/02-setup-token-acl.ts
npx ts-node scripts/03-setup-abl-gate.ts
```

### フロントエンド

```bash
cd app
npm install
npm run dev   # http://localhost:3000
```

### クライアント生成（任意）

```bash
npx ts-node scripts/codama.ts
```

---

## 主要設計上の判断

**なぜ Token-2022 の `DefaultAccountState = Frozen` を使うのか？**  
すべての新規 ATA はデフォルトで凍結されます。これにより、明示的な KYC 承認なしには投資家がトークンを保有・受取できないことが、アプリケーションコードではなくプロトコル層で強制されます。

**なぜ Token ACL パーミッションレスアンフリーズをサーバー API ルートで行うのか？**  
Token ACL のパーミッションレスアンフリーズ命令は、ABL Gate のサーク外追加アカウントメタをオンチェーンから解決する必要があります。ブラウザ環境で構築するには Node.js 専用パッケージが必要なため、`/api/build-thaw` という Next.js サーバーサイドルートで `@token-acl/sdk` を呼び出し、命令をフロントエンドに返してウォレット署名する方式を採用しています。

**なぜエポックごとの `ClaimRecord` PDA が必要か？**  
`ClaimRecord` PDA（`[distributor, investor, epoch]` でシード）により、同一エポック内の二重請求を防止します。同じ投資家が二度請求しようとすると `AccountAlreadyInitialized` エラーでトランザクションが失敗します。

---

## ライセンス

MIT
