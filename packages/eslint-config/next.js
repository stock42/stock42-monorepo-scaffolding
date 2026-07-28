import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import { baseConfig } from "./index.js";

export const nextConfig = [...baseConfig, ...nextVitals, ...nextTypeScript];

export default nextConfig;
