#!/bin/sh
# Keep the installer in a function so a truncated download cannot run a partial install.
collab_install() (
  set -eu
  version=0.1.1
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) echo 'Collab supports macOS and Linux here. Use install.ps1 on Windows.' >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64) arch=x64 ;;
    *) echo 'Unsupported CPU architecture.' >&2; exit 1 ;;
  esac
  if [ "$os" = linux ] && ! getconf GNU_LIBC_VERSION >/dev/null 2>&1; then
    echo 'Collab requires glibc on Linux; Alpine/musl is not supported.' >&2; exit 1
  fi
  archive="collab-$os-$arch.tar.gz"
  base="https://github.com/Art-of-Technology/collab/releases/download/cli-v$version"
  work=$(mktemp -d)
  staged=''
  trap 'rm -rf "$work"; if [ -n "$staged" ]; then rm -f "$staged"; fi' EXIT
  trap 'exit 1' HUP INT TERM
  curl -fsSL "$base/$archive" -o "$work/$archive"
  curl -fsSL "$base/$archive.sha256" -o "$work/$archive.sha256"
  # Accept only the expected filename and one SHA-256, never paths from the sidecar.
  read -r expected filename < "$work/$archive.sha256"
  [ "$filename" = "$archive" ] && [ "${#expected}" -eq 64 ] || { echo 'Invalid checksum file.' >&2; exit 1; }
  case "$expected" in *[!0-9a-fA-F]*) echo 'Invalid checksum.' >&2; exit 1 ;; esac
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$work/$archive")
  else
    actual=$(shasum -a 256 "$work/$archive")
  fi
  [ "${actual%% *}" = "$expected" ] || { echo 'Checksum mismatch. Nothing installed.' >&2; exit 1; }
  # Extract just the expected executable, without trusting archive paths or symlinks.
  tar -xOzf "$work/$archive" "collab-$os-$arch/collab" > "$work/collab"
  [ -s "$work/collab" ] || { echo 'Executable missing from archive.' >&2; exit 1; }
  chmod 755 "$work/collab"
  "$work/collab" schema >/dev/null
  mkdir -p "$HOME/.local/bin" "$HOME/.local/share/collab"
  staged=$(mktemp "$HOME/.local/bin/.collab-XXXXXX")
  cp "$work/collab" "$staged"
  chmod 755 "$staged"
  mv -f "$staged" "$HOME/.local/bin/collab"
  staged=''
  cat > "$HOME/.local/share/collab/env" <<'ENV'
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac
hash -r 2>/dev/null || true
ENV
  # shellcheck disable=SC2016 # Expand HOME when the user's shell starts.
  line='. "$HOME/.local/share/collab/env"'
  login_profile="$HOME/.profile"
  if [ -f "$HOME/.bash_profile" ]; then login_profile="$HOME/.bash_profile"
  elif [ -f "$HOME/.bash_login" ]; then login_profile="$HOME/.bash_login"; fi
  for profile in "$login_profile" "$HOME/.bashrc" "${ZDOTDIR:-$HOME}/.zshrc"; do
    if ! grep -Fqx "$line" "$profile" 2>/dev/null; then
      printf '\n# Collab CLI\n%s\n' "$line" >> "$profile"
    fi
  done
  printf 'Collab %s installed. Run collab --help to get started.\n' "$version"
)
collab_install
