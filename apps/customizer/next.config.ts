import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@berkayorhan/stackkit-core",
    "@berkayorhan/stackkit-registry",
    "@berkayorhan/stackkit-schemas"
  ]
};

export default nextConfig;
