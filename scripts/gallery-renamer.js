#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_GALLERY_DIR = path.resolve(__dirname, '..', 'images', 'gallery');
const IMAGE_EXTENSIONS = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
]);
const WEB_GALLERY_EXTENSIONS = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);
const HEX_NAME = /^0x([0-9a-f]{4})$/i;
const MAX_ID = 0xffff;
const WATCH_STABILITY_MS = 2000;

function printHelp() {
  console.log(`Usage: node scripts/gallery-renamer.js [--once] [--dir PATH]

Without --once, the script scans immediately and then watches the gallery by
scanning once per second. A file must stay unchanged for two seconds before it
is renamed. Press Ctrl+C to stop the watcher.

Options:
  --once       Rename current images, refresh index.json, and exit
  --dir PATH   Use a different gallery directory (mainly useful for testing)
  --help       Show this help`);
}

function parseArguments(argv) {
  const options = {
    directory: DEFAULT_GALLERY_DIR,
    once: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];

    if (argument === '--once') {
      options.once = true;
    } else if (argument === '--dir') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw new Error('--dir requires a path');
      }
      options.directory = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argument === '--help' || argument === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function isImage(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function getHexId(filename) {
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  const match = HEX_NAME.exec(stem);
  return match ? Number.parseInt(match[1], 16) : null;
}

function readImageFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && isImage(entry.name))
    .map(entry => entry.name);
}

function getStableNames(directory, filenames, minimumStableMs, observations) {
  if (minimumStableMs === 0 || observations === null) return new Set(filenames);

  const now = Date.now();
  const presentNames = new Set(filenames);
  const stableNames = new Set();

  for (const filename of filenames) {
    try {
      const stats = fs.statSync(path.join(directory, filename));
      const signature = `${stats.size}:${stats.mtimeMs}`;
      const previous = observations.get(filename);

      if (previous && previous.signature === signature) {
        if (now - previous.unchangedSince >= minimumStableMs) {
          stableNames.add(filename);
        }
      } else {
        observations.set(filename, { signature, unchangedSince: now });
      }
    } catch {
      observations.delete(filename);
    }
  }

  for (const filename of observations.keys()) {
    if (!presentNames.has(filename)) observations.delete(filename);
  }

  return stableNames;
}

