/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker: generates a self-contained .next/standalone folder
  // that includes server.js and the minimal node_modules needed to run.
  output: "standalone",
};

export default nextConfig;
