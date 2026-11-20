/*******************************************************************************
* djinterp.js [tools]                                    djinterp_fixture_main.c
*
*   The reference's own djinterp program, with the fixture's frames
* (fixture.h) in its registry: the second source of transcripts for
* djinterp.js. It is the reference's main (src/djinterp/tools/djinterp/
* djinterp_main.c) with two additions before the program runs: the
* fixture's rows are declared on the registry's root and its djins are
* registered; and a command line may be given as one line, split here as
* the port's `run` splits a line.
*     djinterp_fixture --line 'get --show-origin printer.style'
*     djinterp_fixture --rows-json COMMIT
*   The second form starts the kit's settings and writes the whole registry
* -- the fixture's rows and the kit's own, which are static in the kit --
* as JSON: generated/program.json, which the port's tests build their
* registry from.
*   djinterp_commands.c, djin.c and the kit are linked unchanged.
*
*   THE LINE'S WORDS. Spaces and tabs separate words. A span in double
* quotes keeps its spaces, with \" and \\ read as a quote and a backslash;
* a span in apostrophes is kept as it is. Quoted spans and plain text join
* into one word where nothing separates them. A backslash anywhere else is
* itself. A quote that is not closed is an error, said as the kit says one.
* This rule is this tool's and the port's, not the reference's: the
* reference is given its words by a shell.
*
*
* path:      /tools/djinterp_fixture_main.c
* link(s):   TBA
* author(s): Samuel 'teer' Neal-Blim                         created: 2026.11.15
*                                                            revised: 2026.11.15
*******************************************************************************/

// std
#include <stdio.h>   // fputs, stderr
#include <stdlib.h>  // calloc
#include <string.h>  // memset, strcmp, strlen
// djinterp
#include "djinterp/c/modules/parse/cli/arg_parser/arg_parser.h"  // the parser
#include "djinterp/tools/cli/c/cli_program.h"   // the kit's program
#include "djinterp/tools/cli/c/cli_settings.h"  // d_cli_settings_start
#include "djinterp_commands.h"                  // the program (-I src/djinterp/tools/djinterp)
#include "./fixture.h"                          // the fixture
#include "./json_out.h"                         // json_rows

#define FIXTURE_WORDS  64

static struct dj_option_env g_frames[FX_FRAMES];

/*
frame_of
  The fixture's frame of a name: the program's registry's root for the
first.
*/
static struct dj_option_env*
frame_of(
    const char* _name
)
{
    for (uint32_t f = 0u; (_name != NULL) && (f < FX_FRAMES); ++f)
    {
        if (strcmp(fx_frames[f].name, _name) == 0)
        {
            return (f == 0u)
                       ? d_option_env_registry_frame(d_option_env_registry())
                       : &g_frames[f];
        }
    }

    return NULL;
}

/*
setup
  The fixture's frames in the program's registry, but the last, which is a
root of its own. The registry's root keeps its own name, "djinterp".
*/
static int
setup(void)
{
    int ok = 1;

    for (uint32_t f = 0u; f + 1u < FX_FRAMES; ++f)
    {
        const struct dj_fixture_frame* const fx    = &fx_frames[f];
        struct dj_option_env* const          frame = frame_of(fx->name);

        if (f != 0u)
        {
            ok &= d_option_env_init(
                      frame,
                      (struct dj_option*)calloc(fx->bindings,
                                                sizeof(struct dj_option)),
                      (unsigned char*)calloc(fx->bindings, sizeof(uint64_t)),
                      fx->bindings,
                      (uint32_t)(fx->bindings * sizeof(uint64_t)),
                      (const struct dj_option_env_var**)
                          calloc(fx->vars, sizeof(void*)),
                      fx->vars,
                      (char*)calloc(fx->text, 1u),
                      fx->text).is_ok;
            ok &= d_option_env_set_name(frame, fx->name).is_ok;
        }

        ok &= d_option_env_declare_all(frame, fx->rows, fx->row_count).is_ok;

        if (fx->scope_count != 0u)
        {
            ok &= d_option_env_set_scopes(frame, fx->scopes,
                                          fx->scope_count).is_ok;
        }

        if (fx->parent != NULL)
        {
            ok &= ( (fx->is_djin != 0)
                        ? d_option_env_registry_add(d_option_env_registry(),
                                                    frame)
                        : d_option_env_set_parent(frame,
                                                  frame_of(fx->parent)) )
                      .is_ok;
        }
    }

    return ok;
}

