/* option_driver.c: a first source of transcripts for djinterp.js. Declares
   two rows, binds them from a script given as the one argument, and prints
   each status and each value with the source it came from, by djinterp's
   own functions. Built against djinterp at 2bb6b246. */
#include <stdio.h>
#include <string.h>
#include "djinterp/c/option/option_env.h"

static const struct dj_option_env_var g_vars[] =
{
    D_OPTION_ENV_REAL("ratio", 0.5, "a real"),
    D_OPTION_ENV_INT_RANGE("width", 240, 100, 600, "an int in range"),
};

int main(int argc, char** argv)
{
    struct dj_option_env           env;
    struct dj_option               options[16];
    unsigned char                  values[1024];
    const struct dj_option_env_var* vars[8];
    char                           text[1024];
    char                           out[128];
    size_t                         at = 0u;
    uint32_t                       i;
    struct dj_option_result        r;

    r = d_option_env_init(&env, options, values, 16u, sizeof(values),
                          vars, 8u, text, sizeof(text));
    printf("init %d\n", (int)d_option_result_status(&r));
    for (i = 0u; i < 2u; ++i)
    {
        r = d_option_env_declare(&env, &g_vars[i]);
        printf("declare %s %d\n", g_vars[i].name, (int)d_option_result_status(&r));
    }
    r = d_option_env_load(&env, (argc > 1) ? argv[1] : "", &at);
    printf("load %d (%s) at %zu\n", (int)d_option_result_status(&r),
           d_option_status_message((enum dj_option_status)d_option_result_status(&r)), at);
    for (i = 0u; i < 2u; ++i)
    {
        (void)d_option_env_format(&env, 0u, i, out, sizeof(out));
        printf("%s=%s  [%s]\n", g_vars[i].name, out,
               d_option_env_source_name(d_option_env_source(&env, 0u, i)));
    }
    return 0;
}
