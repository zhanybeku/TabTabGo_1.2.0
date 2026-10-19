#!/usr/bin/env python3
"""
jev_replay.py - Asks Jev to predict the recorded clicks, and compares it with the click tables.

For every usable click in the recordings (the same ones click_tables.py uses), Jev gets:
  - a description of the page (from the recorded page state), e.g. "Gmail web app. Folder: inbox."
  - the actions available on that page, grouped like the tables ("open an email from the list", "Compose", ...)
  - with --history N: the user's previous N actions in that session
and ranks the actions. Jev is scored like the tables: top-1 / top-3 accuracy.

Privacy: no email subjects or snippets are sent (emails are grouped into actions), but the labels of
other elements are, e.g. folder names and the text of links inside an open email.

Usage:
  python3 analysis/jev_replay.py ~/Downloads/P1_S*_record_*.json --dry-run            # see what would be sent
  JEV_API_KEY=... python3 analysis/jev_replay.py ~/Downloads/P1_S*_record_*.json --limit 10   # cheap test
  JEV_API_KEY=... python3 analysis/jev_replay.py ~/Downloads/P1_S*_record_*.json --export ~/Downloads/tabtabgo_results

Jev's answers are cached (--cache), so running again only calls the API for new requests.
"""

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from click_tables import (PREDICTOR_NAMES, evaluate, load_clicks, open_csv,  # noqa: E402
                          page_actions, state_key)

JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
JEV_MODEL = 'jev-1.13.0'  # same pinned model as the extension (jevClient.js)
REQUEST_TIMEOUT_S = 30    # offline there's no need for the extension's 1.2 s limit
RETRIES = 2

# How grouped actions are shown to Jev (other actions are shown as their label)
ACTION_TEXT = {
    'open-email': 'Open an email from the list',
    'select-email': 'Select an email (its checkbox)',
    'star-email': 'Star or unstar an email',
    'Back to list': 'Back to the email list',
    'Mark as read/unread': 'Mark as read or unread',
    'preview-attachment': 'Preview an attachment',
    'download-attachment': 'Download an attachment',
    'save-attachment-to-drive': 'Save an attachment to Drive',
}

QUESTION = 'Which of these actions will the user take next?'


# ---------------------------------------------------------------- what Jev is told

def describe_page(page):
    """Plain-text page description, worded like the extension's describePageForJev()"""
    if not page:
        return 'A page has just loaded.'
    if page.get('site') == 'gmail':
        parts = [f"Gmail web app. Folder: {page.get('folder', 'unknown')}.",
                 'An email conversation is open.' if page.get('emailOpen') else 'The email list is shown.']
        if page.get('composeOpen'):
            parts.append('A message is being written.')
        elif page.get('dialogOpen'):
            parts.append('A dialog is open.')
        return ' '.join(parts)
    text = f"Website: {page.get('site', 'unknown')}. Page: {page.get('path', '/')}."
    return text + (' A dialog is open.' if page.get('dialogOpen') else '')


def build_state(click, history):
    situation = f"{describe_page(click['page'])} The user is using the mouse. {QUESTION}"
    if not history:
        return situation
    # Same shape as the extension's Jev + History mode
    return {
        'situation': situation,
        'previous_interactions': [{'action': ACTION_TEXT.get(h['action'], h['action']), 'page': h['state']}
                                  for h in history]
    }


# ---------------------------------------------------------------- calling Jev

