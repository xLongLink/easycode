import { expect, test } from "bun:test"
import { chmod, mkdtemp, readdir, rm } from "node:fs/promises"
import path from "node:path"

const cli = path.resolve(import.meta.dir, "..")
const installer = path.resolve(cli, "../../install")

test("release archives contain executable standalone binaries", async () => {
  const root = await mkdtemp("/tmp/opencode/release-archives-")
  const targets = [
    { directory: "cli-linux-x64", binary: "easycode", archive: "easycode-linux-x64" },
    { directory: "cli-linux-x64-baseline-musl", binary: "easycode", archive: "easycode-linux-x64-baseline-musl" },
    { directory: "cli-darwin-arm64", binary: "easycode", archive: "easycode-darwin-arm64" },
  ]
  try {
    await Bun.write(path.join(root, "cli-windows-arm64/bin/easycode.exe"), "unsupported")
    await Promise.all(
      targets.map((target) => Bun.write(path.join(root, target.directory, "bin", target.binary), "fixture")),
    )
    const result = await Bun.$`bun script/publish.ts --dry-run`
      .cwd(cli)
      .env({
        ...process.env,
        OPENCODE_CLI_DIST: root,
        OPENCODE_VERSION: "2.3.4",
        OPENCODE_CHANNEL: "dev",
      })
      .quiet()
    expect(result.exitCode).toBe(0)
    expect(await Bun.file(path.join(root, "easycode-windows-arm64.tar.gz")).exists()).toBe(false)
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

test.skipIf(process.platform !== "linux").each(["latest", "version", "local"])(
  "easycode installation installs only the easycode executable from %s",
  async (mode) => {
    const root = await mkdtemp("/tmp/opencode/release-install-")
    const requests: string[] = []
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const pathname = new URL(request.url).pathname
        requests.push(pathname)
        if (pathname === "/repos/example/easycode/releases/latest") return Response.json({ tag_name: "v2.3.4" })
        if (pathname.startsWith("/example/easycode/releases/download/v2.3.4/easycode-linux-")) {
          return new Response(Bun.file(path.join(root, "binary.tar.gz")))
        }
        return new Response("Not found", { status: 404 })
      },
    })
    try {
      const binary = path.join(root, "easycode")
      await Bun.write(binary, "#!/bin/sh\necho fixture-version\n")
      await chmod(binary, 0o755)
      await Bun.$`tar -czf ${path.join(root, "binary.tar.gz")} -C ${root} easycode`.quiet()
      const curl = Bun.which("curl")
      if (!curl) throw new Error("curl is required for the installer contract")
      // Route real curl requests to a local HTTP fixture instead of hitting GitHub.
      await Bun.write(
        path.join(root, "bin/curl"),
        `#!/bin/bash
args=()
for arg in "$@"; do
  case "$arg" in
    https://api.github.com/*) args+=("${server.url.origin}\${arg#https://api.github.com}") ;;
    https://github.com/*) args+=("${server.url.origin}\${arg#https://github.com}") ;;
    *) args+=("$arg") ;;
  esac
done
exec "${curl}" "\${args[@]}"
`,
      )
      await chmod(path.join(root, "bin/curl"), 0o755)
      const args = mode === "local" ? ["--binary", binary] : mode === "version" ? ["--version", "v2.3.4"] : []
      const result = await Bun.$`bash ${installer} --no-modify-path ${args}`
        .env({
          ...process.env,
          PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
          HOME: root,
          SHELL: "/bin/bash",
          TMPDIR: root,
          GH_REPO: "example/easycode",
          VERSION: "",
          EASYCODE_INSTALL_DIR: "",
          XDG_BIN_DIR: "",
          GITHUB_ACTIONS: "false",
        })
        .quiet()
      expect(result.exitCode).toBe(0)
      expect((await Bun.$`${path.join(root, ".easycode/bin/easycode")}`.text()).trim()).toBe("fixture-version")
      expect(await Bun.file(path.join(root, ".easycode/bin/opencode")).exists()).toBe(false)
      expect(await Bun.file(path.join(root, ".easycode/bin/opencode2")).exists()).toBe(false)
      expect(requests.some((request) => request.endsWith("/releases/latest"))).toBe(mode === "latest")
      expect(requests.some((request) => request.includes("/releases/download/v2.3.4/"))).toBe(mode !== "local")
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
      for (const args of [[], ["--binary", path.join(root, "missing")]]) {
        const result = await Bun.$`bash ${installer} --no-modify-path ${args}`
          .env({
            ...process.env,
            PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
            HOME: root,
            EASYCODE_INSTALL_DIR: path.join(root, "installation"),
            INSTALL_TEST_PLATFORM: platform,
          })
          .nothrow()
          .quiet()
        expect(result.exitCode).toBe(1)
        expect(result.stderr.toString()).toContain("supports Linux and macOS only")
        expect(await readdir(root)).toEqual(["bin"])
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)
