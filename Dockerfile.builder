FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

# Unity 2019.4 supports this LTS base and needs both player modules explicitly.
RUN apt-get update && apt-get install -y --no-install-recommends \
        android-sdk-build-tools \
        ca-certificates \
        libarchive13 \
        libasound2 \
        libfontconfig1 \
        libfreetype6 \
        libgconf-2-4 \
        libglib2.0-0 \
        libgtk2.0-0 \
        libnss3 \
        libsoup2.4-1 \
        libx11-6 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        mono-complete \
        nuget \
        openjdk-8-jdk \
        p7zip-full \
        tar \
        wget \
        xvfb \
        zip \
    && wget -q https://dist.nuget.org/win-x86-commandline/v6.8.0/nuget.exe -O /usr/local/lib/nuget.exe \
    && wget -q https://download.unity3d.com/download_unity/fb553f8fdd6c/UnitySetup-2019.4.41f1 -O /tmp/UnitySetup \
    && chmod +x /tmp/UnitySetup \
    && echo "y" | xvfb-run -a /tmp/UnitySetup --unattended --install-location=/opt/unity --components=Unity,Android \
    && rm -f /tmp/UnitySetup \
    && ln -s /opt/unity/Editor/Unity /usr/local/bin/unity-editor \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends libgtk-3-0 python3 \
    && ln -s /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_NDK_ROOT=/opt/android-ndk-r19
RUN wget -q https://dl.google.com/android/repository/commandlinetools-linux-6609375_latest.zip -O /tmp/android-commandlinetools.zip \
    && 7z x -y -o/opt/android-commandlinetools /tmp/android-commandlinetools.zip >/dev/null \
    && yes | /opt/android-commandlinetools/tools/bin/sdkmanager --sdk_root="$ANDROID_SDK_ROOT" --licenses >/dev/null \
    && /opt/android-commandlinetools/tools/bin/sdkmanager --sdk_root="$ANDROID_SDK_ROOT" \
        "platform-tools" \
        "platforms;android-29" \
        "build-tools;29.0.2" \
    && mv /opt/android-commandlinetools/tools "$ANDROID_SDK_ROOT/tools" \
    && mv "$ANDROID_SDK_ROOT/tools/bin/sdkmanager" "$ANDROID_SDK_ROOT/tools/bin/sdkmanager.real" \
    && printf '#!/bin/sh\nexec /opt/android-sdk/tools/bin/sdkmanager.real --sdk_root=/opt/android-sdk "$@"\n' > "$ANDROID_SDK_ROOT/tools/bin/sdkmanager" \
    && chmod +x "$ANDROID_SDK_ROOT/tools/bin/sdkmanager" \
    && rm -rf /tmp/android-commandlinetools.zip /opt/android-commandlinetools

RUN wget -q https://dl.google.com/android/repository/android-ndk-r19-linux-x86_64.zip -O /tmp/android-ndk-r19.zip \
    && 7z x -y -o/opt /tmp/android-ndk-r19.zip >/dev/null \
    && rm -f /tmp/android-ndk-r19.zip

# Mono's bundled compiler cannot parse the project's C# 7 syntax.
RUN wget -q https://www.nuget.org/api/v2/package/Microsoft.Net.Compilers/3.11.0 -O /tmp/Microsoft.Net.Compilers.nupkg \
    && mkdir -p /opt/roslyn \
    && 7z x -y -o/opt/roslyn /tmp/Microsoft.Net.Compilers.nupkg \
    && rm -f /tmp/Microsoft.Net.Compilers.nupkg

ENV JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
ENV PATH=${JAVA_HOME}/bin:${PATH}

WORKDIR /project
COPY . /project/
COPY workflowScripts/build-docker.sh /usr/local/bin/build-valkyrie
RUN chmod +x /usr/local/bin/build-valkyrie

ENTRYPOINT ["build-valkyrie"]
