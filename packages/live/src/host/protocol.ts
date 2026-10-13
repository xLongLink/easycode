import { z } from "zod"

export const Command = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    input: z.object({ file: z.string().min(1) }).optional(),
    output: z.union([z.literal("none"), z.object({ file: z.string().min(1) })]).optional(),
    duckOthers: z.boolean().default(false),
  }),
  z.object({ type: z.literal("answer"), sdp: z.string().min(1) }),
  z.object({ type: z.literal("mute"), muted: z.boolean() }),
  z.object({ type: z.literal("clear") }),
  z.object({ type: z.literal("devices") }),
  z.object({ type: z.literal("close") }),
])

export type Command = z.infer<typeof Command>
export type Start = Extract<Command, { type: "start" }>
export type Emit = (event: { type: string } & Record<string, unknown>) => void