function readExistingOrder(directory) {
  const indexPath = path.join(directory, 'index.json');

  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(name => typeof name === 'string') : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[gallery] Could not read index.json; using filename order: ${error.message}`);
    }
    return [];
  }
}

function orderForRenaming(directory, filenames) {
  const remaining = new Set(filenames);
  const ordered = [];

  for (const filename of readExistingOrder(directory)) {
    if (remaining.delete(filename)) ordered.push(filename);
  }

  return ordered.concat([...remaining].sort());
}

function allocateId(usedIds, nextId) {
  // Normally append after the current maximum so new images remain last. If a
  // manually named 0xFFFF file exists, wrap once and use the first free gap.
  for (let id = nextId; id <= MAX_ID; id += 1) {
    if (!usedIds.has(id)) return id;
  }
  for (let id = 0; id < Math.min(nextId, MAX_ID + 1); id += 1) {
    if (!usedIds.has(id)) return id;
  }
  throw new Error('No gallery IDs remain in the four-digit range 0x0000-0xFFFF');
}

function compareGalleryFilenames(left, right, existingPositions) {
  const leftId = getHexId(left);
  const rightId = getHexId(right);

  if (leftId !== null && rightId !== null && leftId !== rightId) {
    return leftId - rightId;
  }

  const leftPosition = existingPositions.get(left);
  const rightPosition = existingPositions.get(right);
  if (leftPosition !== undefined || rightPosition !== undefined) {
    if (leftPosition === undefined) return 1;
    if (rightPosition === undefined) return -1;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function writeIndexAtomically(indexPath, contents) {
  const directory = path.dirname(indexPath);
  const temporaryPath = path.join(
    directory,
    `.index.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporaryPath, indexPath);
  } finally {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function refreshIndex(directory, eligibleNames = null) {
  const existingPositions = new Map(
    readExistingOrder(directory).map((filename, index) => [filename, index]),
  );
  const filenames = readImageFiles(directory)
    .filter(filename => WEB_GALLERY_EXTENSIONS.has(path.extname(filename).toLowerCase()))
    .filter(filename => eligibleNames === null || eligibleNames.has(filename))
    .sort((left, right) => compareGalleryFilenames(left, right, existingPositions));
  const nextContents = JSON.stringify(filenames);
  const indexPath = path.join(directory, 'index.json');
  let currentContents = null;

  try {
    currentContents = fs.readFileSync(indexPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (currentContents === nextContents) return false;

  writeIndexAtomically(indexPath, nextContents);
  console.log(`[gallery] Updated index.json (${filenames.length} web images)`);
  return true;
}

function claimDestinationWithoutOverwrite(sourcePath, destinationPath) {
  try {
    // Creating a hard link is an atomic, no-overwrite claim on the destination.
    // It avoids rename() replacing a file created by another watcher in between.
    fs.linkSync(sourcePath, destinationPath);
  } catch (error) {
    const copyFallbackErrors = new Set(['EACCES', 'EINVAL', 'ENOSYS', 'ENOTSUP', 'EPERM', 'EXDEV']);
    if (!copyFallbackErrors.has(error.code)) throw error;

    // Some filesystems do not support hard links. COPYFILE_EXCL keeps the same
    // no-overwrite guarantee; the source is removed only after a complete copy.
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
  }
}

function moveWithoutOverwrite(sourcePath, destinationPath) {
  const stagingDirectory = fs.mkdtempSync(
    path.join(path.dirname(sourcePath), '.gallery-renamer-'),
  );
  const stagingPath = path.join(stagingDirectory, 'image.tmp');
  let cleanupWarning = null;

  try {
    // Moving into a newly-created private directory prevents another process
    // from touching the source while this process claims the final name.
    fs.renameSync(sourcePath, stagingPath);

    try {
      claimDestinationWithoutOverwrite(stagingPath, destinationPath);
    } catch (error) {
      try {
        fs.renameSync(stagingPath, sourcePath);
      } catch (restoreError) {
        error.message += `; source is safe at ${stagingPath}, but restore failed: ${restoreError.message}`;
      }
      throw error;
    }

    try {
      fs.unlinkSync(stagingPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        cleanupWarning = `could not remove staging link ${stagingPath}: ${error.message}`;
      }
    }

    return cleanupWarning;
  } finally {
    try {
      fs.rmdirSync(stagingDirectory);
    } catch {
      // A failed cleanup leaves a hidden, non-gallery staging file rather than
      // risking deletion of the valid destination image.
    }
  }
}

function scanGallery(directory, options = {}) {
  const announceWhenClean = options.announceWhenClean === true;
  const minimumAgeMs = options.minimumAgeMs || 0;
  const observations = options.observations || null;
  const filenames = readImageFiles(directory);
  const ordered = orderForRenaming(directory, filenames);
  const existingIndexNames = new Set(readExistingOrder(directory));
  const eligibleNames = new Set();
  const usedIds = new Set();
  const renameQueue = [];
  let waiting = 0;

  for (const filename of getStableNames(
    directory,
    filenames,
    minimumAgeMs,
    observations,
  )) eligibleNames.add(filename);

  // Keep the first occurrence of an existing ID. A duplicate ID is assigned a
  // fresh one so IDs stay unique even when the extensions differ.
  for (const filename of ordered) {
    const id = getHexId(filename);
    if (id !== null && !usedIds.has(id)) {
      usedIds.add(id);
      if (!eligibleNames.has(filename) && !existingIndexNames.has(filename)) {
        waiting += 1;
      }
    } else if (!eligibleNames.has(filename)) {
      waiting += 1;
    } else {
      renameQueue.push(filename);
    }
  }

  // A failed or not-yet-attempted rename must not publish a brand-new legacy
  // name. Previously indexed legacy files remain visible until their retry.
  for (const filename of renameQueue) eligibleNames.delete(filename);
  for (const filename of existingIndexNames) eligibleNames.add(filename);

  let nextId = usedIds.size === 0 ? 0 : Math.max(...usedIds) + 1;
  let renamed = 0;
  let failed = 0;
  let renamedUnsupported = 0;

  for (const filename of renameQueue) {
    try {
      nextId = allocateId(usedIds, nextId);
    } catch (error) {
      console.error(`[gallery] ${error.message}`);
      failed += renameQueue.length - renamed - failed;
      break;
    }

    const extension = path.extname(filename);
    const nextFilename = `0x${nextId.toString(16).toUpperCase().padStart(4, '0')}${extension}`;
    const sourcePath = path.join(directory, filename);
    const destinationPath = path.join(directory, nextFilename);

    try {
      const cleanupWarning = moveWithoutOverwrite(sourcePath, destinationPath);
      console.log(`[gallery] ${filename} -> ${nextFilename}`);
      if (cleanupWarning) console.warn(`[gallery] ${cleanupWarning}`);
      eligibleNames.delete(filename);
      eligibleNames.add(nextFilename);
      usedIds.add(nextId);
      nextId += 1;
      renamed += 1;

      if (!WEB_GALLERY_EXTENSIONS.has(extension.toLowerCase())) {
        renamedUnsupported += 1;
      }
    } catch (error) {
      // A large file may still be copying. Watch mode retries it on the next scan.
      console.warn(`[gallery] Will retry ${filename}: ${error.message}`);
      failed += 1;
      nextId += 1;
    }
  }

  // Keep files already present in the index while they are being replaced, but
  // do not expose a brand-new file until its write has settled.
  refreshIndex(directory, eligibleNames);

  if (renamedUnsupported > 0) {
    console.warn(
      `[gallery] ${renamedUnsupported} image(s) were named but omitted from index.json; `
      + 'convert them to JPG, PNG, GIF, or WebP, or extend the site format allowlist.',
    );
  }

  if (waiting > 0 && announceWhenClean) {
    console.log(`[gallery] Waiting for ${waiting} new image(s) to finish copying.`);
  } else if (announceWhenClean && renamed === 0 && failed === 0) {
    console.log('[gallery] All image names are already normalized.');
  }

  return { failed, renamed, waiting };
}

function main() {
  let options;

  try {
    options = parseArguments(process.argv.slice(2));
    if (!fs.statSync(options.directory).isDirectory()) {
      throw new Error(`Not a directory: ${options.directory}`);
    }
  } catch (error) {
    console.error(`[gallery] ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const observations = new Map();
  if (options.once) {
    let firstScan = true;
    const runOnceWhenStable = () => {
      const result = scanGallery(options.directory, {
        announceWhenClean: firstScan,
        minimumAgeMs: WATCH_STABILITY_MS,
        observations,
      });
      firstScan = false;

      if (result.waiting > 0) {
        setTimeout(runOnceWhenStable, 500);
      } else if (result.failed > 0) {
        process.exitCode = 1;
      }
    };

    runOnceWhenStable();
    return;
  }

  scanGallery(options.directory, {
    announceWhenClean: true,
    minimumAgeMs: WATCH_STABILITY_MS,
    observations,
  });

  console.log(`[gallery] Watching ${options.directory}`);
  console.log('[gallery] Add images at any time; press Ctrl+C to stop.');

  setInterval(() => {
    try {
      scanGallery(options.directory, {
        minimumAgeMs: WATCH_STABILITY_MS,
        observations,
      });
    } catch (error) {
      console.error(`[gallery] Scan failed: ${error.message}`);
    }
  }, 1000);
}

main();
