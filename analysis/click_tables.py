#!/usr/bin/env python3
"""
click_tables.py - Next-click prediction baselines from TabTabGo recordings (Free recording mode).

Builds the two tables the professor suggested and measures how well they predict:
  Table 1: P(next click | current page)
  Table 2: P(next click | previous page + current page)

Each click is turned into an "action" first, so the tables generalize across days:
  - labels are cleaned (counts, shortcut hints, Gmail state prefixes removed)
  - a specific email becomes what the click does to it: open-email, select-email, star-email
  - clicks that hit no element are left out (reported as "no target")

Usage:
  python3 analysis/click_tables.py ~/Downloads/P1_S*_record_*.json
  python3 analysis/click_tables.py ~/Downloads/P1_S*_record_*.json --export ~/Downloads/tabtabgo_results

--export writes table1.csv, table2.csv, accuracy.csv and clicks.csv (open in Excel/Numbers).

Only the Python standard library is used.
"""

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

# ---------------------------------------------------------------- label cleaning

INVISIBLE = re.compile(r'[​-‏‪-‮⁦-⁩﻿]')       # direction marks Gmail adds
SHORTCUT = re.compile(r'\s*\((?:[⌘⇧⌥⌃]|Ctrl|Shift|Alt)[^)]*\)')                  # "(⌘Enter)", "(Shift for pop-out)"
STATE_PREFIX = re.compile(r'^(?:selected|unread|starred|important),\s*', re.I)   # "selected, unread, Kino.kz, ..."
COUNTS = re.compile(r',?\s*(?:\d[\d,]*|one)\s+(?:unread(?:\s+messages?)?|new\s+messages?)\b,?', re.I)
SUFFIXES = re.compile(r'\s+has menu$', re.I)                                      # screen-reader text
OVERRIDES = [
    (re.compile(r'^Google Account:.*'), 'Google Account'),                        # also hides the email address
    (re.compile(r'^Back to .*'), 'Back to list'),                                 # "Back to Inbox", "Back to Sent Mail"
    (re.compile(r'^Select all .* conversations.*'), 'Select all conversations'),
    (re.compile(r'^Mark as (?:read|unread)$', re.I), 'Mark as read/unread'),      # one button, label shows its next action
]

# What the logger falls back to when an element has no text: not a usable label
TAG_NAMES = {'a', 'div', 'span', 'img', 'button', 'input', 'li', 'td', 'tr', 'svg'}


def clean_label(raw):
    s = unicodedata.normalize('NFKC', raw or '')
    s = INVISIBLE.sub('', s)
    s = SHORTCUT.sub('', s)
    while STATE_PREFIX.match(s):
        s = STATE_PREFIX.sub('', s, count=1)
    s = COUNTS.sub('', s)
    s = SUFFIXES.sub('', s)
    s = re.sub(r'\s+', ' ', s).strip(' ,.')
    for pattern, replacement in OVERRIDES:
        if pattern.match(s):
            return replacement
    return s


def simplify(text):
    """Letters and digits only, lowercase: for comparing a clicked text with a label"""
    return ''.join(ch for ch in (text or '').lower() if ch.isalnum())


# ---------------------------------------------------------------- actions

STAR_LABELS = {'Starred', 'Not starred'}
ROW_LABEL_MIN_CHARS = 20  # email rows have long labels (sender, subject, snippet); toolbar/nav items don't


def is_star_toggle(candidates, j):
    """The star button of an email row: "Starred"/"Not starred" next to a long row label.
    (The "Starred" folder link in the sidebar sits between short labels like Inbox and Snoozed.)
    Only one neighbour needs to be long: a subject can be short ("New", "(no subject)")."""
    if j <= 0 or j + 1 >= len(candidates):
        return False
    return (candidates[j] in STAR_LABELS and
            max(len(candidates[j - 1]), len(candidates[j + 1])) > ROW_LABEL_MIN_CHARS)


