FROM evoapicloud/evolution-api:homolog

COPY patch-baileys.js /tmp/patch-baileys.js
RUN echo "cache-bust-v9-test" && node /tmp/patch-baileys.js && rm /tmp/patch-baileys.js
