// pageActions.js - What a click does, generalized ("open-email", "Back to list", "Compose"), and the
// page descriptions Jev gets. A line-by-line port of analysis/click_tables.py and analysis/jev_replay.py,
// so the extension asks Jev exactly what the offline evaluation asked. Change both sides together:
// analysis/check_action_parity.py compares them on recorded sessions.
// No DOM access here, so Node can run this file for that check.

/* ========= LABEL CLEANING (click_tables.py) ========= */

const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g; // direction marks Gmail adds
const SHORTCUT = /\s*\((?:[⌘⇧⌥⌃]|Ctrl|Shift|Alt)[^)]*\)/g; // "(⌘Enter)", "(Shift for pop-out)"
const STATE_PREFIX = /^(?:selected|unread|starred|important),\s*/i; // "selected, unread, Kino.kz, ..."
const COUNTS = /,?\s*(?:\d[\d,]*|one)\s+(?:unread(?:\s+messages?)?|new\s+messages?)\b,?/gi;
const SUFFIXES = /\s+has menu$/i; // screen-reader text
const OVERRIDES = [
  [/^Google Account:.*/, "Google Account"], // also hides the email address
  [/^Back to .*/, "Back to list"], // "Back to Inbox", "Back to Sent Mail"
  [/^Select all .* conversations.*/, "Select all conversations"],
  [/^Mark as (?:read|unread)$/i, "Mark as read/unread"], // one button, label shows its next action
  // Attachment names are unique to one email, like subjects: keep only what the click does
  [/^Preview attachment\b/i, "preview-attachment"],
  [/^Download attachment\b/i, "download-attachment"],
  [/^Add attachment to Drive\b/i, "save-attachment-to-drive"],
];

// What the logger falls back to when an element has no text: not a usable label
const TAG_NAMES = new Set(["a", "div", "span", "img", "button", "input", "li", "td", "tr", "svg"]);

// Python's len() counts code points, JavaScript's .length UTF-16 units
const length = (text) => [...text].length;

export function cleanLabel(raw) {
  let s = (raw || "").normalize("NFKC");
  s = s.replace(INVISIBLE, "");
  s = s.replace(SHORTCUT, "");
  while (STATE_PREFIX.test(s)) {
    s = s.replace(STATE_PREFIX, "");
  }
  s = s.replace(COUNTS, "");
  s = s.replace(SUFFIXES, "");
  s = s.replace(/\s+/g, " ").replace(/^[ ,.]+|[ ,.]+$/g, "");
  for (const [pattern, replacement] of OVERRIDES) {
    if (pattern.test(s)) return replacement;
  }
  return s;
}

/**
 * Letters and digits only, lowercase: for comparing a clicked text with a label
 */
