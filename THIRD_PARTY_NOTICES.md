# Third-party components

BK Autotrim uses Electron (MIT), electron-builder (MIT, build-time only), FFmpeg and x264. The application is licensed under GPL-3.0-or-later. Dependency versions and integrity hashes are recorded in package-lock.json.

The media tools are built from FFmpeg n7.1.2 and x264 commit 31e19f92f00c7003fa115047ce50978bc98c3a0d by scripts/build-media.sh. They link x264 statically and enable GPL components, without enabling nonfree components. They use operating-system frameworks on macOS and standard Windows system libraries. NVIDIA encoding, when available, additionally uses the machine's NVIDIA driver. No NVIDIA driver is shipped.

Each installer includes FFmpeg/x264 copyright and license files in its media-licenses resource folder, along with the build script. Each corresponding release also includes platform-specific media source archives. These archives include the source used for the build; the build script and versioned repository provide the instructions and configuration needed to rebuild it. No external FFmpeg or FFprobe installation is required.

Upstream sources:

- https://github.com/FFmpeg/FFmpeg/tree/n7.1.2
- https://github.com/mirror/x264/tree/31e19f92f00c7003fa115047ce50978bc98c3a0d
- https://www.electronjs.org/
- https://www.electron.build/

BK branding artwork is supplied for this application. The software license does not grant rights to use BK trademarks for unrelated products.
