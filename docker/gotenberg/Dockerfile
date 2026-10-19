# EMP-D1: Gotenberg (LibreOffice headless) untuk konversi Formulir Aplikasi .docx → PDF.
# Template formulir memakai Arial Narrow (font Microsoft, tidak boleh disebar) → dipasang pengganti bermetrik
# sama "Liberation Sans Narrow" (GPL + font exception) supaya teks tidak melebar/terpotong.
FROM gotenberg/gotenberg:8

USER root
ARG NARROW_URL=https://github.com/liberationfonts/liberation-sans-narrow/files/2579431/liberation-narrow-fonts-ttf-1.07.6.tar.gz
ARG NARROW_SHA256=8879d89b5ff7b506c9fc28efc31a5c0b954bbe9333e66e5283d27d20a8519ea3
RUN curl -fsSL -o /tmp/narrow.tar.gz "$NARROW_URL" \
  && echo "$NARROW_SHA256  /tmp/narrow.tar.gz" | sha256sum -c - \
  && mkdir -p /usr/share/fonts/truetype/liberation-narrow \
  && tar -xzf /tmp/narrow.tar.gz -C /tmp \
  && cp /tmp/liberation-narrow-fonts-ttf-*/*.ttf /usr/share/fonts/truetype/liberation-narrow/ \
  && rm -rf /tmp/narrow.tar.gz /tmp/liberation-narrow-fonts-ttf-*
COPY arial-narrow.conf /etc/fonts/conf.d/30-arial-narrow.conf
RUN fc-cache -f
USER gotenberg
