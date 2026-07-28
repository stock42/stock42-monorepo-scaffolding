import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@stock42/api-client", "@stock42/contracts", "@stock42/ui"],
};

export default nextConfig;
