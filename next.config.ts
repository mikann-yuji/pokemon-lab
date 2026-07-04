/**
 * このファイルの役割: Next.jsのビルド・実行時設定を定義する設定ファイル。
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        port: "",
        pathname: "/PokeAPI/sprites/**",
        search: "",
      },
    ],
  },
};

export default nextConfig;
