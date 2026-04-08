import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fixes "multiple lockfiles" so Turbopack uses this project folder, not a parent (e.g. user home).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