class JevClient:
    def __init__(self, api_key, model, cache_path, dry_run=False):
        self.api_key = api_key
        self.model = model
        self.cache_path = cache_path
        self.dry_run = dry_run
        self.calls = 0
        self.cache_hits = 0
        self.errors = 0
        self.latencies = []
        self.cache = {}
        if cache_path and os.path.exists(cache_path):
            with open(cache_path, encoding='utf-8') as f:
                self.cache = json.load(f)

    def probabilities(self, state, options):
        """Jev's probability for each option (a list of texts), or None if the request failed"""
        body = {
            'state': state,
            'model': self.model,
            'questions': {'next_element': {'type': 'choice',
                                           'criteria': {str(i): text for i, text in enumerate(options)}}}
        }
        key = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        if key in self.cache:
            self.cache_hits += 1
            return self.cache[key]
        self.calls += 1
        if self.dry_run:
            return [1 / len(options)] * len(options)

        for attempt in range(RETRIES + 1):
            try:
                request = urllib.request.Request(
                    JEV_ENDPOINT, data=json.dumps(body).encode(), method='POST',
                    headers={'Authorization': f'Bearer {self.api_key}', 'Content-Type': 'application/json'})
                start = time.time()
                with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_S) as response:
                    answer = json.load(response)['answers']['next_element']['probabilities']
                self.latencies.append(time.time() - start)
                result = [float(answer.get(str(i), 0)) for i in range(len(options))]
                self.cache[key] = result
                self._save()
                return result
            except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as error:
                detail = error.read().decode(errors='replace')[:200] if isinstance(error, urllib.error.HTTPError) else error
                if attempt == RETRIES:
                    print(f"   ⚠️  Jev request failed: {detail}", file=sys.stderr)
                    self.errors += 1
                    return None
                time.sleep(2 * (attempt + 1))

    def _save(self):
        if self.cache_path:
            os.makedirs(os.path.dirname(self.cache_path) or '.', exist_ok=True)
            with open(self.cache_path, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, ensure_ascii=False)


def rank_actions(jev, state, actions, max_options):
    """Actions ordered by Jev, most likely first (None if Jev couldn't answer).
    More actions than Jev accepts at once: a tournament. Jev ranks each group, the best of every
    group go to a final round, and the final decides the order (no option is dropped unseen)."""
    def ask(group):
        probs = jev.probabilities(state, [ACTION_TEXT.get(a, a) for a in group])
        if probs is None:
            return None
        return [a for _, a in sorted(zip(probs, group), key=lambda pa: -pa[0])]

    if len(actions) <= max_options:
        return ask(actions)

    n_groups = math.ceil(len(actions) / max_options)
    size = math.ceil(len(actions) / n_groups)
    keep = max_options // n_groups
    finalists, rest = [], []
    for start in range(0, len(actions), size):
        ranked_group = ask(actions[start:start + size])
        if ranked_group is None:
            return None
        finalists += ranked_group[:keep]
        rest += ranked_group[keep:]
    final = ask(finalists)
    return None if final is None else final + rest


# ---------------------------------------------------------------- evaluation

