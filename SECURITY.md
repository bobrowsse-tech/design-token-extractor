# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Email **bobrowsse+security@gmail.com** with:

- a description of the issue
- steps to reproduce
- the affected package (`@design-tokens/core`, `@design-tokens/cli`, or the VS Code extension)
- any suggested fix, if you have one

You should hear back within 7 days. If the report is confirmed, we will work
on a fix and credit you if you want that.

## What this project does with your files

The VS Code extension and CLI read CSS/SCSS/SASS/LESS in a workspace to
extract design values. Rewriting source files is **opt-in** and only happens
after an explicit Preview + Apply (or a scoped CodeLens replace). Nothing is
sent to a remote service by this project.
