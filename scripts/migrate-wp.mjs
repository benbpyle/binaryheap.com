#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseStringPromise } from 'xml2js';
import TurndownService from 'turndown';

const OUTPUT_DIR = resolve(import.meta.dirname, '..', 'src', 'data', 'blog');

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeYaml(str) {
  // Collapse newlines into spaces first — YAML frontmatter values should be single-line
  const cleaned = str.replace(/\s*\n\s*/g, ' ').trim();
  if (/[:#\[\]{}&*!|>'"`,@%\n]/.test(cleaned) || cleaned.startsWith(' ') || cleaned.endsWith(' ')) {
    return `"${cleaned.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return cleaned;
}

function buildFrontmatter(post) {
  const lines = ['---'];
  lines.push(`title: ${escapeYaml(post.title)}`);
  lines.push(`author: "Benjamen Pyle"`);
  lines.push(`description: ${escapeYaml(post.description)}`);
  lines.push(`pubDatetime: ${post.date}T00:00:00Z`);

  // Lowercase + deduplicate tags
  const uniqueTags = [...new Set(post.tags.map(t => t.toLowerCase()))];
  if (uniqueTags.length > 0) {
    lines.push('tags:');
    for (const tag of uniqueTags) {
      lines.push(`  - ${escapeYaml(tag)}`);
    }
  } else {
    lines.push('tags: []');
  }

  lines.push(`draft: ${post.draft}`);
  lines.push('---');
  return lines.join('\n');
}

function extractDescription(excerpt, markdownContent) {
  if (excerpt && excerpt.trim()) {
    // Strip any remaining HTML/markdown and truncate
    const clean = excerpt
      .replace(/<[^>]+>/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .trim();
    if (clean) return clean.slice(0, 200);
  }

  // Fall back to first paragraph of content
  const firstPara = markdownContent
    .split(/\n\n/)
    .find((p) => p.trim() && !p.startsWith('#') && !p.startsWith('!['));

  if (firstPara) {
    const clean = firstPara.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
    return clean.slice(0, 200);
  }

  return 'No description available.';
}

function extractTags(item) {
  const tags = new Set();
  const raw = item.category;
  if (!raw) return [];
  const categories = Array.isArray(raw) ? raw : [raw];

  for (const cat of categories) {
    // xml2js can return strings or objects with _ for text and $ for attributes
    if (typeof cat === 'string') {
      tags.add(cat);
    } else if (cat._) {
      tags.add(cat._);
    } else if (cat.$ && cat.$.nicename) {
      tags.add(cat.$.nicename);
    }
  }

  return [...tags].filter(Boolean);
}

async function main() {
  const xmlPath = process.argv[2];

  if (!xmlPath) {
    console.error('Usage: node scripts/migrate-wp.mjs <path-to-wp-export.xml>');
    process.exit(1);
  }

  const resolvedPath = resolve(xmlPath);

  if (!existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Reading WordPress export from: ${resolvedPath}`);
  const xml = readFileSync(resolvedPath, 'utf-8');

  const result = await parseStringPromise(xml, {
    explicitArray: false,
    trim: true,
  });

  const channel = result.rss?.channel;
  if (!channel) {
    console.error('Invalid WordPress export: missing rss > channel');
    process.exit(1);
  }

  // Ensure items is an array
  let items = channel.item;
  if (!items) {
    console.error('No items found in the export.');
    process.exit(1);
  }
  if (!Array.isArray(items)) {
    items = [items];
  }

  // Filter to published posts only
  const posts = items.filter((item) => {
    const postType = item['wp:post_type'];
    const status = item['wp:status'];
    return postType === 'post' && (status === 'publish' || status === 'draft');
  });

  if (posts.length === 0) {
    console.log('No posts found in the export.');
    return;
  }

  console.log(`Found ${posts.length} post(s) to migrate.`);

  // Set up Turndown
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });

  // Map Enlighter language names to markdown fence labels
  const langMap = {
    golang: 'go',
    generic: '',
    csharp: 'csharp',
    js: 'javascript',
    swift: 'swift',
    typescript: 'typescript',
    json: 'json',
    bash: 'bash',
    yaml: 'yaml',
    rust: 'rust',
    dockerfile: 'dockerfile',
    html: 'html',
  };

  // Rule: Enlighter syntax highlighter plugin (<pre class="EnlighterJSRAW" data-enlighter-language="...">)
  turndown.addRule('enlighter', {
    filter(node) {
      return (
        node.nodeName === 'PRE' &&
        node.getAttribute('class')?.includes('EnlighterJSRAW')
      );
    },
    replacement(content, node) {
      const rawLang = node.getAttribute('data-enlighter-language') || '';
      const lang = langMap[rawLang] ?? rawLang;
      const code = node.textContent || '';
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    },
  });

  // Rule: wp-block-code (<pre class="wp-block-code"><code>...</code></pre>)
  turndown.addRule('wpBlockCode', {
    filter(node) {
      return (
        node.nodeName === 'PRE' &&
        (node.getAttribute('class')?.includes('wp-block-code') ||
         node.getAttribute('class')?.includes('wp-block-preformatted'))
      );
    },
    replacement(content, node) {
      const codeEl = node.querySelector('code');
      const code = (codeEl || node).textContent || '';
      // Try to detect language from class like "language-go"
      const codeClass = codeEl?.getAttribute('class') || '';
      const langMatch = codeClass.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : '';
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    },
  });

  // Rule: Keep WordPress HTML comments stripped (they leak through as-is)
  turndown.addRule('wpComments', {
    filter(node) {
      return node.nodeType === 8; // Comment node
    },
    replacement() {
      return '';
    },
  });

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const usedSlugs = new Set();
  let successCount = 0;

  for (const item of posts) {
    const title = (item.title || 'Untitled').trim();
    const rawDate = item['wp:post_date'] || item.pubDate || '';
    const status = item['wp:status'];
    const isDraft = status === 'draft';

    // Parse date
    let date;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().split('T')[0];
      }
    }
    if (!date) {
      date = new Date().toISOString().split('T')[0];
      console.warn(`  Warning: No valid date for "${title}", using today.`);
    }

    // Convert content
    const htmlContent = item['content:encoded'] || '';
    const markdownContent = htmlContent ? turndown.turndown(htmlContent) : '';

    // Extract excerpt / description
    const excerpt = item['excerpt:encoded'] || '';
    const description = extractDescription(excerpt, markdownContent);

    // Extract tags
    const tags = extractTags(item);

    // Generate unique slug
    let slug = slugify(title);
    if (!slug) slug = 'untitled';

    let uniqueSlug = slug;
    let counter = 1;
    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${slug}-${counter}`;
      counter++;
    }
    usedSlugs.add(uniqueSlug);

    const post = {
      title,
      description,
      date,
      tags,
      draft: isDraft,
    };

    const frontmatter = buildFrontmatter(post);
    const fileContent = `${frontmatter}\n\n${markdownContent}\n`;
    const filename = `${uniqueSlug}.md`;
    const filepath = join(OUTPUT_DIR, filename);

    writeFileSync(filepath, fileContent, 'utf-8');
    console.log(`  ✓ ${filename} — "${title}" (${date}, ${tags.length} tag(s)${isDraft ? ', DRAFT' : ''})`);
    successCount++;
  }

  console.log(`\nDone! Migrated ${successCount} post(s) to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
