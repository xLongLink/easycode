import type { Driver } from "./driver.js"
import { execDefaults } from "./exec-defaults.js"
import type { Files } from "./files.js"

export const makeFiles = (driver: Driver): Files => ({
  ...execDefaults(driver.spawner),
  ...driver.overrides,
})
