/**
 * Phase 1: Step 4
 * 発行体が投資家ウォレットをKYC承認する（AllowListへ追加）。
 *
 * 実行:
 *   KYC承認:     npx ts-node scripts/04-kyc-approve.ts <INVESTOR_WALLET>
 *   AMLブロック: npx ts-node scripts/04-kyc-approve.ts <WALLET> --block
 */
import { address } from "@solana/kit";
import {
  addWalletInstruction,
  findWalletEntryPda,
} from "./abl-gate-compat";
import { createClient, buildAndSend } from "./shared";
import { readFileSync } from "fs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx ts-node scripts/04-kyc-approve.ts <WALLET> [--block]");
    process.exit(1);
  }

  const walletToAdd = address(args[0]);
  const isBlock = args.includes("--block");

  const client = await createClient();
  const { payer } = client;
  const config = JSON.parse(readFileSync("scripts/.abl-config", "utf-8"));
  const listPda = address(isBlock ? config.blockListPda : config.allowListPda);
  const listType = isBlock ? "BlockList (AML)" : "AllowList (KYC)";

  console.log(`Adding ${walletToAdd} to ${listType}...`);

  const [walletEntryPda] = await findWalletEntryPda({
    listConfig: listPda,
    walletAddress: walletToAdd,
  });

  const sig = await buildAndSend(client, [
    addWalletInstruction(payer, payer, listPda, walletToAdd, walletEntryPda),
  ]);

  console.log(`✅ ${walletToAdd} added to ${listType}`);
  console.log("   Signature:", sig);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
