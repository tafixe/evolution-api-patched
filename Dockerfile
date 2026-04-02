FROM evoapicloud/evolution-api:homolog

# Debug: extract patterns around prepareMediaMessage and waUploadToServer
RUN grep -oP '.{0,60}prepareMediaMessage.{0,60}' /evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js | head -10 && \
    echo "---UPLOAD---" && \
    grep -oP '.{0,60}waUploadToServer.{0,60}' /evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js | head -10 && \
    echo "---FORWARD---" && \
    grep -oP '.{0,80}forward.{0,80}' /evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js | grep -i "remoteJid\|fromMe" | head -5

COPY patch-baileys.js /tmp/patch-baileys.js
RUN node /tmp/patch-baileys.js && rm /tmp/patch-baileys.js
