import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { fileURLToPath } from "url"
import path from "path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@opencode/core/database/drizzle"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { Reactivity } from "effect/reactivity"
import { SqlClient, Statement } from "effect/sql"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "@opencode/core/database/migration"
import { migrations } from "@opencode/core/database/migration.gen"
import { Database } from "@opencode/core/database/database"
import { tmpdir } from "./fixture/tmpdir"
import { Global } from "@opencode/util/global"

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | Global.Service>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideService(Global.Service, Global.make({ data: path.join(process.cwd(), ".test-data") })),
      Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })),
      Effect.scoped,
    ),
  )

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

// Park schema inspection while the database holds its bootstrap lock.
const parkedClient = (arrived: Deferred.Deferred<void>, gate: Deferred.Deferred<void>) =>
  Layer.effect(
    SqlClient.SqlClient,
    Effect.gen(function* () {
      const client = yield* SqlClient.SqlClient
      const connection = yield* client.reserve
      const park = <A, E>(query: string, effect: Effect.Effect<A, E>) =>
        query.includes("sqlite_master")
          ? Deferred.succeed(arrived, undefined).pipe(Effect.andThen(Deferred.await(gate)), Effect.andThen(effect))
          : effect
      return yield* SqlClient.make({
        acquirer: Effect.succeed({
          ...connection,
          execute: (query, params, transform) => park(query, connection.execute(query, params, transform)),
          executeRaw: (query, params) => park(query, connection.executeRaw(query, params)),
        }),
        compiler: Statement.makeCompilerSqlite(),
        spanAttributes: [],
      })
    }),
  ).pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Layer.provide(Reactivity.layer))

