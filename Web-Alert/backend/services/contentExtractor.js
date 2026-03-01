/**
 * Content extraction for change detection.
 * Uses Mozilla Readability when available for article extraction;
 * falls back to lightweight HTML cleaning for non-article pages.
 */

const crypto = require('crypto');

let Readability = null;
let JSDOM = null;

function loadReadability() {
    if (!Readability) {
        try {
            Readability = require('@mozilla/readability');
            JSDOM = require('jsdom').JSDOM;
        } catch (e) {
            console.warn('Readability/jsdom not available, using fallback extraction:', e.message);
        }
    }
    return { Readability, JSDOM };
}

/**
 * Extract main content from HTML using Readability when possible.
 * Falls back to cleanContentForComparison for non-article pages or when Readability fails.
 */
function extractContentForComparison(html) {
    if (!html) return '';

    const { Readability: R, JSDOM: J } = loadReadability();
    if (R && J) {
        try {
            const dom = new J(html, { url: 'https://example.com/' });
            const reader = new R(dom.window.document);
            const article = reader.parse();
            if (article && article.textContent && article.textContent.trim().length > 50) {
                // Normalize whitespace for stable comparison
                return article.textContent.replace(/\s+/g, ' ').trim();
            }
        } catch (e) {
            // Fall through to legacy cleaning
        }
    }

    return cleanContentForComparison(html);
}

/**
 * Legacy HTML cleaning - used when Readability fails or for non-article pages.
 * Removes ads, scripts, dynamic content, and normalizes structure.
 */
function cleanContentForComparison(html) {
    if (!html) return '';

    let cleaned = html;

    // Remove script/style/noscript
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    cleaned = cleaned.replace(/<link[^>]*>/gi, '');
    cleaned = cleaned.replace(/<meta[^>]*>/gi, '');

    // Remove ad-related patterns
    cleaned = cleaned.replace(/<[^>]*class="[^"]*ad[s]?[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '');
    cleaned = cleaned.replace(/<ins[^>]*class="[^"]*adsbygoogle[^"]*"[^>]*>[\s\S]*?<\/ins>/gi, '');
    cleaned = cleaned.replace(/<iframe[^>]*(?:ads?|advertisement|doubleclick)[^>]*>[\s\S]*?<\/iframe>/gi, '');

    // Remove loading/dynamic patterns
    cleaned = cleaned.replace(/>[^<]*(?:Loading\.\.\.|Loading|Please wait|Processing)[^<]*</gi, '><');
    cleaned = cleaned.replace(/<[^>]*(?:id|class)="[^"]*(?:loading|spinner|progress|clock|timer|counter)[^"]*"[^>]*>[\s\S]*?<\/[^>]+>/gi, '');

    // Strip attributes that change often (order-independent for hash stability)
    cleaned = cleaned.replace(/\s+(?:class|id|style|data-[^=]*|src|href)="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s+(?:class|id|style|data-[^=]*|src|href)='[^']*'/gi, '');

    // Extract text and normalize
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

/**
 * Compute stable SHA-256 hash of content for comparison.
 * More robust than string equality against tiny order/attribute changes.
 */
function contentHash(content) {
    if (!content) return '';
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

module.exports = {
    extractContentForComparison,
    cleanContentForComparison,
    contentHash,
};
