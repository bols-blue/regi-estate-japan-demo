"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { findDistributorPda, LAMPORTS_PER_SOL, MINT_ADDRESS } from "@/lib/config";

type DistributorState = {
  authority: string;
  mint: string;
  epoch: bigint;
  totalSupply: bigint;
  dividendAmount: bigint;
  claimedAmount: bigint;
};

function readU64LE(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function toHex(data: Uint8Array): string {
  return Array.from(data).map(b => b.toString(16).padStart(2, "0")).join("");
}

function decodeDistributorState(raw: Uint8Array): DistributorState {
  let offset = 8; // skip discriminator
  const authority = toHex(raw.slice(offset, offset + 32));
  offset += 32;
  const mint = toHex(raw.slice(offset, offset + 32));
  offset += 32;
  const epoch = readU64LE(raw, offset); offset += 8;
  const totalSupply = readU64LE(raw, offset); offset += 8;
  const dividendAmount = readU64LE(raw, offset); offset += 8;
  const claimedAmount = readU64LE(raw, offset); offset += 8;
  return { authority, mint, epoch, totalSupply, dividendAmount, claimedAmount };
}

export default function DistributorStatus({ refreshKey }: { refreshKey: number }) {
  const { connection } = useConnection();
  const [state, setState] = useState<DistributorState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pda = findDistributorPda();

    connection.getAccountInfo(pda).then((info) => {
      if (!info) {
        setState(null);
        setError("未初期化 — 発行体が Initialize を実行してください");
      } else {
        setState(decodeDistributorState(new Uint8Array(info.data)));
        setError(null);
      }
    }).catch((e) => setError(String(e))).finally(() => setLoading(false));
  }, [connection, refreshKey]);

  const pda = findDistributorPda();

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-5 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-3" />
        <div className="h-4 bg-gray-700 rounded w-3/4" />
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5 space-y-3">
      <h2 className="text-lg font-semibold text-white">📊 Distributor 状態</h2>
      <div className="text-xs text-gray-400 font-mono break-all">
        PDA: {pda.toBase58()}
      </div>
      <div className="text-xs text-gray-400 font-mono break-all">
        Mint: {MINT_ADDRESS.toBase58()}
      </div>

      {error ? (
        <p className="text-yellow-400 text-sm">{error}</p>
      ) : state ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <StatItem label="エポック" value={state.epoch.toString()} />
          <StatItem label="総発行量" value={state.totalSupply.toLocaleString() + " tokens"} />
          <StatItem
            label="配当総額"
            value={(Number(state.dividendAmount) / LAMPORTS_PER_SOL).toFixed(4) + " SOL"}
          />
          <StatItem
            label="請求済み"
            value={(Number(state.claimedAmount) / LAMPORTS_PER_SOL).toFixed(4) + " SOL"}
          />
          <StatItem
            label="残配当"
            value={(Number(state.dividendAmount - state.claimedAmount) / LAMPORTS_PER_SOL).toFixed(4) + " SOL"}
          />
        </dl>
      ) : null}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-700 rounded-lg p-2">
      <dt className="text-gray-400 text-xs">{label}</dt>
      <dd className="text-white font-semibold">{value}</dd>
    </div>
  );
}
