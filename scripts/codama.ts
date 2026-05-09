/**
 * Codama クライアント生成スクリプト
 *
 * Anchor IDL → @solana/kit 対応 TypeScript クライアントを生成する
 *
 * 実行: npx ts-node scripts/codama.ts
 * 出力: clients/js/src/generated/
 */
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";
import { readFileSync } from "fs";
import { join } from "path";

const idlPath = join(__dirname, "../target/idl/dividend_distributor.json");
const idl = JSON.parse(readFileSync(idlPath, "utf-8"));

const codama = createFromRoot(rootNodeFromAnchor(idl));

// Codama は outputDir 内に src/generated/ を自動生成する
const outputDir = join(__dirname, "../clients/js");

codama.accept(
  renderJavaScriptVisitor(outputDir, {
    prettierOptions: {
      semi: true,
      singleQuote: true,
      trailingComma: "es5",
      printWidth: 100,
    },
  })
);

console.log(`✅ Codama: TypeScript client generated at ${outputDir}`);
