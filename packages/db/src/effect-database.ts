import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import type { Effect } from "effect";
import { Context, Layer, Redacted } from "effect";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

const makeEffectDatabase = PgDrizzle.makeWithDefaults({ relations });

/** Effect-native Drizzle database. */
export class EffectDatabase extends Context.Service<
  EffectDatabase,
  Omit<Effect.Success<typeof makeEffectDatabase>, "$client">
>()("@nora/db/EffectDatabase") {}

/** Owns the native Effect PostgreSQL pool and closes it when the server scope ends. */
export const createEffectDatabaseLayer = (env: DatabaseConfig) => {
  const clientLayer = PgClient.layer({ url: Redacted.make(env.DATABASE_URL) });

  return Layer.effect(EffectDatabase, makeEffectDatabase).pipe(
    Layer.provide(clientLayer)
  );
};
