import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { buildRelease } from "../release.ts"

test("voice release is standalone, reproducible, and checksummed", async () => {
  await mkdir("/tmp/opencode", { recursive: true })
  const directory = await mkdtemp("/tmp/opencode/release-tests-")
  try {
    const integration = "voice"
    const name = `uncode-${integration}-v1.2.3-rc.1`
    const archive = await buildRelease("v1.2.3-rc.1", directory)
    const installer = join(directory, `${integration}.sh`)
    expect(Bun.spawnSync(["bash", "-n", installer]).exitCode).toBe(0)
    const script = await Bun.file(installer).text()
    expect(script).toContain(`integration='${integration}'`)
    expect(script).toContain("version='v1.2.3-rc.1'")
    expect(script).not.toContain("@VERSION@")
    const checksum = Bun.spawnSync(["sha256sum", "-c", `${archive}.sha256`], { cwd: directory })
    expect(checksum.exitCode).toBe(0)
    const extract = Bun.spawnSync(["tar", "-xzf", archive, "-C", directory])
    expect(extract.exitCode).toBe(0)
    const root = join(directory, name)
    expect(await Bun.file(join(root, "VERSION")).text()).toBe("v1.2.3-rc.1\n")
    for (const file of ["setup.sh", "package.json", "README.md", "LICENSE", "src/setup.ts"])
      expect(await Bun.file(join(root, file)).exists()).toBe(true)
    expect(await Bun.file(join(root, "LICENSE")).text()).toContain("Apache License")
    expect((await Bun.file(join(root, "package.json")).json()).license).toBe("Apache-2.0")
    expect(Bun.spawnSync(["bash", "-n", join(root, "setup.sh")]).exitCode).toBe(0)
    const files = [...new Bun.Glob("**/*").scanSync({ cwd: root, dot: true })]
    expect(files.some((file) => /tests|\.cache|node_modules|\.env/.test(file))).toBe(false)
    for (const file of [
      "src/voice.ts",
      "src/transcribe.ts",
      "models/whistle.cact",
      "models/LICENSE",
    ])
      expect(await Bun.file(join(root, file)).exists()).toBe(true)
    const bytes = await Bun.file(archive).arrayBuffer()
    await buildRelease("v1.2.3-rc.1", directory)
    expect(await Bun.file(archive).arrayBuffer()).toEqual(bytes)
    await expect(buildRelease("../bad", directory)).rejects.toThrow("Version")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
