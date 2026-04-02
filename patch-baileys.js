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
  // Search for it
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
      console.error(`  Pattern: ${search.substring(0, 80)}...`);
      process.exit(1);
    }
  }
  fs.writeFileSync(filePath, content);
  console.log(`  Saved: ${relPath}`);
}

// =============================================
// PATCH 1: Defaults/index.js
// Add NEWSLETTER_MEDIA_PATH_MAP after MEDIA_PATH_MAP
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
  // Add after MEDIA_HKDF_KEY_MAPPING declaration
  defaultsContent = defaultsContent.replace(
    'export const MEDIA_HKDF_KEY_MAPPING',
    newsletterMap + 'export const MEDIA_HKDF_KEY_MAPPING'
  );
  fs.writeFileSync(defaultsPath, defaultsContent);
  console.log('  [OK] Added NEWSLETTER_MEDIA_PATH_MAP');
} else {
  console.log('  [SKIP] NEWSLETTER_MEDIA_PATH_MAP already exists');
}

// =============================================
// PATCH 2: Socket/messages-send.js
// Add mediatype attribute to plaintext node for newsletters
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
// Use newsletter-specific upload paths
// =============================================
console.log('\n--- Patch 3: Utils/messages-media.js ---');
patchFile('Utils/messages-media.js', [
  // 3a: Import NEWSLETTER_MEDIA_PATH_MAP
  [
    'MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP',
    'MEDIA_HKDF_KEY_MAPPING, MEDIA_PATH_MAP, NEWSLETTER_MEDIA_PATH_MAP',
    'Import NEWSLETTER_MEDIA_PATH_MAP'
  ],
  // 3b: Add newsletter parameter
  [
    '{ mediaType, fileEncSha256B64, timeoutMs }',
    '{ mediaType, fileEncSha256B64, timeoutMs, newsletter }',
    'Add newsletter parameter'
  ],
  // 3c: Use newsletter paths for URL construction
  [
    'const url = `https://${hostname}${MEDIA_PATH_MAP[mediaType]}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}`;',
    'const mediaPath = (newsletter ? NEWSLETTER_MEDIA_PATH_MAP[mediaType] : undefined) || MEDIA_PATH_MAP[mediaType];\n            const url = `https://${hostname}${mediaPath}/${fileEncSha256B64}?auth=${auth}&token=${fileEncSha256B64}` + (newsletter ? \'&server_thumb_gen=1\' : \'\');',
    'Use newsletter upload paths + server_thumb_gen'
  ],
  // 3d: Fallback mediaUrl to direct_path
  [
    'mediaUrl: result.url,',
    'mediaUrl: result.url || result.direct_path,',
    'Fallback mediaUrl to direct_path'
  ],
  // 3e: Add thumbnail info to return
  [
    'ts: result.ts',
    'ts: result.ts,\n                        thumbnailDirectPath: result.thumbnail_info?.thumbnail_direct_path,\n                        thumbnailSha256: result.thumbnail_info?.thumbnail_sha256',
    'Add thumbnail info to return'
  ]
]);

// =============================================
// PATCH 4: Utils/messages.js
// Pass newsletter:true and handle thumbnail for newsletter uploads
// =============================================
console.log('\n--- Patch 4: Utils/messages.js ---');
patchFile('Utils/messages.js', [
  // 4a: In newsletter branch - destructure thumbnail fields from upload result
  [
    'const { mediaUrl, directPath } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs\n        });',
    'const { directPath, thumbnailDirectPath, thumbnailSha256 } = await options.upload(filePath, {\n            fileEncSha256B64: fileSha256B64,\n            mediaType: mediaType,\n            timeoutMs: options.mediaUploadTimeoutMs,\n            newsletter: true\n        });',
    'Pass newsletter:true and destructure thumbnail fields'
  ],
  // 4b: In newsletter branch - remove url, add fileEncSha256=fileSha256 and thumbnail fields
  [
    "url: mediaUrl,\n                directPath,\n                fileSha256,\n                fileLength,\n                ...uploadData,\n                media: undefined",
    "directPath,\n                fileSha256,\n                fileEncSha256: fileSha256,\n                fileLength,\n                thumbnailDirectPath,\n                thumbnailSha256: thumbnailSha256 ? Buffer.from(thumbnailSha256, 'base64') : undefined,\n                ...uploadData,\n                media: undefined",
    'Remove url, add fileEncSha256 and thumbnail fields for newsletter'
  ]
]);

// =============================================
// PATCH 5: Evolution API - whatsapp.baileys.service.js
// Pass JID to prepareWAMessageMedia for newsletter detection
// =============================================
console.log('\n--- Patch 5: Evolution API whatsapp.baileys.service.js ---');

// Find the Evolution API compiled service file
const possibleEvoPaths = [
  '/evolution/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js',
  '/app/dist/api/integrations/channel/whatsapp/whatsapp.baileys.service.js',
];

