djinterp.js, @@NAME@@: the port's commits @@FIRST@@ to @@LAST@@

Unzip this folder anywhere and run @@NAME@@.ps1 as a file
(pwsh -File ..., or ./@@NAME@@.ps1 from its folder). It makes the
commits on main in D:\sam\code\projects\repos\djinterp\djinterp.js, or
in the repository -Repo names, and prints "done"; then git push.

@@START@@

-List says where the repository stands and what would be made, and
changes nothing; -Through N stops after step N, and running it again goes
on. It refuses before writing anything if HEAD's tree is none it knows,
if tracked files have changes, or if the folder has a file a step writes
that the repository does not track. After every commit it checks the
tree against the port's own commit's. Each tree is the port's to the
byte and each message the port's word for word, so the commits differ
from the port's only in who made them and when.

@@FILES@@

@@GATES@@

  #  port's   files     gates     subject
@@TABLE@@

"files" counts the files a step writes, and after a minus those it
deletes. "gates": tests passed of those run; s, the style check passes;
t, the type check passes. ~ marks a subject cut to fit; the message has
it whole.

BEFORE YOU RUN IT:

- Every commit is authored by git's user.name and user.email where it
  runs. For the commits to count on your GitHub graph, the email must be
  one on your account.
- The messages end as the port's do, with its Co-Authored-By and
  Claude-Session lines.

Made by the port's tools/make_kit.js.
