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

console.log('\n=== All patches applied successfully! ===\n');
