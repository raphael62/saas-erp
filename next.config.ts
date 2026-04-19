import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // Avoid broken server webpack vendor chunks (missing ./vendor-chunks/*.js on Windows / stale .next).
  serverExternalPackages: ["tailwind-merge", "@supabase/ssr", "@supabase/supabase-js"],
};

export default nextConfig;
