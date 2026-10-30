#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${BK_MEDIA_WORK:-$ROOT/.media-build}"
PREFIX="$WORK/install"
mkdir -p "$WORK" "$PREFIX" "$ROOT/vendor/bin" "$ROOT/vendor/licenses"
fetch_source() {
  local name="$1" url="$2"
  if [ ! -d "$WORK/$name" ]; then
    curl --fail --location --retry 3 "$url" -o "$WORK/$name.tar.gz"
    mkdir -p "$WORK/$name"
    tar -xzf "$WORK/$name.tar.gz" --strip-components=1 -C "$WORK/$name"
  fi
}
fetch_source x264 https://github.com/mirror/x264/archive/31e19f92f00c7003fa115047ce50978bc98c3a0d.tar.gz
fetch_source ffmpeg https://github.com/FFmpeg/FFmpeg/archive/refs/tags/n7.1.2.tar.gz
JOBS="${BK_BUILD_JOBS:-4}"
cd "$WORK/x264"
./configure --prefix="$PREFIX" --enable-static --disable-cli --enable-pic --disable-opencl
make -j"$JOBS"
make install
cd "$WORK/ffmpeg"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
OPTIONS=(--prefix="$PREFIX" --pkg-config-flags=--static --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib" --enable-gpl --enable-libx264 --enable-zlib --disable-autodetect --disable-doc --disable-debug --disable-network --disable-shared --enable-static --disable-ffplay)
if [[ "$(uname -s)" == Darwin ]]; then OPTIONS+=(--enable-videotoolbox); fi
if [[ "${MSYSTEM:-}" == MINGW64 ]]; then OPTIONS+=(--enable-nvenc --enable-ffnvcodec); fi
if [[ "${MSYSTEM:-}" == MINGW64 ]]; then OPTIONS+=(--target-os=mingw32 --extra-ldflags="-L$PREFIX/lib -static"); fi
./configure "${OPTIONS[@]}"
make -j"$JOBS"
SUFFIX=""; if [[ "${MSYSTEM:-}" == MINGW64 ]]; then SUFFIX=.exe; fi
cp "ffmpeg$SUFFIX" "ffprobe$SUFFIX" "$ROOT/vendor/bin/"
cp COPYING.GPLv2 COPYING.GPLv3 LICENSE.md "$ROOT/vendor/licenses/"
if [[ "${MSYSTEM:-}" == MINGW64 ]]; then
  cp /mingw64/share/licenses/zlib/LICENSE "$ROOT/vendor/licenses/zlib-LICENSE"
fi
cp "$WORK/x264/COPYING" "$ROOT/vendor/licenses/x264-COPYING"
cp "$ROOT/scripts/build-media.sh" "$ROOT/vendor/licenses/build-media.sh"
# Keep corresponding source next to each installer in releases.
tar -czf "$ROOT/vendor/media-sources.tar.gz" -C "$WORK" --exclude='*.o' --exclude='*.a' --exclude='ffmpeg/ffmpeg' --exclude='ffmpeg/ffprobe' x264 ffmpeg
"$ROOT/vendor/bin/ffmpeg$SUFFIX" -version
"$ROOT/vendor/bin/ffprobe$SUFFIX" -version
