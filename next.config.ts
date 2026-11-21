import type { NextConfig } from "next";

// Pin the project root: there is an unrelated package-lock.json in the home folder.
const config: NextConfig = { turbopack: { root: process.cwd() } };
export default config;
