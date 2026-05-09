"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  findDistributorPda,
  findClaimRecordPda,
  MINT_ADDRESS,
  TOKEN_2022_PROGRAM_ID,
  LAMPORTS_PER_SOL,
} from "@/lib/config";
import type { DividendDistributor } from "@/lib/idl/dividend_distributor";
import IDL from "@/lib/idl/dividend_distributor.json";

const DISTRIBUTOR_DISCRIMINATOR = Buffer.from([228, 86, 189, 137, 118, 24, 15, 127]);

function readU64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

type KycStatus = "unknown" | "approved" | "pending" | "no_account";

export default function InvestorPanel({ onSuccess }: { onSuccess: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [kycStatus, setKycStatus] = useState<KycStatus>("unknown");
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [estimatedPayout, setEstimatedPayout] = useState<number>(0);
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getProgram() {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error("ウォレット未接続");
    const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
    return new Program(IDL as DividendDistributor, provider);
  }

  useEffect(() => {
    if (!wallet.publicKey) {
      setKycStatus("unknown");
      return;
    }
    fetchInvestorStatus();
  }, [wallet.publicKey, connection]);

  async function fetchInvestorStatus() {
    if (!wallet.publicKey) return;

    try {
      // ATA を取得（Token-2022）
      const ata = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const ataInfo = await connection.getAccountInfo(ata);

      if (!ataInfo) {
        setKycStatus("no_account");
        setTokenBalance(0);
        return;
      }

      // Token アカウントの state: offset 108 (0=uninit, 1=init/thawed, 2=frozen)
      const ataData = new Uint8Array(ataInfo.data);
      const state = ataData[108];
      setKycStatus(state === 1 ? "approved" : "pending");

      // 残高: offset 64, u64 LE
      const balance = readU64LE(ataData, 64);
      setTokenBalance(Number(balance));

      // DistributorState から按分を計算
      const distributorPda = findDistributorPda();
      const distInfo = await connection.getAccountInfo(distributorPda);
      if (distInfo && distInfo.data.length >= 97) {
        const d = new Uint8Array(distInfo.data);
        const epoch = readU64LE(d, 72);
        const totalSupply = readU64LE(d, 80);
        const dividendAmount = readU64LE(d, 88);

        if (totalSupply > BigInt(0) && dividendAmount > BigInt(0)) {
          const payout = Number(balance) * Number(dividendAmount) / Number(totalSupply);
          setEstimatedPayout(payout);
        }

        // ClaimRecord が存在するか確認（二重請求チェック）
        const claimPda = findClaimRecordPda(wallet.publicKey, epoch);
        const claimInfo = await connection.getAccountInfo(claimPda);
        setAlreadyClaimed(!!claimInfo);
      }
    } catch {
      // ignore
    }
  }

  async function handleClaim() {
    setLoading(true);
    setStatus(null);
    try {
      const program = getProgram();
      const distributorPda = findDistributorPda();

      // 現在のエポックを取得
      const distInfo = await connection.getAccountInfo(distributorPda);
      if (!distInfo) throw new Error("Distributor が初期化されていません");
      const epoch = readU64LE(new Uint8Array(distInfo.data), 72);

      const ata = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        wallet.publicKey!,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const claimRecordPda = findClaimRecordPda(wallet.publicKey!, epoch);

      const tx = await program.methods
        .claimDividend()
        .accounts({
          investor: wallet.publicKey!,
          distributor: distributorPda,
          investorTokenAccount: ata,
          claimRecord: claimRecordPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setStatus(`✅ 請求完了: ${tx.slice(0, 20)}...`);
      setAlreadyClaimed(true);
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("InvestorNotKyc")) {
        setStatus("❌ KYC 未承認: トークンアカウントが Frozen です。発行体に KYC 申請してください。");
      } else if (msg.includes("ZeroBalance")) {
        setStatus("❌ トークン残高がゼロです。");
      } else {
        setStatus(`❌ ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  const connected = !!wallet.publicKey;

  const kycBadge = {
    unknown:    { text: "---",         cls: "bg-gray-600 text-gray-300" },
    approved:   { text: "✅ KYC承認済", cls: "bg-green-700 text-green-200" },
    pending:    { text: "⏳ 未承認(Frozen)", cls: "bg-yellow-700 text-yellow-200" },
    no_account: { text: "❌ ATA なし",  cls: "bg-red-800 text-red-200" },
  }[kycStatus];

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">👤 投資家パネル</h2>

      {connected && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">KYC 状態:</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${kycBadge.cls}`}>
              {kycBadge.text}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-700 rounded-lg p-2">
              <dt className="text-gray-400 text-xs">保有枚数</dt>
              <dd className="text-white font-semibold">{tokenBalance.toLocaleString()} tokens</dd>
            </div>
            <div className="bg-gray-700 rounded-lg p-2">
              <dt className="text-gray-400 text-xs">受取予定</dt>
              <dd className="text-white font-semibold">
                {(estimatedPayout / LAMPORTS_PER_SOL).toFixed(4)} SOL
              </dd>
            </div>
          </dl>
        </div>
      )}

      {alreadyClaimed && (
        <p className="text-green-400 text-sm bg-green-900/30 rounded-lg p-2">
          ✅ このエポックは請求済みです
        </p>
      )}

      <button
        onClick={handleClaim}
        disabled={!connected || loading || alreadyClaimed || kycStatus !== "approved"}
        className="w-full py-2 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
      >
        {loading
          ? "送信中..."
          : alreadyClaimed
          ? "請求済み"
          : "Claim Dividend"}
      </button>

      <button
        onClick={fetchInvestorStatus}
        disabled={!connected}
        className="w-full py-1 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
      >
        状態を更新
      </button>

      {status && (
        <p className="text-sm text-gray-300 bg-gray-700 rounded-lg p-3 break-all">
          {status}
        </p>
      )}
    </div>
  );
}
