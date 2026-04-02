FROM evoapicloud/evolution-api:homolog

# Debug: dump relevant sections of the Evolution API service file
RUN grep -n "prepareMediaMessage\|waUploadToServer\|prepareWAMessageMedia\|forward.*remoteJid.*fromMe" /evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js | head -40

COPY patch-baileys.js /tmp/patch-baileys.js
RUN node /tmp/patch-baileys.js && rm /tmp/patch-baileys.js
