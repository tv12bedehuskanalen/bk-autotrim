#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${BK_MEDIA_WORK:-$ROOT/.media-build}"
PREFIX="$WORK/install"
# Source archives must not inherit the enclosing application Git version.
export GIT_CEILING_DIRECTORIES="$WORK"
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
if [[ "$(uname -s)" == Darwin ]]; then export MACOSX_DEPLOYMENT_TARGET=13.0; fi
cd "$WORK/x264"
if [ -f config.mak ]; then make distclean; fi
./configure --prefix="$PREFIX" --enable-static --disable-cli --enable-pic --disable-opencl
make -j"$JOBS"
make install
cd "$WORK/ffmpeg"
if [ -f ffbuild/config.mak ]; then make distclean; fi
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
OPTIONS=(--prefix="$PREFIX" --pkg-config-flags=--static --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib" --enable-gpl --enable-libx264 --enable-zlib --disable-autodetect --disable-doc --disable-debug --disable-network --disable-shared --enable-static --disable-ffplay)
if [[ "$(uname -s)" == Darwin ]]; then OPTIONS+=(--enable-videotoolbox); fi
if [[ "${MSYSTEM:-}" == MINGW64 ]]; then OPTIONS+=(--enable-nvenc --enable-ffnvcodec); fi
if [[ "${MSYSTEM:-}" == MINGW64 ]]; then OPTIONS+=(--target-os=mingw32 --extra-ldflags="-L$PREFIX/lib -static"); fi
./configure "${OPTIONS[@]}"
make -j"$JOBS"
SUFFIX=""; if [[ "${MSYSTEM:-}" == MINGW64 ]]; then SUFFIX=.exe; fi
for TOOL in ffmpeg ffprobe; do
  cp "$TOOL$SUFFIX" "$ROOT/vendor/bin/$TOOL$SUFFIX.new"
  mv -f "$ROOT/vendor/bin/$TOOL$SUFFIX.new" "$ROOT/vendor/bin/$TOOL$SUFFIX"
done
cp COPYING.GPLv2 COPYING.GPLv3 LICENSE.md "$ROOT/vendor/licenses/"
if [[ "${MSYSTEM:-}" == MINGW64 ]]; then
  cp /mingw64/share/licenses/ffnvcodec-headers/LICENSE "$ROOT/vendor/licenses/ffnvcodec-LICENSE"
  mkdir -p "$WORK/ffnvcodec-headers"
  cp -R /mingw64/include/ffnvcodec "$WORK/ffnvcodec-headers/"
  cp /mingw64/lib/pkgconfig/ffnvcodec.pc "$WORK/ffnvcodec-headers/"
  ZLIB_VERSION="$(pacman -Q mingw-w64-x86_64-zlib | awk '{print $2}')"
  printf '%s\n' "$ZLIB_VERSION" > "$ROOT/vendor/licenses/zlib-package-version.txt"
  curl --fail --location --retry 3 "https://repo.msys2.org/mingw/sources/mingw-w64-zlib-$ZLIB_VERSION.src.tar.zst" -o "$WORK/zlib-source-package.tar.zst"
  cp /mingw64/share/licenses/zlib/LICENSE "$ROOT/vendor/licenses/zlib-LICENSE"
fi
cp "$WORK/x264/COPYING" "$ROOT/vendor/licenses/x264-COPYING"
cp "$ROOT/scripts/build-media.sh" "$ROOT/vendor/licenses/build-media.sh"
# Keep corresponding source next to each installer in releases.
tar -czf "$ROOT/vendor/media-sources.tar.gz" -C "$WORK" --exclude='*.o' --exclude='*.a' --exclude='ffmpeg/ffmpeg' --exclude='ffmpeg/ffprobe' x264 ffmpeg ${MSYSTEM:+ffnvcodec-headers} ${MSYSTEM:+zlib-source-package.tar.zst}
"$ROOT/vendor/bin/ffmpeg$SUFFIX" -version
"$ROOT/vendor/bin/ffprobe$SUFFIX" -version
