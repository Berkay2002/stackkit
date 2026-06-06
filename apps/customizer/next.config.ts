import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "./module-graph.js": "../../packages/core/src/module-graph.ts",
      "./tooling.js": "../../packages/core/src/tooling.ts"
    }
  },
  transpilePackages: [
    "@berkayorhan/stackkit-core",
    "@berkayorhan/stackkit-registry",
    "@berkayorhan/stackkit-schemas"
  ]
};

export default nextConfig;
