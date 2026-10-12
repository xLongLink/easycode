import type { DatabaseMigration } from "./migration.js"
import m00 from "./migration/20261013000000_initial.js"

export const migrations = [m00] satisfies DatabaseMigration.Migration[]
