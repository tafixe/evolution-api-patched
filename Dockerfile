FROM evoapicloud/evolution-api:homolog

COPY patch-baileys.js /tmp/patch-baileys.js
RUN echo "cache-bust-v11" && node /tmp/patch-baileys.js > /tmp/patch-report.txt 2>&1 && cat /tmp/patch-report.txt && rm /tmp/patch-baileys.js

# Show patch report at startup, then hand off to original entrypoint
COPY start.sh /tmp/start.sh
RUN chmod +x /tmp/start.sh
ENTRYPOINT ["/tmp/start.sh"]
