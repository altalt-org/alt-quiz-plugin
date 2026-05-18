import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, readFile, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "dist");
const releaseDir = join(root, "release");
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
);
const zipPath = join(releaseDir, `${manifest.id}-${manifest.version}.zip`);

await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

// Minimal STORE-only zip writer (no compression), so we don't need a runtime
// dep. Good enough for shipping bundled JS/HTML/CSS.
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

const fileEntries = [];
const localParts = [];
let offset = 0;

for await (const filePath of walk(distDir)) {
  const data = await readFile(filePath);
  const name = relative(distDir, filePath).split("/").join("/");
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const localHeader = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(data.length),
    u32(data.length),
    u16(nameBuf.length),
    u16(0),
    nameBuf,
  ]);
  localParts.push(localHeader, data);
  fileEntries.push({
    name: nameBuf,
    crc,
    size: data.length,
    offset,
  });
  offset += localHeader.length + data.length;
}

const centralParts = [];
let centralSize = 0;
for (const entry of fileEntries) {
  const central = Buffer.concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(entry.crc),
    u32(entry.size),
    u32(entry.size),
    u16(entry.name.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(entry.offset),
    entry.name,
  ]);
  centralParts.push(central);
  centralSize += central.length;
}

const eocd = Buffer.concat([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(fileEntries.length),
  u16(fileEntries.length),
  u32(centralSize),
  u32(offset),
  u16(0),
]);

const output = createWriteStream(zipPath);
for (const part of localParts) output.write(part);
for (const part of centralParts) output.write(part);
output.write(eocd);
await new Promise((resolve, reject) => {
  output.end(resolve);
  output.on("error", reject);
});

const finalStat = await stat(zipPath);
console.log(`Wrote ${relative(root, zipPath)} (${finalStat.size} bytes)`);
