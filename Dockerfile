FROM evoapicloud/evolution-api:homolog

COPY patch-baileys.js /tmp/patch-baileys.js
RUN echo "cache-bust-v10" && node /tmp/patch-baileys.js > /tmp/patch-report.txt 2>&1 && cat /tmp/patch-report.txt && rm /tmp/patch-baileys.js

# Override entrypoint to show patch report at startup
COPY start.sh /tmp/start.sh
RUN chmod +x /tmp/start.sh
CMD ["/tmp/start.sh"]
