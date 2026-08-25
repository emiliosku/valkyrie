#!/bin/bash
set -e
# License and source stay outside the image. Only build artifacts are written to the host.
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
ULF="${UNITY_LICENSE_PATH:-$HOME/.local/share/unity3d/Unity/Unity_lic.ulf}"
BUILD_DIR="${BUILD_DIR:-$PROJECT_ROOT/build}"

if [ ! -f "$ULF" ]; then
  echo "ERROR: Unity license not found: $ULF"
  echo "Activate a Personal license in Unity Hub or set UNITY_LICENSE_PATH to its .ulf file."
  exit 1
fi

mkdir -p "$BUILD_DIR"
echo "Using ULF: $ULF ($(wc -c < "$ULF") bytes)"
echo "Building image valkyrie-builder:2019.4.41f1-linux-android ..."
docker build -f Dockerfile.builder -t valkyrie-builder:2019.4.41f1-linux-android "$PROJECT_ROOT"
echo "Running isolated Linux and Android build..."
docker run --rm \
  --network host \
  --hostname "$(hostname)" \
  -v /etc/machine-id:/etc/machine-id:ro \
  -v "$BUILD_DIR:/build" \
  -v "$ULF:/root/.local/share/unity3d/Unity/Unity_lic.ulf:ro" \
  valkyrie-builder:2019.4.41f1-linux-android
docker run --rm \
  -v "$BUILD_DIR:/build" \
  --entrypoint chown \
  valkyrie-builder:2019.4.41f1-linux-android \
  -R "$(id -u):$(id -g)" /build
echo "Build finished. Artifacts in $BUILD_DIR/"
ls -lh "$BUILD_DIR"
