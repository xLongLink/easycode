# Uncode Voice

[![Bun](https://img.shields.io/badge/runtime-Bun-14151a)](https://bun.sh)
[![Platform](https://img.shields.io/badge/platform-Linux%20Wayland-blue)](https://wayland.freedesktop.org/)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/xLongLink/uncode/blob/main/LICENSE)

Local dictation powered by [Whistle](https://cactuscompute.com/blog/whistle).
Hold Copilot to record, then release to transcribe and paste into the focused app.
No cloud transcription or API key is required.

## Install

Requires Bun, an Ubuntu/Debian Wayland desktop, and a Copilot keyboard.
Supports x86_64 and ARM64. Run as your desktop user, not root.

```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/voice.sh | bash
```

Alternatively, from this directory or an extracted release archive:

```sh
bun run up
```

From the repository root, use `bun run up:voice`. Setup uses sudo to install
`pipewire-bin`, `wireplumber`, `wl-clipboard`, and `unzip`, configure device access,
and detect your keyboard. Press **Copilot** when prompted.

The speech model is bundled; the pinned native engine downloads into `.cache/`.
Setup installs a user systemd service. **Keep this directory at its installed
path**; rerun setup after moving it.

To select a keyboard without detection:

```sh
VOICE_KEYBOARD=/dev/input/by-id/YOUR-KEYBOARD-event-kbd bun run up
```

## Use

- Focus the destination, hold Copilot, speak, then release. Keep it focused until paste completes.
- Text is pasted with Shift+Insert. The clipboard and primary selection are replaced.
  Apps without Shift+Insert support require manual paste. **Enter is never pressed.**
- Recordings are limited to 30 seconds. Empty transcripts are ignored.
- System playback is muted during recording and restored afterward.
- The default system microphone is used. Audio stays in memory; logs omit transcripts.

Supported languages: English, German, French, Spanish, Italian, Dutch, and Polish.
Detection is automatic. To force a language, set `language` to a code such as
`"en"` in `${XDG_CONFIG_HOME:-~/.config}/uncode-voice.json`, then restart the service.

## Permissions

Setup grants the active desktop user access to the **selected keyboard** and
`/dev/uinput`. This allows reading keystrokes and synthesizing input; do not install
on an untrusted or shared desktop. Detection briefly reads keyboard events with sudo.
No broad `input` group membership is added.

The service intercepts Left Shift + Left Super + F23, or bare F23. Other Copilot
mappings are not supported. Stop the service to restore the key's normal behavior.

## Troubleshooting

```sh
systemctl --user status uncode-voice.service
journalctl --user -u uncode-voice.service -f
systemctl --user restart uncode-voice.service
systemctl --user stop uncode-voice.service
```

If device access is denied, log out and back in. If Copilot does nothing, verify
the selected keyboard and its F23 mapping. For microphone issues, check your
desktop's sound settings.

## Uninstall

```sh
bun run down
```

From the repository root, use `bun run down:voice`. Uninstall removes the service,
configuration, and device permission rules. Log out and back in to fully revoke
access. System packages and the native-engine cache are retained.

The bundled model is licensed under [Apache-2.0](models/LICENSE);
see [model provenance](models/README.md).
