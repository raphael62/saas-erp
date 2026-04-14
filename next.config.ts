import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // Avoid broken server webpack vendor chunks for tailwind-merge (missing ./vendor-chunks/tailwind-merge.js on Windows / stale .next).
  serverExternalPackages: ["tailwind-merge"],
};

export default nextConfig;
