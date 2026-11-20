/*******************************************************************************
* djinterp.js [tools]                                          strict_modules.js
*
*   The modules under src/ held to the checker's strict mode, by their
* paths under src/. tools/check_types.js holds them to it, and
* tools/check_style.js holds the functions inside them to the comment the
* owner's ruling D25 gives them. The strict mode is brought in a module at
* a time (D24); a module joins this list when it has no finding there.
*
*
* path:      /tools/strict_modules.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.17
*                                                            revised: 2026.11.18
*******************************************************************************/

// the modules held to the strict mode
export const STRICT = Object.freeze([
    'event/event.js',
    'event/event_common.js',
    'event/event_dispatcher_common.js',
    'event/event_handler_common.js',
    'event/event_registry_common.js',
    'event/event_table_common.js',
    'option/option_common.js',
    'text/cut.js',
    'text/real_format.js',
    'text/real_read.js',
    'tools/cli/cli_settings.js'
]);
