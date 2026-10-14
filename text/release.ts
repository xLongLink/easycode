import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { join, resolve } from "node:path"

export async function buildRelease(version: string, output: string) {
  const integration = "text"
  if (
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
      version,
    )
  )
    throw new Error("Version must be a tag such as v1.2.3 or v1.2.3-rc.1")

  const root = import.meta.dir
  const destination = resolve(output)
  await mkdir(destination, { recursive: true })
  const staging = await mkdtemp(join(destination, ".release-"))
  const name = `uncode-${integration}-${version}`
  const directory = join(staging, name)
  const archive = join(destination, `${name}.tar.gz`)
  try {
    const files = ["setup.sh", "package.json", "README.md", "LICENSE"]
    for await (const file of new Bun.Glob("src/*.{ts,sh}").scan(root)) files.push(file)
    for (const file of files) {
      const target = join(directory, file)
      await mkdir(resolve(target, ".."), { recursive: true })
      await copyFile(join(root, file), target)
    }
    await Bun.write(join(directory, "VERSION"), `${version}\n`)
    const child = Bun.spawn(
      [
        "tar",
        "--sort=name",
        "--mtime=@0",
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "-czf",
        archive,
        "-C",
        staging,
        name,
      ],
      { stdout: "inherit", stderr: "inherit" },
    )
    if ((await child.exited) !== 0) throw new Error("Release archive creation failed")
    const digest = new Bun.CryptoHasher("sha256")
      .update(await Bun.file(archive).arrayBuffer())
      .digest("hex")
    await Bun.write(`${archive}.sha256`, `${digest}  ${name}.tar.gz\n`)
    const installer = (await Bun.file(join(root, "install-release.sh")).text())
      .replaceAll("@INTEGRATION@", integration)
      .replaceAll("@VERSION@", version)
    await Bun.write(join(destination, `${integration}.sh`), installer)
    return archive
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const [version = "v0.0.0-dev", output = "dist", ...extra] = process.argv.slice(2)
  if (extra.length) throw new Error("Usage: release.ts [vX.Y.Z] [output-directory]")
  console.info(await buildRelease(version, output))
}
