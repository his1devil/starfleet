# HX-1 运行时芯片：设计说明

第三个场景。前两个是比喻（实验车、推理主板），这一个直接画 grok-build harness 本身：芯片上的每个模块都是源码里真实存在的组件，名字取自源码；在模块之间流动的是真实会话的数据：上下文构成、每次请求的 token 数、缓存命中的块数、流式分片、工具调用。

## 为什么画成芯片

| 方案 | 好处 | 问题 |
|---|---|---|
| 操作系统架构 | 和 harness 的概念最贴近：回合是进程、工具是系统调用、权限是内核、hook 是中断、子 agent 是子进程（Karpathy 的「LLM OS」） | 实物化之后只剩分层框图，没有可以画的「东西」 |
| 主板架构（TK-1） | 模块是芯片和插卡，数据走铜线，已经做过 | 一个模块是一颗芯片，粒度太粗，装不下 harness 内部的流程 |
| 芯片版图（本场景） | 版图本身就是一张实体化的架构图；SRAM、总线、PHY、保护环这些部件天然精细；内存层级可以直接画（对话缓冲 → 前缀缓存 → KV 页 → 本地存储） | 版图天生抽象，要靠标注、形状和数据流把它讲清楚 |

所以这一版是一颗 2.5D 封装的芯片：操作系统的概念（循环、系统调用、中断、权限、子进程）画成芯片上的功能块，主板那一层只剩封装和网络。

## 画面

- 展示底座上两个封装。左边**本机**：harness 芯片（HX-1），外加 `~/.grok` 存储芯片；左侧是 ACP 客户端（终端或 IDE），前面是外部的 MCP 服务器。右边**远端**：推理服务，包括前端芯片、模型芯片和六个 HBM 堆叠。中间一束光纤就是网络（HTTPS 请求出去，SSE 流回来）。
- 模型和两种缓存（KV 缓存、提示缓存）都画在远端，因为它们本来就不在本机：harness 只能通过账单、计时和错误看到它们，它能做的是让请求的前缀保持稳定。
- harness 芯片的中心是**智能体循环**：一个圆台，六个阶段排成一圈，一颗亮点每次模型调用绕一圈。圆台外面是**环形总线**，各模块挂在总线上：外圈顺时针，内圈逆时针，箭头标出方向。
- 每个模块有英文名、中文名、源码里的名字，还有一个小雕塑：漏斗是组装，表盘是采样，三叉是分流，盾牌是权限，梳子是 hook，插头是 MCP，数据库是记忆，书堆是技能。
- 「封装盖」滑块控制两个封装的散热盖（画成玻璃）的透明度。

### 架构分层与名牌

- 28 个模块分成 8 层：会话与输入、循环核心、上下文管理、模型请求、工具管线、子会话与后台、远端推理、本地存储。每层一种颜色，取自页面的颜色变量，名牌、底座接缝和右侧图例用的是同一套。
- harness 芯片上的模块是**堆叠的裸片**：每个模块立在自己的底座上，高度按它的分量定，智能体循环最高（3.4），提问队列最低（0.7），所以版图有了高低。底座顶上有一道该层颜色的接缝，看得出模块属于哪一层；侧面画了硅通孔。
- 每个模块上方立着一块**玻璃名牌**，半透明，能看到下面的版图。名牌依次写着：哪一层、模块的中文名和英文名、源码里的名字和编号。模块在工作时名牌放大，边框变成该层的颜色，最后一行换成它此刻在做的事，比如「● 命中 84% · 50 块」「● docs-search · 4 个工具」；等待审批时边框是黄色，出错时是红色。
- 名牌画在描线之后的一层，芯片上的线不会压住字。每一帧按屏幕尺寸重新算大小，按优先级排开：正在工作的、离画面中心近的、底座高的先放，其余的沿柱子往上升，直到不和已放好的重叠；放不下的先隐去。靠近时名牌带编号，原来的 HTML 编号点让开。
- 拉远到全景时，模块名牌淡出，换成 8 个**分层标注**：像解剖图那样排在芯片上下两侧，彩色引线落到该层最居中的模块上。
- 右侧「架构分层」图例点一层，镜头会框住这一层的模块，其他层的名牌变淡；再点一次回到跟随。底部的「名牌」按钮可以把名牌全部收起。

