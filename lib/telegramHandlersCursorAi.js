/**
 * CursorAI Telegram commands — register via registerTelegramInboundHandler.
 *
 * Commands (first line). Bot username suffix supported: /ca_create@YourBot
 *
 *   /ca_help — this help
 *   /ca_list — recent projects (short)
 *   /ca_create <project-name> [auto|openai|claude]
 *   <following lines = prompt>
 *
 *   /ca_update <folder-name> [auto|openai|claude]
 *   <following lines = new prompt>
 */

'use strict';

const {
  cursorAiCreateProject,
  cursorAiUpdateProject,
  cursorAiListProjects
} = require('./cursorAiCore');
const { absoluteUrl } = require('./notify');

const HELP = `LAB007 <b>CursorAI</b> (Telegram)

/ca_create <i>project-name</i> [auto|openai|claude]
<i>then on the next lines, your prompt</i>

/ca_update <i>folder-name</i> [auto|openai|claude]
<i>then the new prompt</i>

/ca_list — recent projects
/ca_help — this message`;

function splitFirstLineRest(text) {
  const lines = String(text || '').split(/\r?\n/);
  const first = (lines[0] || '').trim();
  const rest = lines.slice(1).join('\n').trim();
  return { first, rest };
}

function normalizeCmdLine(firstLine) {
  return firstLine.replace(/^\/([a-zA-Z0-9_]+)(@[a-zA-Z0-9_]+)?/i, '/$1');
}

async function handleCursorAiTelegram(ctx) {
  const raw = ctx.text.trim();
  if (!raw.startsWith('/')) return false;

  const { first, rest } = splitFirstLineRest(raw);
  const line = normalizeCmdLine(first);

  if (/^\/(ca_help|cursorai_help)$/i.test(line)) {
    await ctx.replyHtml(HELP);
    return true;
  }

  if (/^\/ca_list$/i.test(line)) {
    const projects = cursorAiListProjects().slice(0, 8);
    if (!projects.length) {
      await ctx.reply('No projects yet. Use /ca_create from the help.');
      return true;
    }
    const lines = projects.map((p, i) => {
      const prev = absoluteUrl(p.previewUrl);
      const link =
        prev && /^https?:\/\//i.test(prev)
          ? `<a href="${escapeAttr(prev)}">${escapeHtml(p.projectName || p.folderName)}</a>`
          : escapeHtml(p.projectName || p.folderName);
      return `${i + 1}. ${link} <code>${escapeHtml(p.folderName)}</code>`;
    });
    await ctx.replyHtml(`<b>Recent projects</b>\n\n${lines.join('\n')}`);
    return true;
  }

  const createMatch = line.match(
    /^\/ca_create\s+(\S+)(?:\s+(auto|openai|claude))?\s*$/i
  );
  if (createMatch) {
    const projectName = createMatch[1];
    const provider = (createMatch[2] || 'auto').toLowerCase();
    if (!rest) {
      await ctx.reply('Add your prompt on the lines after the command.');
      return true;
    }
    await ctx.reply('⏳ Generating project…');
    try {
      const out = await cursorAiCreateProject({
        projectName,
        prompt: rest,
        provider
      });
      const previewAbs = absoluteUrl(out.previewUrl);
      const dashAbs = absoluteUrl('/cursorai/dashboard');
      const html = [
        '✅ <b>Project created</b>',
        `<code>${escapeHtml(out.folderName)}</code>`,
        previewAbs && /^https?:\/\//i.test(previewAbs)
          ? `• <a href="${escapeAttr(previewAbs)}">Open preview</a>`
          : `Preview path: ${escapeHtml(out.previewUrl)}`,
        dashAbs && /^https?:\/\//i.test(dashAbs)
          ? `• <a href="${escapeAttr(dashAbs)}">All projects</a>`
          : ''
      ]
        .filter(Boolean)
        .join('\n');
      await ctx.replyHtml(html);
    } catch (e) {
      await ctx.reply(`❌ ${e.message || 'Create failed'}`);
    }
    return true;
  }

  const updateMatch = line.match(
    /^\/ca_update\s+(\S+)(?:\s+(auto|openai|claude))?\s*$/i
  );
  if (updateMatch) {
    const folderName = updateMatch[1];
    const provider = (updateMatch[2] || 'auto').toLowerCase();
    if (!rest) {
      await ctx.reply('Add the new prompt on the lines after the command.');
      return true;
    }
    await ctx.reply('⏳ Updating project…');
    try {
      const out = await cursorAiUpdateProject({
        folderName,
        projectName: '',
        prompt: rest,
        provider
      });
      const previewAbs = absoluteUrl(out.previewUrl);
      const html = [
        '✅ <b>Project updated</b>',
        `<code>${escapeHtml(out.folderName)}</code>`,
        previewAbs && /^https?:\/\//i.test(previewAbs)
          ? `• <a href="${escapeAttr(previewAbs)}">Open preview</a>`
          : `Preview path: ${escapeHtml(out.previewUrl)}`
      ]
        .filter(Boolean)
        .join('\n');
      await ctx.replyHtml(html);
    } catch (e) {
      await ctx.reply(`❌ ${e.message || 'Update failed'}`);
    }
    return true;
  }

  const normFirst = normalizeCmdLine(first.trim());
  if (/^\/ca_/i.test(normFirst)) {
    await ctx.reply('Unknown CursorAI command. Send /ca_help for usage.');
    return true;
  }

  return false;
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function registerCursorAiTelegramHandlers(register) {
  register(handleCursorAiTelegram);
}

module.exports = {
  registerCursorAiTelegramHandlers,
  HELP
};
