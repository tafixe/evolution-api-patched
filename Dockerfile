FROM evoapicloud/evolution-api:homolog

# Debug: extract exact patterns from minified Evolution API code
RUN node -e " \
const fs = require('fs'); \
const c = fs.readFileSync('/evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js','utf8'); \
const patterns = ['prepareMediaMessage','waUploadToServer','prepareWAMessageMedia','forward']; \
patterns.forEach(p => { \
  const re = new RegExp('.{0,80}' + p + '.{0,80}', 'g'); \
  const matches = c.match(re) || []; \
  console.log('=== ' + p + ' (' + matches.length + ' matches) ==='); \
  matches.slice(0,5).forEach(m => console.log(m)); \
}); \
"

COPY patch-baileys.js /tmp/patch-baileys.js
RUN node /tmp/patch-baileys.js && rm /tmp/patch-baileys.js
