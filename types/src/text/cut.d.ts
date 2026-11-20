/*******************************************************************************
* djinterp.js [text]                                                      cut.js
*
*   A text cut at a limit. The port counts text in UTF-16 units, and a
* character past the first plane is two of them, a surrogate pair. A cut
* that fell between the two would leave half a character, which is no
* text: so where it would, the cut is one unit earlier (the owner's
* ruling of 2026-11-16 on a cut that would part a pair).
*   The reference cuts bytes without regard to characters. For ASCII, and
* for every character in the first plane, the port's cut is at the limit
* exactly, as the reference's is.
*
*
* path:      /src/text/cut.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.16
*                                                            revised: 2026.11.17
*******************************************************************************/
/**
 * The first units of a text, as many as a limit allows, and one fewer
 * where the last of them would be the first half of a surrogate pair.
 *
 * @param {string} _text   the text.
 * @param {number} _limit  the most units to keep; under 1 keeps none.
 * @returns {string} the text, whole or cut.
 */
export function cutAt(_text: string, _limit: number): string;
