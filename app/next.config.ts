import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  images: {
    unoptimized: true, // external URLs (x.com avatars/media)
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
