#!/usr/bin/env node

// ============================================================================
// Follow Builders — Local Digest Web Server
// ============================================================================
// Serves a web UI for browsing current and past AI Builders Digests.
//
// Usage:
//   node serve.js              # starts on port 3456
//   PORT=8080 node serve.js    # custom port
//
// Then open http://localhost:3456 in your browser.
// ============================================================================

import { createServer } from 'http';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { marked } from 'marked';

const PORT = parseInt(process.env.PORT || '3456', 10);
const DIGESTS_DIR = join(homedir(), '.follow-builders', 'digests');

// -- API handlers -----------------------------------------------------------

async function getDigestList() {
  if (!existsSync(DIGESTS_DIR)) return [];
  const files = await readdir(DIGESTS_DIR);
  return files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

async function getDigest(date) {
  const filePath = join(DIGESTS_DIR, `${date}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

// -- HTML template ----------------------------------------------------------

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Builders Digest</title>
<!-- marked.js no longer needed, markdown is rendered server-side -->
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui,
                 "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #f5f5f7;
    color: #1d1d1f;
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* Sidebar */
  .sidebar {
    width: 260px;
    min-width: 260px;
    background: #ffffff;
    border-right: 1px solid #e5e5e7;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 24px 20px 16px;
    border-bottom: 1px solid #e5e5e7;
  }

  .sidebar-header h1 {
    font-size: 18px;
    font-weight: 700;
    color: #1d1d1f;
    letter-spacing: -0.3px;
  }

  .sidebar-header p {
    font-size: 12px;
    color: #86868b;
    margin-top: 4px;
  }

  .date-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .month-group {
    padding: 0 12px;
  }

  .month-label {
    font-size: 11px;
    font-weight: 600;
    color: #86868b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 16px 8px 6px;
  }

  .date-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    margin: 1px 0;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #1d1d1f;
    transition: background 0.15s;
  }

  .date-item:hover { background: #f5f5f7; }

  .date-item.active {
    background: #0071e3;
    color: #ffffff;
  }

  .date-item .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #0071e3;
    margin-right: 10px;
    flex-shrink: 0;
  }

  .date-item.active .dot { background: #ffffff; }

  .date-item .day-text { flex: 1; }

  /* Main content */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-header {
    padding: 20px 32px 16px;
    border-bottom: 1px solid #e5e5e7;
    background: #ffffff;
  }

  .content-header h2 {
    font-size: 16px;
    font-weight: 600;
    color: #1d1d1f;
  }

  .content-body {
    flex: 1;
    overflow-y: auto;
    padding: 32px;
  }

  .digest-content {
    max-width: 720px;
    margin: 0 auto;
    line-height: 1.75;
    font-size: 15px;
  }

  .digest-content h1 { font-size: 24px; font-weight: 700; margin: 32px 0 16px; color: #1d1d1f; }
  .digest-content h2 { font-size: 20px; font-weight: 600; margin: 28px 0 12px; color: #1d1d1f; border-bottom: 2px solid #0071e3; padding-bottom: 8px; }
  .digest-content h3 { font-size: 17px; font-weight: 600; margin: 24px 0 8px; color: #1d1d1f; }
  .digest-content p { margin: 12px 0; }
  .digest-content a { color: #0071e3; text-decoration: none; }
  .digest-content a:hover { text-decoration: underline; }
  .digest-content ul, .digest-content ol { margin: 12px 0; padding-left: 24px; }
  .digest-content li { margin: 6px 0; }
  .digest-content blockquote {
    border-left: 3px solid #0071e3;
    padding: 8px 16px;
    margin: 16px 0;
    background: #f5f5f7;
    border-radius: 0 8px 8px 0;
    color: #424245;
  }
  .digest-content strong { font-weight: 600; }
  .digest-content hr { border: none; border-top: 1px solid #e5e5e7; margin: 24px 0; }

  /* Empty & loading states */
  .empty-state, .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #86868b;
    text-align: center;
    padding: 32px;
  }

  .empty-state .icon { font-size: 48px; margin-bottom: 16px; }
  .empty-state h3 { font-size: 18px; color: #1d1d1f; margin-bottom: 8px; }
  .empty-state p { font-size: 14px; max-width: 360px; }

  /* Mobile toggle */
  .mobile-toggle {
    display: none;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 100;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: #ffffff;
    border: 1px solid #e5e5e7;
    cursor: pointer;
    font-size: 18px;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  @media (max-width: 768px) {
    .sidebar {
      position: fixed;
      left: -280px;
      top: 0;
      z-index: 50;
      transition: left 0.25s ease;
      box-shadow: 2px 0 8px rgba(0,0,0,0.1);
    }
    .sidebar.open { left: 0; }
    .mobile-toggle { display: flex; }
    .content-header { padding-left: 60px; }
    .content-body { padding: 24px 16px; }
  }
</style>
</head>
<body>

<button class="mobile-toggle" onclick="toggleSidebar()">&#9776;</button>

<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <h1>AI Builders Digest</h1>
    <p>AI \u6784\u5EFA\u8005\u65E5\u62A5</p>
  </div>
  <div class="date-list" id="dateList"></div>
</aside>

<main class="main">
  <div class="content-header">
    <h2 id="contentTitle">\u52A0\u8F7D\u4E2D... / Loading...</h2>
  </div>
  <div class="content-body">
    <div class="digest-content" id="digestContent">
      <div class="loading-state">
        <p>\u52A0\u8F7D\u4E2D... / Loading...</p>
      </div>
    </div>
  </div>
</main>

<script>
  let currentDate = null;
  let dates = [];

  // No client-side markdown rendering needed — server returns pre-rendered HTML

  async function init() {
    try {
      const res = await fetch('/api/digests');
      dates = await res.json();
    } catch { dates = []; }

    if (dates.length === 0) {
      showEmpty();
      return;
    }

    renderDateList();
    loadDigest(dates[0]);
  }

  function renderDateList() {
    const container = document.getElementById('dateList');
    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const enMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let html = '';
    let currentMonth = '';

    for (const date of dates) {
      const [y, m, d] = date.split('-');
      const monthKey = y + '-' + m;

      if (monthKey !== currentMonth) {
        if (currentMonth) html += '</div>';
        currentMonth = monthKey;
        const mi = parseInt(m, 10) - 1;
        html += '<div class="month-group"><div class="month-label">'
              + y + '年' + monthNames[mi] + ' / ' + enMonths[mi] + ' ' + y
              + '</div>';
      }

      html += '<div class="date-item" data-date="' + date + '">'
            + '<span class="dot"></span>'
            + '<span class="day-text">' + m + '-' + d + '</span>'
            + '</div>';
    }
    if (currentMonth) html += '</div>';
    container.innerHTML = html;

    // Event delegation for date clicks
    container.addEventListener('click', function(e) {
      const item = e.target.closest('.date-item');
      if (item && item.dataset.date) {
        loadDigest(item.dataset.date);
      }
    });
  }

  async function loadDigest(date) {
    currentDate = date;

    document.querySelectorAll('.date-item').forEach(function(el) {
      el.classList.toggle('active', el.dataset.date === date);
    });

    var title = document.getElementById('contentTitle');
    var content = document.getElementById('digestContent');

    title.textContent = 'AI Builders Digest — ' + date;
    content.innerHTML = '<div class="loading-state"><p>加载中... / Loading...</p></div>';

    try {
      var res = await fetch('/api/digests/' + date);
      if (!res.ok) throw new Error('Not found');
      var data = await res.json();
      content.innerHTML = data.html || data.content || '';
      // Make all links open in new tab
      content.querySelectorAll('a').forEach(function(a) { a.target = '_blank'; });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><h3>加载失败</h3><p>Failed to load digest for ' + date + '</p><p style="font-size:12px;color:#999">' + (err.message || '') + '</p></div>';
    }

    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('open');
    }
  }

  function showEmpty() {
    document.getElementById('contentTitle').textContent = 'AI Builders Digest';
    document.getElementById('digestContent').innerHTML =
      '<div class="empty-state">'
      + '<div class="icon">📰</div>'
      + '<h3>还没有日报 / No digests yet</h3>'
      + '<p>运行 /ai 生成第一期日报，之后就可以在这里浏览了。<br>Run /ai to generate your first digest.</p>'
      + '</div>';
    document.getElementById('dateList').innerHTML =
      '<div style="padding:32px 20px;color:#86868b;font-size:13px;text-align:center">'
      + '暂无历史日报<br>No history available</div>';
  }

  function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  }

  init();
</script>
</body>
</html>`;

// -- Server -----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    if (path === '/api/digests') {
      const dates = await getDigestList();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dates));
      return;
    }

    if (path === '/api/digests/latest') {
      const dates = await getDigestList();
      if (dates.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No digests found' }));
        return;
      }
      const digest = await getDigest(dates[0]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(digest));
      return;
    }

    const dateMatch = path.match(/^\/api\/digests\/(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) {
      const digest = await getDigest(dateMatch[1]);
      if (!digest) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Digest not found' }));
        return;
      }
      // Pre-render markdown to HTML on server side
      if (digest.content) {
        digest.html = marked.parse(digest.content);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(digest));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`AI Builders Digest reader running at http://localhost:${PORT}`);
});
