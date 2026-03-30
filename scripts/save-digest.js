#!/usr/bin/env node

// ============================================================================
// Follow Builders — Digest Archive Script
// ============================================================================
// Saves a remixed digest to ~/.follow-builders/digests/YYYY-MM-DD.json
// for local web browsing.
//
// Usage:
//   echo "digest text" | node save-digest.js
//   node save-digest.js --message "digest text"
//   node save-digest.js --file /path/to/digest.txt
// ============================================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const USER_DIR = join(homedir(), '.follow-builders');
const CONFIG_PATH = join(USER_DIR, 'config.json');
const DIGESTS_DIR = join(USER_DIR, 'digests');

async function getDigestText() {
  const args = process.argv.slice(2);

  const msgIdx = args.indexOf('--message');
  if (msgIdx !== -1 && args[msgIdx + 1]) {
    return args[msgIdx + 1];
  }

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return await readFile(args[fileIdx + 1], 'utf-8');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function getTodayInTimezone(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }
}

function formatRawFeedAsMarkdown(data) {
  const lines = [];
  const date = data.generatedAt
    ? new Date(data.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  lines.push(`AI Builders Digest — ${date}\n`);
  lines.push('---\n');

  // Blogs
  if (data.blogs && data.blogs.length > 0) {
    lines.push('## OFFICIAL BLOGS\n');
    for (const blog of data.blogs) {
      const title = blog.title || 'Untitled';
      const source = blog.source || '';
      lines.push(`**${source ? source + ': ' : ''}${title}**\n`);
      if (blog.summary) lines.push(`${blog.summary}\n`);
      if (blog.url) lines.push(`${blog.url}\n`);
      lines.push('');
    }
    lines.push('---\n');
  }

  // X / Twitter
  if (data.x && data.x.length > 0) {
    lines.push('## X / TWITTER\n');
    for (const author of data.x) {
      const name = author.name || author.handle || 'Unknown';
      const handle = author.handle ? `@${author.handle}` : '';
      const bio = author.bio ? ` (${author.bio})` : '';
      const tweets = author.tweets || [];

      for (const tweet of tweets) {
        lines.push(`**${name}**${bio}${handle ? ' ' + handle : ''}\n`);
        if (tweet.text) lines.push(`${tweet.text}\n`);
        if (tweet.url) lines.push(`${tweet.url}\n`);
        lines.push('');
      }
    }
    lines.push('---\n');
  }

  // Podcasts
  if (data.podcasts && data.podcasts.length > 0) {
    lines.push('## PODCASTS\n');
    for (const pod of data.podcasts) {
      const show = pod.show || '';
      const title = pod.title || 'Untitled';
      lines.push(`**${show}${show ? ' — ' : ''}"${title}"**\n`);
      if (pod.summary) lines.push(`${pod.summary}\n`);
      if (pod.url) lines.push(`${pod.url}\n`);
      lines.push('');
    }
    lines.push('---\n');
  }

  lines.push('Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders');
  return lines.join('\n');
}

function extractContent(rawText) {
  const trimmed = rawText.trim();
  // Detect if the input is raw JSON from prepare-digest.js (not a pre-formatted digest)
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      // If it has x/podcasts/blogs fields, it's raw feed data — format it
      if (parsed.x || parsed.podcasts || parsed.blogs) {
        return formatRawFeedAsMarkdown(parsed);
      }
      // If it has a content field already, use that
      if (parsed.content) return parsed.content;
    } catch {
      // Not valid JSON, treat as plain text
    }
  }
  return trimmed;
}

async function main() {
  let config = {};
  if (existsSync(CONFIG_PATH)) {
    config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  }

  const digestText = await getDigestText();

  if (!digestText || digestText.trim().length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'Empty digest text' }));
    return;
  }

  const content = extractContent(digestText);
  const today = getTodayInTimezone(config.timezone || 'UTC');
  const filePath = join(DIGESTS_DIR, `${today}.json`);
  const rawPath = join(DIGESTS_DIR, `${today}.raw.json`);

  await mkdir(DIGESTS_DIR, { recursive: true });

  // Save raw source JSON if input is valid JSON
  const trimmed = digestText.trim();
  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed); // validate
      await writeFile(rawPath, trimmed, 'utf-8');
    } catch {}
  }

  const digest = {
    date: today,
    generatedAt: new Date().toISOString(),
    language: config.language || 'en',
    content
  };

  await writeFile(filePath, JSON.stringify(digest, null, 2), 'utf-8');

  console.log(JSON.stringify({ status: 'ok', path: filePath, rawPath }));
}

main();