describe("DatabaseMigration", () => {
  test("serializes concurrent embedded initialization for one database path", async () => {
    await using tmp = await tmpdir()
    const filename = path.join(tmp.path, "embedded.sqlite")

    await Effect.runPromise(
      Effect.all(
        [Database.layer({ path: filename }), Database.layer({ path: filename })].map((layer) =>
          Effect.scoped(Layer.build(layer)),
        ),
        { concurrency: "unbounded" },
      ).pipe(Effect.provideService(Global.Service, Global.make({ data: tmp.path }))),
    )
  })

  test("bootstraps distinct databases without waiting on each other's lock", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const arrived = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const parked = yield* Effect.forkScoped(
          Layer.build(Database.layerFromClient.pipe(Layer.provide(parkedClient(arrived, gate)))),
        )
        yield* Deferred.await(arrived)

        yield* Layer.build(
          Database.layerFromClient.pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true }))),
        ).pipe(Effect.timeout("2 seconds"))

        expect(parked.pollUnsafe()).toBeUndefined()
        yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(parked)
      }).pipe(
        Effect.provideService(Global.Service, Global.make({ data: path.join(process.cwd(), ".test-data") })),
        Effect.scoped,
      ),
    )
  })

  if (process.platform === "linux") {
    test("declared schema has no ungenerated migrations", async () => {
      const result = await $`bun ${fileURLToPath(new URL("../script/migration.ts", import.meta.url))} --check`
        .quiet()
        .nothrow()
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(result.stdout.toString()).toContain("No schema changes, nothing to migrate")
    }, 30_000)
  }

  test("bootstraps the current schema and records the initial baseline once", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const journal = yield* db.all(sql`SELECT * FROM migration`)
        yield* db.run(sql`INSERT INTO kv (key, value, time_created, time_updated) VALUES ('retained', 'value', 1, 1)`)
        yield* DatabaseMigration.apply(db)

        expect(migrations.map((migration) => migration.id)).toEqual(["20261013000000_initial"])
        expect(yield* db.all(sql`SELECT * FROM migration`)).toEqual(journal)
        expect(journal).toHaveLength(1)
        expect(yield* db.get(sql`SELECT value FROM kv WHERE key = 'retained'`)).toEqual({ value: "value" })
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'`)).toEqual({
          name: "session_v2",
        })
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_pending'`)).toEqual({
          name: "session_pending",
        })
        expect(
          (yield* db.all<{ name: string }>(sql`PRAGMA table_info(instruction_state)`)).map((column) => column.name),
        ).toEqual(["session_id", "initial_values", "current_values"])
        expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
      }),
    )
  })

  test("the frozen baseline creates the same schema as bootstrap", async () => {
    const inspect = (apply: typeof DatabaseMigration.apply) =>
      run(
        Effect.gen(function* () {
          const db = yield* makeDb
          yield* db.run(sql`PRAGMA foreign_keys = ON`)
          yield* apply(db)
          expect(yield* db.all(sql`PRAGMA foreign_key_check`)).toEqual([])
          return yield* db.all(sql`
            SELECT type, name, tbl_name, sql FROM sqlite_master
            WHERE name NOT LIKE 'sqlite_%'
            ORDER BY type, name
          `)
        }),
      )

    expect(await inspect((db) => DatabaseMigration.applyOnly(db, migrations))).toEqual(
      await inspect(DatabaseMigration.apply),
    )
  })

  test("rejects a non-empty database without a session table", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const db = yield* makeDb
          yield* db.run(sql`CREATE TABLE unrelated (id text PRIMARY KEY)`)
          yield* DatabaseMigration.apply(db)
        }),
      ),
    ).rejects.toThrow("Database is not empty and has no session table")
  })

  test("bootstraps alongside underscore-prefixed embedder tables", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`CREATE TABLE _embedder_state (id text PRIMARY KEY)`)
        yield* db.run(sql`INSERT INTO _embedder_state VALUES ('retained')`)
        yield* DatabaseMigration.apply(db)
        expect(yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'`)).toEqual({
          name: "session_v2",
        })
        expect(yield* db.all(sql`SELECT id FROM _embedder_state`)).toEqual([{ id: "retained" }])
      }),
    )
  })

  test("applies incremental migrations after the baseline once and in order", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const input = [
          ...migrations,
          {
            id: "first",
            up: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
              tx.run(sql`CREATE TABLE applied (id text PRIMARY KEY)`),
          },
          {
            id: "second",
            up: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
              tx.run(sql`INSERT INTO applied (id) VALUES ('second')`),
          },
        ]

        yield* DatabaseMigration.applyOnly(db, input)
        yield* DatabaseMigration.applyOnly(db, input)

        expect(yield* db.all(sql`SELECT id FROM applied`)).toEqual([{ id: "second" }])
        expect(yield* db.all(sql`SELECT id FROM migration ORDER BY time_completed, id`)).toEqual(
          input.map((migration) => ({ id: migration.id })),
        )
      }),
    )
  })

  test("rolls back a failed migration without recording it", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const migration = {
          id: "failing",
          up: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
            Effect.gen(function* () {
              yield* tx.run(sql`CREATE TABLE rolled_back (id text PRIMARY KEY)`)
              yield* Effect.fail(new Error("stop"))
            }),
        }

        expect((yield* Effect.exit(DatabaseMigration.applyOnly(db, [migration])))._tag).toBe("Failure")
        expect(
          yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rolled_back'`),
        ).toBeUndefined()
        expect(yield* db.get(sql`SELECT id FROM migration WHERE id = 'failing'`)).toBeUndefined()
      }),
    )
  })

  test("suspends foreign keys outside migrations that rebuild referenced tables", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY, title text NOT NULL)`)
        yield* db.run(
          sql`CREATE TABLE message (id text PRIMARY KEY, session_id text NOT NULL REFERENCES session(id) ON DELETE CASCADE)`,
        )
        yield* db.run(sql`INSERT INTO session VALUES ('session', 'title')`)
        yield* db.run(sql`INSERT INTO message VALUES ('message', 'session')`)

        yield* DatabaseMigration.applyOnly(db, [
          {
            id: "rebuild",
            foreignKeys: false,
            up: (tx) =>
              Effect.gen(function* () {
                yield* tx.run(sql`CREATE TABLE next_session (id text PRIMARY KEY, title text)`)
                yield* tx.run(sql`INSERT INTO next_session SELECT * FROM session`)
                yield* tx.run(sql`DROP TABLE session`)
                yield* tx.run(sql`ALTER TABLE next_session RENAME TO session`)
              }),
          },
        ])

        expect(yield* db.get(sql`SELECT id FROM message`)).toEqual({ id: "message" })
        expect(yield* db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 })
      }),
    )
  })
})
