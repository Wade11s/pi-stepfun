/**
 * pi-stepfun — StepFun (阶跃星辰) Step Plan provider for pi.
 *
 * Registers the StepFun "Step Plan" subscription channel
 * (https://api.stepfun.com/step_plan/v1, OpenAI Chat Completions compatible)
 * with the text/reasoning models available to Step Plan subscribers:
 *
 * - step-5-preview        flagship base model for real-world tasks, 1M context, text+image input
 * - step-3.7-flash        flagship multimodal reasoning model, 256K context, text+image input
 * - step-3.5-flash        high-speed reasoning MoE (196B/A11B) tuned for agents & coding
 * - step-3.5-flash-2603   agent-optimized step-3.5-flash (low/high effort only)
 * - step-router-v1        auto-routes between deepseek-v4-pro and step-3.7-flash (Step Plan only;
 *                         text-only, max_tokens ≤ 250K, no web_search tool)
 *
 * Auth: set STEP_API_KEY, or run `/login stepfun` and paste a key created at
 * https://platform.stepfun.com (the Step Plan subscription must be active for the key's account).
 *
 * Install: put this under ~/.pi/agent/extensions/pi-stepfun/ or .pi/extensions/pi-stepfun/
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Step Plan dedicated endpoint (NOT the standard https://api.stepfun.com/v1). */
export const STEP_PLAN_BASE_URL = "https://api.stepfun.com/step_plan/v1";

/**
 * Shared OpenAI-compat quirks for the Step Plan Chat Completions endpoint:
 * - `reasoning_effort` (low/medium/high) controls reasoning depth
 * - only the `system` role is documented → disable `developer`
 * - request field is `max_tokens` (default INF; not OpenAI's `max_completion_tokens`)
 * - `store` / `strict` are not documented → don't send them
 * - streamed responses include usage, but `stream_options` is not documented
 */
const STEP_COMPAT = {
	supportsDeveloperRole: false,
	supportsReasoningEffort: true,
	supportsStore: false,
	supportsStrictMode: false,
	// Step documents usage in streamed chunks but do not document the
	// OpenAI `stream_options` request field. Keep pi from sending it.
	supportsUsageInStreaming: false,
	maxTokensField: "max_tokens",
} as const;

/** All three-level models: off can't disable reasoning natively → map to the cheapest tier. */
const EFFORT_LOW_MEDIUM_HIGH = {
	off: "low",
	minimal: null,
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: null,
	max: null,
} as const;

/** step-3.5-flash-2603 only accepts `low` / `high`. */
const EFFORT_LOW_HIGH = {
	off: "low",
	minimal: null,
	low: "low",
	medium: null,
	high: "high",
	xhigh: null,
	max: null,
} as const;

/**
 * List prices (¥ per 1M tokens) converted at ≈¥7.1/US$ and rounded.
 * Step Plan itself bills in Credits (1M Credits = ¥1, monthly pool), so these
 * are only pi's best-effort cost estimates. Cache writes are billed like
 * cache-miss input → cacheWrite mirrors the input price.
 *   step-5-preview:      ¥7 / ¥0.35 hit / ¥20 out
 *   step-3.7-flash:      ¥1.35 / ¥0.27 hit / ¥8.1 out
 *   step-3.5-flash(-2603): ¥0.7 / ¥0.14 hit / ¥2.1 out
 *   step-router-v1:      billed per routed model; mid estimate of the two engines
 */
