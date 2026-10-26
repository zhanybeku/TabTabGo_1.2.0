// page_actions_node.mjs - Runs the extension's src/tabtabgologic/pageActions.js on clicks given as JSON
// on stdin, for check_action_parity.py. Not meant to be run by hand.

import { actionOf, buildState, describePage, pageActions, rankActions, stateKey } from "../src/tabtabgologic/pageActions.js";

// The same made-up "Jev" as check_action_parity.py: a fixed probability per option text
const fakeProbability = (text) => ([...text].reduce((sum, ch) => sum + ch.codePointAt(0), 0) * 7919 % 1000) / 1000;
const fakeAsk = async (options) => options.map(fakeProbability);

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { clicks, maxOptions } = JSON.parse(input);

const results = [];
for (const click of clicks) {
  results.push({
    action: actionOf(click.context, click.elementText),
    pageActions: pageActions(click.context.candidates, click.detection),
    stateKey: stateKey(click.page),
    describePage: describePage(click.page),
    state: buildState(click.page, "using the mouse", click.history),
    ranking: await rankActions(fakeAsk, pageActions(click.context.candidates, click.detection), maxOptions),
  });
}
process.stdout.write(JSON.stringify(results));
