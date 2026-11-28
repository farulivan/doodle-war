# Security

Doodle War is a browser game with an optional room server for online play. There is no account and no
sign-in. The game stores its settings, record and the name last typed in the player's browser. The room
server keeps the players' names, the match and the room's last 30 chat lines in memory while the room lasts,
and stores nothing. It doesn't log chat.

## Reporting a vulnerability

Please report it privately, through GitHub:
[**Report a vulnerability**](https://github.com/farulivan/doodle-war/security/advisories/new)
(under the repository's **Security** tab). Please don't open a public issue for it.

Say what you found, where, and how to reproduce it. I aim to reply within 7 days.

## What gets fixed

The game and the room server as built from `main`. Older commits aren't patched.