def replay(clicks, jev, history_sizes, max_options, limit):
    """Per history size: hit counts and one row per click"""
    results, rows = {}, []
    by_session = {}
    for c in clicks:
        by_session.setdefault(c['session'], []).append(c)

    for n_history in history_sizes:
        r = {'top1': 0, 'top3': 0, 'answered': 0, 'clicks': 0}
        done = 0
        for session_clicks in by_session.values():
            for i, click in enumerate(session_clicks):
                if limit and done >= limit:
                    break
                done += 1
                history = session_clicks[max(0, i - n_history):i] if n_history else []
                actions = page_actions(click)
                ranking = rank_actions(jev, build_state(click, history), actions, max_options)
                r['clicks'] += 1
                if ranking is not None:
                    r['answered'] += 1
                    r['top1'] += click['action'] in ranking[:1]
                    r['top3'] += click['action'] in ranking[:3]
                rows.append({
                    'history': n_history, 'session': click['session'], 'timestamp': click['timestamp'],
                    'page': click['state'], 'actual': click['action'], 'options': len(actions),
                    'jev_top1': ranking[0] if ranking else '', 'jev_top3': ' | '.join(ranking[:3]) if ranking else '',
                    'actual_rank': (ranking.index(click['action']) + 1) if ranking and click['action'] in ranking else '',
                })
                if sys.stderr.isatty():
                    print(f"\r   history {n_history}: {done} clicks", end='', file=sys.stderr)
                elif done % 25 == 0:
                    print(f"   history {n_history}: {done} clicks", file=sys.stderr)
        if sys.stderr.isatty():
            print(file=sys.stderr)
        results[n_history] = r
    return results, rows


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='+', help='session JSON files exported by TabTabGo')
    parser.add_argument('--history', type=int, nargs='+', default=[0, 5],
                        help='history sizes to compare (default: 0 5)')
    parser.add_argument('--max-options', type=int, default=40,
                        help='most options Jev gets in one request (default 40, like the extension)')
    parser.add_argument('--model', default=JEV_MODEL, help=f'Jev model (default {JEV_MODEL})')
    parser.add_argument('--cache', default=os.path.expanduser('~/.cache/tabtabgo/jev_cache.json'),
                        help="file that keeps Jev's answers (default ~/.cache/tabtabgo/jev_cache.json)")
    parser.add_argument('--limit', type=int, help='only replay the first N clicks (a cheap test)')
    parser.add_argument('--dry-run', action='store_true', help='show what would be sent, without calling Jev')
    parser.add_argument('--export', metavar='FOLDER', help='write accuracy.csv (tables + Jev) and jev_predictions.csv')
    args = parser.parse_args()

    api_key = os.environ.get('JEV_API_KEY', '')
    if not api_key and not args.dry_run:
        sys.exit('Set JEV_API_KEY (the key from the extension popup), or use --dry-run.')

    clicks, _ = load_clicks(args.files)
    usable = [c for c in clicks if c['action'] is not None]
    if not usable:
        sys.exit('No usable clicks.')

    jev = JevClient(api_key, args.model, None if args.dry_run else args.cache, dry_run=args.dry_run)

    if args.dry_run:
        i = next((i for i, c in enumerate(usable) if i >= 5 and len(page_actions(c)) > 5), 0)
        example = usable[i]
        history = [c for c in usable[max(0, i - 5):i] if c['session'] == example['session']]
        actions = page_actions(example)
        print(f'Example request (one click, history {len(history)}):\n')
        print(json.dumps({'state': build_state(example, history), 'options': [ACTION_TEXT.get(a, a) for a in actions]},
                         ensure_ascii=False, indent=2))
        print(f"\nActual click: {example['action']!r}")

    print(f"Replaying {min(len(usable), args.limit or len(usable))} clicks × history {args.history} "
          f"with {args.model}{' (dry run: no API calls)' if args.dry_run else ''}...", file=sys.stderr)
    jev_results, rows = replay(usable, jev, args.history, args.max_options, args.limit)
    print(f"Jev requests: {jev.calls} sent, {jev.cache_hits} from cache, {jev.errors} failed"
          + (f", average {sum(jev.latencies) / len(jev.latencies):.2f} s" if jev.latencies else ''))
    if args.dry_run:
        print('Dry run: the numbers below are meaningless (every option got the same probability).')

    # The tables, on the same clicks
    table_results, method = evaluate(usable)
    n_tables = len(usable)

    print(f"\n{'predictor':<44}{'top-1':>8}{'top-3':>8}{'clicks':>8}")
    summary = []
    for key, name in PREDICTOR_NAMES.items():
        r = table_results[key]
        summary.append([name, 100 * r['top1'] / n_tables, 100 * r['top3'] / n_tables, n_tables, method])
    for n_history, r in jev_results.items():
        name = f"Jev, history {n_history}" + (' (no previous actions)' if n_history == 0 else ' previous actions')
        n = r['clicks']
        summary.append([name, 100 * r['top1'] / n, 100 * r['top3'] / n, n,
                        f"{r['answered']} of {n} answered" if r['answered'] < n else 'all answered'])
    for name, top1, top3, n, _ in summary:
        print(f"{name:<44}{top1:>7.1f}%{top3:>7.1f}%{n:>8}")
    print(f"\nTables: {method}. Jev: no training, each click predicted from its page (and history).")
    if args.limit:
        print(f"(--limit {args.limit}: a quick test; Jev saw only {args.limit} clicks, so only a full run is comparable)")

    if args.export and not args.dry_run:
        folder = os.path.expanduser(args.export)
        os.makedirs(folder, exist_ok=True)
        with open_csv(os.path.join(folder, 'accuracy.csv')) as f:
            writer = csv.writer(f)
            writer.writerow(['predictor', 'top1_percent', 'top3_percent', 'clicks', 'notes'])
            for name, top1, top3, n, note in summary:
                writer.writerow([name, round(top1, 1), round(top3, 1), n, note])
        with open_csv(os.path.join(folder, 'jev_predictions.csv')) as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        print(f"\nExported accuracy.csv and jev_predictions.csv to {folder}")


if __name__ == '__main__':
    main()
