/**
 * LAB007 Digital Marketing — SEO analyzer UI (pairs with POST /api/analyze)
 */
const DM_CATEGORY_META = {
  seo: { icon: '🏷️', label: 'SEO & Metadata' },
  speed: { icon: '⚡', label: 'Page Speed' },
  mobile: { icon: '📱', label: 'Mobile & UX' },
  backlinks: { icon: '🔗', label: 'Backlinks' },
  local: { icon: '📍', label: 'Local (Google)' },
  bing: { icon: '🔵', label: 'Bing & Apple' },
  keywords: { icon: '🔑', label: 'Keywords' },
  schema: { icon: '🧩', label: 'Schema / JSON-LD' },
  social: { icon: '📣', label: 'Social Signals' },
  security: { icon: '🔒', label: 'Security & Tech' }
};

(function initDigitalMarketingNav() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navMenu = document.getElementById('navMenu');
  const navOverlay = document.getElementById('navOverlay');
  if (!hamburgerBtn || !navMenu || !navOverlay) return;
  hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('open');
    navMenu.classList.toggle('open');
    navOverlay.classList.toggle('open');
  });
  navOverlay.addEventListener('click', () => {
    hamburgerBtn.classList.remove('open');
    navMenu.classList.remove('open');
    navOverlay.classList.remove('open');
  });
})();

window.scrollToAnalyzer = function scrollToAnalyzer() {
  const el = document.getElementById('analyzer');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

window.scrollToMarketingManager = function scrollToMarketingManager() {
  const el = document.getElementById('marketing-manager');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
};

(function bindAnalyzerInput() {
  const input = document.getElementById('urlInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.runAnalysis();
    });
  }
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => window.runAnalysis());
  }
})();

window.runAnalysis = async function runAnalysis() {
  let url = document.getElementById('urlInput').value.trim();
  if (!url) {
    alert('Please enter a URL');
    return;
  }
  if (!url.startsWith('http')) url = 'https://' + url;

  let hostname;
  try {
    hostname = new URL(url).hostname.replace('www.', '');
  } catch {
    alert('Please enter a valid URL');
    return;
  }

  document.getElementById('analyzeBtn').disabled = true;
  document.getElementById('analyzer-idle').style.display = 'none';
  document.getElementById('analyzer-results').style.display = 'none';
  document.getElementById('analyzer-loading').style.display = 'block';
  document.getElementById('loading-url-display').textContent = url;

  const steps = document.querySelectorAll('.loading-step');
  steps.forEach((s) => {
    s.className = 'loading-step pending';
  });

  let stepIdx = 0;
  const stepInterval = setInterval(() => {
    if (stepIdx > 0) {
      steps[stepIdx - 1].classList.remove('active');
      steps[stepIdx - 1].classList.add('done');
      steps[stepIdx - 1].querySelector('.step-indicator').textContent = '✓';
    }
    if (stepIdx < steps.length) {
      steps[stepIdx].classList.add('active');
      stepIdx++;
    } else {
      clearInterval(stepInterval);
    }
  }, 600);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: buildSeoPrompt(url, hostname), url })
    });
    const raw = await res.text();
    let data = {};
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Analyzer response was not JSON (status ${res.status})`);
    }
    clearInterval(stepInterval);
    steps.forEach((s) => {
      s.className = 'loading-step done';
      s.querySelector('.step-indicator').textContent = '✓';
    });

    if (!data.success) {
      throw new Error(data.error || 'Analysis failed');
    }

    await new Promise((r) => setTimeout(r, 600));

    const text = data.text || '';
    const parsed = parseAnalyzerJson(text);
    renderAnalyzerResults(parsed, url, hostname, data.imageAltAudit || []);
    await loadGscReport(url);
  } catch (err) {
    clearInterval(stepInterval);
    document.getElementById('analyzer-loading').style.display = 'none';
    document.getElementById('analyzer-idle').style.display = 'block';
    document.getElementById('analyzer-idle').innerHTML = `<div class="idle-icon">⚠️</div><p style="color:var(--red)">Analysis failed. Please try again.<br><small style="color:var(--muted)">${err.message}</small></p>`;
    document.getElementById('analyzeBtn').disabled = false;
  }
};

function parseAnalyzerJson(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = clean.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error('Could not parse analyzer JSON output');
  }
}

function buildSeoPrompt(url, hostname) {
  return `You are an expert SEO analyst. Analyze the website: ${url}

