import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 はデフォルト Turbopack — webpack config は不要
  // Turbopack は最新 Solana パッケージのブラウザビルドをそのまま解決できる
  turbopack: {},

  // workspace root の誤検知を抑制
  // (regi-estate-japan/yarn.lock と app/package-lock.json が共存)
};

export default nextConfig;
