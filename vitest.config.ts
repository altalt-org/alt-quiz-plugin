import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const sdkRoot = fileURLToPath(
  new URL("../alt/vendor/alt-plugin-sdk/src", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@alt\/plugin-sdk\/contracts$/,
        replacement: `${sdkRoot}/contracts.ts`,
      },
      {
        find: /^@alt\/plugin-sdk\/ai$/,
        replacement: `${sdkRoot}/ai.ts`,
      },
      {
        find: /^@alt\/plugin-sdk$/,
        replacement: `${sdkRoot}/index.ts`,
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./test/setup.ts"],
    css: false,
  },
});
