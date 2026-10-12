import nodePath from "path"
import { customType } from "drizzle-orm/sqlite-core"
import { Schema } from "effect"
import { AbsolutePath } from "../schema.js"

function isWindowsStoragePath(input: string) {
  return /^[A-Za-z]:\//.test(input) || input.startsWith("//")
}

function absolute(input: string) {
  const result = input
  // Persisted projects and sessions can move between operating systems during migration.
  if (!nodePath.posix.isAbsolute(result) && !isWindowsStoragePath(result)) {
    throw new Error(`Path is not absolute: ${input}`)
  }
  return result
}

export const absoluteColumn = customType<{
  data: AbsolutePath
  driverData: string
  driverOutput: string
}>({
  dataType() {
    return "text"
  },
  toDriver(input) {
    return absolute(input)
  },
  fromDriver(input) {
    return AbsolutePath.make(absolute(input))
  },
})

// Legacy sessions may persist an empty directory. Keep that existing value
// readable while normalizing and validating every real directory.
export const directoryColumn = customType<{
  data: string
  driverData: string
  driverOutput: string
}>({
  dataType() {
    return "text"
  },
  toDriver(input) {
    return input ? absolute(input) : input
  },
  fromDriver(input) {
    return input ? absolute(input) : input
  },
})

export const pathColumn = customType<{
  data: string
  driverData: string
  driverOutput: string
}>({
  dataType() {
    return "text"
  },
  toDriver(input) {
    return input
  },
  fromDriver(input) {
    return input
  },
})

const decodeAbsoluteArray = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.String)))

export const absoluteArrayColumn = customType<{
  data: AbsolutePath[]
  driverData: string
  driverOutput: string
}>({
  dataType() {
    return "text"
  },
  toDriver(input) {
    return JSON.stringify(input.map(absolute))
  },
  fromDriver(input) {
    return decodeAbsoluteArray(input).map((item) => AbsolutePath.make(absolute(item)))
  },
})
