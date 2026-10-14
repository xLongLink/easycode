import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { buildRelease } from "../../release.ts"

test("release archives contain standalone integrations and valid checksums", async () => {
  await mkdir("/tmp/opencode", { recursive: true })
  const directory = await mkdtemp("/tmp/opencode/release-tests-")
  try {
    for (const integration of ["text", "voice"]) {
      const name = `uncode-${integration}-v1.2.3-rc.1`
      const archive = await buildRelease(integration, "v1.2.3-rc.1", directory)
      const checksum = Bun.spawnSync(["sha256sum", "-c", `${archive}.sha256`], { cwd: directory })
      expect(checksum.exitCode).toBe(0)
      const extract = Bun.spawnSync(["tar", "-xzf", archive, "-C", directory])
      expect(extract.exitCode).toBe(0)
      const root = join(directory, name)
      expect(await Bun.file(join(root, "VERSION")).text()).toBe("v1.2.3-rc.1\n")
      for (const file of ["setup.sh", "package.json", "README.md", "LICENSE", "src/setup.ts"])
        expect(await Bun.file(join(root, file)).exists()).toBe(true)
      expect(Bun.spawnSync(["bash", "-n", join(root, "setup.sh")]).exitCode).toBe(0)
      const files = [...new Bun.Glob("**/*").scanSync({ cwd: root, dot: true })]
      expect(files.some((file) => /tests|\.cache|node_modules|\.env/.test(file))).toBe(false)
      if (integration === "voice") {
        for (const file of [
          "src/voice.ts",
          "src/transcribe.ts",
          "models/whistle.cact",
          "models/LICENSE",
        ])
          expect(await Bun.file(join(root, file)).exists()).toBe(true)
      } else {
        expect(await Bun.file(join(root, "src/hook.sh")).exists()).toBe(true)
        const config = join(directory, "config.json")
        expect(
          Bun.spawnSync([
            process.execPath,
            join(root, "src/setup.ts"),
            "/fake/pi",
            "direct",
            config,
          ]).exitCode,
        ).toBe(0)
        expect(await Bun.file(config).json()).toEqual({ pi: "/fake/pi", runner: "direct" })
      }
      const bytes = await Bun.file(archive).arrayBuffer()
      await buildRelease(integration, "v1.2.3-rc.1", directory)
      expect(await Bun.file(archive).arrayBuffer()).toEqual(bytes)
    }
    await expect(buildRelease("other", "v1.2.3", directory)).rejects.toThrow("Integration")
    await expect(buildRelease("text", "../bad", directory)).rejects.toThrow("Version")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
