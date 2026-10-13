import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from "werift"
import { Audio } from "../src/host/audio.js"
import { FRAME_BYTES, PcmQueue, level, readWav, wavHeader } from "../src/host/pcm.js"
import { Command } from "../src/host/protocol.js"
import { HelperProcess, ensureHelper } from "../src/tui/helper.js"
import { liveAssets } from "../script/assets.js"

const temporary = existsSync("/tmp/opencode") ? "/tmp/opencode" : os.tmpdir()

describe("Node audio", () => {
  test("queues complete frames, pads underflows, bounds latency and clears playback", () => {
    const queue = new PcmQueue()
    queue.push(Buffer.alloc(FRAME_BYTES / 2, 1))
    const frame = queue.read()
    expect(frame.length).toBe(FRAME_BYTES)
    expect(frame.subarray(0, FRAME_BYTES / 2).every((value) => value === 1)).toBe(true)
    expect(frame.subarray(FRAME_BYTES / 2).every((value) => value === 0)).toBe(true)
    queue.push(Buffer.alloc(FRAME_BYTES * 60, 2))
    expect(Array.from({ length: 50 }, () => queue.read().every((value) => value === 2)).every(Boolean)).toBe(true)
    expect(level(queue.read())).toBe(0)
    queue.push(Buffer.alloc(FRAME_BYTES, 3))
    queue.clear()
    expect(level(queue.read())).toBe(0)
  })

  test("validates PCM16 WAV input and duplicates mono into stereo", () => {
    const pcm = Buffer.alloc(FRAME_BYTES, 4)
    expect(readWav(Buffer.concat([wavHeader(pcm.length), pcm]))).toEqual(pcm)
    const mono = wavHeader(4)
    mono.writeUInt16LE(1, 22)
    mono.writeUInt16LE(2, 32)
    expect(readWav(Buffer.concat([mono, Buffer.from([1, 0, 2, 0])]))).toEqual(Buffer.from([1, 0, 1, 0, 2, 0, 2, 0]))
    expect(() => readWav(Buffer.from("not WAV"))).toThrow("PCM16 WAV")
    const wrongRate = wavHeader(0)
    wrongRate.writeUInt32LE(44100, 24)
    expect(() => readWav(wrongRate)).toThrow("48 kHz")
    expect(() => readWav(Buffer.concat([wavHeader(10), Buffer.alloc(2)]))).toThrow("Truncated")
  })

  test("records valid WAV output, clears queued audio and closes idempotently", async () => {
    const directory = mkdtempSync(path.join(temporary, "live-audio-"))
    const input = path.join(directory, "input.wav")
    const output = path.join(directory, "output.wav")
    const pcm = Buffer.alloc(FRAME_BYTES, 4)
    writeFileSync(input, Buffer.concat([wavHeader(pcm.length), pcm]))
    const audio = new Audio(
      { type: "start", input: { file: input }, output: { file: output }, duckOthers: false },
      () => {},
    )
    try {
      await audio.open()
      expect(audio.read()).toEqual(pcm)
      expect(level(audio.read())).toBe(0)
      audio.receive(pcm)
      expect(audio.play()).toEqual(pcm)
      audio.receive(pcm)
      await audio.clear()
      expect(level(audio.play())).toBe(0)
      audio.close()
      audio.close()
      expect(readWav(readFileSync(output))).toEqual(Buffer.concat([pcm, Buffer.alloc(FRAME_BYTES)]))
    } finally {
      audio.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test("validates every host command and rejects invalid options", () => {
    for (const command of [
      { type: "start" },
      { type: "answer", sdp: "answer" },
      { type: "mute", muted: true },
      { type: "clear" },
      { type: "devices" },
      { type: "close" },
    ])
      expect(Command.safeParse(command).success).toBe(true)
    expect(Command.safeParse({ type: "mute", muted: "yes" }).success).toBe(false)
    expect(Command.safeParse({ type: "start", output: "unknown" }).success).toBe(false)
  })
})

test.each(["source", "bundled"])(
  "the %s Node helper negotiates WebRTC, sends audio and events, mutes, clears and exits",
  async (mode) => {
    const directory = mkdtempSync(path.join(temporary, "live-peer-"))
    const input = path.join(directory, "input.wav")
    const pcm = Buffer.alloc(FRAME_BYTES * 50)
    for (let offset = 0; offset < pcm.length; offset += 2)
      pcm.writeInt16LE(Math.round(Math.sin(offset / 10) * 8000), offset)
    writeFileSync(input, Buffer.concat([wavHeader(pcm.length), pcm]))
    const peer = new RTCPeerConnection({
      iceServers: [],
      codecs: {
        audio: [new RTCRtpCodecParameters({ mimeType: "audio/opus", clockRate: 48000, channels: 2, payloadType: 111 })],
      },
    })
    const packet = Promise.withResolvers<void>()
    const playback = Promise.withResolvers<void>()
    const message = Promise.withResolvers<void>()
    const muted = Promise.withResolvers<void>()
    const silent = Promise.withResolvers<void>()
    const output = new MediaStreamTrack({ kind: "audio" })
    peer.addTrack(output)
    peer.onTrack.subscribe((track) =>
      track.onReceiveRtp.subscribe((received) => {
        packet.resolve()
        output.writeRtp(
          new RtpPacket(
            new RtpHeader({
              payloadType: 111,
              sequenceNumber: received.header.sequenceNumber,
              timestamp: received.header.timestamp,
              ssrc: 1234,
            }),
            received.payload,
          ),
        )
      }),
    )
    peer.onDataChannel.subscribe((channel) =>
      channel.stateChange.subscribe((state) => {
        if (state === "open") channel.send("test event")
      }),
    )
    const entry = mode === "source" ? await ensureHelper() : path.join(directory, "host.mjs")
    if (mode === "bundled") {
      const assets = await liveAssets()
      writeFileSync(entry, assets.host)
      expect(assets.prompts["gpt-live"]).toContain("{{project}}")
    }
    const helper = new HelperProcess(entry, {
      onEvent(event) {
        if (event.type === "event" && event.data === "test event") message.resolve()
        if (event.type === "muted" && event.muted) muted.resolve()
        if (event.type === "levels" && event.mic === 0) silent.resolve()
        if (event.type === "levels" && Number(event.speaker) > 0) playback.resolve()
      },
    })
    try {
      expect((await helper.ready).version).toBe("node")
      const sdp = await helper.start({ input: { file: input }, output: "none" })
      expect(sdp).toContain("opus/48000/2")
      expect(sdp).toContain("a=candidate:")
      await peer.setRemoteDescription({ type: "offer", sdp })
      await peer.setLocalDescription(await peer.createAnswer())
      await helper.answer(peer.localDescription!.sdp)
      await Promise.all([packet.promise, message.promise, playback.promise])
      helper.mute(true)
      await Promise.all([muted.promise, silent.promise])
      helper.clear()
    } finally {
      await helper.close()
      await peer.close()
      rmSync(directory, { recursive: true, force: true })
    }
  },
  30_000,
)
