# AI usage

The library and demo app were built in pair with Claude Code over two calendar days,
2026-09-16 to 2026-09-17. Figures below come from the local session transcripts and both
repositories' git history.

| | |
| --- | --- |
| Milestones completed | 9 out of 10 (M0–M8; M9 caching, stretch, not started) |
| Sessions | 5 (1 brainstorm, 2 build, 2 follow-up) |
| Active session time | ~10 hours (gaps over 15 min excluded; ~16 hours wall clock) |
| Human prompts | 130 |
| API calls | 710 |
| Token usage | 123M input / 0.66M output |
| of which uncached input | 1.65M |
| Models | Claude Opus 5 (brainstorm, M0–M2), Claude Fable 5.1 (M3–M8, follow-up) |
| Commits | 27 (12 lib, 15 app) |
| Files changed | 101 (52 lib, 49 app) |
| Unit tests | 116, pure layer only |

How it was used: the idea was discussed and challenged before any code; the plan, spikes and
findings were written as working notes under `.claude/docs`, then discarded once they had done
their job. Riskiest work first (Java/OSGi bridge), each milestone left the repo in a runnable,
deployed state, and the human did the Content Studio verification and the gallery styling
decisions.
