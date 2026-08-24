#!/bin/bash
set -e
# Valkyrie Docker Builder wrapper - license passed at startup via volume mount, not baked
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
ULF="$PROJECT_ROOT/Unity_lic.ulf"
if [ ! -f "$ULF" ]; then
  echo "ERROR: $ULF not found. Place your Personal Unity_lic.ulf there (chmod 600) or mount via -v"
  echo "Generate via Unity Hub -> Get Personal license -> cp ~/.local/share/unity3d/Unity/Unity_lic.ulf $ULF"
  exit 1
fi
echo "Using ULF: $ULF ($(wc -c < "$ULF") bytes)"
echo "Building image valkyrie-builder:2019.4.41f1-android ..."
docker build -f Dockerfile.builder -t valkyrie-builder:2019.4.41f1-android "$PROJECT_ROOT"
echo "Running build (Linux+Android) with ULF mounted read-only..."
docker run --rm \
  -v "$PROJECT_ROOT:/project" \
  -v "$PROJECT_ROOT/build:/build" \
  -v "$ULF:/root/.local/share/unity3d/Unity/Unity_lic.ulf:ro" \
  valkyrie-builder:2019.4.41f1-android -BuildWindows \$false -BuildMac \$false -BuildLinux \$true -BuildAndroid \$true
echo "Build finished. Artifacts in $PROJECT_ROOT/build/"
ls -lh "$PROJECT_ROOT/build" 2>&1 | head -n 30
