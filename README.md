# Starfleet

把 coding agent 一次任务里的全部流程事件（请求、推理、正文、工具调用、权限、hook、压缩、子 agent……）做成戴森球计划风格的 3D 星球工厂。先接 grok-build，后续接更多 agent。

## 隐喻

| 游戏里 | agent 里 |
|---|---|
| 伊卡洛斯（机甲） | agent 本身：飞到当前事件所在的建筑，镜头在它肩后跟随 |
| 恒星 | 模型 |
| 行星 | 会话（工作目录） |
| 卫星 | 子 agent |
| 火箭 | 一次模型请求，飞行时间 ≈ TTFT |
| 光束脉冲 | 流式 chunk（紫 = 推理，蓝 = 正文） |
| 闭环传送带 | agent loop：请求 → 流式 → 工具 → 结果回灌 → 再请求 |
| 权限闸门 | session/request_permission |
| 蓄电池 | 上下文窗口占用，85% 红线触发自动压缩 |
| 分馏塔 | compaction |
| 戴森球 | 全部会话的累计 token（长期成长线） |
| 黑雾 | 重试 / doom-loop |

## 目录

```
docs/grok-trace-events.md     grok-build 事件目录：数据源、分层、各流程状态机、字段、源码位置
tools/extract_grok_trace.py   ~/.grok/sessions 里的一个会话 → 统一事件格式（ATE v0）
prototype/src/page.html       视觉小样（Three.js 单页）
prototype/data/               抽取出的样例 trace
prototype/build.py            把 trace 注入页面，输出到 prototype/dist/
```

## 跑小样

```sh
# 1. 从本地 grok 会话抽取（可换 --session / --turns）
python3 tools/extract_grok_trace.py \
  --session "~/.grok/sessions/<url-encoded-cwd>/<session-id>" \
  --turns 0,4,8,10,11,12,15,27 \
  --out prototype/data/sample-trace.json

# 2. 构建并本地预览
python3 prototype/build.py
python3 -m http.server 8765 --directory prototype/dist   # 打开 http://127.0.0.1:8765
```

镜头有三种：默认「跟随」是 2.5D 过肩视角（固定 3/4 俯角，跟着伊卡洛斯，拖动转角度、滚轮调远近），另有「全景」和「星系」。画质会根据帧率自动降级（先关 GTAO，再降分辨率）；地址末尾加 `#hq` 可锁定最高画质。

小样目前用录制回放模拟「实时监控」。真人审批过的权限和 ask_user 提问会弹框让你来点，拒绝录制里批准过的操作会走演示分支。压缩、子 agent、黑雾三种事件本机还没有真实样本，用底部的「演示事件」按钮触发，payload 按 grok-build 源码里的真实 schema 构造。

`prototype/data/*.json` 不进版本库（含真实会话片段：prompt、命令输出、文件内容摘录），clone 后先用上面第 1 步从自己的 `~/.grok/sessions` 生成一份。
