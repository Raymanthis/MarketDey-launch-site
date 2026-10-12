import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The original runtime mounted each section once; StrictMode double-mounts would restart scroll/WebGL setup in dev.
  reactStrictMode: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
