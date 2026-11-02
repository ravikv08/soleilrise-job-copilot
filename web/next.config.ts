import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server serves from .next while it runs. A production build
  // writing there replaces its chunk map and breaks the running server
  // mid-session, with misleading "Cannot find module './847.js'" errors.
  // Keeping the build output elsewhere makes the two independent.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