### 元件

- 封装上加了一圈分立元件，高低错开：本机封装前沿是稳压模块（带散热鳍片）、一排高低不一的电解电容、电感、晶振和排阻；后沿是钽电容和小电解；左右两边是贴片电容、电解和电感。中介层边上排着硅电容。
- 远端封装右沿是两个稳压模块和一列电解电容，前后沿有电感、钽电容和电解，HBM 和模型芯片之间排着硅电容。

## 真实数据怎么进来

- **上下文构成**：抽取器从会话的 `chat_history.jsonl` 还原模型看到的每一条：系统提示词、`<user_info>`、技能清单提醒、MCP 提醒、每次提问、推理、正文、工具调用、工具结果。token 数按字符估算（ASCII 约 4 个一 token，中文约 1.5 个），和 grok 自己报的 `_meta.totalTokens` 对得上，误差 2–5%。只存类型、大小和名字，不存内容。
- **工具定义**不在聊天记录里。第一轮如果只有一次模型调用，账单输入减去第一次上下文读数就是它的大小，本机会话里约 7.3K token。
- **提示缓存按 256 token 一块**：账单里的 `cachedReadTokens` 全是 256 的整数倍。请求在画面上是一列「车厢」，一节车厢就是一块（太长时一节装几块）；远端的前缀索引从根开始逐块比对，命中的亮青色，后面的重新预填。
- 本机会话里能直接看到缓存的行为。第 0 轮命中 87%，因为系统提示词和工具定义在别的会话里已经缓存过。日期换了之后的那一轮命中 0，缓存过期了。再下一轮只命中 1280 token，只剩开头几块还在。
- 默认后端是无状态的 Responses API，每次请求都把整个对话重新发一遍。`response_started` 只有 Messages 后端才发，没有它的时候，每次请求的命中数按这一回合账单的命中比例估算，并取整到 256 的整数倍。

## grok-build harness 的真实结构（源码阅读摘要）

源码在 `~/Development/personal/grok-build`（主要是 `crates/codegen/xai-grok-shell`），下面每条后面括号里是对应的模块。

**回合与循环**（`session/acp_session_impl/turn.rs`）

1. `SessionCommand::Prompt` 进队列（`pending_inputs`），同一时间只跑一个回合。
2. `handle_prompt` 依次做这些事：
   - 解析斜杠命令和技能，发出 `turn_started`；
   - 处理图片（≤1.5 MB、≤2000 px，存进会话 `assets`）；
   - 注入回合前提醒（MCP 变化、日期变了、计划模式、后台任务、工作流）；
   - 写入提问，触发 `user_prompt_submit` hook；
   - 进入循环，循环结束后走收尾闸门；
   - 发出 `turn_ended` 和 `turn_completed`。
3. `process_conversation_turn` 每转一圈做这些事：
   - 发出 `loop_started`；
   - 原地打转检查：同一个工具调用连着 16 次就叫停，8 次时先提醒；
   - 注入插话、技能、监视输出、首回合记忆、MCP 提醒；
   - 上下文超过 85% 先压缩；
   - 组装请求，进入 `waiting_for_model`；
   - 采样，记用量，发出 `response_completed`；
   - 有工具调用就执行工具再转一圈，没有就去收尾闸门。
4. 回合的结局只有四种：完成、取消、达到轮数上限（默认不限）、原地打转被叫停。

**请求组装**（`xai-chat-state/src/actor/request_builder.rs`、`xai-grok-agent/src/prompt`）