def match_by_text(element_text, candidates):
    """For a click no candidate was found for: the candidate whose label the clicked text starts with
    (e.g. a click on the date in an email row: its text starts like the row's label)"""
    clicked = simplify(element_text)
    if len(clicked) < 3 or (element_text or '').strip().lower() in TAG_NAMES:
        return -1
    best, best_len = -1, 0
    for j, label in enumerate(candidates):
        lab = simplify(label)
        if len(lab) >= 3 and (clicked.startswith(lab) or lab.startswith(clicked)) and len(lab) > best_len:
            best, best_len = j, len(lab)
    return best


def action_of(click):
    """What the click did, generalized: e.g. 'open-email', 'Back to list', 'Compose'.
    Returns (action, how) where how says how the clicked element was found, or (None, reason)."""
    candidates = click['candidates']
    index = click['index']
    role = click['role']
    how = click['match'] or 'on'

    # Same check the extension now makes when logging (recordings before it can contain wrong
    # "near" guesses, e.g. a disabled "Older" button logged as "Show more messages")
    if how == 'near' and 0 <= index < len(candidates):
        clicked, label = simplify(click['element_text']), simplify(candidates[index])
        if not (clicked and label and (clicked.startswith(label) or label.startswith(clicked))):
            return None, 'no target'

    if index is None or index < 0:
        index = match_by_text(click['element_text'], candidates)
        if index < 0:
            return None, 'no target'
        how, role = 'text', None
        # The row's first element is named with the whole row, so a click anywhere on the row
        # (sender, date) lands here; clicking a row opens the email
        if index + 1 < len(candidates) and is_star_toggle(candidates, index + 1):
            return 'open-email', how

    if is_star_toggle(candidates, index):
        return 'star-email', how
    if index + 1 < len(candidates) and is_star_toggle(candidates, index + 1):
        # First element of a row: the checkbox (Dynamic detection) or the whole row (Gmail rules)
        return ('select-email' if role == 'checkbox' else 'open-email'), how
    if index > 0 and is_star_toggle(candidates, index - 1):
        return 'open-email', how  # the subject link
    return clean_label(candidates[index]), how


# ---------------------------------------------------------------- page states

def state_key(page):
    """Readable page state, e.g. 'inbox · email open', 'drafts · compose', 'en.wikipedia.org/wiki/X'"""
    if not page:
        return '(page load)'
    if page.get('site') == 'gmail':
        if page.get('composeOpen'):
            view = 'compose'
        elif page.get('emailOpen'):
            view = 'email open'
        else:
            view = 'list'
        # The compose window is itself a dialog, so a dialog only adds information without it
        dialog = ' · dialog' if page.get('dialogOpen') and not page.get('composeOpen') else ''
        return f"{page.get('folder', '?')} · {view}{dialog}"
    dialog = ' · dialog' if page.get('dialogOpen') else ''
    return f"{page.get('site', '?')}{page.get('path', '')}{dialog}"


# ---------------------------------------------------------------- loading

def load_clicks(paths):
    clicks, skipped = [], Counter()
    for path in paths:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        session = f"{data.get('sessionId', '?')} ({path.rsplit('/', 1)[-1]})"
        for task in data.get('tasks', []):
            for item in task.get('interactions', []):
                context = item.get('context')
                if not context or item.get('timestamp') is None:
                    skipped['no context (older recording or placeholder)'] += 1
                    continue
                click = {
                    'session': session,
                    'mode': data.get('mode'),
                    'detection': data.get('detection', 'gmail-rules'),
                    'timestamp': item['timestamp'],
                    'element_text': item.get('elementText') or '',
                    'candidates': context.get('candidates') or [],
                    'index': context.get('clickedCandidateIndex'),
                    'role': context.get('clickedRole'),
                    'match': context.get('clickMatch'),
                    'state': state_key(context.get('pageState')),
                    'prev_state': state_key(context.get('prevPageState')),
                }
                click['action'], click['how'] = action_of(click)
                clicks.append(click)
    clicks.sort(key=lambda c: (c['session'], c['timestamp']))
    return clicks, skipped


