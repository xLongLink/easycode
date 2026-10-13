export const RATE = 48_000
export const SAMPLES = 960
export const CHANNELS = 2
export const FRAME_BYTES = SAMPLES * CHANNELS * 2

/** A bounded PCM queue shared by capture and playback. */
export class PcmQueue {
  private buffer = Buffer.alloc(0)

  push(pcm: Buffer) {
    this.buffer = Buffer.concat([this.buffer, pcm]).subarray(-FRAME_BYTES * 50)
  }

  read() {
    const frame = Buffer.alloc(FRAME_BYTES)
    this.buffer.copy(frame, 0, 0, FRAME_BYTES)
    this.buffer = this.buffer.subarray(FRAME_BYTES)
    return frame
  }

  clear() {
    this.buffer = Buffer.alloc(0)
  }
}

export function level(pcm: Buffer) {
  const samples = pcm.length / 2
  if (!samples) return 0
  const sum = Array.from({ length: samples }, (_, index) => (pcm.readInt16LE(index * 2) / 32768) ** 2).reduce(
    (total, value) => total + value,
    0,
  )
  return Math.min(1, Math.sqrt(sum / samples) * 4)
}

export function wavHeader(bytes: number) {
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + bytes, 4)
  header.write("WAVEfmt ", 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * CHANNELS * 2, 28)
  header.writeUInt16LE(CHANNELS * 2, 32)
  header.writeUInt16LE(16, 34)
  header.write("data", 36)
  header.writeUInt32LE(bytes, 40)
  return header
}

/** Headless input uses uncompressed 48 kHz PCM16 WAV, mono or stereo. */
export function readWav(wav: Buffer) {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("Voice input must be a PCM16 WAV file")
  let channels = 0
  let pcm: Buffer | undefined
  for (let offset = 12; offset + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > wav.length) throw new Error("Truncated WAV input")
    const name = wav.toString("ascii", offset, offset + 4)
    if (name === "fmt ") {
      if (size < 16 || wav.readUInt16LE(start) !== 1 || wav.readUInt16LE(start + 14) !== 16)
        throw new Error("Voice input must use PCM16 WAV encoding")
      channels = wav.readUInt16LE(start + 2)
      if ((channels !== 1 && channels !== 2) || wav.readUInt32LE(start + 4) !== RATE)
        throw new Error("Voice input must be a 48 kHz mono or stereo WAV file")
    }
    if (name === "data") pcm = wav.subarray(start, start + size)
    offset = start + size + (size % 2)
  }
  if (!channels || !pcm || pcm.length % (channels * 2)) throw new Error("WAV input is missing valid audio data")
  if (channels === CHANNELS) return pcm
  const stereo = Buffer.alloc(pcm.length * 2)
  for (let offset = 0; offset < pcm.length; offset += 2) {
    stereo.writeInt16LE(pcm.readInt16LE(offset), offset * 2)
    stereo.writeInt16LE(pcm.readInt16LE(offset), offset * 2 + 2)
  }
  return stereo
}
