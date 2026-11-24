import { defineConfig } from "drizzle-kit";

// Not wired into varlock while the app has no database: set DATABASE_URL in
// the shell to run Drizzle commands.

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
