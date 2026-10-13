import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { download } from "../src/assets"

const directories: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []

afterEach(async () => {
  servers.splice(0).forEach((server) => server.stop(true))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function destination() {
  const directory = await mkdtemp(path.join(tmpdir(), "needle-assets-"))
  directories.push(directory)
  return path.join(directory, "asset")
}

function serve(fetch: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })
  servers.push(server)
  return server.url.toString()
}

test("downloads an asset once and reuses the cache without network", async () => {
  let requests = 0
  const url = serve(() => {
    requests++
    return new Response("model bytes")
  })
  const file = await destination()
  await download(url, file)
  expect(await Bun.file(file).text()).toBe("model bytes")
  servers[0]!.stop(true)
  await download(url, file)
  expect(requests).toBe(1)
  expect(await readdir(path.dirname(file))).toEqual(["asset"])
})

test("HTTP failures leave no cached file", async () => {
  const file = await destination()
  await expect(
    download(
      serve(() => new Response("missing", { status: 404 })),
      file,
    ),
  ).rejects.toThrow("HTTP 404")
  expect(await readdir(path.dirname(file))).toEqual([])
})

test("empty responses are not cached", async () => {
  const file = await destination()
  await expect(
    download(
      serve(() => new Response("")),
      file,
    ),
  ).rejects.toThrow("download was empty")
  expect(await readdir(path.dirname(file))).toEqual([])
})

test("cancelling an in-flight download leaves no partial model", async () => {
  const controller = new AbortController()
  const file = await destination()
  const url = serve(() => {
    controller.abort(new Error("Dictation cancelled"))
    return new Response("model bytes")
  })
  await expect(download(url, file, controller.signal)).rejects.toThrow()
  expect(await readdir(path.dirname(file))).toEqual([])
})
