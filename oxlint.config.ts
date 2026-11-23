import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack, antiSlop],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: ["@stylexjs/eslint-plugin"],
  overrides: [
    {
      // StyleX objects are ordered by @stylexjs/sort-keys instead.
      files: ["apps/web/src/**/*.tsx", "apps/web/src/styles/**"],
      rules: { "sort-keys": "off" },
    },
  ],
  rules: {
    "@stylexjs/no-unused": "error",
    "@stylexjs/sort-keys": "error",
    "@stylexjs/valid-shorthands": "error",
    "@stylexjs/valid-styles": [
      "error",
      {
        // Newer than the plugin's property list. Trims text to the cap
        // height and baseline: "trim-both cap alphabetic".
        propLimits: { textBox: { limit: "string" } },
      },
    ],
  },
});
