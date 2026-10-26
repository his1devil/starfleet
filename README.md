# Starfleet

把 coding agent 一次任务里的全部流程事件（请求、推理、正文、工具调用、权限、hook、压缩、子 agent……）画成一辆剖开的面包车实验室：MV-01。agent 的执行过程就是一次实验流程。先接 grok-build，后续接更多 agent。

画风参考 [anatomy](https://github.com/wheresryan22/anatomy)（等轴测、纸面四档明暗、细墨线、密集的小零件、卡片四角）和 [Every Joule](https://iamtechartist.github.io/every-joule-lesson1/)（纸上的 3D 墨线图、玻璃容器里的彩色液体）。完整的设计说明和事件映射见 [docs/lab-design.md](docs/lab-design.md)。

## 隐喻（简表）

| 实验车里 | agent 里 |
|---|---|
| 车顶导轨上的机械臂 | agent 本身：取样、送样、倒液，镜头默认跟着它 |
| 反应釜（三口烧瓶 + 加热套 + 回流冷凝管） | 模型：加热到第一滴冷凝液 = TTFT，紫色回流 = 推理，蓝色馏出 = 正文 |
| 储液塔（对数刻度，85% 红环） | 上下文窗口占用 |
| 蠕动泵 | 每次模型请求 |
| 驾驶台电传打印机 / 传递窗 | 用户消息进来、回答打出去 |
| 显微镜 / 分光仪 / 移液工作站 / 通风橱 | 读文件 / 搜索 / 写和编辑 / 执行命令 |
| 安全联锁（钥匙开关 + 红绿灯） | 权限请求，人工审批时弹授权单 |
| 对讲机 / 实验记录夹 / 天线 / 仪器机柜 | ask_user / todo / 联网 / MCP |
| 低温样品冰柜 | 回合完成，长期成长线（本机累计回合和 token） |
| 旋转蒸发仪 / 无人机坞站 / 失控反应 | 自动压缩 / 子 agent / 重试与 doom-loop（演示） |

## 目录

```
docs/grok-trace-events.md     grok-build 事件目录：数据源、分层、各流程状态机、字段、源码位置
docs/lab-design.md            MV-01 的画面、事件 → 实验流程映射、布局尺寸
tools/extract_grok_trace.py   ~/.grok/sessions 里的一个会话 → 统一事件格式（ATE v0）
prototype/src/page.html       页面骨架：样式、HUD、对话框
prototype/src/js/*.js         脚本模块，按文件名顺序拼成一个 <script type="module">
prototype/data/               抽取出的样例 trace
prototype/build.py            拼脚本、语法检查、注入 trace，输出到 prototype/dist/
```

脚本模块：`00-core` 数据与时间线，`10-render` 纸面材质与墨线后处理，`20-kit` 几何零件库，`30-van` 车与底板，`40/45-lab` 各台仪器，`50-robot` 机械臂，`60-hud` 记录与仪表，`70-director` 事件 → 动画，`75-demos` 演示事件，`80-main` 相机、输入、主循环。

## 跑小样

```sh
# 1. 从本地 grok 会话抽取（可换 --session / --turns）
python3 tools/extract_grok_trace.py \
  --session "~/.grok/sessions/<url-encoded-cwd>/<session-id>" \
  --turns 0,4,8,10,11,12,15,27 \
  --out prototype/data/sample-trace.json

# 2. 构建并本地预览（构建时会用 node --check 检查拼好的脚本）
python3 prototype/build.py
python3 -m http.server 8765 --directory prototype/dist   # 打开 http://127.0.0.1:8765
```

开场是整车全景，几秒后镜头靠近、跟着机械臂。拖动转视角，滚轮缩放，点仪器或右侧列表看详情；底部的「透视」滑块调车身外壳的透明度，「编号」开关仪器编号，半圆按钮切换明暗。帧率不够时会自动降低渲染分辨率，地址末尾加 `#hq` 可锁定最高画质。

小样目前用录制回放模拟「实时监控」。真人审批过的权限和 ask_user 提问会弹框让你来点，拒绝录制里批准过的操作会走演示分支。压缩、子 agent、失控反应三种事件本机还没有真实样本，用底部的「演示」按钮触发，payload 按 grok-build 源码里的真实 schema 构造。

`prototype/data/*.json` 不进版本库（含真实会话片段：prompt、命令输出、文件内容摘录），clone 后先用上面第 1 步从自己的 `~/.grok/sessions` 生成一份。
