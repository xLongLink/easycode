import { expect, test } from "bun:test"

test.skipIf(process.platform !== "linux")("missing pactl warns once without polling or blocking cleanup", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `import { duckAudio } from ${JSON.stringify(new URL("../src/host/duck.ts", import.meta.url).pathname)};
       const events = [];
       const restore = await duckAudio(event => events.push(event));
       await new Promise(resolve => setTimeout(resolve, 1700));
       await restore();
       console.log(JSON.stringify(events));`,
    ],
    { env: { ...process.env, PATH: "" }, stdout: "pipe", stderr: "pipe" },
  )
  const output = await new Response(child.stdout).text()
  const errors = await new Response(child.stderr).text()
  expect(await child.exited).toBe(0)
  expect(errors).toBe("")
  expect(JSON.parse(output)).toEqual([
    { type: "warning", message: expect.stringMatching(/Audio ducking unavailable: .*pactl/) },
  ])
})
