# Voice

Standalone local dictation for Ubuntu/Debian Wayland desktops. No OpenCode runtime,
cloud transcription, or API key required. Written in **TypeScript**, running on
**Bun**. Uses Cactus Compute's **Whistle native CPU engine** through Bun FFI in a
worker thread, PipeWire for microphone capture, and Bun FFI for Linux keyboard access. No Python
or npm dependencies are required. Supports x86_64 and ARM64 Linux.

```sh
make up:voice       # from repository root
make down:voice     # stop, disable autostart, remove config and permission rules
```

Install [Bun](https://bun.sh) first. Installation uses sudo for `pipewire-bin`, `wireplumber`,
`wl-clipboard`, `unzip`, and device permissions, downloads the native engine into
`voice/.cache`, and uses the bundled `voice/models/whistle.cact` (about 17 MB; no model
download needed). It asks you to **press Copilot** to detect your
keyboard, and installs a **user** systemd service. Detection briefly reads keyboard
events using sudo; only the detected keyboard gets persistent access. The repository must stay
at the installed path. Re-run setup after moving it.

For unattended keyboard selection:

```sh
VOICE_KEYBOARD=/dev/input/by-id/YOUR-KEYBOARD-event-kbd make up:voice
```

## Use

Focus the text field or terminal where you want the words, **hold Copilot**, speak,
then release. The transcript replaces the clipboard and is pasted at the current
cursor/selection with Shift+Insert. Both the clipboard and primary selection are
replaced, for compatibility with terminals. Keep the destination focused until it arrives.
Apps that do not support Shift+Insert need manual paste from the clipboard.
It never presses Enter or submits your text.

System playback is muted while recording and restored on release (or when the
30-second limit is reached). Your volume level is unchanged; an already-muted
output stays muted. This uses WirePlumber's `wpctl`; if it is unavailable, dictation
continues with a warning in the service logs. Existing installations without
`wpctl` can install it with `sudo apt-get install wireplumber`.

The usual Copilot key sends **Left Shift + Left Super + F23**; bare F23 is also
supported. The service suppresses that key/chord, forwarding other keyboard input
through a virtual keyboard. Unusual keyboards with different mappings are not yet
supported. Stop the service to restore the keyboard's normal Copilot action.
The service checks held keys against the physical keyboard to recover missed
release events instead of remaining stuck waiting to paste.

Each recording is capped at **30 seconds**; release and start another for longer
dictation. Empty/silent recordings are not pasted. You can start another recording
while transcription is in progress; up to three dictations are queued in order.
Transcripts ready together are pasted as one block, separated by spaces.
Paste waits until the keyboard's keys are
released. Audio is kept only in memory; logs do not contain transcripts.

Whistle detects English, German, French, Spanish, Italian, Dutch, and Polish.
To force a language, change `language` in
`${XDG_CONFIG_HOME:-~/.config}/uncode-voice.json` from `null` to e.g. `"en"`, then
restart the service. The default system microphone is used.

## Permissions and troubleshooting

The udev rules grant the active local desktop user read access to the **selected
keyboard** and access to `/dev/uinput`. This permits reading that keyboard's
keystrokes and synthesizing input; no broad `input` group membership is added.
Do not install this on an untrusted/shared desktop. The service grabs the selected
keyboard to prevent the Copilot action; exiting releases the grab automatically.

```sh
systemctl --user status uncode-voice.service
journalctl --user -u uncode-voice.service -f
systemctl --user restart uncode-voice.service
systemctl --user stop uncode-voice.service
```

If device access is denied, log out/in after installation. If the key does nothing,
check that you selected the right keyboard device and that it emits F23. For
microphone issues, select the correct input in GNOME's Sound settings.

Uninstall removes only this setup's service, config, udev rules and module-load
entry. Log out/in to fully revoke device access. Apt packages and `voice/.cache`
are retained, so other software is not disrupted. There is no SDK telemetry.
Re-run `make up:voice` to replace an older service. Any old `.venv`, Python model
cache, and WASM assets are left untouched and are no longer used. The native `.so`
comes from Cactus's pinned Linux wheel; `unzip` extracts it without installing or
running Python. The model remains loaded between recordings.

After upgrading from JavaScript, re-run `make up:voice` once so the service points
to `voice.ts` instead of the removed `voice.js`.

For an existing TypeScript installation with `unzip` already available, update
the engine without re-selecting your keyboard or replacing your config:

```sh
bun voice/setup.ts download
systemctl --user restart uncode-voice.service
```

Microphone shutdown is forced after one second if PipeWire does not respond to
release. Clipboard failures retain the transcript and retry without crashing the service; a compositor
without primary-selection support can still use the regular clipboard.

Logs include microphone shutdown, native transcription, clipboard/paste, and total
release-to-paste timings, but never the spoken text. On this machine an 11-second
speech sample took about 0.61 seconds natively versus 1.3 seconds with warmed-up
WASM; performance depends on your CPU and recording. Transcription still happens
after release, not while speaking.

Tests: run `make test:voice` from the repository root. To download the native engine and smoke-test the bundled model
without installing the service or changing permissions, run `bun setup.ts download`.
Run `VOICE_NATIVE_TEST=1 bun test` inside `voice/` to also test the actual native
engine (downloads the native engine if not cached).

Whistle reference: https://cactuscompute.com/blog/whistle
