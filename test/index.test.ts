import { test } from "node:test";
import assert from "node:assert/strict";
import plugin from "../index.ts";

type MockModel = {
	id: string;
	reasoning: boolean;
	input: string[];
	cost: Record<string, number>;
	contextWindow: number;
	maxTokens: number;
	thinkingLevelMap: Record<string, string | null>;
	compat: Record<string, unknown>;
};

function createMockPi() {
	const providers: Array<{ name: string; config: Record<string, unknown> }> = [];
	const commands = new Map<
		string,
		{ description?: string; handler: (args: string, ctx: unknown) => Promise<void> }
	>();
	const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	const pi = {
		registerProvider(name: string, config: Record<string, unknown>) {
			providers.push({ name, config });
		},
		on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerCommand(
			name: string,
			options: { description?: string; handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			commands.set(name, options);
		},
	};
	return { pi, providers, commands, handlers };
}

function load() {
	const mock = createMockPi();
	plugin(mock.pi as unknown as Parameters<typeof plugin>[0]);
	assert.equal(mock.providers.length, 1, "exactly one provider is registered");
	const provider = mock.providers[0];
	assert.equal(provider.name, "stepfun");
	const models = provider.config.models as MockModel[];
	const byId = new Map(models.map((model) => [model.id, model]));
	return { ...mock, models, byId, provider };
}

/** Run the registered message_end handler against a fake assistant error message. */
function runMessageEnd(
	handlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>,
	message: Record<string, unknown>,
	ctx: Record<string, unknown> = {},
) {
	const list = handlers.get("message_end");
	assert.ok(list && list.length === 1, "message_end handler registered");
	return list[0]({ type: "message_end", message }, ctx);
}

test("registers the StepFun Step Plan channel", () => {
	const { provider } = load();
	assert.equal(provider.config.baseUrl, "https://api.stepfun.com/step_plan/v1");
	assert.equal(provider.config.api, "openai-completions");
	assert.equal(provider.config.apiKey, "$STEP_API_KEY");
	assert.equal(provider.config.name, "StepFun (Step Plan)");
});

test("registers exactly the Step Plan models", () => {
	const { models } = load();
	assert.deepEqual(
		models.map((model) => model.id),
		["step-5-preview", "step-3.7-flash", "step-3.5-flash", "step-3.5-flash-2603", "step-router-v1"],
	);
});

test("step-5-preview advertises 1M context and 64K max output", () => {
	const { byId } = load();
	const model = byId.get("step-5-preview");
	assert.ok(model);
	assert.equal(model.contextWindow, 1_000_000);
	assert.equal(model.maxTokens, 65536);
	assert.ok(model.reasoning);
	assert.deepEqual(model.input, ["text", "image"]);
	assert.deepEqual(model.cost, { input: 1.0, output: 2.7, cacheRead: 0.05, cacheWrite: 1.0 });
});

test("step-5-preview maps pi thinking levels to low/medium/high only", () => {
	const { byId } = load();
	const map = byId.get("step-5-preview")?.thinkingLevelMap;
	assert.ok(map);
	// StepFun documents reasoning_effort ∈ {low, medium, high} for step-5-preview.
	assert.equal(map.low, "low");
	assert.equal(map.medium, "medium");
	assert.equal(map.high, "high");
	// Step models are reasoning-native: no off/minimal, and no xhigh/max either.
	for (const unsupported of ["off", "minimal", "xhigh", "max"]) {
		assert.equal(map[unsupported], null, `${unsupported} must be unsupported`);
	}
});

test("three-level models share the low/medium/high map", () => {
	const { byId } = load();
	for (const id of ["step-3.7-flash", "step-3.5-flash", "step-router-v1"]) {
		const map = byId.get(id)?.thinkingLevelMap;
		assert.ok(map, `${id} registered`);
		assert.deepEqual(
			{ low: map.low, medium: map.medium, high: map.high },
			{ low: "low", medium: "medium", high: "high" },
			`${id} effort map`,
		);
		assert.equal(map.off, null);
	}
});

test("step-3.5-flash-2603 only accepts low/high effort", () => {
	const { byId } = load();
	const map = byId.get("step-3.5-flash-2603")?.thinkingLevelMap;
	assert.ok(map);
	assert.equal(map.low, "low");
	assert.equal(map.high, "high");
	assert.equal(map.medium, null);
});

test("step-router-v1 allows 250K output tokens and text-only input", () => {
	const { byId } = load();
	const model = byId.get("step-router-v1");
	assert.ok(model);
	assert.equal(model.maxTokens, 250_000);
	assert.deepEqual(model.input, ["text"]);
});

test("models share the Step Plan OpenAI-compat quirks", () => {
	const { models } = load();
	for (const model of models) {
		assert.deepEqual(
			model.compat,
			{
				supportsDeveloperRole: false,
				supportsReasoningEffort: true,
				supportsStore: false,
				supportsStrictMode: false,
				supportsUsageInStreaming: false,
				maxTokensField: "max_tokens",
			},
			`${model.id} compat`,
		);
	}
});

test("rewrites Chinese overflow errors to context_length_exceeded", () => {
	const { handlers } = load();
	const result = runMessageEnd(handlers, {
		role: "assistant",
		provider: "stepfun",
		stopReason: "error",
		errorMessage: "上下文长度超过上限，请减少输入",
	});
	assert.ok(result && typeof result === "object");
	const rewritten = (result as { message: { errorMessage: string } }).message.errorMessage;
	assert.match(rewritten, /^context_length_exceeded: 上下文长度超过上限，请减少输入$/);
});

test("rewrites English overflow errors to context_length_exceeded", () => {
	const { handlers } = load();
	const result = runMessageEnd(handlers, {
		role: "assistant",
		provider: "stepfun",
		stopReason: "error",
		errorMessage: "This model's maximum context length is 1000000 tokens",
	});
	assert.ok(result && typeof result === "object");
	assert.match(
		(result as { message: { errorMessage: string } }).message.errorMessage,
		/^context_length_exceeded: /,
	);
});

test("leaves throttling, prefixed, foreign-provider and healthy messages alone", () => {
	const { handlers } = load();
	const base = { role: "assistant", stopReason: "error" } as Record<string, unknown>;

	// Rate-limit errors must stay untouched so pi retries with backoff.
	assert.equal(
		runMessageEnd(handlers, { ...base, provider: "stepfun", errorMessage: "rate limit exceeded" }),
		undefined,
	);
	assert.equal(
		runMessageEnd(handlers, {
			...base,
			provider: "stepfun",
			errorMessage: "请求过于频繁，请稍后重试",
		}),
		undefined,
	);
	// Already normalized.
	assert.equal(
		runMessageEnd(handlers, {
			...base,
			provider: "stepfun",
			errorMessage: "context_length_exceeded: prompt too long",
		}),
		undefined,
	);
	// Unrelated provider errors are not our business.
	assert.equal(
		runMessageEnd(handlers, {
			...base,
			provider: "anthropic",
			errorMessage: "context length exceeded",
		}),
		undefined,
	);
	// Successful messages are not touched.
	assert.equal(
		runMessageEnd(handlers, {
			...base,
			provider: "stepfun",
			errorMessage: "上下文长度超过上限",
			stopReason: "stop",
		}),
		undefined,
	);
	// Non-overflow errors pass through.
	assert.equal(
		runMessageEnd(handlers, { ...base, provider: "stepfun", errorMessage: "internal server error" }),
		undefined,
	);
});

test("falls back to the session model provider for overflow rewriting", () => {
	const { handlers } = load();
	const result = runMessageEnd(
		handlers,
		{ role: "assistant", provider: "other", stopReason: "error", errorMessage: "prompt too long" },
		{ model: { provider: "stepfun", id: "step-5-preview" } },
	);
	assert.ok(result && typeof result === "object");
	assert.match(
		(result as { message: { errorMessage: string } }).message.errorMessage,
		/^context_length_exceeded: /,
	);
});

test("/stepfun command reports provider info", async () => {
	const { commands } = load();
	const command = commands.get("stepfun");
	assert.ok(command, "stepfun command registered");
	assert.match(command.description ?? "", /StepFun/);

	const calls: Array<[string, string]> = [];
	await command.handler("", {
		ui: { notify: (message: string, level: string) => calls.push([message, level]) },
		model: { provider: "stepfun", id: "step-5-preview" },
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0][1], "info");
	const [text] = calls[0];
	assert.match(text, /api\.stepfun\.com\/step_plan\/v1/);
	assert.match(text, /step-5-preview\s+1M ctx/);
	assert.match(text, /Current model: step-5-preview/);
	assert.match(text, /STEP_API_KEY: (set|not set)/);
});
