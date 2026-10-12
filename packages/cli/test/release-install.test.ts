import { beforeAll, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import path from "node:path"

const cli = path.resolve(import.meta.dir, "..")
const installer = path.resolve(cli, "../../install")

beforeAll(() => mkdir("/tmp/opencode", { recursive: true }))

test("release archives contain executable standalone binaries", async () => {
  const root = await mkdtemp("/tmp/opencode/release-archives-")
  const targets = [
    { directory: "cli-linux-x64", binary: "uncode", archive: "uncode-linux-x64" },
    { directory: "cli-linux-x64-baseline-musl", binary: "uncode", archive: "uncode-linux-x64-baseline-musl" },
    { directory: "cli-darwin-arm64", binary: "uncode", archive: "uncode-darwin-arm64" },
  ]
  try {
    await Bun.write(path.join(root, "cli-windows-arm64/bin/uncode.exe"), "unsupported")
    await Promise.all(
      targets.map((target) => Bun.write(path.join(root, target.directory, "bin", target.binary), "fixture")),
    )
    const result = await Bun.$`bun script/package.ts`
      .cwd(cli)
      .env({ ...process.env, OPENCODE_CLI_DIST: root })
      .quiet()
    expect(result.exitCode).toBe(0)
    expect(await Bun.file(path.join(root, "uncode-windows-arm64.tar.gz")).exists()).toBe(false)
    for (const target of targets) {
      const archive = path.join(root, `${target.archive}.tar.gz`)
      expect((await Bun.$`tar -tzf ${archive}`.text()).trim()).toBe(target.binary)
      expect(await Bun.$`tar -tvzf ${archive}`.text()).toContain("rwxr-xr-x")
      expect(await Bun.$`tar -xOzf ${archive} ${target.binary}`.text()).toBe("fixture")
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test.each(["default", "override", "xdg-ignored", "download-failure", "extraction-failure"])(
  "latest release installation: %s",
  async (mode) => {
    const root = await mkdtemp("/tmp/opencode/release-install-")
    const requests: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const pathname = new URL(request.url).pathname
        requests.push(pathname)
        if (!/^\/example\/uncode\/releases\/latest\/download\/uncode-(linux|darwin)-.*\.tar\.gz$/.test(pathname)) {
          return new Response("Not found", { status: 404 })
        }
        if (mode === "download-failure") return new Response("Download failed", { status: 503 })
        if (mode === "extraction-failure") return new Response("Invalid archive")
        return new Response(Bun.file(path.join(root, "binary.tar.gz")))
      },
    })
    try {
      await Bun.write(path.join(root, "uncode"), "#!/bin/sh\necho fixture-version\n")
      await Bun.$`tar -czf ${path.join(root, "binary.tar.gz")} -C ${root} uncode`.quiet()
      const curl = Bun.which("curl")
      if (!curl) throw new Error("curl is required for the installer contract")
      // Route real curl requests to a local HTTP fixture instead of hitting GitHub.
      await Bun.write(
        path.join(root, "bin/curl"),
        `#!/bin/bash
args=()
for arg in "$@"; do
  case "$arg" in
    https://github.com/*) args+=("${server.url.origin}\${arg#https://github.com}") ;;
    *) args+=("$arg") ;;
  esac
done
exec "${curl}" "\${args[@]}"
`,
      )
      await chmod(path.join(root, "bin/curl"), 0o755)
      await Bun.write(path.join(root, ".bashrc"), "# existing configuration\n")
      const destination = path.join(root, mode === "override" ? "bin with spaces" : ".uncode/bin")
      const result = await Bun.$`bash ${installer}`
        .env({
          ...process.env,
          PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
          HOME: root,
          TMPDIR: root,
          GH_REPO: "example/uncode",
          UNCODE_INSTALL_DIR: mode === "override" ? destination : "",
          XDG_BIN_DIR: mode === "xdg-ignored" || mode === "override" ? path.join(root, "xdg") : "",
        })
        .nothrow()
        .quiet()
      expect(requests).toHaveLength(1)
      expect((await readdir(root)).filter((name) => name.startsWith("uncode_install."))).toEqual([])
      expect(await Bun.file(path.join(root, ".bashrc")).text()).toBe("# existing configuration\n")
      if (mode.endsWith("-failure")) {
        expect(result.exitCode).not.toBe(0)
        expect(await Bun.file(path.join(destination, "uncode")).exists()).toBe(false)
        return
      }
      expect(result.exitCode).toBe(0)
      expect((await Bun.$`${path.join(destination, "uncode")}`.text()).trim()).toBe("fixture-version")
      expect(result.stdout.toString()).toContain(`Installed uncode to ${destination}/uncode`)
      expect(await Bun.file(path.join(destination, "opencode")).exists()).toBe(false)
      expect(await Bun.file(path.join(root, "xdg", "uncode")).exists()).toBe(false)
    } finally {
      server.stop(true)
      await rm(root, { recursive: true, force: true })
    }
  },
)

test.each(["MINGW64_NT-10.0", "MSYS_NT-10.0", "CYGWIN_NT-10.0"])(
  "installer rejects native Windows %s before creating files",
  async (platform) => {
    const root = await mkdtemp("/tmp/opencode/release-unsupported-")
    try {
      await Bun.write(path.join(root, "bin/uname"), '#!/bin/sh\nprintf "%s\\n" "$INSTALL_TEST_PLATFORM"\n')
      await chmod(path.join(root, "bin/uname"), 0o755)
      const result = await Bun.$`bash ${installer}`
        .env({
          ...process.env,
          PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
          HOME: root,
          UNCODE_INSTALL_DIR: path.join(root, "installation"),
          INSTALL_TEST_PLATFORM: platform,
        })
        .nothrow()
        .quiet()
      expect(result.exitCode).toBe(1)
      expect(result.stderr.toString()).toContain("supports Linux and macOS only")
      expect(await readdir(root)).toEqual(["bin"])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test("installer rejects command-line options", async () => {
  const result = await Bun.$`bash ${installer} --version v2.3.4`.nothrow().quiet()
  expect(result.exitCode).toBe(1)
  expect(result.stderr.toString()).toContain("Run install without arguments")
})
