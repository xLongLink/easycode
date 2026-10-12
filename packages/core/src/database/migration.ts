export * as DatabaseMigration from "./migration.js"

import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { EffectDrizzleSqlite } from "./drizzle.js"
import { migrations } from "./migration.gen.js"
import schema from "./schema.gen.js"
import { Global } from "@opencode/util/global"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export type Migration = {
  id: string
  foreignKeys?: boolean
  up: (tx: Transaction) => Effect.Effect<void, unknown, Global.Service>
}

// Not serialized here: the Database layer holds a lock scoped to the database
// it is bootstrapping, since two instances over one file must not race.
export function apply(db: Database) {
  return Effect.gen(function* () {
    // OpenCode owns the unprefixed table namespace. Embedders sharing this
    // database may own underscore-prefixed tables, which bootstrap ignores.
    const tables = yield* db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 1) <> '_'`,
    )
    if (tables.some((table) => table.name === "session" || table.name === "session_v2"))
      return yield* applyOnly(db, migrations)
    if (tables.length > 0) return yield* Effect.die(new Error("Database is not empty and has no session table"))
    const started = Date.now()
    yield* Effect.logInfo("database schema bootstrap started", { migrations: migrations.length })
    yield* db.transaction((tx) =>
      Effect.gen(function* () {
        yield* schema.up(tx)
        yield* tx.run(
          sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
        )
        yield* Effect.forEach(migrations, (migration) =>
          tx.run(
            sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
          ),
        )
      }),
    )
    yield* Effect.logInfo("database schema bootstrap completed", {
      migrations: migrations.length,
      durationMs: Date.now() - started,
    })
  })
}

export function applyOnly(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    yield* db.run(
      sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
    )
    const completed = new Set(
      (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
    )

    for (const migration of input) {
      if (completed.has(migration.id)) continue
      const started = Date.now()
      yield* Effect.logInfo("database migration started", { migration: migration.id })
      const apply = db.transaction((tx) =>
        Effect.gen(function* () {
          yield* migration.up(tx)
          yield* tx.run(
            sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
          )
        }),
      )
      const run =
        migration.foreignKeys !== false
          ? apply
          : Effect.gen(function* () {
              yield* db.run(sql`PRAGMA foreign_keys = OFF`)
              yield* apply.pipe(Effect.ensuring(db.run(sql`PRAGMA foreign_keys = ON`).pipe(Effect.orDie)))
            })
      yield* run.pipe(
        Effect.tapError((error) =>
          Effect.logError("database migration failed", {
            migration: migration.id,
            durationMs: Date.now() - started,
            error,
          }),
        ),
      )
      yield* Effect.logInfo("database migration completed", {
        migration: migration.id,
        durationMs: Date.now() - started,
      })
    }
  })
}