- 系统提示词由 `PromptContext` 渲染 MiniJinja 模板而来。extend 模式是内置的 `prompt.md` 加上可选的正文。
- 会话前缀依次是：系统提示词、技能清单提醒、`<user_info>` 加 `<git_status>`、AGENTS.md。这段前缀之后不再改，日期变了也只追加一条提醒。源码注释原话是为了保住提示缓存。
- 工具列表只放内置工具。MCP 工具以 `server__tool` 的名字登记在旁路注册表里，模型要先用 `search_tool`（BM25）找到，再用 `use_tool` 调用。这样工具列表在会话中途不会变（「no KV cache breaks」）。
- 请求头带 `x-grok-conv-id`（会话 id），让请求尽量落到存着它缓存的机器上。加密推理按原样回放，保持前缀不变。请求体超过 47 MB 时先丢图片。

**采样器**（`xai-grok-sampler`）

- 传输：reqwest 走 HTTP/2，POST `/responses`，响应是 SSE 流。
- 计时：TTFT 只算第一段正文，推理不算；ITL 取分位数。
- 重试：遇到 429、5xx、断流或空响应时重试，间隔从 2 秒起翻倍、封顶 30 秒、加抖动，最多 15 次；429 只重试 1 次。
- doom-loop 检测：服务端发现推理在原地打转时中途掐断并重采样，最多 2 次。
- 空闲超时：600 秒没有新事件就判超时。

**工具调用**（`tool_calls.rs`、`xai-grok-workspace/src/permission`）

1. 等整段响应收完才执行工具。
2. 每个调用先过预检：
   - 修复坏掉的 JSON，修不了就把错误当结果交还模型；
   - 计划模式下，除了计划文件，所有编辑都拦下；
   - 跑 `pre_tool_use` hook（只能拦，不能改参数）。
3. 权限按下面的顺序逐项检查，命中就停：
   - 拒绝规则（YOLO 也拦不住）；
   - YOLO；
   - 已有授权；
   - auto 模式的分类器；
   - 只读工具和安全命令直接放行；
   - 都没决定，就用 `session/request_permission` 问你。
4. 通过的调用全部并行执行，不限并发；写同一路径的调用串行。
5. 结果追加提醒（诊断、任务完成）后写回对话，再跑 `post_tool_use` hook。

**上下文管理**

- 压缩（`session/compaction.rs`）：
  - 用会话自己的模型写一份九个小节的 `<summary>`；
  - 新对话只剩系统提示词、`<user_info>`、AGENTS.md、最后一条提问、摘要和一条状态提醒；
  - 检查点写进 `compaction_checkpoints/`；
  - `auto_compact_cancelled` 和 `auto_continue_completed` 在当前版本没有发出它们的代码。
- 记忆（`xai-grok-memory`）：
  - 默认关闭，开关是 `--experimental-memory`；
  - 数据存在 `MEMORY.md` 和 FTS5 加向量索引里；
  - 首回合检索前 6 条，并进系统消息；
  - flush 是一次不带工具的模型调用，只看最近约 20 条消息；
  - dream 在攒够 4 小时、3 份新日志后，把日志整合进 `MEMORY.md`。
- 技能：
  - 在 `.grok`、`.agents`、`.claude` 下的 `skills` 目录里发现；
  - 清单作为一条提醒放在系统提示词之后；
  - 模型用 `read_file` 读 `SKILL.md`，没有专门的技能工具。
- MCP：
  - 最多 8 个服务并行启动；stdio 起子进程，http 和 sse 共用 streamable HTTP；
  - OAuth 发现 5 秒超时；
  - 启动、连上、断开都通过提醒告诉模型；
  - stdio 服务挂了按 1、4、16 秒重启。

**其他**

