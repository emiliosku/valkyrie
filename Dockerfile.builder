FROM test-mono:1

# Install Unity 2019.4.41f1
USER root
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates gnupg libgtk2.0-0 libglib2.0-0 libgconf-2-4 libnss3 libxss1 libasound2 libxtst6 libx11-6 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxrandr2 libxrender1 libxfixes3 libfontconfig1 libfreetype6 libsoup2.4-1 libarchive13 xvfb \
    && wget -q https://download.unity3d.com/download_unity/fb553f8fdd6c/UnitySetup-2019.4.41f1 -O /tmp/UnitySetup \
    && chmod +x /tmp/UnitySetup \
    && echo "y" | xvfb-run -a /tmp/UnitySetup --unattended --install-location=/opt/unity --components=Unity,Android \
    && rm /tmp/UnitySetup \
    && ln -sf /opt/unity/Editor/Unity /usr/local/bin/unity-editor \
    && apt-get update && apt-get install -y --no-install-recommends wget ca-certificates gnupg \
    && wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && apt-get update && apt-get install -y --no-install-recommends \
        nuget \
        nsis \
        p7zip-full \
        powershell \
    && rm -rf /var/lib/apt/lists/* /tmp/packages-microsoft-prod.deb \
    && ln -sf /usr/bin/xbuild /usr/bin/msbuild \
    && wget -q https://dist.nuget.org/win-x86-commandline/v6.8.0/nuget.exe -O /usr/local/bin/nuget.exe \
    && echo '#!/bin/bash\nmono /usr/local/bin/nuget.exe "$@"' > /usr/local/bin/nuget \
    && chmod +x /usr/local/bin/nuget

WORKDIR /project
COPY workflowScripts/ workflowScripts/
COPY libraries/ libraries/
COPY unity/ unity/
COPY valkyrie.nsi valkyrie.nsi

ENTRYPOINT ["pwsh", "-File", "workflowScripts/build.ps1"]
CMD ["-BuildWindows", "$false", "-BuildMac", "$false", "-BuildLinux", "$true", "-BuildAndroid", "$true"]
