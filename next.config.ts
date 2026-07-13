import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["kordoc", "pdfjs-dist"],
};

export default nextConfig;
