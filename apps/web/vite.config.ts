import { cloudflare } from "@cloudflare/vite-plugin";
import type { PluginConfig } from "@cloudflare/vite-plugin";
import stylex from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockCloudflareVitePlugin } from "@varlock/cloudflare-integration";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { radixColors } from "./src/styles/radix-colors.ts";

/** StyleX spacing scale, resolved at compile time: multiples of 4px. */
const spacing = (step: number) => `${step * 4}px`;

const cloudflareOptions: PluginConfig = {
  // The source config sits at the repo root, where the Deploy to Cloudflare
  // button looks for it.
  configPath: "../../wrangler.jsonc",
  viteEnvironment: { name: "ssr" },
};

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
    tanstackStart(),
    viteReact({ compiler: true }),
  ],
}));
