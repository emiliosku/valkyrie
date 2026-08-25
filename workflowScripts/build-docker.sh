#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=/project
BUILD_ROOT=/build
UNITY_EDITOR=/opt/unity/Editor/Unity
UNITY_EDITOR_HOME=/opt/unity/Editor
VERSION_FILE="$PROJECT_ROOT/unity/Assets/Resources/version.txt"

mapfile -t version_lines < "$VERSION_FILE"
version="${version_lines[0]%$'\r'}"
release_kind="${version_lines[1]:-}"
release_kind="${release_kind%$'\r'}"

case "$release_kind" in
    MAJOR) output_version="${version}-major" ;;
    BETA) output_version="${version}-beta" ;;
    *) output_version="$version" ;;
esac

linux_name="valkyrie-linux-${output_version}"
linux_dir="$BUILD_ROOT/$linux_name"
apk_path="$BUILD_ROOT/Valkyrie-android-${output_version}.apk"

shopt -s dotglob nullglob
old_artifacts=("$BUILD_ROOT"/*)
if [ ${#old_artifacts[@]} -gt 0 ]; then
    rm -rf "${old_artifacts[@]}"
fi
mkdir -p "$linux_dir"

mono /usr/local/lib/nuget.exe restore "$PROJECT_ROOT/libraries/libraries.sln"
xbuild "$PROJECT_ROOT/libraries/libraries.sln" /nologo /p:Configuration=Release /p:NoWarn=0108 /p:UnityEditorPath="$UNITY_EDITOR_HOME" /p:CscToolPath=/opt/roslyn/tools /p:CscToolExe=csc.exe
mono "$PROJECT_ROOT/libraries/SetVersion/bin/Release/SetVersion.exe" "$PROJECT_ROOT"
rm -f "$PROJECT_ROOT/unity/Assets/Plugins/UnityEngine.dll"

"$UNITY_EDITOR" \
    -batchmode \
    -nographics \
    -quit \
    -projectPath "$PROJECT_ROOT/unity" \
    -buildTarget Linux64 \
    -buildLinux64Player "$linux_dir/valkyrie" \
    -logFile "$BUILD_ROOT/Editor_valkyrie-linux.log"

test -x "$linux_dir/valkyrie"

cp "$PROJECT_ROOT/LICENSE" "$linux_dir/LICENSE.txt"
cp "$PROJECT_ROOT/NOTICE" "$linux_dir/NOTICE.txt"
cp "$PROJECT_ROOT/.NET-Ogg-Vorbis-Encoder-LICENSE" "$linux_dir/.NET-Ogg-Vorbis-Encoder-LICENSE.txt"
cp "$PROJECT_ROOT/dotnetzip-license.rtf" "$linux_dir/"
tar -C "$BUILD_ROOT" -czf "$BUILD_ROOT/${linux_name}.tar.gz" "$linux_name"

"$UNITY_EDITOR" \
    -batchmode \
    -nographics \
    -quit \
    -projectPath "$PROJECT_ROOT/unity" \
    -buildTarget Android \
    -executeMethod PerformBuild.CommandLineBuildAndroid \
    +buildlocation "$apk_path" \
    -logFile "$BUILD_ROOT/Editor_valkyrie-android.log"

test -f "$apk_path"
7z -tzip d "$apk_path" META-INF
jarsigner -keystore "$PROJECT_ROOT/unity/user.keystore" -storepass valkyrie -keypass valkyrie "$apk_path" com.bruce.valkyrie
jarsigner -verify -verbose -certs "$apk_path"
zipalign -f -v 4 "$apk_path" "$apk_path.aligned"
mv "$apk_path.aligned" "$apk_path"
