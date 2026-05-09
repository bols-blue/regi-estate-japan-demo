/**
 * Phase 1: Step 5
 * 投資家のATAを作成し、Token ACLによる自動アンフリーズを試みる。
 *
 * 実行:
 *   自分自身:    npx ts-node scripts/05-create-ata-and-thaw.ts
 *   任意ウォレット: npx ts-node scripts/05-create-ata-and-thaw.ts <INVESTOR_WALLET>
 */
import { address, fetchEncodedAccount } from "@solana/kit";
import { createTokenAccountWithAcl } from "@token-acl/sdk";
import { createClient, buildAndSend } from "./shared";
import { readFileSync } from "fs";

async function main() {
  const args = process.argv.slice(2);
  const client = await createClient();
  const { rpc, payer } = client;
  const config = JSON.parse(readFileSync("scripts/.abl-config", "utf-8"));
  const mintAddr = address(config.mint);

  // 引数があればそのウォレット、なければ payer 自身
  const investorAddr = args[0] ? address(args[0]) : payer.address;
  console.log("Investor:", investorAddr);
  console.log("Mint:", mintAddr);

  const mintAccount = await fetchEncodedAccount(rpc, mintAddr);
  if (!mintAccount.exists) throw new Error("Mint account not found");

  const { getMintDecoder } = await import("@solana-program/token-2022");
  const mintData = getMintDecoder().decode(mintAccount.data);

  // payer が手数料を負担し、investorAddr 所有の ATA を作成 + permissionless thaw
  const instructions = await createTokenAccountWithAcl(
    rpc as any,
    mintData as any,
    mintAddr,
    investorAddr,
    payer      // fee payer & signer
  );

  const sig = await buildAndSend(client, instructions);
  console.log("✅ ATA created and thaw attempted:", sig);
  console.log("   Investor ATA owner:", investorAddr);
}

main().catch((err: any) => {
  if (err.message?.includes("thaw") || err.message?.includes("gate")) {
    console.error("❌ KYC未承認: まず 04-kyc-approve.ts を実行してください");
  } else {
    console.error(err);
  }
  process.exit(1);
});
