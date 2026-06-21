# 04 — Symmetric (mirrored) log tails

What it achieved: redefined the core scale. The two log tails were never true mirrors —
the left expanded its small extreme while the right compressed its large extreme — because
a plain log scale measures ratio (slope 1/x always expands the small end). This prompt
established the goal of treating both extremes by the SAME LAW, and led to replacing both
tails with `d3.scaleSymlog` measuring distance outward from the linear-window boundary.

Important refinement (see the follow-up prompt below): the goal is NOT a forced visual
mirror. The same compression law applies both sides, but the output must follow the data —
asymmetric data should look asymmetric. Symmetry is an emergent property of symmetric data,
never imposed by normalising the constant.

---

## Prompt (the crystallising statement)

> the whole purpose of this graph is to deal with a dataset which has outliers on both
> extremes. So I want a log scale — a traditional log scale on the right, but an inverted
> log scale on the left. […] I want a distribution that handles both of those in a visual
> way so that what you see on the right would be reflected on the left visually. In other
> words, like a log scale but both ways.

## Preceding diagnosis prompts

> ideally the left and the right should be using almost the same code. It's just mirrored,
> right? […] I think this isn't a patching problem, it's actually a problem with the code
> in general.

> does this fix still respect the integrity of the data it's meant to be displaying
> accurately?

> make sure you're using all the power and existing functions available to you from the
> d3 libraries — don't reinvent the wheel, and don't do things that aren't the D3 way.

## Follow-up prompt — faithful, not forced-symmetric

> The purpose of this graph is to enable people to visually inspect extreme data sets…
> I don't want to massage how that works depending on the data. I'm not looking for a
> 100% visually symmetric result — that would only happen if the linear section sat
> perfectly between two equal sets of extreme data. If the data doesn't say that, you're
> not going to massage it to look that way. My ultimate goal is not a visual outcome.

## Resolution

- Root cause: commit `0cbede2` had silently swapped `scalePow(0.3)` → `scaleLog` on both
  tails; neither was ever a mirror (both expand the small end).
- Fix: `symlogTail()` wraps native `d3.scaleSymlog` fed boundary-relative distance, so both
  tails compress outward by the same law.
- Constant: **slope-matched to the window** (boundary slope = window slope), a parameter-free
  value derived per-tail from the data + geometry. A first attempt used a shared `span/κ`
  constant for pixel-identical mirrors — rejected as "massaging," because it normalised away
  the data. The slope-matched version lets a small-range tail stay near-linear and a
  large-range tail compress hard; symmetry emerges only when the data is symmetric.
- Collapsed the hatch hacks (collectLeftBands, index formula, gap fill) now that the scale
  uses one shared law. See DEVLOG entries [13:50]–[14:20].
