import type { EffectDrizzleSqlite } from "../database/drizzle.js"
import { isNotNull, isNull, ne, or } from "drizzle-orm"
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { absoluteArrayColumn, absoluteColumn } from "../database/path.js"
import { Timestamps } from "../database/schema.sql.js"
import type { AbsolutePath } from "../schema.js"
import { ProjectSchema } from "./schema.js"

type DatabaseClient = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0]

export const ProjectTable = sqliteTable("project", {
  id: text().$type<ProjectSchema.ID>().primaryKey(),
  worktree: absoluteColumn().notNull(),
  vcs: text().$type<ProjectSchema.Vcs["type"]>(),
  name: text(),
  icon_url: text(),
  icon_url_override: text(),
  icon_color: text(),
  ...Timestamps,
  time_initialized: integer(),
  time_active: integer()
    .notNull()
    .default(0)
    .$defaultFn(() => Date.now()),
  time_archived: integer(),
  sandboxes: absoluteArrayColumn().notNull(),
  commands: text({ mode: "json" }).$type<{ start?: string }>(),
})

export function upsertProject(
  db: DatabaseClient | Transaction,
  project: { readonly id: ProjectSchema.ID; readonly canonical: AbsolutePath; readonly vcs?: ProjectSchema.Vcs },
) {
  const vcs = project.vcs?.type
  return db
    .insert(ProjectTable)
    .values({ id: project.id, worktree: project.canonical, vcs, sandboxes: [] })
    .onConflictDoUpdate({
      target: ProjectTable.id,
      set: { vcs: vcs ?? null },
      setWhere: vcs ? or(isNull(ProjectTable.vcs), ne(ProjectTable.vcs, vcs)) : isNotNull(ProjectTable.vcs),
    })
    .run()
}
