import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent webpack from trying to bundle Node.js-only packages used by @repo/db
  serverExternalPackages: ["ws", "@neondatabase/serverless", "bcrypt"],
};

export default nextConfig;
