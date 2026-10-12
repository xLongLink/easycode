import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20261012215608_instruction_state_maps",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`instruction_state\` DROP COLUMN \`epoch_start\`;`)
      yield* tx.run(`ALTER TABLE \`instruction_state\` DROP COLUMN \`through_seq\`;`)
    })
  },
}

export default migration
