import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import type { PluginConfig } from "@cloudflare/vite-plugin";
import stylex from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockCloudflareVitePlugin } from "@varlock/cloudflare-integration";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

import { radixColors } from "./src/styles/radix-colors.ts";

/** StyleX spacing scale, resolved at compile time: multiples of 4px. */
const spacing = (step: number) => `${step * 4}px`;

const cloudflareOptions: PluginConfig = {
  // The source config sits at the repo root, where the Deploy to Cloudflare
  // button looks for it.
  configPath: "../../wrangler.jsonc",
  viteEnvironment: { name: "ssr" },
};

/**
 * After a build, points Wrangler run from the repo root at the built Worker
 * config, the way the Cloudflare plugin already does for apps/web. Workers
 * Builds' default deploy command, `npx wrangler deploy`, runs from the root.
 */
const rootDeployRedirect = (): Plugin => ({
  name: "nora:root-deploy-redirect",
  apply: "build",
  closeBundle() {
    const directory = path.resolve(
      import.meta.dirname,
      "../../.wrangler/deploy"
    );
    const builtConfig = path.resolve(
      import.meta.dirname,
      "dist/server/wrangler.json"
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "config.json"),
      JSON.stringify({
        configPath: path.relative(directory, builtConfig),
        auxiliaryWorkers: [],
      })
    );
  },
});

export default defineConfig(({ command }) => ({
  server: {
    port: 3000,
    strictPort: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // Before the framework plugins, so Fast Refresh sees compiled StyleX.
    stylex({
      // StyleX resolves .stylex.ts imports itself, so it needs the tsconfig alias too.
      aliases: { "@/*": [`${import.meta.dirname}/src/*`] },
      env: { colors: radixColors, spacing },
      unstable_moduleResolution: {
        rootDir: import.meta.dirname,
        type: "commonJS",
      },
      useCSSLayers: { before: ["reset"] },
    }),
    // Dev and preview: varlock validates .env and hands it to the Worker.
    // Builds: plain Cloudflare, so the Worker reads its own vars and secrets
    // at runtime, whether `wrangler secret put`, the dashboard or the Deploy
    // button set them.
    command === "serve"
      ? varlockCloudflareVitePlugin(cloudflareOptions)
      : cloudflare(cloudflareOptions),
    rootDeployRedirect(),
    tanstackStart(),
    viteReact({ compiler: true }),
  ],
}));
