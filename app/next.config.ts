import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.X_SYNC_DIST_DIR ?? '.next',
  serverExternalPackages: ['better-sqlite3'],
  images: {
    unoptimized: true, // external URLs (x.com avatars/media)
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
