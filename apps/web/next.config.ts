import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for Docker: generates .next/standalone with server.js
  output: "standalone",
  // Prevent webpack from bundling server-only native packages
  serverExternalPackages: ["bcrypt"],
};

export default nextConfig;
