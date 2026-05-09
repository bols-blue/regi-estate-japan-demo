"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { MINT_ADDRESS } from "@/lib/config";

export default function TransferPanel({ onSuccess }: { onSuccess: () => void }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [recipientAddr, setRecipientAddr] = useState("");
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function getRecipientPubkey(): PublicKey | null {
    try {
      return new PublicKey(recipientAddr.trim());
    } catch {
      return null;
    }
  }

  async function handleTransfer() {
    const recipient = getRecipientPubkey();
    if (!recipient || !wallet.publicKey) return;
    setLoading(true);
    setStatus(null);
    try {
      const senderAta = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        wallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      const recipientAta = getAssociatedTokenAddressSync(
        MINT_ADDRESS,
        recipient,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      // 受取人の ATA が存在するか確認
      const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
      if (!recipientAtaInfo) {
        setStatus("❌ 受取人の ATA が存在しません。先に発行体パネルで「ATA作成 + アンフリーズ」を実行してください。");
        return;
      }

      // 受取人の KYC 状態確認（offset 108: 1=thawed, 2=frozen）
      const recipientState = recipientAtaInfo.data[108];
      if (recipientState === 2) {
        setStatus("❌ 受取人が KYC 未承認（Frozen）です。");
        return;
      }

      const transferAmount = BigInt(parseInt(amount));
      const ix = createTransferInstruction(
        senderAta,
        recipientAta,
        wallet.publicKey,
        transferAmount,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      const tx = new Transaction().add(ix);
      const sig = await wallet.sendTransaction(tx, connection, {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`✅ ${amount} REJST を転送しました: ${sig.slice(0, 20)}...`);
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("frozen") || msg.includes("0x11")) {
        setStatus("❌ 送信元または受取人のアカウントが Frozen です。KYC 承認を確認してください。");
      } else if (msg.includes("insufficient funds") || msg.includes("0x1")) {
        setStatus("❌ 残高不足です。");
      } else {
        setStatus(`❌ ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  const connected = !!wallet.publicKey;
  const recipientValid = !!getRecipientPubkey();

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">↔️ トークン転送</h2>

      <p className="text-xs text-gray-400">
        接続中のウォレットから任意のアドレスへ REJST を転送します。
        受取人は事前に KYC 承認 + ATA 作成が必要です。
      </p>

      <label className="block">
        <span className="text-gray-400 text-sm">受取人ウォレットアドレス</span>
        <input
          type="text"
          placeholder="受取人の公開鍵を入力..."
          value={recipientAddr}
          onChange={(e) => setRecipientAddr(e.target.value)}
          className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 placeholder-gray-500"
        />
        {recipientAddr && !recipientValid && (
          <p className="text-red-400 text-xs mt-1">無効なアドレスです</p>
        )}
      </label>

      <label className="block">
        <span className="text-gray-400 text-sm">転送数量（REJST）</span>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </label>

      <button
        onClick={handleTransfer}
        disabled={!connected || !recipientValid || loading}
        className="w-full py-2 px-4 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 text-white rounded-lg font-medium text-sm transition-colors"
      >
        {loading ? "送信中..." : "↔️ REJST を転送"}
      </button>

      {status && (
        <p className="text-sm text-gray-300 bg-gray-700 rounded-lg p-3 break-all">
          {status}
        </p>
      )}
    </div>
  );
}
