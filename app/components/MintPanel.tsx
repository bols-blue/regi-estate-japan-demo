"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  AccountMeta,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createMintToInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { MINT_ADDRESS } from "@/lib/config";

// ─── 定数 ────────────────────────────────────────────────────
const ABL_GATE_PROGRAM = new PublicKey(
  "GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz"
);
// AllowList PDA（scripts/.abl-config の allowListPda と一致）
const ALLOW_LIST_PDA = new PublicKey(
  "3uxMTPpC29ygmP2Xwxw6bAEwRhCa2m51YrS3y9VA47Qd"
);

/** wallet_entry PDA を導出（ABL Gate の seeds = ["wallet_entry", listConfig, wallet]） */
function findWalletEntryPda(investor: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("wallet_entry"),
      ALLOW_LIST_PDA.toBuffer(),
      investor.toBuffer(),
    ],
    ABL_GATE_PROGRAM
  );
  return pda;
}

/** ABL Gate addWallet 命令（discriminator = [2]、アカウント順は Rust SDK 準拠） */
function buildAddWalletInstruction(
  authority: PublicKey,
  payer: PublicKey,
  investor: PublicKey
): TransactionInstruction {
  const walletEntry = findWalletEntryPda(investor);
  const keys: AccountMeta[] = [
    { pubkey: authority, isSigner: true,  isWritable: false },
    { pubkey: payer,     isSigner: true,  isWritable: true  },
    { pubkey: ALLOW_LIST_PDA, isSigner: false, isWritable: true },
    { pubkey: investor,  isSigner: false, isWritable: false },
    { pubkey: walletEntry, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: ABL_GATE_PROGRAM,
    keys,
    data: Buffer.from([2]), // ADD_WALLET discriminator
  });
}

// ─────────────────────────────────────────────────────────────

