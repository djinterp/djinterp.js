/*******************************************************************************
* djinterp.js [tools]                                                rows_json.c
*
*   Writes what the reference holds as data, as JSON, so that the port reads
* it and types none of it again (JS_STYLE.md, section 7):
*     rows_json option  COMMIT   the option machine's vocabulary: statuses
*                                with their names and messages, kinds,
*                                sources, the registry's room, the djin
*                                statuses
*     rows_json fixture COMMIT   the tools' fixture (fixture.h): frames, and
*                                every member of each struct dj_option_env_var
*   Every name and message is asked of the reference's own functions. A
* 64-bit integer is written as a decimal string, since a JSON number is a
* double; a real as its "%.17g" text beside its bits in hexadecimal.
*
*
* path:      /tools/rows_json.c
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

// std
#include <stdio.h>     // printf, fputs
#include <string.h>    // strcmp
// djinterp
#include "djinterp/c/option/option_common.h"  // statuses
#include "./fixture.h"                        // the fixture
#include "./json_out.h"                       // json_string, json_rows

/*
write_option
  The option machine's vocabulary.
*/
static void
write_option(
    const char* _commit
)
{
    static const int statuses[] =
    {
        D_OPTION_STATUS_OK, D_OPTION_STATUS_KEY_ABSENT,
        D_OPTION_STATUS_KEY_DUPLICATE, D_OPTION_STATUS_VALUE_TYPE_MISMATCH,
        D_OPTION_STATUS_KEY_TYPE_MISMATCH, D_OPTION_STATUS_NO_VALUE,
        D_OPTION_STATUS_POLICY_REJECTED, D_OPTION_STATUS_CONFLICT,
        D_OPTION_STATUS_INVALID_ARGUMENT, D_OPTION_STATUS_BUFFER_TOO_SMALL,
        D_OPTION_STATUS_CAPACITY, D_OPTION_STATUS_VALUE_CAPACITY,
        D_OPTION_STATUS_NO_MEMORY
    };

    printf("{\n  \"reference\": \"%s\",\n", _commit);
    fputs("  \"generated_by\": \"tools/rows_json.c option\",\n", stdout);
    fputs("  \"statuses\": [\n", stdout);

    for (size_t i = 0u; i < sizeof(statuses) / sizeof(statuses[0]); ++i)
    {
        printf("    {\"code\": %d, \"name\": ", statuses[i]);
        json_string(d_option_status_name((enum dj_option_status)statuses[i]));
        fputs(", \"message\": ", stdout);
        json_string(
            d_option_status_message((enum dj_option_status)statuses[i]));
        fputs((i + 1u < sizeof(statuses) / sizeof(statuses[0])) ? "},\n"
                                                                : "}\n",
              stdout);
    }

    fputs("  ],\n  \"status_unknown\": {\"name\": ", stdout);
    json_string(d_option_status_name((enum dj_option_status)0x7777));
    fputs(", \"message\": ", stdout);
    json_string(d_option_status_message((enum dj_option_status)0x7777));
    printf("},\n  \"mechanical_floor\": %d,\n",
           (int)D_OPTION_STATUS_MECHANICAL_FLOOR);

    fputs("  \"kinds\": [", stdout);

    for (int kind = 0; kind <= D_OPTION_ENV_KIND_FLAGS; ++kind)
    {
        fputs((kind != 0) ? ", " : "", stdout);
        json_string(d_option_env_kind_name(kind));
    }

    fputs("],\n  \"sources\": [", stdout);

    for (int source = 0; source < D_OPTION_ENV_SOURCES; ++source)
    {
        fputs((source != 0) ? ", " : "", stdout);
        json_string(d_option_env_source_name(source));
    }

    fputs("],\n  \"source_unknown\": ", stdout);
    json_string(d_option_env_source_name(99));
    printf(",\n  \"depth_max\": %u,\n", (unsigned)D_OPTION_ENV_DEPTH_MAX);
    printf("  \"registry\": {\"bindings\": %u, \"variables\": %u, "
           "\"text\": %u, \"djins\": %u},\n",
           (unsigned)D_CFG_OPTION_ENV_REGISTRY_BINDINGS,
           (unsigned)D_CFG_OPTION_ENV_REGISTRY_VARIABLES,
           (unsigned)D_CFG_OPTION_ENV_REGISTRY_TEXT,
           (unsigned)D_CFG_OPTION_ENV_REGISTRY_DJINS);
    printf("  \"djin_abi\": %u,\n  \"djin_statuses\": [",
           (unsigned)D_DJIN_ABI);

    for (int status = D_DJIN_STATUS_OK; status <= D_DJIN_STATUS_SETTINGS;
         ++status)
    {
        fputs((status != 0) ? ", " : "", stdout);
        json_string(d_djin_status_name(status));
    }

    fputs("],\n  \"djin_status_unknown\": ", stdout);
    json_string(d_djin_status_name(99));
    fputs("\n}\n", stdout);

    return;
}

