#!/usr/bin/env bash
set -euo pipefail

# Replaced by release.ts so this installer always uses its own release's assets.
integration='@INTEGRATION@'
version='@VERSION@'
name="uncode-${integration}-${version}"
url="https://github.com/xLongLink/uncode/releases/download/${version}"

for command in bun curl tar sha256sum mktemp; do
    command -v "$command" >/dev/null || { printf 'Required command not found: %s\n' "$command" >&2; exit 1; }
done
if [[ "$integration" == voice && "${XDG_SESSION_TYPE:-}" != wayland ]]; then
    printf 'Run the voice installer from your Ubuntu/Debian Wayland desktop.\n' >&2
    exit 1
fi

base="${XDG_DATA_HOME:-$HOME/.local/share}/uncode/releases"
mkdir -p "$base"
download=$(mktemp -d "$base/.download.XXXXXX")
trap 'rm -rf -- "$download"' EXIT
printf 'Downloading Uncode %s %s...\n' "$integration" "$version"
for file in "$name.tar.gz" "$name.tar.gz.sha256"; do
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
        --output "$download/$file" "$url/$file"
done

read -r digest filename extra < "$download/$name.tar.gz.sha256"
if [[ ! "$digest" =~ ^[[:xdigit:]]{64}$ || "$filename" != "$name.tar.gz" || -n "$extra" ]]; then
    printf 'Invalid release checksum file.\n' >&2
    exit 1
fi
(cd "$download" && sha256sum --check "$name.tar.gz.sha256")
tar --extract --gzip --no-same-owner --file "$download/$name.tar.gz" --directory "$download"

# A unique persistent directory avoids overwriting existing installs or voice caches.
installation=$(mktemp -d "$base/${integration}-${version}.XXXXXX")
mv "$download/$name" "$installation/$name"
installation="$installation/$name"
printf 'Installed release files: %s\n' "$installation"
printf 'To uninstall: bash %q uninstall\n' "$installation/setup.sh"
bash "$installation/setup.sh" install