Based on the domain "${hostname}", URL structure, TLD, and your knowledge of similar sites, provide a realistic and detailed SEO health analysis. Return ONLY a valid JSON object with NO extra text, markdown, or backticks.

JSON structure required:
{
  "overall": 64,
  "headline": "Moderate SEO foundation with significant ranking opportunities",
  "categories": [
    {
      "id": "seo",
      "score": 70,
      "findings": [
        {"status": "pass", "title": "Title tag present", "detail": "Page has a descriptive title tag under 60 characters"},
        {"status": "warn", "title": "Meta description thin", "detail": "Description appears under 120 characters — expand to 150-160 chars for better CTR"},
        {"status": "fail", "title": "Missing H1 structure", "detail": "Primary heading hierarchy is not clearly defined — add a single keyword-rich H1 per page"},
        {"status": "warn", "title": "Canonical tags", "detail": "Self-referencing canonical tags may not be configured on all pages"},
        {"status": "fail", "title": "Open Graph tags incomplete", "detail": "og:title, og:description, og:image not fully configured — impacts social sharing previews"}
      ]
    },
    {
      "id": "speed",
      "score": 58,
      "findings": [
        {"status": "pass", "title": "HTTPS enabled", "detail": "Site is served over a secure TLS connection — good for trust and rankings"},
        {"status": "warn", "title": "Images not in WebP format", "detail": "Converting images to WebP/AVIF format can reduce page weight by 25-35%"},
        {"status": "fail", "title": "Render-blocking resources", "detail": "JavaScript and CSS may be blocking first contentful paint — defer non-critical scripts"},
        {"status": "warn", "title": "LCP likely above 2.5s", "detail": "Largest Contentful Paint is a Core Web Vital — aim for under 2.5 seconds"},
        {"status": "warn", "title": "Browser caching", "detail": "Static assets should have cache headers set for 1 year to reduce repeat load times"}
      ]
    },
    {
      "id": "mobile",
      "score": 72,
      "findings": [
        {"status": "pass", "title": "Mobile viewport meta tag", "detail": "Viewport meta tag detected — good baseline for responsive design"},
        {"status": "pass", "title": "Touch targets sized correctly", "detail": "Interactive elements appear appropriately sized for mobile use"},
        {"status": "warn", "title": "CLS score unknown", "detail": "Cumulative Layout Shift should be below 0.1 — test with PageSpeed Insights"},
        {"status": "warn", "title": "Font size on mobile", "detail": "Ensure body text is at least 16px on mobile to avoid zoom triggers in Google's assessment"},
        {"status": "fail", "title": "Mobile-first indexing audit needed", "detail": "Google now indexes mobile version first — ensure mobile has full content parity with desktop"}
      ]
    },
    {
      "id": "backlinks",
      "score": 44,
      "findings": [
        {"status": "warn", "title": "Domain Authority estimate: Low-Medium", "detail": "Based on domain age and niche, DA is likely 15-35 — quality link building needed"},
        {"status": "fail", "title": "Industry directory listings", "detail": "Site likely not listed in relevant industry directories — each listing adds a quality backlink"},
        {"status": "warn", "title": "Anchor text diversity", "detail": "Balanced mix of branded, keyword, and naked URL anchors needed for a natural link profile"},
        {"status": "fail", "title": "No guest post presence detected", "detail": "Publishing on industry blogs can build authority and drive referral traffic"},
        {"status": "warn", "title": "Competitor backlinks not yet leveraged", "detail": "Identify sites linking to competitors but not to you — target these for outreach"}
      ]
    },
    {
      "id": "local",
      "score": 52,
      "findings": [
        {"status": "warn", "title": "Google Business Profile", "detail": "Cannot confirm if GBP is fully claimed, verified, and optimized with photos, hours, services"},
        {"status": "warn", "title": "Google Maps visibility", "detail": "Map pack ranking depends on proximity, relevance, and profile completeness — verify yours"},
        {"status": "fail", "title": "NAP consistency", "detail": "Name, Address, Phone must be identical across all online mentions — inconsistencies hurt local rankings"},
        {"status": "warn", "title": "GBP review count", "detail": "Businesses with 50+ reviews and a 4.5+ star rating significantly outperform in local search"},
        {"status": "fail", "title": "GBP posts not active", "detail": "Regular Google Business Profile posts signal activity and improve local visibility"}
      ]
    },
    {
      "id": "bing",
      "score": 38,
      "findings": [
        {"status": "fail", "title": "Bing Places not verified", "detail": "Bing handles ~6% of US searches — claim your free Bing Places listing to capture this traffic"},
        {"status": "fail", "title": "Apple Maps listing", "detail": "Apple Maps is used by all iOS users by default — claim via Apple Business Connect (free)"},
        {"status": "warn", "title": "Bing Webmaster Tools", "detail": "Submit your sitemap to Bing Webmaster Tools to improve crawl coverage on Microsoft's index"},
        {"status": "fail", "title": "Yelp & industry directories", "detail": "Yelp, Foursquare, and niche directories feed into Apple Maps and Bing — ensure listings are claimed"},
        {"status": "warn", "title": "Yahoo/DuckDuckGo coverage", "detail": "DuckDuckGo uses Bing's index — optimizing for Bing also improves DuckDuckGo visibility"}
      ]
    },
    {
      "id": "keywords",
      "score": 55,
      "findings": [
        {"status": "warn", "title": "Primary keyword targeting", "detail": "Ensure each page is optimized for one primary keyword and 2-3 semantic variations"},
        {"status": "fail", "title": "Long-tail keyword gap", "detail": "Long-tail phrases (3-5 words) convert better and have lower competition — create dedicated pages"},
        {"status": "warn", "title": "Keyword cannibalization risk", "detail": "Multiple pages targeting the same keyword split ranking signals — consolidate or differentiate"},
        {"status": "warn", "title": "Featured snippet opportunities", "detail": "Structure FAQ and how-to content with H2/H3 headers and concise answers to capture position zero"},
        {"status": "fail", "title": "Content volume insufficient", "detail": "More indexed pages = more ranking opportunities — a blog or resource section is recommended"}
      ]
    },
    {
      "id": "schema",
      "score": 30,
      "findings": [
        {"status": "fail", "title": "No LocalBusiness schema", "detail": "JSON-LD LocalBusiness markup tells Google your exact name, address, phone, hours — critical for local SEO"},
        {"status": "fail", "title": "No WebSite schema", "detail": "WebSite schema enables the sitelinks search box in Google results — adds rich appearance"},
        {"status": "fail", "title": "No BreadcrumbList schema", "detail": "Breadcrumb markup improves navigation display in SERPs and click-through rates"},
        {"status": "warn", "title": "FAQ schema opportunity", "detail": "Pages with Q&A content should use FAQPage schema to capture accordion-style rich results"},
        {"status": "fail", "title": "No Review/Rating schema", "detail": "If you have reviews, ReviewSchema markup can display star ratings directly in search results"}
      ]
    },
    {
      "id": "social",
      "score": 48,
      "findings": [
        {"status": "warn", "title": "Twitter/X Card tags", "detail": "twitter:card, twitter:title, twitter:image tags likely missing — impacts link sharing appearance"},
        {"status": "warn", "title": "Facebook Open Graph", "detail": "og:image should be 1200x630px and under 1MB for optimal Facebook/LinkedIn sharing"},
        {"status": "fail", "title": "Social profile links in site footer", "detail": "Linking to active social profiles from your site reinforces brand entity signals to Google"},
        {"status": "warn", "title": "Content shareability", "detail": "Shareable assets (infographics, data, tools) earn organic social links which boost domain authority"},
        {"status": "fail", "title": "Consistent posting cadence", "detail": "Regular social activity signals brand life to search engines — aim for 3-5 posts per week"}
      ]
    },
    {
      "id": "security",
      "score": 75,
      "findings": [
        {"status": "pass", "title": "HTTPS / SSL active", "detail": "SSL certificate present and active — required for modern ranking and user trust"},
        {"status": "pass", "title": "No obvious malware signals", "detail": "Domain does not appear on known blocklists or Safe Browsing flags"},
        {"status": "warn", "title": "robots.txt verification", "detail": "Ensure robots.txt is accessible at /robots.txt and is not accidentally blocking key pages"},
        {"status": "warn", "title": "XML sitemap submitted", "detail": "Submit an up-to-date sitemap to Google Search Console and Bing Webmaster Tools"},
        {"status": "warn", "title": "301 redirect hygiene", "detail": "Check for redirect chains (A→B→C) and loops — these dilute link equity and slow crawling"}
      ]
    }
  ],
  "quickWins": [
    {"title": "Claim Google Business Profile", "detail": "Free, takes 30 mins, immediate local ranking boost"},
    {"title": "Add LocalBusiness JSON-LD schema", "detail": "Copy-paste code snippet, instant rich result eligibility"},
    {"title": "Submit sitemap to Search Console", "detail": "Ensures all pages get crawled and indexed"},
    {"title": "Claim Apple Business Connect", "detail": "Free iOS Maps listing — reaches all iPhone users"},
    {"title": "Set up Bing Webmaster Tools", "detail": "Free, reaches Bing + DuckDuckGo + Yahoo audiences"}
  ],
  "recommendations": [
    {"priority": "high", "title": "Implement LocalBusiness Schema", "detail": "Add JSON-LD schema to every page with your business name, address, phone, hours, and service area."},
    {"priority": "high", "title": "Fully Optimize Google Business Profile", "detail": "Add 10+ photos, complete all service categories, set accurate hours, enable messaging, and post weekly updates."},
    {"priority": "high", "title": "Build Quality Backlinks", "detail": "Target industry-specific directories, local chamber of commerce listings, and partner site mentions."},
    {"priority": "high", "title": "Claim Bing Places & Apple Business Connect", "detail": "Both are free and reach substantial audiences."},
    {"priority": "med", "title": "Fix Core Web Vitals", "detail": "Use PageSpeed Insights to identify your LCP, FID, and CLS scores."},
    {"priority": "med", "title": "Expand Keyword Targeting", "detail": "Create dedicated landing pages for 5-10 long-tail keyword phrases relevant to your business."},
    {"priority": "med", "title": "Add FAQ & How-To Schema", "detail": "Pages with FAQ structured data can appear as expandable accordions in Google results."},
    {"priority": "low", "title": "Build a Content Publishing Cadence", "detail": "Even 2 blog posts per month signals freshness to Google."},
    {"priority": "low", "title": "Configure Social Open Graph & Twitter Cards", "detail": "Proper og:image and twitter:card tags ensure professional link previews."},
    {"priority": "low", "title": "Audit & Fix Redirect Chains", "detail": "Use Screaming Frog or Ahrefs to identify redirect chains."}
  ]
}

