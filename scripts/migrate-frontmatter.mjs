#!/usr/bin/env node

/**
 * migrate-frontmatter.mjs
 *
 * Transforms frontmatter in all blog posts from the old binaryheap.com format
 * to AstroPaper's expected format:
 *   - date: YYYY-MM-DD → pubDatetime: YYYY-MM-DDT00:00:00Z
 *   - Add author: "Benjamen Pyle"
 *   - Remove heroImage field
 *   - Lowercase + deduplicate tags
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const BLOG_DIR = join(ROOT, "src", "data", "blog");

async function main() {
  const files = (await readdir(BLOG_DIR)).filter(f => f.endsWith(".md"));
  console.log(`Found ${files.length} markdown files to migrate.\n`);

  let modified = 0;

  for (const file of files) {
    const filepath = join(BLOG_DIR, file);
    const content = await readFile(filepath, "utf-8");

    // Split frontmatter from body
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      console.warn(`  SKIP (no frontmatter): ${file}`);
      continue;
    }

    const [, frontmatterRaw, body] = match;
    const lines = frontmatterRaw.split("\n");

    const newLines = [];
    let hasAuthor = false;
    let hasPubDatetime = false;
    let inTags = false;
    const tags = [];

    for (const line of lines) {
      // Detect tag block
      if (line.match(/^tags:\s*$/)) {
        inTags = true;
        continue;
      }

      if (inTags) {
        const tagMatch = line.match(/^\s+-\s+(.+)$/);
        if (tagMatch) {
          tags.push(tagMatch[1].trim().toLowerCase());
          continue;
        } else {
          // End of tags block — flush deduplicated tags
          inTags = false;
          const uniqueTags = [...new Set(tags)];
          if (uniqueTags.length > 0) {
            newLines.push("tags:");
            for (const tag of uniqueTags) {
              newLines.push(`  - ${tag}`);
            }
          } else {
            newLines.push("tags: []");
          }
        }
      }

      // Transform date → pubDatetime
      const dateMatch = line.match(/^date:\s+(\d{4}-\d{2}-\d{2})$/);
      if (dateMatch) {
        newLines.push(`pubDatetime: ${dateMatch[1]}T00:00:00Z`);
        hasPubDatetime = true;
        continue;
      }

      // Remove heroImage
      if (line.match(/^heroImage:/)) {
        continue;
      }

      // Track if author already exists
      if (line.match(/^author:/)) {
        hasAuthor = true;
      }

      // Track if pubDatetime already exists
      if (line.match(/^pubDatetime:/)) {
        hasPubDatetime = true;
      }

      newLines.push(line);
    }

    // Flush tags if file ended while still in tags block
    if (inTags) {
      const uniqueTags = [...new Set(tags)];
      if (uniqueTags.length > 0) {
        newLines.push("tags:");
        for (const tag of uniqueTags) {
          newLines.push(`  - ${tag}`);
        }
      } else {
        newLines.push("tags: []");
      }
    }

    // Add author if not present — insert after title
    if (!hasAuthor) {
      const titleIdx = newLines.findIndex(l => l.startsWith("title:"));
      if (titleIdx !== -1) {
        newLines.splice(titleIdx + 1, 0, 'author: "Benjamen Pyle"');
      } else {
        newLines.unshift('author: "Benjamen Pyle"');
      }
    }

    const newFrontmatter = newLines.join("\n");
    const newContent = `---\n${newFrontmatter}\n---\n${body}`;

    if (newContent !== content) {
      await writeFile(filepath, newContent, "utf-8");
      console.log(`  OK: ${file}`);
      modified++;
    } else {
      console.log(`  UNCHANGED: ${file}`);
    }
  }

  console.log(`\nDone! Modified ${modified} of ${files.length} files.`);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
