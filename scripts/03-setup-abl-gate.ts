/**
 * Phase 1: Step 3
 * ABL Gate で AllowList / BlockList を作成し Mint に適用する。
 * モード: Composite（KYCホワイトリスト + AMLブラックリスト）
 *
 * 実行: npx ts-node scripts/03-setup-abl-gate.ts
 */
import { address } from "@solana/kit";
import { ABL_PROGRAM_ADDRESS } from "@token-acl/abl-sdk";
import {
  createListInstruction,
  setupExtraMetasInstruction,
  findListConfigPda,
  findMintConfigPda,
  findThawExtraMetasPdaForGate,
} from "./abl-gate-compat";
import { createClient, buildAndSend } from "./shared";
import { readFileSync, writeFileSync } from "fs";

async function main() {
  const client = await createClient();
  const { payer, rpc } = client;

  const { mint } = JSON.parse(readFileSync("scripts/.mint-address", "utf-8"));
  const mintAddr = address(mint);
  console.log("Mint:", mintAddr);

  const [mintConfigPda] = await findMintConfigPda({ mint: mintAddr });

  // AllowList seed: mint address（KYC承認済み投資家）
  const [allowListPda] = await findListConfigPda({
    authority: payer.address,
    seed: mintAddr,
  });

  // BlockList seed: ABL_PROGRAM_ADDRESS（制裁対象）
  const [blockListPda] = await findListConfigPda({
    authority: payer.address,
    seed: address(ABL_PROGRAM_ADDRESS),
  });

  // ExtraMetas PDA は ABL Gate プログラム (gating program) から導出する
  const [thawExtraMetasPda] = await findThawExtraMetasPdaForGate(mintAddr);

  console.log("AllowList PDA:", allowListPda);
  console.log("BlockList PDA:", blockListPda);
  console.log("ThawExtraMetas PDA:", thawExtraMetasPda);

  // Step A: AllowList 作成（既存なら skip）
  const allowListInfo = await rpc.getAccountInfo(allowListPda).send();
  if (allowListInfo.value) {
    console.log("⏭  AllowList already exists:", allowListPda);
  } else {
    const sig1 = await buildAndSend(client, [
      createListInstruction(payer, payer, allowListPda, 0 /* Allow */, mintAddr),
    ]);
    console.log("✅ AllowList created:", sig1);
  }

  // Step B: BlockList 作成（seed=ABL_PROGRAM_ADDRESS なので Mint 変更でも同一 PDA → 既存なら skip）
  const blockListInfo = await rpc.getAccountInfo(blockListPda).send();
  if (blockListInfo.value) {
    console.log("⏭  BlockList already exists:", blockListPda);
  } else {
    const sig2 = await buildAndSend(client, [
      createListInstruction(payer, payer, blockListPda, 2 /* Block */, address(ABL_PROGRAM_ADDRESS)),
    ]);
    console.log("✅ BlockList created:", sig2);
  }

  // Step C: ExtraMetas セットアップ（Composite: AllowList + BlockList）
  const sig3 = await buildAndSend(client, [
    setupExtraMetasInstruction(payer, payer, mintConfigPda, mintAddr, thawExtraMetasPda, [
      allowListPda,
      blockListPda,
    ]),
  ]);
  console.log("✅ ExtraMetas configured (Composite):", sig3);

  writeFileSync(
    "scripts/.abl-config",
    JSON.stringify({ mint, mintConfigPda, allowListPda, blockListPda, thawExtraMetasPda })
  );
  console.log("✅ ABL Gate setup complete. Config saved to scripts/.abl-config");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
