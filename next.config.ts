import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite is only used for local dev without Neon; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
