/**
 * Phase 1: Step 2
 * Token ACL の MintConfig PDA を作成しフリーズ権限を委譲する。
 * パーミッションレスThawを有効化する。
 *
 * 実行: npx ts-node scripts/02-setup-token-acl.ts
 */
import { address } from "@solana/kit";
import {
  getCreateConfigInstruction,
  findMintConfigPda,
  getTogglePermissionlessInstructionsInstruction,
} from "@token-acl/sdk";
import { createClient, buildAndSend } from "./shared";
import { readFileSync, writeFileSync } from "fs";

const ABL_PROGRAM_ADDRESS = "GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz";

async function main() {
  const client = await createClient();
  const { payer } = client;

  const { mint } = JSON.parse(readFileSync("scripts/.mint-address", "utf-8"));
  const mintAddr = address(mint);
  console.log("Mint:", mintAddr);

  const [mintConfigPda] = await findMintConfigPda({ mint: mintAddr });
  console.log("MintConfig PDA:", mintConfigPda);

  // Step A: MintConfig 作成（フリーズ権限委譲）
  const sig1 = await buildAndSend(client, [
    getCreateConfigInstruction({
      payer: payer.address,
      authority: payer,
      mint: mintAddr,
      mintConfig: mintConfigPda,
      gatingProgram: address(ABL_PROGRAM_ADDRESS),
    }),
  ]);
  console.log("✅ MintConfig created:", sig1);

  // Step B: パーミッションレスThaw有効化
  const sig2 = await buildAndSend(client, [
    getTogglePermissionlessInstructionsInstruction({
      authority: payer,
      mintConfig: mintConfigPda,
      thawEnabled: true,
      freezeEnabled: false,
    }),
  ]);
  console.log("✅ Permissionless thaw enabled:", sig2);

  writeFileSync(
    "scripts/.acl-config",
    JSON.stringify({ mint, mintConfigPda })
  );
  console.log("Config saved to scripts/.acl-config");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
