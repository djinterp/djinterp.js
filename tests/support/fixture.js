/*******************************************************************************
* djinterp.js [tests]                                                 fixture.js
*
*   The tools' fixture (tools/fixture.h) made over the port, from the JSON
* tools/rows_json.c wrote of it: a registry, its frames with their rows,
* scopes and room, the records of its djins, and the rows no frame takes.
* No row is typed here.
*
*
* path:      /tests/support/fixture.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

import { readFileSync } from 'node:fs';

import * as djin from '../../src/modules/interp/djin.js';
import * as optionEnv from '../../src/option/option_env.js';
import * as optionEnvRegistry from '../../src/option/option_env_registry.js';

/**
 * A generated file's JSON.
 *
 * @param {string} _name  the file's name in generated/.
 * @returns {object}
 */
export function generated(
    _name
)
{
    return JSON.parse(readFileSync(new URL('../../generated/' + _name,
                                           import.meta.url), 'utf8'));
}

/**
 * The fixture, made: every frame set up as tools/session.c sets it up, in
 * its order, with the result of each step kept for a session to write.
 *
 * @returns {{data: object, registry: object, frames: Map<string, object>,
 *            steps: Array<object>, records: Map<string, object>,
 *            set: object}}
 */
export function makeFixture()
{
    const data     = generated('fixture.json');
    const first    = data.frames[0];
    const made     = optionEnvRegistry.init(first.name, {
        bindings: first.bindings, vars: first.vars, text: first.text
    });
    const registry = made.registry;
    const frames   = new Map();
    const steps    = [];

    for (const [f, fx] of data.frames.entries())
    {
        const frame = (f === 0) ? optionEnvRegistry.frame(registry)
                                : optionEnv.init({ bindings: fx.bindings,
                                                   vars:     fx.vars,
                                                   text:     fx.text });
        const step  = { name: fx.name };

        frames.set(fx.name, frame);

        if (f !== 0)
        {
            step.nameResult = optionEnv.setName(frame, fx.name);
        }

        step.declare = optionEnv.declareAll(frame, fx.rows);

        if (fx.scopes.length !== 0)
        {
            step.scopes = optionEnv.setScopes(frame, fx.scopes);
        }

        if (fx.parent !== null)
        {
            step.attach = fx.is_djin
                ? optionEnvRegistry.add(registry, frame)
                : optionEnv.setParent(frame, frames.get(fx.parent));
        }

        steps.push(step);
    }

    // the records, their settings found by name
    const records = new Map(data.djins.map((_djin) => [_djin.key, {
        abi:      _djin.abi,
        name:     _djin.name,
        version:  _djin.version,
        summary:  _djin.summary,
        commands: _djin.commands,
        settings: (_djin.settings !== null) ? frames.get(_djin.settings)
                                            : null
    }]));

    return {
        data:     data,
        registry: registry,
        made:     made,
        frames:   frames,
        steps:    steps,
        records:  records,
        set:      djin.setInit({ capacity: 3, registry: registry,
                                 reserved: data.reserved })
    };
}
