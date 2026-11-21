import type { NextConfig } from "next";

// Pin the project root: there is an unrelated package-lock.json in the home folder.
// runs/ is read at request time via fs, so tell file tracing to ship it with the functions.
const config: NextConfig = { turbopack: { root: process.cwd() }, outputFileTracingIncludes: { "/**": ["./runs/**"] } };
export default config;
