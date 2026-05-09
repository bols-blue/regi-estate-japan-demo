/**
 * Phase 1: Step 1
 * Token-2022 Mint を作成する。
 * 拡張: DefaultAccountState=Frozen, MetadataPointer, TokenMetadata(token_acl=ABL Gate)
 *
 * 実行: npx ts-node scripts/01-create-mint.ts
 */
import {
  generateKeyPairSigner,
  address,
  some,
} from "@solana/kit";
import {
  getInitializeMint2Instruction,
  getInitializeDefaultAccountStateInstruction,
  getInitializeMetadataPointerInstruction,
  getInitializeTokenMetadataInstruction,
  getUpdateTokenMetadataFieldInstruction,
  tokenMetadataField,
  TOKEN_2022_PROGRAM_ADDRESS,
  AccountState,
  getMintSize,
} from "@solana-program/token-2022";
import { getCreateAccountInstruction } from "@solana-program/system";
import { createClient, buildAndSend } from "./shared";
import { writeFileSync } from "fs";

// ABL Gate program address
const ABL_GATE_PROGRAM = address("GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz");

async function main() {
  const client = await createClient();
  const { rpc, payer } = client;

  console.log("Payer:", payer.address);

  const mint = await generateKeyPairSigner();
  console.log("Mint address:", mint.address);

  // Tx1 で確保するアカウントサイズ: DefaultAccountState + MetadataPointer のみ
  // (InitializeMint2 は未初期化の TokenMetadata TLV があると InvalidAccountData になるため)
  const INIT_SPACE = BigInt(getMintSize([
    { __kind: "DefaultAccountState", state: AccountState.Frozen },
    { __kind: "MetadataPointer", authority: some(payer.address), metadataAddress: some(mint.address) },
  ] as any));

  // InitializeTokenMetadata / UpdateTokenMetadataField が realloc するため、
  // 最終サイズ分の家賃を先払いしておく（excess lamports が realloc の原資になる）
  const FULL_SPACE = BigInt(getMintSize([
    { __kind: "DefaultAccountState", state: AccountState.Frozen },
    { __kind: "MetadataPointer", authority: some(payer.address), metadataAddress: some(mint.address) },
    { __kind: "TokenMetadata", updateAuthority: some(payer.address), mint: mint.address,
      name: "RegiEstateJapan ST", symbol: "REJST", uri: "",
      additionalMetadata: [["token_acl", ABL_GATE_PROGRAM]] },
  ] as any));

  console.log("Init space:", INIT_SPACE, "bytes / Full space:", FULL_SPACE, "bytes");

  const rentLamports = await rpc
    .getMinimumBalanceForRentExemption(FULL_SPACE)
    .send();

  // Tx 1: アカウント作成 + Mint初期化（InitializeMint2の前にextension初期化）
  const sig1 = await buildAndSend(client, [
    // 1. アカウント作成
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: rentLamports,
      space: INIT_SPACE,
      programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    }),
    // 2. DefaultAccountState=Frozen（InitializeMint2の前に必須）
    getInitializeDefaultAccountStateInstruction({
      mint: mint.address,
      state: AccountState.Frozen,
    }),
    // 3. MetadataPointer（自己参照、InitializeMint2の前に必須）
    getInitializeMetadataPointerInstruction({
      mint: mint.address,
      authority: payer.address,
      metadataAddress: mint.address,
    }),
    // 4. Mint 本体初期化（拡張Mint用: InitializeMint2 = rentSysvar不要）
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: 0,
      mintAuthority: payer.address,
      freezeAuthority: payer.address,
    }),
  ]);
  console.log("✅ Mint account created:", sig1);

  // Tx 2: TokenMetadata 初期化（InitializeMint2の後に実行）
  const sig2 = await buildAndSend(client, [
    // 5. TokenMetadata 初期化
    getInitializeTokenMetadataInstruction({
      metadata: mint.address,
      updateAuthority: payer.address,
      mint: mint.address,
      mintAuthority: payer,
      name: "RegiEstateJapan ST",
      symbol: "REJST",
      uri: "",
    }),
    // 6. token_acl フィールドを追加（ABL Gate プログラムアドレス）
    getUpdateTokenMetadataFieldInstruction({
      metadata: mint.address,
      updateAuthority: payer,
      field: tokenMetadataField("Key", ["token_acl"] as const),
      value: ABL_GATE_PROGRAM,
    }),
  ]);
  console.log("✅ TokenMetadata initialized with token_acl field:", sig2);
  console.log("   Mint address:", mint.address);

  writeFileSync(
    "scripts/.mint-address",
    JSON.stringify({ mint: mint.address })
  );
  console.log("   Saved to scripts/.mint-address");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