- Hook：14 种事件，外部脚本从 stdin 收 JSON，默认 5 秒超时，出错一律放行。只有 `pre_tool_use` 能拦工具；`stop` 和 `subagent_stop` 能把模型推回去，每回合最多 8 次。
- 子 agent：一个独立会话，和父会话共用权限、hook、终端、文件系统和 MCP 连接；默认在后台跑，深度 1。工作流是 Rhai 脚本，脚本里的每个 agent 都是一个子会话。
- 后台与定时：命令转后台后，完成时自动唤醒；monitor 的输出作为提醒注入；定时任务间隔不少于 60 秒，最多 50 个。

## 模块对照

| 芯片上的模块 | 源码 | 对应的事件 |
|---|---|---|
| ACP 接口 / ACP 客户端 | ACP stdio JSON-RPC，events.jsonl / updates.jsonl 写入 | 用户消息、提问、反馈、等待交互、中继 |
| 提问队列 | `SessionCommand` · `pending_inputs` | 插话、自动唤醒 |
| 回合控制 | `handle_prompt` | turn_started / ended / completed、图片、自救 |
| 智能体循环 | `process_conversation_turn` | loop_started、phase_changed |
| 提醒注入 / 技能 | `push_system_reminder` · `SkillManager` | 提醒（随上下文构成显示） |
| 提示词模板 | `PromptContext` · `prompt.md` | — |
| 对话缓冲 | `ChatState` 会话条目 | 上下文 `_meta.totalTokens`，推理与正文整段 |
| 压缩器 | `run_compact_inner` | auto_compact_*、compaction_checkpoint |
| 请求组装 + 工具定义 | `build_conversation_request` · `tool_definitions_builtins_only` | — |
| 采样器 + 收发器 | `SamplerActor` · `SamplingClient` · `retry.rs` · `doom_loop.rs` | first_token、response_completed、retry_state、换模型 |
| 流处理 | `handle_sampling_event` | 流式分片、tool_call_delta_chunk、reasoning_completed |
| 工具执行 + 文件快照 | `execute_tool_calls` · `FileStateTracker` | tool_call / update / started / completed、diff_review、rewind_marker |
| 权限 | `PermissionManager` | permission_*、YOLO、计划模式、批准方案 |
| Hook 调度 | `HookDispatcher` | 14 种 hook、批注、插件 |
| 工具运行时（11 条通道） | `FinalizedToolset::call` | 计划、各类工具 |
| MCP 池 + 工具检索 | `McpManager` · `search_tool` / `use_tool` | mcp_* 全套 |
| 记忆 | `xai-grok-memory` | memory_* |
| 收尾闸门 + 目标模式 | `stop_gate.rs` · goal 各角色 | todo_gate、laziness、goal_* |
| 子会话 | `run_shell_child` · 工作流 | subagent_*、workflow_updated |
| 后台 | 后台任务、monitor、scheduler | task_*、monitor_event、scheduled_task_* |
| `~/.grok` | 会话目录、记忆、技能、hook、检查点 | 写入时闪灯 |
| 推理前端 / 模型 / KV 页 / 前缀索引（远端） | 推理服务的一般做法（示意） | 请求、首 token、缓存命中、重试 |

## 代码

`prototype/src/soc/`：

| 文件 | 内容 |
|---|---|
| `30-package` | 底座、封装、裸片、版图纹理、网络、封装盖 |
| `32-components` | 封装上的分立元件：稳压模块、电解、电感、钽电容、贴片电容、硅电容、晶振 |
| `35-routes` | 环形总线、路由、请求车厢 |
| `38-glyphs` | 模块上的小雕塑 |
| `40` / `42` / `44-harness` | harness 芯片上的各模块 |
| `45-remote` | 推理服务 |
| `50-flow` | 连接点、网络路径、上下文模型 |
| `55-layers` | 架构分层、模块底座和接缝、玻璃名牌、全景分层标注、图例 |
| `70-director` | 事件到动画 |
| `80-main` | 相机和主循环 |

`python3 prototype/build.py --variant soc` 输出 `prototype/dist/soc.html`。