const MODELS = [
	{
		id: "step-5-preview",
		name: "Step 5 Preview",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: { input: 0.99, output: 2.82, cacheRead: 0.05, cacheWrite: 0.99 },
		contextWindow: 1_000_000,
		maxTokens: 65536,
		thinkingLevelMap: { ...EFFORT_LOW_MEDIUM_HIGH },
		compat: { ...STEP_COMPAT },
	},
	{
		id: "step-3.7-flash",
		name: "Step 3.7 Flash",
		reasoning: true,
		input: ["text", "image"] as ("text" | "image")[],
		cost: { input: 0.19, output: 1.14, cacheRead: 0.04, cacheWrite: 0.19 },
		contextWindow: 262_144,
		maxTokens: 65536,
		thinkingLevelMap: { ...EFFORT_LOW_MEDIUM_HIGH },
		compat: { ...STEP_COMPAT },
	},
	{
		id: "step-3.5-flash",
		name: "Step 3.5 Flash",
		reasoning: true,
		input: ["text"] as ("text" | "image")[],
		cost: { input: 0.1, output: 0.3, cacheRead: 0.02, cacheWrite: 0.1 },
		contextWindow: 262_144,
		maxTokens: 65536,
		thinkingLevelMap: { ...EFFORT_LOW_MEDIUM_HIGH },
		compat: { ...STEP_COMPAT },
	},
	{
		id: "step-3.5-flash-2603",
		name: "Step 3.5 Flash 2603",
		reasoning: true,
		input: ["text"] as ("text" | "image")[],
		cost: { input: 0.1, output: 0.3, cacheRead: 0.02, cacheWrite: 0.1 },
		contextWindow: 262_144,
		maxTokens: 65536,
		thinkingLevelMap: { ...EFFORT_LOW_HIGH },
		compat: { ...STEP_COMPAT },
	},
	{
		id: "step-router-v1",
		name: "Step Router V1",
		reasoning: true,
		input: ["text"] as ("text" | "image")[],
		cost: { input: 0.15, output: 0.72, cacheRead: 0.03, cacheWrite: 0.15 },
		contextWindow: 262_144,
		// Step Router accepts up to 250K output tokens on the Step Plan
		// channel (the other models use the conservative 64K catalog value).
		maxTokens: 250_000,
		thinkingLevelMap: { ...EFFORT_LOW_MEDIUM_HIGH },
		compat: { ...STEP_COMPAT },
	},
];

/**
 * Step-specific context-overflow phrasings pi doesn't recognize natively
 * (pi's generic list already covers common OpenAI-style messages). Matched
 * errors get prefixed with `context_length_exceeded` so pi can auto-compact
 * and retry. Scoped to provider "stepfun" only.
 */
const STEP_OVERFLOW_PATTERNS = [
	/上下文(?:长度|大小).{0,32}(?:超过|超出|上限|限制)/i,
	/输入(?:长度|token).{0,24}(?:超过|超出|上限|限制)/i,
	/(?:超过|超出).{0,24}(?:上下文|context)/i,
	/(?:context(?:\s+length)?|prompt).{0,32}(?:exceed\w*|too long|maximum|limit)/i,
	/maximum.{0,32}context(?:\s+length)?/i,
	/(?:exceed\w*|too long|over).{0,32}context(?:\s+length)?/i,
];

export default function (pi: ExtensionAPI) {
	pi.registerProvider("stepfun", {
		name: "StepFun (Step Plan)",
		baseUrl: STEP_PLAN_BASE_URL,
		apiKey: "$STEP_API_KEY",
		api: "openai-completions",
		models: MODELS,
	});

	pi.on("message_end", (event, ctx) => {
		const message = event.message;
		if (message.role !== "assistant") return;
		if (message.stopReason !== "error") return;
		if (message.provider !== "stepfun" && ctx.model?.provider !== "stepfun") return;

		const errorMessage = message.errorMessage ?? "";
		if (errorMessage.includes("context_length_exceeded")) return;
		// Never rewrite throttling errors — pi retries those with backoff instead of compacting.
		if (/rate limit|too many requests|限流|请求过于频繁|速率限制/i.test(errorMessage)) return;
		if (!STEP_OVERFLOW_PATTERNS.some((pattern) => pattern.test(errorMessage))) return;

		return {
			message: {
				...message,
				errorMessage: `context_length_exceeded: ${errorMessage}`,
			},
		};
	});

	pi.registerCommand("stepfun", {
		description: "Show StepFun Step Plan provider info",
		handler: async (_args, ctx) => {
			const envSet = Boolean(process.env.STEP_API_KEY);
			const current =
				ctx.model?.provider === "stepfun" ? `\nCurrent model: ${ctx.model.id}` : "";
			ctx.ui.notify(
				[
					"StepFun (Step Plan) — https://api.stepfun.com/step_plan/v1",
					`STEP_API_KEY: ${envSet ? "set" : "not set (use /login stepfun to paste a key)"}`,
					"",
					"Models:",
					"  step-5-preview        1M ctx · text+image · effort low/medium/high",
					"  step-3.7-flash        256K ctx · text+image · effort low/medium/high",
					"  step-3.5-flash        256K ctx · text · effort low/medium/high",
					"  step-3.5-flash-2603   256K ctx · text · effort low/high",
					"  step-router-v1        256K ctx · 250K max output · text · auto-routes deepseek-v4-pro / step-3.7-flash",
					"",
					"Console: https://platform.stepfun.com",
					"Docs: https://platform.stepfun.com/docs/zh/step-plan/quick-start",
				].join("\n") + current,
				"info",
			);
		},
	});
}
