import { PublicKey } from "@solana/web3.js";

export const DEVNET_RPC = "https://api.devnet.solana.com";

// scripts/01-create-mint.ts で作成した Token-2022 Mint
export const MINT_ADDRESS = new PublicKey(
  "FkD73NkVGZmkHujFrGKKCT9iagHGpfnCisPsxR1VWJPF"
);

// DividendDistributor プログラム
export const PROGRAM_ID = new PublicKey(
  "BLpJKVjV8hm2TBFrmhbrLjnqs1FPSdWdbrMCmn1tW322"
);

// Token-2022 プログラム
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// ABL Gate プログラム（KYC/AML）
export const ABL_GATE_PROGRAM_ID = new PublicKey(
  "GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz"
);

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** DistributorState PDA を導出 */
export function findDistributorPda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("distributor"), MINT_ADDRESS.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/** ClaimRecord PDA を導出 */
export function findClaimRecordPda(investor: PublicKey, epoch: bigint): PublicKey {
  const epochBuf = new Uint8Array(8);
  new DataView(epochBuf.buffer).setBigUint64(0, epoch, true); // little-endian
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("claim"),
      findDistributorPda().toBuffer(),
      investor.toBuffer(),
      epochBuf,
    ],
    PROGRAM_ID
  );
  return pda;
}