/*
split
  A line's words, written into the line's own room; -1 for a quote that is
not closed, or too many words.
*/
static int
split(
    char*        _line,
    const char** _words,
    int          _room
)
{
    int   count = 0;
    char* out   = _line;
    char* at    = _line;

    while (*at != '\0')
    {
        int in_word = 0;

        while ( (*at == ' ') ||
                (*at == '\t') )
        {
            ++at;
        }

        if (*at == '\0')
        {
            break;
        }

        if (count >= _room)
        {
            return -1;
        }

        _words[count++] = out;

        while ( (*at != '\0') &&
                ( (in_word != 0) ||
                  ( (*at != ' ') &&
                    (*at != '\t') ) ) )
        {
            if (*at == '"')
            {
                for (++at; *at != '"'; ++at)
                {
                    if (*at == '\0')
                    {
                        return -1;
                    }

                    if ( (*at == '\\') &&
                         ( (at[1] == '"') ||
                           (at[1] == '\\') ) )
                    {
                        ++at;
                    }

                    *out++ = *at;
                }

                ++at;
            }
            else if (*at == '\'')
            {
                for (++at; *at != '\''; ++at)
                {
                    if (*at == '\0')
                    {
                        return -1;
                    }

                    *out++ = *at;
                }

                ++at;
            }
            else
            {
                *out++ = *at++;
            }

            in_word = 0;
        }

        // the word's end may be where the next begins: step past it first
        if (*at != '\0')
        {
            ++at;
        }

        *out++ = '\0';
    }

    return count;
}

/*
write_registry
  The program's registry as JSON: the root, then each djin, with its
scopes and every row it declares itself.
*/
static void
write_registry(
    const char* _commit
)
{
    struct dj_option_env_registry* const registry = d_option_env_registry();
    const uint32_t count = d_option_env_registry_count(registry);

    // a table of rows is rows_json.c's to write; here each frame is walked
    (void)json_rows;

    printf("{\n  \"reference\": \"%s\",\n", _commit);
    fputs("  \"generated_by\": \"tools/djinterp_fixture_main.c "
          "--rows-json\",\n", stdout);
    fputs("  \"frames\": [\n", stdout);

    for (uint32_t f = 0u; f <= count; ++f)
    {
        const struct dj_option_env* const frame =
            (f == 0u) ? d_option_env_registry_frame(registry)
                      : d_option_env_registry_at(registry, f - 1u);

        fputs("    {\"name\": ", stdout);
        json_string(frame->name);
        printf(", \"is_root\": %s,\n      \"scopes\": [",
               (f == 0u) ? "true" : "false");

        for (uint32_t s = 0u; s < frame->scope_count; ++s)
        {
            fputs((s != 0u) ? ", " : "", stdout);
            json_string(frame->scopes[s]);
        }

        printf("],\n      \"bindings\": %u, \"vars\": %u, \"text\": %lu,\n"
               "      \"rows\": [\n",
               (unsigned)frame->set.capacity, (unsigned)frame->var_capacity,
               (unsigned long)frame->text_capacity);

        for (uint32_t i = 0u; i < frame->var_count; ++i)
        {
            fputs("        ", stdout);
            json_row(frame->vars[i]);
            fputs((i + 1u < frame->var_count) ? ",\n" : "\n", stdout);
        }

        fputs((f < count) ? "      ]},\n" : "      ]}\n", stdout);
    }

    fputs("  ]\n}\n", stdout);

    return;
}

int main(
    int    _argc,
    char** _argv
)
{
    struct dj_arg_parser  parser;
    struct dj_cli_program program;
    const char*           words[FIXTURE_WORDS + 1];
    int                   count = 0;
    int                   status;

    memset(&program, 0, sizeof(program));

    if (setup() == 0)
    {
        (void)fputs("djinterp: error: the fixture could not be made\n",
                    stderr);

        return D_CLI_EXIT_TROUBLE;
    }

    if ( (_argc == 3) &&
         (strcmp(_argv[1], "--rows-json") == 0) )
    {
        (void)d_cli_settings_start(NULL);
        write_registry(_argv[2]);

        return D_CLI_EXIT_OK;
    }

    if ( (_argc == 3) &&
         (strcmp(_argv[1], "--line") == 0) )
    {
        words[0] = "djinterp";
        count    = split(_argv[2], words + 1, FIXTURE_WORDS - 1);

        if (count < 0)
        {
            (void)fputs("djinterp: error: a quote is not closed\n", stderr);

            return D_CLI_EXIT_TROUBLE;
        }

        ++count;
        words[count] = NULL;
    }
    else
    {
        for (; (count < _argc) && (count < FIXTURE_WORDS); ++count)
        {
            words[count] = _argv[count];
        }

        words[count] = NULL;
    }

    if (d_arg_parser_init(&parser,
                          "the djinterp language's command line: its djins "
                          "and their settings",
                          "djinterp") != D_ARG_OK)
    {
        (void)fputs("djinterp: error: out of memory\n", stderr);

        return D_CLI_EXIT_TROUBLE;
    }

    // a program whose making failed says why when it runs
    (void)d_djinterp_program_make(&program, &parser);
    status = d_cli_program_run(&program, count, words);

    d_cli_program_release(&program);
    d_arg_parser_release(&parser);

    return status;
}