Adjust all scores to be realistic for the domain "${hostname}". Consider domain age clues (.io = tech startup, .com = established, local TLDs = local business), business type signals in the domain name, and typical SEO maturity for that category. Return ONLY the JSON object, nothing else.`;
}

function getScoreClass(score) {
  if (score >= 70) return 'good';
  if (score >= 45) return 'warn';
  return 'bad';
}

function renderAnalyzerResults(data, url, hostname, imageAltAudit) {
  document.getElementById('analyzer-loading').style.display = 'none';
  document.getElementById('analyzer-results').style.display = 'block';
  document.getElementById('analyzeBtn').disabled = false;

  const overall = Math.min(100, Math.max(0, data.overall || 0));
  const cls = getScoreClass(overall);

  const scoreEl = document.getElementById('overall-score');
  const arcEl = document.getElementById('score-arc');
  const circumference = 364;
  scoreEl.textContent = overall;
  scoreEl.style.color =
    cls === 'good' ? 'var(--green)' : cls === 'warn' ? 'var(--amber)' : 'var(--red)';
  arcEl.style.stroke =
    cls === 'good' ? 'var(--green)' : cls === 'warn' ? 'var(--amber)' : 'var(--red)';
  setTimeout(() => {
    arcEl.style.strokeDashoffset = circumference - (circumference * overall) / 100;
  }, 100);

  const gradeEl = document.getElementById('score-grade');
  const grades = [
    [90, 'A+ Excellent'],
    [80, 'A Good'],
    [70, 'B+ Above Avg'],
    [60, 'B Average'],
    [45, 'C Needs Work'],
    [0, 'D Critical Issues']
  ];
  const grade = grades.find(([min]) => overall >= min);
  gradeEl.textContent = grade ? grade[1] : 'F';
  gradeEl.style.color =
    cls === 'good' ? 'var(--green)' : cls === 'warn' ? 'var(--amber)' : 'var(--red)';

  document.getElementById('results-url-display').textContent = url;
  document.getElementById('results-headline').textContent = data.headline || 'SEO Analysis Complete';

  const cats = data.categories || [];
  const passing = cats.filter((c) => c.score >= 70).length;
  const warning = cats.filter((c) => c.score >= 45 && c.score < 70).length;
  const failing = cats.filter((c) => c.score < 45).length;
  document.getElementById('results-meta').innerHTML = `
    <span class="meta-pill"><span class="meta-dot g"></span>${passing} Good</span>
    <span class="meta-pill"><span class="meta-dot a"></span>${warning} Needs Work</span>
    <span class="meta-pill"><span class="meta-dot r"></span>${failing} Critical</span>
  `;

  const bdEl = document.getElementById('score-breakdown');
  bdEl.innerHTML = cats
    .slice(0, 5)
    .map(
      (c) =>
        `<span class="score-chip ${getScoreClass(c.score)}">${(DM_CATEGORY_META[c.id] || {}).icon || ''} ${
          (DM_CATEGORY_META[c.id] || { label: c.id }).label
        }: ${c.score}</span>`
    )
    .join('');

  const catGrid = document.getElementById('cat-grid');
  catGrid.innerHTML = '';
  cats.forEach((cat) => {
    const sc = Math.min(100, Math.max(0, cat.score || 0));
    const cc = getScoreClass(sc);
    const meta = DM_CATEGORY_META[cat.id] || { icon: '📊', label: cat.id };
    const card = document.createElement('div');
    card.className = 'cat-card';
    card.innerHTML = `
      <div class="cat-icon">${meta.icon}</div>
      <div class="cat-name">${meta.label}</div>
      <div class="cat-score-val ${cc}">${sc}</div>
      <div class="mini-bar"><div class="mini-fill ${cc}" style="width:0%" data-w="${sc}%"></div></div>
    `;
    card.addEventListener('click', () => showCategoryDetail(cat, card));
    catGrid.appendChild(card);
  });

  setTimeout(() => {
    document.querySelectorAll('.mini-fill').forEach((el) => {
      el.style.width = el.dataset.w;
    });
  }, 100);

  if (cats.length) {
    const firstCard = catGrid.querySelector('.cat-card');
    showCategoryDetail(cats[0], firstCard);
  }

  const qwGrid = document.getElementById('quick-wins-grid');
  qwGrid.innerHTML = (data.quickWins || [])
    .map(
      (qw, i) => `
    <div class="quick-win-item">
      <div class="qw-num">${i + 1}</div>
      <div class="qw-text"><strong>${qw.title}</strong>${qw.detail}</div>
    </div>
  `
    )
    .join('');

  const recList = document.getElementById('rec-list');
  recList.innerHTML = (data.recommendations || [])
    .map(
      (rec) => `
    <div class="rec-item">
      <span class="rec-priority ${rec.priority}">${
        rec.priority === 'high' ? 'High' : rec.priority === 'med' ? 'Medium' : 'Low'
      }</span>
      <div class="rec-text"><h5>${rec.title}</h5><p>${rec.detail}</p></div>
    </div>
  `
    )
    .join('');

  const imgAuditWrap = document.getElementById('image-alt-audit');
  const imgAuditMeta = document.getElementById('image-alt-meta');
  const imgAuditList = document.getElementById('image-alt-list');
  if (imgAuditWrap && imgAuditMeta && imgAuditList) {
    const rows = Array.isArray(imageAltAudit) ? imageAltAudit : [];
    if (!rows.length) {
      imgAuditWrap.style.display = 'none';
    } else {
      const missing = rows.filter((r) => r.missingAlt).length;
      imgAuditMeta.textContent = `${rows.length} images scanned • ${missing} missing alt`;
      imgAuditList.innerHTML = rows
        .slice(0, 120)
        .map((r) => {
          const altText = (r.alt || '').trim();
          return `<div class="img-alt-row">
            <div class="img-alt-file" title="${escapeHtml(r.fileName || r.src || '')}">${escapeHtml(r.fileName || r.src || '')}</div>
            <div class="img-alt-text" title="${escapeHtml(altText || '(missing alt)')}">${escapeHtml(altText || '(missing alt)')}</div>
            <span class="img-alt-badge ${r.missingAlt ? 'img-alt-missing' : 'img-alt-ok'}">${r.missingAlt ? 'Missing' : 'OK'}</span>
          </div>`;
        })
        .join('');
      imgAuditWrap.style.display = '';
    }
  }

  setTimeout(
    () =>
      document.getElementById('analyzer-results').scrollIntoView({ behavior: 'smooth', block: 'start' }),
    200
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadGscReport(url) {
  const panel = document.getElementById('gsc-panel');
  const stateEl = document.getElementById('gsc-state');
  const bodyEl = document.getElementById('gsc-body');
  if (!panel || !stateEl || !bodyEl) return;
  panel.style.display = '';
  stateEl.className = 'gsc-state';
  stateEl.textContent = 'Checking availability...';
  bodyEl.innerHTML = '';
  try {
    const res = await fetch('/api/gsc/report?url=' + encodeURIComponent(url));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load GSC report');
    if (data.status === 'not_connected') {
      stateEl.className = 'gsc-state gsc-bad';
      stateEl.textContent = 'Cannot use GSC (not connected)';
      bodyEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0 0 10px 0;">${escapeHtml(
        data.reason || 'Google Search Console is not connected.'
      )}</p><a class="btn-ghost" href="/api/gsc/connect" style="padding:9px 14px;font-size:12px;">Connect Google Search Console</a>`;
      return;
    }
    if (data.status !== 'available') {
      stateEl.className = 'gsc-state gsc-bad';
      stateEl.textContent = 'Cannot use GSC for this site';
      bodyEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">${escapeHtml(
        data.reason || 'No matching Search Console property access.'
      )}</p>`;
      return;
    }
    stateEl.className = 'gsc-state gsc-ok';
    stateEl.textContent = 'GSC available for this site';
    const rows = Array.isArray(data.queries) ? data.queries : [];
    const top = rows.slice(0, 50);
    bodyEl.innerHTML = `
      <p style="font-size:12px;color:var(--muted);margin:0 0 8px 0;">Property: ${escapeHtml(
        data.property || ''
      )} • Range: ${escapeHtml(data.dateRange || '')}</p>
      <p style="font-size:12px;color:var(--muted);margin:0 0 10px 0;">Queries: ${
        data.summary?.totalQueries || 0
      } • Clicks: ${data.summary?.totalClicks || 0} • Impressions: ${
      data.summary?.totalImpressions || 0
    }</p>
      <table class="gsc-table">
        <thead><tr><th>Query</th><th>Clicks</th><th>Impr.</th><th>CTR</th><th>Pos</th></tr></thead>
        <tbody>
          ${top
            .map(
              (r) => `<tr>
              <td title="${escapeHtml(r.page || '')}">${escapeHtml(r.query || '')}</td>
              <td>${Number(r.clicks || 0)}</td>
              <td>${Number(r.impressions || 0)}</td>
              <td>${(Number(r.ctr || 0) * 100).toFixed(1)}%</td>
              <td>${Number(r.position || 0).toFixed(1)}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (err) {
    stateEl.className = 'gsc-state gsc-bad';
    stateEl.textContent = 'Cannot use GSC right now';
    bodyEl.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0;">${escapeHtml(err.message)}</p>`;
  }
}

function showCategoryDetail(cat, cardEl) {
  document.querySelectorAll('.cat-card').forEach((c) => c.classList.remove('active'));
  cardEl.classList.add('active');

  const sc = Math.min(100, Math.max(0, cat.score || 0));
  const cc = getScoreClass(sc);
  const meta = DM_CATEGORY_META[cat.id] || { icon: '📊', label: cat.id };
  const iconMap = { pass: '✓', warn: '!', fail: '✕' };

  document.getElementById('detail-title').innerHTML = `<span>${meta.icon}</span> ${meta.label} — Detailed Findings`;
  const badge = document.getElementById('detail-badge');
  badge.textContent = `Score: ${sc}/100`;
  badge.className = `detail-score-badge ${cc}`;

  document.getElementById('detail-findings').innerHTML = (cat.findings || [])
    .map(
      (f) => `
    <div class="finding ${f.status}">
      <div class="finding-icon">${iconMap[f.status] || '?'}</div>
      <div class="finding-text">
        <strong>${f.title}</strong>
        <span>${f.detail}</span>
      </div>
    </div>
  `
    )
    .join('');
}
