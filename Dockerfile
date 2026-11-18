FROM node:22-bookworm-slim AS node

FROM ubuntu:24.04 AS whisper-build
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates git cmake build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git /tmp/whisper.cpp \
    && cmake -S /tmp/whisper.cpp -B /tmp/whisper.cpp/build \
        -DWHISPER_BUILD_TESTS=OFF \
        -DWHISPER_BUILD_EXAMPLES=ON \
        -DBUILD_SHARED_LIBS=OFF \
        -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/whisper.cpp/build --config Release -j"$(nproc)" --target whisper-cli

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates ffmpeg git ripgrep python3 make g++ libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node /usr/local/ /usr/local/
COPY --from=whisper-build /tmp/whisper.cpp/build/bin/whisper-cli /opt/whisper/whisper-cli
ENV WHISPER_CLI_PATH=/opt/whisper/whisper-cli

ARG PI_VERSION=1.5.2
RUN npm install --global --no-audit --no-fund "@earendil-works/pi-coding-agent@${PI_VERSION}"

RUN mkdir -p /home/ubuntu/.pi /workspace \
    && chown ubuntu:ubuntu /home/ubuntu/.pi /workspace
USER ubuntu
ENV HOME=/home/ubuntu
# Keep the legacy global prefix available for existing Pi package installs.
# Current Pi installs extensions under ~/.pi/agent/npm.
ENV NPM_CONFIG_PREFIX=/home/ubuntu/.pi/npm-global
WORKDIR /workspace

ENV PI_WEB_ACCESS_VERSION=0.48.0
RUN pi install npm:whatsapp-pi \
    && pi install "npm:pi-web-access@${PI_WEB_ACCESS_VERSION}"

# Self-healing entrypoint: installs any missing extension before starting
# Pi (e.g. an existing volume hiding the image's ~/.pi).
COPY --chmod=755 <<'EOF' /home/ubuntu/entrypoint.sh
#!/bin/sh
installed() { pi list 2>/dev/null | grep -q "$1"; }
installed whatsapp-pi || pi install npm:whatsapp-pi || true
web_version_matches() {
    node -e 'const fs = require("node:fs");
        const managed = process.env.HOME + "/.pi/agent/npm/node_modules/pi-web-access/package.json";
        const legacy = process.env.NPM_CONFIG_PREFIX + "/lib/node_modules/pi-web-access/package.json";
        try {
            const pkg = JSON.parse(fs.readFileSync(fs.existsSync(managed) ? managed : legacy, "utf8"));
            process.exit(pkg.version === process.env.PI_WEB_ACCESS_VERSION ? 0 : 1);
        } catch { process.exit(1); }'
}
if ! installed pi-web-access || ! web_version_matches; then
    pi install "npm:pi-web-access@$PI_WEB_ACCESS_VERSION" || echo "pi-web-access install failed" >&2
fi
if installed whatsapp-pi; then
    exec pi "$@"
fi
echo "whatsapp-pi unavailable; starting pi without it" >&2
exec pi
EOF

ENTRYPOINT ["/home/ubuntu/entrypoint.sh"]
CMD ["--whatsapp-pi-online"]
