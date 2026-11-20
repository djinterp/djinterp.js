/*******************************************************************************
* djinterp.js [tests]                                                cut.test.js
*
*   A text cut at a limit, and that no cut the port makes leaves half a
* character. The reference has nothing to say here: it cuts bytes, and
* the port counts units (HANDOFF.md, "where the port leaves the
* reference").
*
*
* path:      /tests/text/cut.test.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.16
*                                                            revised: 2026.11.16
*******************************************************************************/

import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as djinterp from '../../src/djinterp.js';
import { cutAt } from '../../src/text/cut.js';

const FACE = '\u{1F600}';

test('a cut is at the limit, for text that has no pairs', () =>
{
    assert.equal(cutAt('abcdef', 4), 'abcd');
    assert.equal(cutAt('abcdef', 6), 'abcdef');
    assert.equal(cutAt('abcdef', 9), 'abcdef');
    assert.equal(cutAt('abcdef', 0), '');
    assert.equal(cutAt('abcdef', -3), '');
    assert.equal(cutAt('', 4), '');
    assert.equal(cutAt('é€�', 2), 'é€');
});

test('a cut that would part a pair is one unit earlier', () =>
{
    const text = 'ab' + FACE + 'cd';

    assert.equal(cutAt(text, 2), 'ab');
    assert.equal(cutAt(text, 3), 'ab');
    assert.equal(cutAt(text, 4), 'ab' + FACE);
    assert.equal(cutAt(FACE, 1), '');
    assert.equal(cutAt(FACE + FACE, 3), FACE);

    // half a pair that was already alone is not the cut's to mend
    assert.equal(cutAt('ab\uD83Dcd', 3), 'ab\uD83D');
    assert.equal(cutAt('ab\uDE00cd', 3), 'ab\uDE00');
});

test('what get writes of a long value ends on a whole character',
     async () =>
{
    const dj   = await djinterp.open({
        settings: [djinterp.optionEnv.rowText('title', null)]
    });
    const long = 'x'.repeat(510) + FACE + 'tail';

    assert.equal((await dj.run(['set', 'title=' + long])).status, 0);

    // 511 units would end on the pair's first half: 510 are written
    const got = (await dj.run(['get', 'title'])).out;

    assert.equal(got, 'title = ' + 'x'.repeat(510) + '\n');

    // one unit less of padding and the pair is whole inside the limit
    const fits = 'x'.repeat(509) + FACE + 'tail';

    await dj.run(['set', 'title=' + fits]);
    assert.equal((await dj.run(['get', 'title'])).out,
                 'title = ' + 'x'.repeat(509) + FACE + '\n');
});
