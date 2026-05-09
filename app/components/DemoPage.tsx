"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);
import DistributorStatus from "./DistributorStatus";
import MintPanel from "./MintPanel";
import IssuerPanel from "./IssuerPanel";
import InvestorPanel from "./InvestorPanel";
import TransferPanel from "./TransferPanel";

export default function DemoPage() {
  const { publicKey } = useWallet();
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ヘッダー */}
      <header className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">🏘 RegiEstateJapan</h1>
          <p className="text-xs text-gray-400">
            Security Token 配当分配デモ — Solana Devnet
          </p>
        </div>
        <WalletMultiButton />
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* デモシナリオ */}
        <div className="bg-blue-900/40 border border-blue-700 rounded-xl p-4 text-sm text-blue-200">
          <p className="font-semibold mb-1">📋 デモシナリオ</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5 text-blue-300">
            <div>
              <p className="font-medium text-blue-200 mt-1">発行体（Issuer）</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>投資家に <strong>KYC承認 + ATA作成</strong> を実施</li>
                <li>投資家に <strong>REJST をミント</strong></li>
                <li><strong>Initialize</strong> でディストリビューター作成</li>
                <li><strong>Deposit Dividend</strong> で配当を入金</li>
              </ol>
            </div>
            <div>
              <p className="font-medium text-blue-200 mt-1">投資家（Investor）</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>ウォレット接続 → KYC 状態を確認</li>
                <li><strong>Claim Dividend</strong> で按分配当を受け取る</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Distributor 状態 */}
        <DistributorStatus refreshKey={refreshKey} />

        {/* 発行体パネル群 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MintPanel onSuccess={refresh} />
          <div className="space-y-4">
            <IssuerPanel onSuccess={refresh} />
          </div>
        </div>

        {/* 転送・投資家パネル */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TransferPanel onSuccess={refresh} />
          <InvestorPanel onSuccess={refresh} />
        </div>

        {publicKey && (
          <div className="text-xs text-gray-500 text-center font-mono">
            接続中: {publicKey.toBase58()}
          </div>
        )}
      </main>
    </div>
  );
}
