import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { buildRelease } from "../release.ts"

test("curl installer verifies downloads, preserves existing installs, and runs real text setup", async () => {
  await mkdir("/tmp/opencode", { recursive: true })
  const directory = await mkdtemp("/tmp/opencode/curl-install-tests-")
  try {
    const assets = join(directory, "assets")
    await buildRelease("v0.0.0", assets)
    const installer = Buffer.from(await Bun.file(join(assets, "text.sh")).text())
    const bin = join(directory, "bin")
    await mkdir(bin)
    await Bun.write(join(bin, "pi"), "#!/bin/bash\nexit 0\n")
    await Bun.write(
      join(bin, "curl"),
      `#!${process.execPath}
import { basename, join } from "node:path"
const args = process.argv.slice(2)
const url = args.at(-1)
if (!url.startsWith("https://github.com/xLongLink/uncode/releases/download/v0.0.0/")) process.exit(2)
if (process.env.INSTALL_TEST_MODE === "download-failure") process.exit(22)
const output = args[args.indexOf("--output") + 1]
const file = Bun.file(join(process.env.INSTALL_TEST_ASSETS, basename(url)))
let bytes = new Uint8Array(await file.arrayBuffer())
if (process.env.INSTALL_TEST_MODE === "corrupt" && url.endsWith(".tar.gz")) bytes[0] ^= 1
if (process.env.INSTALL_TEST_MODE === "invalid-checksum" && url.endsWith(".sha256"))
  bytes = new TextEncoder().encode("0".repeat(64) + "  ../unrelated\\n")
await Bun.write(output, bytes)
`,
    )
    await chmod(join(bin, "pi"), 0o755)
    await chmod(join(bin, "curl"), 0o755)

    for (const mode of ["success", "corrupt", "download-failure", "invalid-checksum"]) {
      const home = join(directory, mode)
      await mkdir(home)
      const rc = join(home, ".bashrc")
      await Bun.write(rc, "export KEEP_SETTING=yes\n")
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: home,
        XDG_DATA_HOME: join(home, "data"),
        PI_BIN: join(bin, "pi"),
        INSTALL_TEST_MODE: mode,
        INSTALL_TEST_ASSETS: assets,
      }
      const install = () =>
        Bun.spawnSync(["bash"], {
          stdin: installer,
          env,
          stdout: "pipe",
          stderr: "pipe",
        })
      const result = install()
      const base = join(home, "data", "uncode", "releases")
      expect([
        ...new Bun.Glob(".download.*").scanSync({ cwd: base, dot: true, onlyFiles: false }),
      ]).toEqual([])
      if (mode !== "success") {
        expect(result.exitCode).not.toBe(0)
        expect(await Bun.file(rc).text()).toBe("export KEEP_SETTING=yes\n")
        expect([...new Bun.Glob("text-*").scanSync({ cwd: base, onlyFiles: false })]).toEqual([])
        continue
      }
      expect(result.exitCode, result.stderr.toString()).toBe(0)
      expect(result.stdout.toString()).toContain("To uninstall: bash")
      expect(await Bun.file(join(home, "data", "uncode", "text", "launch.ts")).exists()).toBe(true)
      const installations = [...new Bun.Glob("text-*/uncode-text-v0.0.0/setup.sh").scanSync(base)]
      expect(installations).toHaveLength(1)
      expect(install().exitCode).toBe(0)
      expect(await Bun.file(join(base, installations[0])).exists()).toBe(true)
      const settings = await Bun.file(rc).text()
      expect(settings).toContain("export KEEP_SETTING=yes")
      expect(settings.match(/# >>> easycode text hook >>>/g)).toHaveLength(1)
      expect(
        Bun.spawnSync(["bash", join(base, installations[0]), "uninstall"], { env }).exitCode,
      ).toBe(0)
      expect(await Bun.file(rc).text()).toBe("export KEEP_SETTING=yes\n")
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
