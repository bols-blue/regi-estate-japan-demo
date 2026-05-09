"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { findDistributorPda, MINT_ADDRESS, LAMPORTS_PER_SOL } from "@/lib/config";
import type { DividendDistributor } from "@/lib/idl/dividend_distributor";
import IDL from "@/lib/idl/dividend_distributor.json";

export default function IssuerPanel({ onSuccess }: { onSuccess: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [amountSol, setAmountSol] = useState("0.5");
  const [totalSupply, setTotalSupply] = useState("1000");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getProgram() {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error("ウォレット未接続");
    const provider = new AnchorProvider(connection, wallet as never, { commitment: "confirmed" });
    return new Program(IDL as DividendDistributor, provider);
  }

  async function handleInitialize() {
    setLoading(true);
    setStatus(null);
    try {
      const program = getProgram();
      const distributorPda = findDistributorPda();
      const tx = await program.methods
        .initialize()
        .accounts({
          authority: wallet.publicKey!,
          distributor: distributorPda,
          mint: MINT_ADDRESS,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setStatus(`✅ 初期化完了: ${tx.slice(0, 20)}...`);
      onSuccess();
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeposit() {
    setLoading(true);
    setStatus(null);
    try {
      const program = getProgram();
      const distributorPda = findDistributorPda();
      const amountLamports = new BN(Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL));
      const supply = new BN(parseInt(totalSupply));

      const tx = await program.methods
        .depositDividend(amountLamports, supply)
        .accounts({
          authority: wallet.publicKey!,
          distributor: distributorPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      setStatus(`✅ 入金完了: ${tx.slice(0, 20)}...`);
      onSuccess();
    } catch (e: unknown) {
      setStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  const connected = !!wallet.publicKey;

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">🏢 発行体パネル</h2>

      <div className="space-y-2">
        <button
          onClick={handleInitialize}
          disabled={!connected || loading}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          Initialize（初回のみ）
        </button>
      </div>

      <hr className="border-gray-700" />

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-300">配当を入金</h3>
        <label className="block">
          <span className="text-gray-400 text-sm">配当額 (SOL)</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={amountSol}
            onChange={(e) => setAmountSol(e.target.value)}
            className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <label className="block">
          <span className="text-gray-400 text-sm">総発行量スナップショット (枚)</span>
          <input
            type="number"
            min="1"
            value={totalSupply}
            onChange={(e) => setTotalSupply(e.target.value)}
            className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
        <button
          onClick={handleDeposit}
          disabled={!connected || loading}
          className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
        >
          {loading ? "送信中..." : "Deposit Dividend"}
        </button>
      </div>

      {status && (
        <p className="text-sm text-gray-300 bg-gray-700 rounded-lg p-3 break-all">
          {status}
        </p>
      )}
    </div>
  );
}
