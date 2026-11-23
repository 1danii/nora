import stylex from "@stylexjs/unplugin/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { radixColors } from "./src/styles/radix-colors.ts";

/** StyleX spacing scale, resolved at compile time: multiples of 4px. */
const spacing = (step: number) => `${step * 4}px`;

export default defineConfig({
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
    tanstackStart(),
    viteReact({ compiler: true }),
  ],
});
