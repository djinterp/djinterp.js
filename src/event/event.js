/*******************************************************************************
* djinterp.js [event]                                                   event.js
*
*   The event core, whole: keys and verdicts, steps, the table, the
* registry and the dispatcher, under one import.
*     import * as event from './event/event.js';
*     const dispatcher = event.dispatcher_init();
*     const key        = event.key_of_name('set');
*     event.dispatcher_bind(dispatcher, key, event.step_make(handler));
*     event.dispatcher_fire(dispatcher, key, payload);
*   reference: inc/djinterp/c/event/event.h, at dfc793c4
*
*
* path:      /src/event/event.js
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

export * from './event_common.js';
export * from './event_handler_common.js';
export * from './event_table_common.js';
export * from './event_registry_common.js';
export * from './event_dispatcher_common.js';
