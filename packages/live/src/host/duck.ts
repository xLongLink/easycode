import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { z } from "zod"
import type { Emit } from "./protocol.js"

const execute = promisify(execFile)
const Streams = z.array(
  z.object({
    index: z.number(),
    properties: z.record(z.string(), z.unknown()).default({}),
    volume: z.record(z.string(), z.object({ value: z.number() })),
  }),
)

/** PulseAudio/PipeWire stream volumes, not the shared system output volume. */
export async function duckAudio(emit: Emit) {
  if (process.platform !== "linux") {
    emit({
      type: "warning",
      message: "Audio ducking is supported on Linux with pactl; other apps' volume is unchanged.",
    })
    return async () => {}
  }
  const changed = new Map<number, { original: number[]; ducked: number[] }>()
  const list = async () =>
    Streams.parse(
      JSON.parse((await execute("pactl", ["--format=json", "list", "sink-inputs"], { timeout: 2000 })).stdout),
    )
  const set = (index: number, volumes: number[]) =>
    execute("pactl", ["set-sink-input-volume", String(index), ...volumes.map(String)], { timeout: 2000 })
  const scan = async () => {
    const streams = await list()
    await Promise.all(
      streams.map(async (stream) => {
        if (changed.has(stream.index) || stream.properties["application.process.binary"] === "ffplay") return
        const original = Object.values(stream.volume).map((channel) => channel.value)
        const ducked = original.map((value) => Math.round(value * 0.2))
        await set(stream.index, ducked)
        changed.set(stream.index, { original, ducked })
      }),
    )
  }
  const warn = (error: unknown) =>
    emit({
      type: "warning",
      message: `Audio ducking unavailable: ${error instanceof Error ? error.message : String(error)}`,
    })
  const available = await scan().then(
    () => true,
    (error: unknown) => {
      warn(error)
      return false
    },
  )
  let pending = Promise.resolve()
  const timer = available
    ? setInterval(() => {
        pending = pending.then(scan).catch(warn)
      }, 1500)
    : undefined
  return async () => {
    clearInterval(timer)
    await pending
    if (!changed.size) return
    const streams = await list().catch(() => [])
    await Promise.all(
      streams.map(async (stream) => {
        const saved = changed.get(stream.index)
        const current = Object.values(stream.volume).map((channel) => channel.value)
        // Respect volume changes made by the user during the call.
        if (
          !saved ||
          current.length !== saved.ducked.length ||
          !current.every((value, index) => value === saved.ducked[index])
        )
          return
        await set(stream.index, saved.original).catch(warn)
      }),
    )
  }
}