export function simplify(text) {
  return (text || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/* ========= ACTIONS (click_tables.py) ========= */

const STAR_LABELS = new Set(["Starred", "Not starred"]);
const ROW_LABEL_MIN_CHARS = 20; // email rows have long labels (sender, subject, snippet); toolbar/nav items don't

/**
 * The star button of an email row: "Starred"/"Not starred" next to a long row label.
 * (The "Starred" folder link in the sidebar sits between short labels like Inbox and Snoozed.)
 */
function isStarToggle(candidates, j) {
  if (j <= 0 || j + 1 >= candidates.length) return false;
  return (
    STAR_LABELS.has(candidates[j]) &&
    Math.max(length(candidates[j - 1]), length(candidates[j + 1])) > ROW_LABEL_MIN_CHARS
  );
}

/**
 * For a click no candidate was found for: the candidate whose label the clicked text starts with
 */
function matchByText(elementText, candidates) {
  const clicked = simplify(elementText);
  if (length(clicked) < 3 || TAG_NAMES.has((elementText || "").trim().toLowerCase())) {
    return -1;
  }
  let best = -1;
  let bestLength = 0;
  candidates.forEach((label, j) => {
    const lab = simplify(label);
    if (
      length(lab) >= 3 &&
      (clicked.startsWith(lab) || lab.startsWith(clicked)) &&
      length(lab) > bestLength
    ) {
      best = j;
      bestLength = length(lab);
    }
  });
  return best;
}

/**
 * The action of candidate j on its page, e.g. 'open-email' for an email's subject link.
 * rowStartIsCheckbox: whether a row's first element is its checkbox (Dynamic detection)
 * or the whole row (Gmail rules)
 */
export function candidateAction(candidates, j, rowStartIsCheckbox) {
  if (isStarToggle(candidates, j)) return "star-email";
  if (j + 1 < candidates.length && isStarToggle(candidates, j + 1)) {
    return rowStartIsCheckbox ? "select-email" : "open-email";
  }
  if (j > 0 && isStarToggle(candidates, j - 1)) return "open-email"; // the subject link
  return cleanLabel(candidates[j]);
}

/**
 * What a logged click did, generalized: e.g. 'open-email', 'Back to list', 'Compose';
 * null if no element was hit. Takes the click context the extension logs (buildClickContext).
 */
export function actionOf(context, elementText) {
  const candidates = context.candidates || [];
  let index = context.clickedCandidateIndex ?? null;
  let role = context.clickedRole;
  const how = context.clickMatch || "on";

  if (how === "near" && index !== null && index >= 0 && index < candidates.length) {
    const clicked = simplify(elementText);
    const label = simplify(candidates[index]);
    if (!(clicked && label && (clicked.startsWith(label) || label.startsWith(clicked)))) {
      return null;
    }
  }

  if (index === null || index < 0) {
    index = matchByText(elementText, candidates);
    if (index < 0) return null;
    role = null;
    // A click anywhere on an email row is named with the whole row; clicking a row opens the email
    if (index + 1 < candidates.length && isStarToggle(candidates, index + 1)) {
      return "open-email";
    }
  }

  return candidateAction(candidates, index, role === "checkbox");
}

/**
 * Every distinct action available on a page, in page order (Jev's options)
 */
export function pageActions(candidates, detection) {
  const actions = [];
  candidates.forEach((_, j) => {
    const action = candidateAction(candidates, j, detection === "dynamic");
    if (action && !actions.includes(action)) actions.push(action);
  });
  return actions;
}

/* ========= PAGE STATES (click_tables.py) ========= */

/**
 * Readable page state, e.g. 'inbox · email open', 'drafts · compose', 'en.wikipedia.org/wiki/X'
 */
export function stateKey(page) {
  if (!page) return "(page load)";
  if (page.site === "gmail") {
    let view;
    if (page.composeOpen && page.emailOpen) {
      view = "email open · writing"; // a reply inside the email, or a compose window over it
    } else if (page.composeOpen) {
      view = "compose";
    } else if (page.emailOpen) {
      view = "email open";
    } else {
      view = "list";
    }
    // The compose window is itself a dialog, so a dialog only adds information without it
    const dialog = page.dialogOpen && !page.composeOpen ? " · dialog" : "";
    return `${page.folder ?? "?"} · ${view}${dialog}`;
  }
  const dialog = page.dialogOpen ? " · dialog" : "";
  return `${page.site ?? "?"}${page.path ?? ""}${dialog}`;
}

/* ========= WHAT JEV IS TOLD (jev_replay.py) ========= */

// How grouped actions are shown to Jev (other actions are shown as their label)
export const ACTION_TEXT = {
  "open-email": "Open an email from the list",
  "select-email": "Select an email (its checkbox)",
  "star-email": "Star or unstar an email",
  "Back to list": "Back to the email list",
  "Mark as read/unread": "Mark as read or unread",
  "preview-attachment": "Preview an attachment",
  "download-attachment": "Download an attachment",
  "save-attachment-to-drive": "Save an attachment to Drive",
};

export const actionText = (action) => ACTION_TEXT[action] ?? action;

export const QUESTION = "Which of these actions will the user take next?";

/**
 * Plain-text page description
 */
export function describePage(page) {
  if (!page) return "A page has just loaded.";
  if (page.site === "gmail") {
    const parts = [
      `Gmail web app. Folder: ${page.folder ?? "unknown"}.`,
      page.emailOpen ? "An email conversation is open." : "The email list is shown.",
    ];
    if (page.composeOpen) {
      parts.push("A message is being written.");
    } else if (page.dialogOpen) {
      parts.push("A dialog is open.");
    }
    return parts.join(" ");
  }
  const text = `Website: ${page.site ?? "unknown"}. Page: ${page.path ?? "/"}.`;
  return text + (page.dialogOpen ? " A dialog is open." : "");
}

/**
 * The state sent to Jev: the situation, plus the previous actions ({action, page}) if there are any
 */
export function buildState(page, input, history) {
  const situation = `${describePage(page)} The user is ${input}. ${QUESTION}`;
  if (!history || history.length === 0) return situation;
  return {
    situation: situation,
    previous_interactions: history.map((h) => ({ action: actionText(h.action), page: h.page })),
  };
}

/**
 * Actions ordered by Jev, most likely first (null if Jev couldn't answer).
 * More actions than Jev accepts at once: a tournament. Jev ranks each group, the best of every
 * group go to a final round, and the final decides the order (no option is dropped unseen).
 * @param {function(string[]): Promise<number[]|null>} ask - Jev's probability for each option text
 */
export async function rankActions(ask, actions, maxOptions) {
  const rank = async (group) => {
    const probabilities = await ask(group.map(actionText));
    if (probabilities === null) return null;
    return group
      .map((action, i) => ({ action, p: probabilities[i] }))
      .sort((a, b) => b.p - a.p) // stable, like Python's sorted(): ties keep page order
      .map((item) => item.action);
  };

  if (actions.length <= maxOptions) return rank(actions);

  const groupCount = Math.ceil(actions.length / maxOptions);
  const size = Math.ceil(actions.length / groupCount);
  const keep = Math.floor(maxOptions / groupCount);
  const groups = [];
  for (let start = 0; start < actions.length; start += size) {
    groups.push(actions.slice(start, start + size));
  }

  // The groups are independent, so they are asked at the same time
  const rankedGroups = await Promise.all(groups.map(rank));
  if (rankedGroups.includes(null)) return null;

  const finalists = rankedGroups.flatMap((ranked) => ranked.slice(0, keep));
  const rest = rankedGroups.flatMap((ranked) => ranked.slice(keep));
  const final = await rank(finalists);
  return final === null ? null : [...final, ...rest];
}
