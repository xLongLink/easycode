import { randomInt } from "node:crypto"
import OpusScript from "opusscript"
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, RtpHeader, RtpPacket } from "werift"
import { Audio } from "./audio.js"
import { duckAudio } from "./duck.js"
import { level, RATE, SAMPLES } from "./pcm.js"
import type { Emit, Start } from "./protocol.js"

export class VoiceHost {
  private peer: RTCPeerConnection | undefined
  private audio: Audio | undefined
  private encoder: OpusScript | undefined
  private decoder: OpusScript | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private muted = false
  private connected = false
  private restoreAudio: (() => Promise<void>) | undefined
  private closing: Promise<void> | undefined
  private readonly opened = Promise.withResolvers<void>()

  constructor(private readonly emit: Emit) {
    // A peer failure can precede receipt of the answer command.
    void this.opened.promise.catch(() => undefined)
  }

  async start(options: Start) {
    if (this.peer) throw new Error("Voice call already started")
    this.audio = new Audio(options, this.emit)
    await this.audio.open()
    if (options.duckOthers) this.restoreAudio = await duckAudio(this.emit)
    // The JS codec is self-contained, so packaged CLIs need no external WASM file.
    this.encoder = new OpusScript(RATE, 2, OpusScript.Application.VOIP, { wasm: false })
    this.decoder = new OpusScript(RATE, 2, OpusScript.Application.AUDIO, { wasm: false })
    const peer = new RTCPeerConnection({
      codecs: {
        audio: [
          new RTCRtpCodecParameters({
            mimeType: "audio/opus",
            clockRate: RATE,
            channels: 2,
            payloadType: 111,
            parameters: "minptime=10;useinbandfec=1",
          }),
        ],
      },
      iceServers: [],
      iceUseTcp: true,
      bundlePolicy: "max-bundle",
    })
    this.peer = peer
    const track = new MediaStreamTrack({ kind: "audio", label: "microphone" })
    peer.addTrack(track)
    const channel = peer.createDataChannel("oai-events")
    channel.stateChange.subscribe((state) => {
      if (state === "open") this.opened.resolve()
      if (state === "closed") this.opened.reject(new Error("Voice event channel closed"))
    })
    channel.onMessage.subscribe((data) => this.emit({ type: "event", data: data.toString() }))
    peer.connectionStateChange.subscribe((state) => {
      this.emit({ type: "peer", state })
      if (state === "failed") this.opened.reject(new Error("Could not connect to GPT-Live"))
    })
    peer.onTrack.subscribe((remote) => {
      remote.onReceiveRtp.subscribe((packet) => {
        if (!this.connected || !this.decoder) return
        this.audio?.receive(this.decoder.decode(packet.payload))
      })
    })
    let sequence = randomInt(65536)
    let timestamp = randomInt(2 ** 32)
    const ssrc = randomInt(1, 2 ** 32)
    let ticks = 0
    this.timer = setInterval(() => {
      if (!this.connected || !this.audio || !this.encoder) return
      const microphone = this.audio.read()
      if (this.muted) microphone.fill(0)
      track.writeRtp(
        new RtpPacket(
          new RtpHeader({ payloadType: 111, sequenceNumber: sequence, timestamp, ssrc }),
          this.encoder.encode(microphone, SAMPLES),
        ),
      )
      sequence = (sequence + 1) % 65536
      timestamp = (timestamp + SAMPLES) >>> 0
      const speaker = this.audio.play()
      if (++ticks % 3 === 0) this.emit({ type: "levels", mic: level(microphone), speaker: level(speaker) })
    }, 20)
    await withTimeout(peer.setLocalDescription(await peer.createOffer()), "Timed out gathering voice ICE candidates")
    const sdp = peer.localDescription?.sdp
    if (!sdp) throw new Error("Voice peer did not create an SDP offer")
    return sdp
  }

  async answer(sdp: string) {
    if (!this.peer) throw new Error("Voice call is not started")
    if (this.connected) throw new Error("Voice answer already applied")
    await withTimeout(
      this.peer.setRemoteDescription({ type: "answer", sdp }).then(() => this.opened.promise),
      "Timed out connecting to GPT-Live",
    )
    this.connected = true
  }

  mute(muted: boolean) {
    this.muted = muted
    this.emit({ type: "muted", muted })
  }

  clear() {
    return this.audio?.clear()
  }

  close() {
    return (this.closing ??= this.shutdown())
  }

  private async shutdown() {
    this.connected = false
    this.opened.reject(new Error("Voice call closed"))
    clearInterval(this.timer)
    this.audio?.close()
    await this.peer?.close()
    await this.restoreAudio?.()
    this.restoreAudio = undefined
    this.peer = undefined
    this.encoder?.delete()
    this.decoder?.delete()
    this.encoder = undefined
    this.decoder = undefined
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string) {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(new Error(message)), 20_000)
  return Promise.race([promise, timeout.promise]).finally(() => clearTimeout(timer))
}
