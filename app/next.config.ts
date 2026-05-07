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
  allowedDevOrigins: [
    'johnnys-macbook-pro.tailf5c3be.ts.net',
    '*.tailf5c3be.ts.net',
    '100.101.52.24',
  ],
};

export default nextConfig;