let evoPath;
for (const p of possibleEvoPaths) {
  if (fs.existsSync(p)) {
    evoPath = p;
    break;
  }
}

if (!evoPath) {
  const { execSync } = require('child_process');
  const result = execSync('find / -name "whatsapp.baileys.service.js" -path "*/dist/*" -maxdepth 8 2>/dev/null').toString().trim().split('\n')[0];
  if (result) {
    evoPath = result;
  }
}

if (!evoPath) {
  console.error('  [FAIL] Could not find Evolution API service file');
  process.exit(1);
}

console.log(`  Found Evolution API at: ${evoPath}`);
let evoContent = fs.readFileSync(evoPath, 'utf8');

// 5a: Patch prepareMediaMessage to accept and pass destinationJid
// Find: { upload: this.client.waUploadToServer }
// Replace: { upload: this.client.waUploadToServer, jid: destinationJid }
// Also need to add destinationJid parameter to the method

// First, find the prepareMediaMessage method signature and add jid param
const prepareMediaOld = 'async prepareMediaMessage(mediaMessage)';
const prepareMediaNew = 'async prepareMediaMessage(mediaMessage, destinationJid)';
if (evoContent.includes(prepareMediaOld)) {
  evoContent = evoContent.replace(prepareMediaOld, prepareMediaNew);
  console.log('  [OK] Added destinationJid parameter to prepareMediaMessage');
} else {
  console.log('  [WARN] prepareMediaMessage signature not found, trying alternative patterns');
  // Try compiled patterns
  const alt1 = 'prepareMediaMessage(mediaMessage)';
  if (evoContent.includes(alt1)) {
    evoContent = evoContent.replace(alt1, 'prepareMediaMessage(mediaMessage, destinationJid)');
    console.log('  [OK] Added destinationJid parameter (alt pattern)');
  }
}

// 5b: Pass jid to prepareWAMessageMedia options
const uploadOld1 = '{ upload: this.client.waUploadToServer }';
const uploadNew1 = '{ upload: this.client.waUploadToServer, jid: destinationJid }';
if (evoContent.includes(uploadOld1)) {
  evoContent = evoContent.replace(uploadOld1, uploadNew1);
  console.log('  [OK] Pass jid to prepareWAMessageMedia');
} else {
  // Try alternative patterns (compiled code may vary)
  const alt2 = 'upload: this.client.waUploadToServer';
  const count = (evoContent.match(new RegExp(alt2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  console.log(`  [INFO] Found ${count} occurrences of upload pattern`);
  if (count > 0) {
    // Replace the first occurrence that's part of prepareWAMessageMedia call
    evoContent = evoContent.replace(
      /(\bprepareWAMessageMedia\b[^)]*\{[^}]*upload:\s*this\.client\.waUploadToServer)\s*\}/,
      '$1, jid: destinationJid }'
    );
    console.log('  [OK] Pass jid via regex pattern');
  }
}

// 5c: In mediaMessage method, pass data.number to prepareMediaMessage
const mediaCallOld = 'await this.prepareMediaMessage(mediaData)';
const mediaCallNew = 'await this.prepareMediaMessage(mediaData, data.number)';
if (evoContent.includes(mediaCallOld)) {
  evoContent = evoContent.replace(mediaCallOld, mediaCallNew);
  console.log('  [OK] Pass data.number to prepareMediaMessage');
} else {
  console.log('  [WARN] mediaMessage call pattern not found, trying alternatives');
  const alt3 = 'this.prepareMediaMessage(mediaData)';
  if (evoContent.includes(alt3)) {
    evoContent = evoContent.replace(alt3, 'this.prepareMediaMessage(mediaData, data.number)');
    console.log('  [OK] Pass data.number (alt pattern)');
  }
}

// 5d: For newsletter messages, don't use forward pattern - send directly
// Find the sendMessageWithTyping call and add newsletter-aware logic
// The key issue: forward messages skip re-upload
// We need to detect newsletter JID and send content directly instead of forwarding
const forwardPattern = "forward: { key: { remoteJid: this.instance.wuid, fromMe: true }, message }";
if (evoContent.includes(forwardPattern)) {
  // We need to wrap the send logic to check if it's a newsletter
  // For newsletters, send the message content directly instead of forwarding
  const sendBlockOld = `{
                forward: { key: { remoteJid: this.instance.wuid, fromMe: true }, message },`;
  const sendBlockNew = `sender.endsWith('@newsletter') ? message : {
                forward: { key: { remoteJid: this.instance.wuid, fromMe: true }, message },`;

  if (evoContent.includes(sendBlockOld)) {
    evoContent = evoContent.replace(sendBlockOld, sendBlockNew);
    console.log('  [OK] Newsletter sends content directly instead of forwarding');
  } else {
    console.log('  [WARN] Could not find exact forward block pattern');
  }
}

fs.writeFileSync(evoPath, evoContent);
console.log(`  Saved: ${evoPath}`);

console.log('\n=== All patches applied successfully! ===\n');
