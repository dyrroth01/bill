import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer", "sharp", "handlebars", "mammoth", "pdf-to-img", "@napi-rs/canvas"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
