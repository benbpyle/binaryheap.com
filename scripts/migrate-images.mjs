#!/usr/bin/env node

/**
 * migrate-images.mjs
 *
 * Scans all markdown files in src/content/blog/ for image URLs pointing to
 * binaryheap.com/wp-content/uploads/ (and WordPress CDN variants like i0.wp.com),
 * downloads every image to public/images/ with a flattened structure, and rewrites
 * the URLs in the markdown files.
 *
 * Handles:
 * - Both http:// and https:// URLs
 * - URL-encoded characters in filenames
 * - Various image formats (png, jpg, jpeg, gif, webp, svg, avif)
 * - Markdown image syntax ![alt](url)
 * - Linked images [![alt](url)](url)
 * - Bare URLs and hyperlink-referenced images [text](image-url)
 * - HTML <img> tags
 * - Duplicate filenames from different upload paths (prefixed with incrementing number)
 */

import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join, basename, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BLOG_DIR = join(ROOT, "src", "data", "blog");
const IMAGES_DIR = join(ROOT, "public", "images");

// Match WordPress upload URLs from binaryheap.com or WordPress CDN
const WP_URL_PATTERN =
  /https?:\/\/(?:(?:i[0-9]\.wp\.com\/)?binaryheap\.com)\/wp-content\/uploads\/[^\s)"\]>]+/g;

async function main() {
  console.log("=== WordPress Image Migration ===\n");
  console.log(`Blog dir:   ${BLOG_DIR}`);
  console.log(`Images dir: ${IMAGES_DIR}\n`);

  // Ensure output directory exists
  await mkdir(IMAGES_DIR, { recursive: true });

  // 1. Gather all markdown files
  const files = (await readdir(BLOG_DIR)).filter((f) => f.endsWith(".md"));
  console.log(`Found ${files.length} markdown files to scan.\n`);

  // 2. Collect every unique WordPress image URL across all files
  const urlToFiles = new Map(); // url -> Set of filenames that reference it
  const fileContents = new Map(); // filepath -> content

  for (const file of files) {
    const filepath = join(BLOG_DIR, file);
    const content = await readFile(filepath, "utf-8");
    fileContents.set(filepath, content);

    const matches = content.match(WP_URL_PATTERN);
    if (matches) {
      for (const url of matches) {
        if (!urlToFiles.has(url)) {
          urlToFiles.set(url, new Set());
        }
        urlToFiles.get(url).add(file);
      }
    }
  }

  const uniqueUrls = [...urlToFiles.keys()];
  console.log(`Found ${uniqueUrls.length} unique WordPress image URLs.\n`);

  if (uniqueUrls.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  // 3. Build download plan: resolve filenames with collision handling
  const usedFilenames = new Set();
  const urlToLocalFilename = new Map(); // original url -> local filename

  for (const url of uniqueUrls) {
    // Decode URL-encoded characters, then extract just the filename
    const decoded = decodeURIComponent(new URL(url).pathname);
    let filename = basename(decoded);

    // Sanitize: replace any remaining problematic chars
    filename = filename.replace(/[^a-zA-Z0-9._@-]/g, "_");

    // Handle collisions
    if (usedFilenames.has(filename.toLowerCase())) {
      const ext = extname(filename);
      const stem = filename.slice(0, -ext.length || undefined);
      let counter = 1;
      let candidate;
      do {
        candidate = `${counter}_${stem}${ext}`;
        counter++;
      } while (usedFilenames.has(candidate.toLowerCase()));
      filename = candidate;
    }

    usedFilenames.add(filename.toLowerCase());
    urlToLocalFilename.set(url, filename);
  }

  // 4. Download images (with concurrency limit)
  const CONCURRENCY = 8;
  let downloaded = 0;
  let failed = 0;
  const failures = [];

  async function downloadImage(url, filename) {
    const dest = join(IMAGES_DIR, filename);

    // Skip if already downloaded (idempotent re-runs)
    try {
      await access(dest);
      console.log(`  SKIP (exists): ${filename}`);
      downloaded++;
      return true;
    } catch {
      // File doesn't exist, proceed with download
    }

    // Try https first, then http if the original was http
    const urls = [url];
    if (url.startsWith("http://")) {
      urls.push(url.replace("http://", "https://"));
    } else {
      urls.push(url.replace("https://", "http://"));
    }

    for (const tryUrl of urls) {
      try {
        const res = await fetch(tryUrl, {
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; ImageMigration/1.0)",
          },
        });
        if (!res.ok) {
          continue;
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(dest, buffer);
        console.log(`  OK: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
        downloaded++;
        return true;
      } catch (err) {
        // Try next URL variant
      }
    }

    console.error(`  FAIL: ${url}`);
    failures.push(url);
    failed++;
    return false;
  }

  console.log("Downloading images...\n");

  // Process in batches
  const entries = [...urlToLocalFilename.entries()];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(([url, filename]) => downloadImage(url, filename)));
  }

  console.log(
    `\nDownload complete: ${downloaded} succeeded, ${failed} failed out of ${uniqueUrls.length} total.\n`
  );

  if (failures.length > 0) {
    console.log("Failed URLs:");
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    console.log();
  }

  // 5. Rewrite URLs in markdown files
  console.log("Rewriting URLs in markdown files...\n");
  let filesModified = 0;
  let replacementsMade = 0;

  for (const [filepath, content] of fileContents) {
    let newContent = content;
    let fileReplacements = 0;

    // Replace all WordPress URLs with local paths
    newContent = newContent.replace(WP_URL_PATTERN, (match) => {
      const localFilename = urlToLocalFilename.get(match);
      if (localFilename) {
        fileReplacements++;
        return `/images/${localFilename}`;
      }
      return match; // Should not happen, but be safe
    });

    if (fileReplacements > 0) {
      await writeFile(filepath, newContent, "utf-8");
      const file = basename(filepath);
      console.log(`  ${file}: ${fileReplacements} replacement(s)`);
      filesModified++;
      replacementsMade += fileReplacements;
    }
  }

  console.log(
    `\nRewrite complete: ${replacementsMade} URLs replaced across ${filesModified} files.\n`
  );

  // 6. Summary
  console.log("=== Migration Summary ===");
  console.log(`  Markdown files scanned:  ${files.length}`);
  console.log(`  Unique image URLs found: ${uniqueUrls.length}`);
  console.log(`  Images downloaded:       ${downloaded}`);
  console.log(`  Download failures:       ${failed}`);
  console.log(`  Files modified:          ${filesModified}`);
  console.log(`  Total URL replacements:  ${replacementsMade}`);
  console.log();

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