# ---------------------------------------------------------------- tables and prediction

def build_tables(clicks):
    by_state = defaultdict(Counter)
    by_pair = defaultdict(Counter)
    overall = Counter()
    for c in clicks:
        by_state[c['state']][c['action']] += 1
        by_pair[(c['prev_state'], c['state'])][c['action']] += 1
        overall[c['action']] += 1
    return by_state, by_pair, overall


def ranked(counter):
    # Ties broken alphabetically so results are reproducible
    return [action for action, _ in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))]


def predict(click, tables, use_previous):
    """Top actions for a click's situation, backing off: (prev, state) -> state -> overall"""
    by_state, by_pair, overall = tables
    sources = []
    if use_previous:
        sources.append(by_pair.get((click['prev_state'], click['state'])))
    sources += [by_state.get(click['state']), overall]

    predictions = []
    for counter in sources:
        for action in ranked(counter or {}):
            if action not in predictions:
                predictions.append(action)
    return predictions


def evaluate(clicks):
    """Top-1 / top-3 accuracy of three predictors. Each session is predicted from the other
    sessions (leave-one-session-out); with a single session, each click from all the others."""
    sessions = sorted({c['session'] for c in clicks})
    by_session = len(sessions) >= 2
    results = {name: {'top1': 0, 'top3': 0, 'seen': 0} for name in ('overall', 'table1', 'table2')}

    for i, click in enumerate(clicks):
        training = [c for j, c in enumerate(clicks)
                    if (c['session'] != click['session'] if by_session else j != i)]
        tables = build_tables(training)
        by_state, by_pair, overall = tables
        guesses = {
            'overall': ranked(overall),
            'table1': predict(click, tables, use_previous=False),
            'table2': predict(click, tables, use_previous=True),
        }
        seen = {
            'overall': True,
            'table1': click['state'] in by_state,
            'table2': (click['prev_state'], click['state']) in by_pair,
        }
        for name, guess in guesses.items():
            results[name]['top1'] += click['action'] in guess[:1]
            results[name]['top3'] += click['action'] in guess[:3]
            results[name]['seen'] += seen[name]

    return results, ('leave-one-session-out' if by_session else 'leave-one-click-out (only 1 session)')


# ---------------------------------------------------------------- output

def print_table(title, table, top, min_clicks):
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")
    for key, counter in sorted(table.items(), key=lambda kv: -sum(kv[1].values())):
        n = sum(counter.values())
        if n < min_clicks:
            continue
        name = key if isinstance(key, str) else f"{key[0]}  →  {key[1]}"
        print(f"\n{name}   (n={n})")
        for action in ranked(counter)[:top]:
            print(f"   {counter[action] / n:6.1%}  {counter[action]:>3}  {action}")
        rest = len(counter) - top
        if rest > 0:
            print(f"          … {rest} more")


# ---------------------------------------------------------------- CSV export

PREDICTOR_NAMES = {
    'overall': 'Most frequent overall (no page info)',
    'table1': 'Table 1: current page',
    'table2': 'Table 2: previous + current page',
}


def open_csv(path):
    # utf-8-sig: Excel only shows non-English labels (Cyrillic, Japanese) correctly with a BOM
    return open(path, 'w', newline='', encoding='utf-8-sig')


def write_table_csv(path, table, with_previous):
    """One row per (page, action): how often the action was clicked there and its share"""
    with open_csv(path) as f:
        writer = csv.writer(f)
        writer.writerow((['previous_page'] if with_previous else []) +
                        ['page', 'clicks_on_page', 'rank', 'action', 'count', 'percent'])
        for key, counter in sorted(table.items(), key=lambda kv: -sum(kv[1].values())):
            n = sum(counter.values())
            page = list(key) if with_previous else [key]
            for rank, action in enumerate(ranked(counter), start=1):
                writer.writerow(page + [n, rank, action, counter[action], round(100 * counter[action] / n, 1)])


