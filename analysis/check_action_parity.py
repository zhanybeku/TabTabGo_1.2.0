#!/usr/bin/env python3
"""
check_action_parity.py - Checks that the extension asks Jev exactly what jev_replay.py asks.

The extension has a JavaScript copy of the action definitions (src/tabtabgologic/pageActions.js).
For every click in the recordings this compares, Python against JavaScript:
  - the click's action (action_of)          - the page's actions (Jev's options)
  - the page state (state_key)              - the page description and the state with history
  - the tournament's order for >40 options, with a made-up "Jev" (a fixed probability per option)

Usage (needs Node.js):
  python3 analysis/check_action_parity.py ~/Downloads/P*_S*_*.json

Run it after changing either side. Only the Python standard library is used.
"""

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from click_tables import action_of, load_clicks, page_actions, state_key  # noqa: E402
from jev_replay import build_state, describe_page, rank_actions  # noqa: E402

NODE_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'page_actions_node.mjs')
HISTORY = 5


class FakeJev:
    """The same made-up "Jev" as page_actions_node.mjs: a fixed probability per option text"""
    def probabilities(self, state, options):
        return [(sum(ord(ch) for ch in text) * 7919 % 1000) / 1000 for text in options]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='+', help='session JSON files exported by TabTabGo')
    parser.add_argument('--max-options', type=int, default=40, help='options per Jev request (default 40)')
    args = parser.parse_args()

    clicks, _ = load_clicks(args.files)
    if not clicks:
        sys.exit('No clicks with context.')

    # History as jev_replay.py builds it: the previous usable clicks of the same session
    payload, expected = [], []
    for i, click in enumerate(clicks):
        earlier = [c for c in clicks[:i] if c['session'] == click['session'] and c['action'] is not None]
        history = earlier[-HISTORY:]
        payload.append({
            'context': {'candidates': click['candidates'], 'clickedCandidateIndex': click['index'],
                        'clickedRole': click['role'], 'clickMatch': click['match']},
            'elementText': click['element_text'],
            'detection': click['detection'],
            'page': click['page'],
            'history': [{'action': h['action'], 'page': h['state']} for h in history],
        })
        expected.append({
            'action': action_of(click)[0],
            'pageActions': page_actions(click),
            'stateKey': state_key(click['page']),
            'describePage': describe_page(click['page']),
            'state': build_state(click, history),
            'ranking': rank_actions(FakeJev(), None, page_actions(click), args.max_options),
        })

    result = subprocess.run(['node', NODE_SCRIPT], input=json.dumps({'clicks': payload, 'maxOptions': args.max_options}),
                            capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        sys.exit(f'Node failed:\n{result.stderr}')
    actual = json.loads(result.stdout)

    mismatches = 0
    for click, py, js in zip(clicks, expected, actual):
        for field in py:
            if py[field] != js[field]:
                mismatches += 1
                if mismatches <= 20:
                    print(f"✗ {field} differs ({click['session']}, {click['timestamp']}):\n"
                          f"    Python: {json.dumps(py[field], ensure_ascii=False)[:300]}\n"
                          f"    JS:     {json.dumps(js[field], ensure_ascii=False)[:300]}")

    tournaments = sum(len(p['pageActions']) > args.max_options for p in expected)
    print(f"{len(clicks)} clicks, {len(expected[0])} fields each, {tournaments} with a tournament "
          f"(>{args.max_options} actions): {'all identical ✓' if mismatches == 0 else f'{mismatches} differences ✗'}")
    sys.exit(1 if mismatches else 0)


if __name__ == '__main__':
    main()
