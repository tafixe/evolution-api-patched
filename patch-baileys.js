const fs = require('fs');
const path = require('path');

// Try multiple possible base paths
const possibleBases = [
  '/evolution/node_modules/@whiskeysockets/baileys/lib',
  '/app/node_modules/@whiskeysockets/baileys/lib',
  '/home/node/node_modules/@whiskeysockets/baileys/lib',
];

let BASE;
for (const p of possibleBases) {
  if (fs.existsSync(p)) {
    BASE = p;
    break;
  }
}

if (!BASE) {
  const { execSync } = require('child_process');
  const result = execSync('find / -path "*/baileys/lib/Defaults/index.js" -maxdepth 8 2>/dev/null').toString().trim();
  if (result) {
    BASE = path.dirname(path.dirname(result));
    console.log(`Found Baileys at: ${BASE}`);
  } else {
    console.error('ERROR: Could not find Baileys lib directory');
    process.exit(1);
  }
}

console.log(`Patching Baileys at: ${BASE}`);

function patchFile(relPath, patches) {
  const filePath = path.join(BASE, relPath);
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [search, replace, description] of patches) {
    if (content.includes(search)) {
      content = content.replace(search, replace);
      console.log(`  [OK] ${description}`);
    } else {
      console.error(`  [FAIL] Could not find pattern for: ${description}`);
      console.error(`  Pattern: ${search.substring(0, 100)}...`);
      process.exit(1);
    }
  }
  fs.writeFileSync(filePath, content);
  console.log(`  Saved: ${relPath}`);
}

// =============================================
// PATCH 1: Defaults/index.js
// =============================================
console.log('\n--- Patch 1: Defaults/index.js ---');
const defaultsPath = path.join(BASE, 'Defaults/index.js');
let defaultsContent = fs.readFileSync(defaultsPath, 'utf8');

const newsletterMap = `
export const NEWSLETTER_MEDIA_PATH_MAP = {
    image: '/newsletter/newsletter-image',
    video: '/newsletter/newsletter-video',
    document: '/newsletter/newsletter-document',
    audio: '/newsletter/newsletter-audio',
    sticker: '/newsletter/newsletter-image',
    'thumbnail-link': '/newsletter/newsletter-image'
};
`;

if (!defaultsContent.includes('NEWSLETTER_MEDIA_PATH_MAP')) {
  defaultsContent = defaultsContent.replace(
    'export const MEDIA_HKDF_KEY_MAPPING',
    newsletterMap + 'export const MEDIA_HKDF_KEY_MAPPING'
  );
  fs.writeFileSync(defaultsPath, defaultsContent);
  console.log('  [OK] Added NEWSLETTER_MEDIA_PATH_MAP');
} else {
  console.log('  [SKIP] Already exists');
}

// =============================================
// PATCH 2: Socket/messages-send.js
// =============================================
console.log('\n--- Patch 2: Socket/messages-send.js ---');
patchFile('Socket/messages-send.js', [
  [
    "tag: 'plaintext',\n                    attrs: {},",
    "tag: 'plaintext',\n                    attrs: mediaType ? { mediatype: mediaType } : {},",
    'Add mediatype to plaintext attrs'
  ]
]);

// =============================================
// PATCH 3: Utils/messages-media.js
// =============================================
console.log('\n--- Patch 3: Utils/messages-media.js ---');
patchFile('Utils/messages-media.js', [
  [
    'MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP',
    'MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP',
    'Import NEWSLETTER_MEDIA_PATH_MAP'
  ],
  [
    '{ mediaType, fileEncSha256B64, timeoutMs }',
    '{ mediaType, fileEncSha256B64, timeoutMs, newsletter }',
    'Add newsletter parameter'
  ],
  [
    'const url = `https://${hostname}${MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;',
    'const mediaPath = (newsletter ? NEWSLETTER_MEDIA_PATH_MAP[mediaType] : undefined) || MEDIA_PATH_MAP[mediaType];\n            const url = `https://${hostname}${mediaPath}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}` + (newsletter ? \'&server_thumb_gen=1\' : \'\');',
    'Use newsletter upload paths + server_thumb_gen'
  ],
  [
    'mediaUrl: result.url,',
    'mediaUrl: result.url || result.direct_path,',
    'Fallback mediaUrl to direct_path'
  ],
  [
    'ts: result.ts',
    'ts: result.ts,\n                        thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path,\n                        thumbnailSha256: result.thumbnail_info?.thumbnail_sha256',
    'Add thumbnail info to return'
  ]
]);