def write_accuracy_csv(path, results, method, n):
    with open_csv(path) as f:
        writer = csv.writer(f)
        writer.writerow(['predictor', 'top1_percent', 'top3_percent', 'situation_seen_percent', 'clicks', 'method'])
        for key, name in PREDICTOR_NAMES.items():
            r = results[key]
            writer.writerow([name, round(100 * r['top1'] / n, 1), round(100 * r['top3'] / n, 1),
                             round(100 * r['seen'] / n, 1), n, method])


def write_clicks_csv(path, clicks):
    with open_csv(path) as f:
        writer = csv.writer(f)
        writer.writerow(['session', 'timestamp', 'prev_state', 'state', 'action', 'found_by',
                         'clicked_label', 'clicked_role', 'element_text'])
        for c in clicks:
            label = c['candidates'][c['index']] if c['index'] is not None and 0 <= c['index'] < len(c['candidates']) else ''
            writer.writerow([c['session'], c['timestamp'], c['prev_state'], c['state'], c['action'] or '',
                             c['how'], label, c['role'] or '', c['element_text']])


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='+', help='session JSON files exported by TabTabGo')
    parser.add_argument('--top', type=int, default=5, help='actions shown per row of a table (default 5)')
    parser.add_argument('--min-clicks', type=int, default=1, help='hide table rows with fewer clicks')
    parser.add_argument('--csv', help='also write every click with its state and action to this CSV file')
    parser.add_argument('--export', metavar='FOLDER',
                        help='write table1.csv, table2.csv, accuracy.csv and clicks.csv into this folder')
    args = parser.parse_args()

    clicks, skipped = load_clicks(args.files)
    usable = [c for c in clicks if c['action'] is not None]
    no_target = [c for c in clicks if c['action'] is None]

    print(f"Files: {len(args.files)}   sessions: {len({c['session'] for c in clicks})}   clicks: {len(clicks)}")
    print(f"Usable: {len(usable)}   no target (left out): {len(no_target)}"
          + ''.join(f"   {reason}: {n}" for reason, n in skipped.items()))
    print('Found by: ' + ', '.join(f"{how} {n}" for how, n in Counter(c['how'] for c in usable).most_common()))
    for c in no_target:
        print(f"   no target: {c['element_text'][:60]!r} in {c['state']}")

    if not usable:
        sys.exit('No usable clicks.')

    by_state, by_pair, _ = build_tables(usable)
    print_table('TABLE 1: P(next click | current page)', by_state, args.top, args.min_clicks)
    print_table('TABLE 2: P(next click | previous page → current page)', by_pair, args.top, args.min_clicks)

    results, method = evaluate(usable)
    n = len(usable)
    print(f"\n{'=' * 78}\nHOW WELL DO THEY PREDICT?   ({method}, {n} clicks)\n{'=' * 78}")
    print(f"{'predictor':<44}{'top-1':>8}{'top-3':>8}{'situation seen':>17}")
    for key, label in PREDICTOR_NAMES.items():
        r = results[key]
        print(f"{label:<44}{r['top1'] / n:>8.1%}{r['top3'] / n:>8.1%}{r['seen'] / n:>17.1%}")
    print("\n'situation seen': share of clicks whose page (pair) occurred in the training data;"
          "\nunseen situations fall back to the next simpler predictor.")

    if args.csv:
        write_clicks_csv(args.csv, clicks)
        print(f"\nWrote {len(clicks)} clicks to {args.csv}")

    if args.export:
        folder = os.path.expanduser(args.export)
        os.makedirs(folder, exist_ok=True)
        write_table_csv(os.path.join(folder, 'table1.csv'), by_state, with_previous=False)
        write_table_csv(os.path.join(folder, 'table2.csv'), by_pair, with_previous=True)
        write_accuracy_csv(os.path.join(folder, 'accuracy.csv'), results, method, n)
        write_clicks_csv(os.path.join(folder, 'clicks.csv'), clicks)
        print(f"\nExported table1.csv, table2.csv, accuracy.csv, clicks.csv to {folder}")


if __name__ == '__main__':
    main()
