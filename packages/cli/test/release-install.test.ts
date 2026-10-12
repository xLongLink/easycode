import { beforeAll, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import path from "node:path"

const cli = path.resolve(import.meta.dir, "..")
const installer = path.resolve(cli, "../../install")

beforeAll(() => mkdir("/tmp/opencode", { recursive: true }))

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
    const result = await Bun.$`bun script/package.ts`
      .cwd(cli)
      .env({
        ...process.env,
        OPENCODE_CLI_DIST: root,
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

test
  .skipIf(process.platform !== "linux")
  .each(["latest", "version", "local", "download-failure", "extraction-failure"])(
  "easycode installation cleans up after %s",
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
          if (mode === "download-failure") return new Response("Download failed", { status: 503 })
          if (mode === "extraction-failure") return new Response("Invalid archive")
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
      const args = mode === "local" ? ["--binary", binary] : mode === "latest" ? [] : ["--version", "v2.3.4"]
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
        .nothrow()
        .quiet()
      expect((await readdir(root)).filter((name) => name.startsWith("easycode_install."))).toEqual([])
      if (mode.endsWith("-failure")) {
        expect(result.exitCode).not.toBe(0)
        expect(await Bun.file(path.join(root, ".easycode/bin/easycode")).exists()).toBe(false)
        expect(requests.filter((request) => request.includes("/releases/download/"))).toHaveLength(1)
        return
      }
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

for (const shell of ["bash", "sh", "zsh", "fish"]) {
  test
    .skipIf(!Bun.which(shell))
    .each(["bin with spaces", "bin'quote", "bin\\slash", "bin$(touch injected)`touch injected`;$HOME"])(
    "installer writes a literal, idempotent PATH entry for " + shell + ": %s",
    async (directory) => {
      const root = await mkdtemp("/tmp/opencode/release-shell-")
      try {
        const home = path.join(root, "home with spaces")
        const config = path.join(
          home,
          shell === "fish"
            ? ".config/fish/config.fish"
            : shell === "zsh"
              ? ".zshrc"
              : shell === "sh"
                ? ".profile"
                : ".bashrc",
        )
        const binary = path.join(root, "binary")
        const installDir = path.join(home, ".easycode", directory)
        await Bun.write(config, "# existing configuration\n")
        await Bun.write(binary, "#!/bin/sh\necho fixture-version\n")
        const env = {
          ...process.env,
          HOME: home,
          SHELL: shell,
          EASYCODE_INSTALL_DIR: installDir,
          XDG_BIN_DIR: "",
          XDG_CONFIG_HOME: path.join(home, ".config"),
          ZDOTDIR: home,
          GITHUB_ACTIONS: "false",
        }
        await Bun.$`bash ${installer} --binary ${binary}`.env(env).quiet()
        const content = await Bun.file(config).text()
        await Bun.$`bash ${installer} --binary ${binary}`.env(env).quiet()
        expect(await Bun.file(config).text()).toBe(content)
        expect(content).toStartWith("# existing configuration\n")
        const command =
          shell === "fish"
            ? 'source "$CONFIG"; printf "%s\\n" $PATH[1]; easycode'
            : '. "$CONFIG"; printf "%s\\n" "$PATH"; easycode'
        const result = await Bun.$`${shell} -c ${command}`
          .cwd(root)
          .env({ ...env, CONFIG: config })
          .quiet()
        expect(result.exitCode).toBe(0)
        expect(result.stdout.toString().split("\n")[0]).toBe(
          shell === "fish" ? installDir : `${installDir}:${process.env.PATH}`,
        )
        expect(result.stdout.toString()).toEndWith("fixture-version\n")
        expect(await Bun.file(path.join(root, "injected")).exists()).toBe(false)
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
  )
}

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