// =============================================
// PATCH 4: Utils/messages.js
// =============================================
console.log('\n--- Patch 4: Utils/messages.js ---');
patchFile('Utils/messages.js', [
  [
    'const { mediaUrl, directPath } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs\n        });',
    'const { directPath, thumbnailDirectPath, thumbnailSha256 } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs,\n            newsletter: true\n        });',
    'Pass newsletter:true and destructure thumbnail fields'
  ],
  [
    "url: mediaUrl,\n                directPath,\n                fileSha256,\n                fileLength,\n                ...uploadData,\n                media: undefined",
    "directPath,\n                fileSha256,\n                fileEncSha256: fileSha256,\n                fileLength,\n                thumbnailDirectPath,\n                thumbnailSha256: thumbnailSha256 ? Buffer.from(thumbnailSha256, 'base64') : undefined,\n                ...uploadData,\n                media: undefined",
    'Remove url, add fileEncSha256 and thumbnail fields for newsletter'
  ]
]);

// =============================================
// PATCH 5: Evolution API - whatsapp.baileys.service.js (MINIFIED)
// Pass JID to prepareWAMessageMedia for newsletter detection
// and bypass forward for newsletters
// =============================================
console.log('\n--- Patch 5: Evolution API whatsapp.baileys.service.js ---');

const possibleEvoPaths = [
  '/evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js',
  '/app/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js',
];

let evoPath;
for (const p of possibleEvoPaths) {
  if (fs.existsSync(p)) { evoPath = p; break; }
}
if (!evoPath) {
  const { execSync } = require('child_process');
  const r = execSync('find / -name "whatsapp.baileys.service.js" -path "*/dist/*" -maxdepth 8 2>/dev/null').toString().trim().split('\n')[0];
  if (r) evoPath = r;
}
if (!evoPath) { console.error('  [FAIL] Could not find Evolution API service file'); process.exit(1); }

console.log(`  Found at: ${evoPath}`);
let evoContent = fs.readFileSync(evoPath, 'utf8');

// 5a: Pass jid to prepareWAMessageMedia (minified: {upload:this.client.waUploadToServer})
const uploadPat = '{upload:this.client.waUploadToServer}';
if (evoContent.includes(uploadPat)) {
  evoContent = evoContent.replace(uploadPat, '{upload:this.client.waUploadToServer,jid:this._newsletterJid}');
  console.log('  [OK] Pass jid to prepareWAMessageMedia');
} else {
  console.error('  [FAIL] upload pattern not found');
  process.exit(1);
}

// 5b: In mediaMessage method, store destination JID before calling prepareMediaMessage
// Minified pattern: let n=await this.prepareMediaMessage(i);return await this.sendMessageWithTyping(e.number
// We use regex to handle variable name variations
const mediaCallRe = /let (\w)=await this\.prepareMediaMessage\((\w)\);return await this\.sendMessageWithTyping\((\w)\.number/g;
let mediaCallMatch;
let mediaCallCount = 0;
// Reset and replace all occurrences (there may be 2: one per class)
const mediaCallMatches = [...evoContent.matchAll(mediaCallRe)];
console.log(`  [INFO] Found ${mediaCallMatches.length} mediaMessage call patterns`);
for (const m of mediaCallMatches) {
  const [full, varN, varI, varE] = m;
  const replacement = `this._newsletterJid=${varE}.number;let ${varN}=await this.prepareMediaMessage(${varI});this._newsletterJid=null;return await this.sendMessageWithTyping(${varE}.number`;
  evoContent = evoContent.replace(full, replacement);
  mediaCallCount++;
  console.log(`  [OK] Store newsletter JID before prepareMediaMessage (vars: ${varN},${varI},${varE})`);
}
if (mediaCallCount === 0) {
  console.error('  [FAIL] Could not find mediaMessage call pattern');
  process.exit(1);
}

// 5c: For newsletter messages, bypass forward pattern - send content directly
// Minified: forward:{key:{remoteJid:this.instance.wuid,fromMe:!0},message:t}
const fwdRe = /forward:\{key:\{remoteJid:this\.instance\.wuid,fromMe:!0\},message:(\w)\}/g;
const fwdMatches = [...evoContent.matchAll(fwdRe)];
console.log(`  [INFO] Found ${fwdMatches.length} forward patterns`);
for (const m of fwdMatches) {
  const [full, msgVar] = m;
  // Replace forward with: if newsletter, send content directly; else use forward
  const replacement = `...(e.endsWith("@newsletter")?${msgVar}:{forward:{key:{remoteJid:this.instance.wuid,fromMe:!0},message:${msgVar}}})`;
  evoContent = evoContent.replace(full, replacement);
  console.log(`  [OK] Newsletter bypasses forward (msg var: ${msgVar})`);
}

fs.writeFileSync(evoPath, evoContent);
console.log(`  Saved: ${evoPath}`);

console.log('\n=== All patches applied successfully! ===\n');
