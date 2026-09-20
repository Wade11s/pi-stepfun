# pi-stepfun

[![CI](https://github.com/Wade11s/pi-stepfun/actions/workflows/publish.yml/badge.svg)](https://github.com/Wade11s/pi-stepfun/actions/workflows/publish.yml)
[![npm](https://img.shields.io/npm/v/pi-stepfun.svg)](https://www.npmjs.com/package/pi-stepfun)

[StepFun (阶跃星辰) "Step Plan"](https://platform.stepfun.com/step-plan) subscription provider for the [pi coding agent](https://github.com/earendil-works/pi-mono).

> 中文说明：[README.md](./README.md)

Once you subscribe to Step Plan, this extension lets pi call StepFun flagship models against your monthly Credit pool — headlined by **`step-5-preview`** (new-generation flagship base model, 1M context, image input).

> Reference: [Step Plan Quick Start](https://platform.stepfun.com/docs/zh/step-plan/quick-start) · [Models](https://platform.stepfun.com/docs/zh/guides/models/overview) · [Pricing](https://platform.stepfun.com/docs/zh/guides/pricing/details)

## Models

| Model ID | Notes | Context | Input | Effort levels |
| --- | --- | --- | --- | --- |
| `step-5-preview` | New flagship base model for coding & knowledge work | **1M** | text + image | low / medium / high |
| `step-3.7-flash` | Flagship multimodal reasoning (198B/A11B MoE) | 256K | text + image | low / medium / high |
| `step-3.5-flash` | High-speed reasoning, tuned for agents & coding | 256K | text | low / medium / high |
| `step-3.5-flash-2603` | Agent-optimized variant, better token efficiency | 256K | text | low / high |
| `step-router-v1` | Auto-routes by task complexity (complex reasoning goes to `deepseek-v4-pro`) | 256K | text | low / medium / high |

All models support streaming and tool calls. Prompt caching is supported by `step-5-preview`, `step-3.7-flash`, `step-3.5-flash`, and `step-3.5-flash-2603` (cache-hit stats show in pi's footer).

## Install

Install with pi's package manager (npm or GitHub source):

```bash
# npm (recommended)
pi install npm:pi-stepfun

# or the GitHub repository
pi install git:github.com/Wade11s/pi-stepfun

# pin a version
pi install npm:pi-stepfun@0.1.1
```

Other options:

```bash
# try it for the current run only (not written to settings)
pi -e npm:pi-stepfun

# project-level install (writes .pi/settings.json, shareable with your team)
pi install -l npm:pi-stepfun

# manual clone
git clone https://github.com/Wade11s/pi-stepfun.git ~/.pi/agent/extensions/pi-stepfun
```

Package management:

```bash
pi list                   # list installed packages
pi update npm:pi-stepfun  # update to the latest version
pi remove npm:pi-stepfun  # uninstall
```

No build step — pi loads the TypeScript source directly.

## API key

Either:

```bash
export STEP_API_KEY=your-key
```

or run `/login stepfun` inside pi and paste a key (stored in `~/.pi/agent/auth.json`).

> Prerequisite: an active Step Plan subscription and an API key from the [StepFun console](https://platform.stepfun.com).
> Step Plan uses the dedicated base URL `https://api.stepfun.com/step_plan/v1` (built into this extension) — separate from the pay-as-you-go `https://api.stepfun.com/v1`.

## Usage

```text
/model stepfun/step-5-preview     # switch models (or pick interactively via /model)
/stepfun                          # show provider info
```

pi thinking levels map to Step's `reasoning_effort`. Step models cannot disable thinking, so pi has no `off` level:

| pi thinking level | step-5-preview / 3.7-flash / 3.5-flash / router | step-3.5-flash-2603 |
| --- | --- | --- |
| low | `low` | `low` |
| medium | `medium` | — (clamps to `high`) |
| high | `high` | `high` |

## Billing notes

Step Plan bills everything in **Credits** (1M Credits = ¥1), granted monthly. Model usage is converted to Credits at the platform list prices (e.g. `step-3.7-flash` output = ¥8.1 / 1M tokens = 8.1M Credits).

The `$` cost shown in pi is a best-effort estimate based on the published list prices (USD); actual consumption draws from your Credit pool.

## Limitations

- `step-router-v1` is Step-Plan-only: no image input, no `web_search` tool, `max_tokens` capped at 250K.
- Step models are reasoning-native and cannot disable thinking, so pi has no `off` level; pick `low` to minimize cost.
- Thinking streams back via `reasoning` / `reasoning_content` and renders as thinking blocks in pi.
- Context-overflow errors are normalized so pi can auto-compact and retry.

## Publish to npm

The repository includes `.github/workflows/publish.yml`:

1. Bump the version in `package.json`, for example with `npm version patch`.
2. Push the version tag with `git push --follow-tags` (it must be `vX.Y.Z` and match the package version).
3. Add `NPM_TOKEN` under **Settings → Secrets and variables → Actions → Secrets**. The token must support non-interactive CI publishing (for example, an npm Automation Token); a regular token with publish-time 2FA will fail because CI cannot enter an OTP.

The workflow runs automatically for version tags, verifies the package contents, and publishes to `registry.npmjs.org` with npm provenance.

## License

MIT
