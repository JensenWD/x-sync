import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'natural'],
  images: {
    unoptimized: true, // external URLs (x.com avatars/media)
  },
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
};

export default nextConfig;
