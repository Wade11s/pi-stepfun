# pi-stepfun

为 [pi coding agent](https://github.com/earendil-works/pi-mono) 接入 **阶跃星辰 StepFun「Step Plan」订阅通道**的 provider 扩展。

订阅 [Step Plan](https://platform.stepfun.com/step-plan) 后，即可在 pi 中以订阅额度（Credit 月池）调用阶跃旗舰模型，重点推荐 **`step-5-preview`**（新一代旗舰基模，1M 上下文，支持图片输入）。

> 参考：[Step Plan 快速开始](https://platform.stepfun.com/docs/zh/step-plan/quick-start) · [Step Plan 概述](https://platform.stepfun.com/docs/zh/step-plan/overview)

## 接入的模型

| 模型 ID | 说明 | 上下文 | 输入 | 推理强度 |
| --- | --- | --- | --- | --- |
| `step-5-preview` | 新一代旗舰基模，覆盖编程与专业知识工作 | **1M** | 文本 + 图片 | low / medium / high |
| `step-3.7-flash` | 旗舰多模态推理模型（198B/A11B MoE） | 256K | 文本 + 图片 | low / medium / high |
| `step-3.5-flash` | 高速推理模型，智能体与代码任务优化 | 256K | 文本 | low / medium / high |
| `step-3.5-flash-2603` | 高频 Agent 场景优化版，Token 效率更高 | 256K | 文本 | low / high |
| `step-router-v1` | 智能路由，按任务自动调度 `deepseek-v4-pro` / `step-3.7-flash` | 256K | 文本 | low / medium / high |

所有模型均支持流式输出与工具调用；`step-3.7-flash`、`step-3.5-flash` 和 `step-3.5-flash-2603` 还支持提示缓存（pi 会展示缓存命中统计）。

## 安装

```bash
# 用户级（所有会话可用）
git clone https://github.com/Wade11s/pi-stepfun.git ~/.pi/agent/extensions/pi-stepfun

# 或项目级
git clone https://github.com/Wade11s/pi-stepfun.git .pi/extensions/pi-stepfun
```

无需构建步骤，pi 直接加载 TypeScript 源码。

## 配置 API Key

二选一：

```bash
# 方式一：环境变量
export STEP_API_KEY=你的密钥
```

```text
# 方式二：在 pi 中执行 /login stepfun，粘贴密钥（存储于 ~/.pi/agent/auth.json）
```

> 前提：账号已订阅 Step Plan，并在 [控制台](https://platform.stepfun.com) 创建了 API Key。
> 注意 Step Plan 使用专用地址 `https://api.stepfun.com/step_plan/v1`（本扩展已内置），与按量付费的 `https://api.stepfun.com/v1` 互不影响。

## 使用

```text
/model stepfun/step-5-preview     # 切换模型（/model 交互选择亦可）
/stepfun                          # 查看本扩展接入信息
```

思考档位（Tab 循环切换）与 Step 的 `reasoning_effort` 对应：

| pi 档位 | step-5-preview / 3.7-flash / 3.5-flash / router | step-3.5-flash-2603 |
| --- | --- | --- |
| off | `low`（Step 模型无法完全关闭思考，取最省档） | `low` |
| low | `low` | `low` |
| medium | `medium` | —（自动就近取 `high`） |
| high | `high` | `high` |

## 计费说明

Step Plan 以 **Credit** 为统一计费单位（1M Credit = ¥1），按月发放、月内消耗。各模型用量按开放平台价格折算为 Credit 扣减，例如 `step-3.7-flash` 输出 1M tokens = ¥8.1 = 8.1M Credits。

扩展中标注的 `$` 成本为按牌价（¥7.1/US$ 汇率）折算的**近似估算**，仅供 pi 内成本参考，实际以订阅 Credit 月池扣减为准。

## 限制与说明

- `step-router-v1` 仅 Step Plan 通道可用；不支持图片输入、不支持 `web_search` 工具，`max_tokens` 上限 250K。
- Step 模型为推理原生模型，无法完全关闭思考；`off` 档会发送 `reasoning_effort: low` 以降低消耗。
- 思考内容通过 `reasoning` / `reasoning_content` 字段流式返回，pi 中显示为 thinking 区块。
- 上下文超限错误已做归一化处理，pi 会自动压缩上下文并重试。

## 发布到 npm

仓库内置 `.github/workflows/publish.yml`：

1. 修改 `package.json` 的版本号并提交，例如运行 `npm version patch`。
2. 推送版本 Tag：`git push --follow-tags`（格式必须是 `vX.Y.Z`，且与 `package.json` 版本一致）。
3. 在仓库的 **Settings → Secrets and variables → Actions → Secrets** 中配置 `NPM_TOKEN`。

工作流会在版本 Tag 推送时自动检查包内容，然后使用 npm provenance 发布到 `registry.npmjs.org`。

## License

MIT
