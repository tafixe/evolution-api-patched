FROM evoapicloud/evolution-api:homolog

# Cache bust: v7
COPY patch-baileys.js /tmp/patch-baileys.js
RUN node /tmp/patch-baileys.js && rm /tmp/patch-baileys.js