export default function MintPanel({ onSuccess }: { onSuccess: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [investorAddr, setInvestorAddr] = useState("");
  const [mintAmount, setMintAmount] = useState("100");
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [ataStatus, setAtaStatus] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<"kyc" | "ata" | "mint" | null>(null);

  function getInvestorPubkey(): PublicKey | null {
    try {
      return new PublicKey(investorAddr.trim());
    } catch {
      return null;
    }
  }

  // ── KYC 承認（AllowList に追加）──────────────────────────
  async function handleKyc() {
    const investor = getInvestorPubkey();
    if (!investor || !wallet.publicKey) return;
    setLoading("kyc");
    setKycStatus(null);
    try {
      const ix = buildAddWalletInstruction(
        wallet.publicKey,
        wallet.publicKey,
        investor
      );
      const tx = new Transaction().add(ix);
      const sig = await wallet.sendTransaction(tx, connection, {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      setKycStatus(`✅ KYC承認: ${sig.slice(0, 20)}...`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already in use")) {
        setKycStatus("⏭ 既に AllowList に登録済みです");
      } else {
        setKycStatus(`❌ ${msg}`);
      }
    } finally {
      setLoading(null);
    }
  }

  // ── ATA 作成 + アンフリーズ（Token ACL permissionless thaw）──
  async function handleCreateAta() {
    const investor = getInvestorPubkey();
    if (!investor || !wallet.publicKey) return;
    setLoading("ata");
    setAtaStatus(null);
    try {
      // ATA が既存かつアンフリーズ済みなら早期リターン
      const ata = getAssociatedTokenAddressSync(
        MINT_ADDRESS, investor, false, TOKEN_2022_PROGRAM_ID
      );
      const ataInfo = await connection.getAccountInfo(ata);
      if (ataInfo && new Uint8Array(ataInfo.data)[108] === 1) {
        setAtaStatus("⏭ ATA は既に存在しアンフリーズ済みです");
        return;
      }

      // サーバーサイドで Token ACL permissionless thaw 命令を組み立てる
      const res = await fetch("/api/build-thaw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorAddress: investor.toBase58(),
          payerAddress: wallet.publicKey.toBase58(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "API error");

      const instructions: TransactionInstruction[] = json.instructions.map(
        (ix: { programId: string; keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: number[] }) =>
          new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            keys: ix.keys.map((k: { pubkey: string; isSigner: boolean; isWritable: boolean }) => ({
              pubkey: new PublicKey(k.pubkey),
              isSigner: k.isSigner,
              isWritable: k.isWritable,
            })),
            data: Buffer.from(ix.data),
          })
      );

      const tx = new Transaction().add(...instructions);
      const sig = await wallet.sendTransaction(tx, connection, {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      setAtaStatus(`✅ ATA作成+アンフリーズ完了: ${sig.slice(0, 20)}...`);
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : String(e);
      const inner = (e as { error?: unknown })?.error;
      if (inner && typeof inner === "object" && "getLogs" in inner) {
        const logs: string[] = await (inner as { getLogs: (c: typeof connection) => Promise<string[]> })
          .getLogs(connection).catch(() => []);
        if (logs.length > 0) msg = logs.join("\n");
      } else if (inner instanceof Error) {
        msg = inner.message;
      }
      setAtaStatus(`❌ ${msg}`);
    } finally {
      setLoading(null);
    }
  }

  // ── ミント ───────────────────────────────────────────────
  async function handleMint() {
    const investor = getInvestorPubkey();
    if (!investor || !wallet.publicKey) return;
    setLoading("mint");
    setMintStatus(null);
    try {
      const ata = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        investor,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const amount = BigInt(parseInt(mintAmount));
      const ix = createMintToInstruction(
        MINT_ADDRESS,
        ata,
        wallet.publicKey,  // mint authority = issuer
        amount,
        [],
        TOKEN_2022_PROGRAM_ID
      );
      const tx = new Transaction().add(ix);
      const sig = await wallet.sendTransaction(tx, connection, {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      setMintStatus(`✅ ${mintAmount} REJST をミント: ${sig.slice(0, 20)}...`);
      onSuccess();
    } catch (e: unknown) {
      setMintStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(null);
    }
  }

  const connected = !!wallet.publicKey;
  const investorValid = !!getInvestorPubkey();

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">🏦 発行体：投資家セットアップ & ミント</h2>

      {/* 投資家ウォレットアドレス入力 */}
      <label className="block">
        <span className="text-gray-400 text-sm">投資家ウォレットアドレス</span>
        <input
          type="text"
          placeholder="投資家の公開鍵を入力..."
          value={investorAddr}
          onChange={(e) => setInvestorAddr(e.target.value)}
          className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
        />
        {investorAddr && !investorValid && (
          <p className="text-red-400 text-xs mt-1">無効なアドレスです</p>
        )}
      </label>

      {/* ── Step 1: KYC 承認 ── */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
          Step 1 — KYC 承認（AllowList に追加）
        </p>
        <button
          onClick={handleKyc}
          disabled={!connected || !investorValid || loading !== null}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {loading === "kyc" ? "送信中..." : "✅ KYC 承認"}
        </button>
        {kycStatus && (
          <p className="text-xs text-gray-300 bg-gray-700 rounded-lg p-2 break-all">
            {kycStatus}
          </p>
        )}
      </div>

      {/* ── Step 2: ATA 作成 + アンフリーズ ── */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
          Step 2 — ATA 作成 + アンフリーズ
        </p>
        <button
          onClick={handleCreateAta}
          disabled={!connected || !investorValid || loading !== null}
          className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {loading === "ata" ? "送信中..." : "🔓 ATA 作成 + アンフリーズ"}
        </button>
        {ataStatus && (
          <p className="text-xs text-gray-300 bg-gray-700 rounded-lg p-2 break-all">
            {ataStatus}
          </p>
        )}
      </div>

      {/* ── Step 3: ミント ── */}
      <div className="space-y-2">
        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
          Step 3 — トークンをミント
        </p>
        <label className="block">
          <span className="text-gray-400 text-sm">ミント数量（REJST）</span>
          <input
            type="number"
            min="1"
            value={mintAmount}
            onChange={(e) => setMintAmount(e.target.value)}
            className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </label>
        <button
          onClick={handleMint}
          disabled={!connected || !investorValid || loading !== null}
          className="w-full py-2 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-medium text-sm transition-colors"
        >
          {loading === "mint" ? "送信中..." : "🪙 REJST をミント"}
        </button>
        {mintStatus && (
          <p className="text-xs text-gray-300 bg-gray-700 rounded-lg p-2 break-all">
            {mintStatus}
          </p>
        )}
      </div>
    </div>
  );
}