/*
write_fixture
  The frames, the rows no frame takes, the records, the reserved names.
*/
static void
write_fixture(
    const char* _commit
)
{
    printf("{\n  \"reference\": \"%s\",\n", _commit);
    fputs("  \"generated_by\": \"tools/rows_json.c fixture\",\n", stdout);
    fputs("  \"frames\": [\n", stdout);

    for (uint32_t f = 0u; f < FX_FRAMES; ++f)
    {
        const struct dj_fixture_frame* const frame = &fx_frames[f];

        fputs("    {\"name\": ", stdout);
        json_string(frame->name);
        fputs(", \"parent\": ", stdout);
        json_string(frame->parent);
        printf(", \"is_djin\": %s,\n      \"scopes\": [",
               (frame->is_djin != 0) ? "true" : "false");

        for (uint32_t s = 0u; s < frame->scope_count; ++s)
        {
            fputs((s != 0u) ? ", " : "", stdout);
            json_string(frame->scopes[s]);
        }

        printf("],\n      \"bindings\": %u, \"vars\": %u, \"text\": %u,\n"
               "      \"rows\": ",
               (unsigned)frame->bindings, (unsigned)frame->vars,
               (unsigned)frame->text);
        json_rows(frame->rows, frame->row_count);
        fputs((f + 1u < FX_FRAMES) ? "},\n" : "}\n", stdout);
    }

    fputs("  ],\n  \"bad_rows\": {\"rows\": ", stdout);
    json_rows(fx_bad_rows, FX_COUNT(fx_bad_rows));
    fputs("},\n  \"reserved\": [", stdout);

    for (size_t i = 0u; fx_reserved[i] != NULL; ++i)
    {
        fputs((i != 0u) ? ", " : "", stdout);
        json_string(fx_reserved[i]);
    }

    fputs("],\n  \"djins\": [\n", stdout);

    for (uint32_t d = 0u; d < FX_DJINS; ++d)
    {
        const struct dj_fixture_djin* const djin = &fx_djins[d];

        fputs("    {\"key\": ", stdout);
        json_string(djin->key);
        fputs(", \"name\": ", stdout);
        json_string(djin->name);
        fputs(", \"version\": ", stdout);
        json_string(djin->version);
        fputs(", \"summary\": ", stdout);
        json_string(djin->summary);
        printf(", \"abi\": %u,\n      \"settings\": ", (unsigned)djin->abi);
        json_string(djin->settings);
        fputs(", \"commands\": [", stdout);

        for (size_t c = 0u; c < djin->command_count; ++c)
        {
            fputs((c != 0u) ? ", " : "", stdout);
            fputs("{\"name\": ", stdout);
            json_string(djin->commands[c].name);
            fputs(", \"summary\": ", stdout);
            json_string(djin->commands[c].summary);
            putchar('}');
        }

        fputs((d + 1u < FX_DJINS) ? "]},\n" : "]}\n", stdout);
    }

    fputs("  ]\n}\n", stdout);

    return;
}

int main(int argc, char** argv)
{
    if ( (argc == 3) &&
         (strcmp(argv[1], "option") == 0) )
    {
        write_option(argv[2]);

        return 0;
    }

    if ( (argc == 3) &&
         (strcmp(argv[1], "fixture") == 0) )
    {
        write_fixture(argv[2]);

        return 0;
    }

    fputs("usage: rows_json option|fixture COMMIT\n", stderr);

    return 2;
}
