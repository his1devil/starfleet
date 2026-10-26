# Starfleet

把 coding agent 一次任务里的全部流程事件（请求、推理、正文、工具调用、权限、hook、压缩、子 agent……）画成一辆剖开的厢式车实验室：MV-01。agent 的执行过程就是一次实验流程。先接 grok-build（131 种事件全部有对应的仪器和动画），后续接更多 agent。

画风参考 [anatomy](https://github.com/wheresryan22/anatomy)（等轴测、纸面四档明暗、细墨线、密集的小零件、卡片四角）和 [Every Joule](https://iamtechartist.github.io/every-joule-lesson1/)（纸上的 3D 墨线图、玻璃容器里的彩色液体）。完整的设计说明和事件映射见 [docs/lab-design.md](docs/lab-design.md)。

## 隐喻（简表）

| 实验车里 | agent 里 |
|---|---|
| 车顶导轨上的机械臂 | agent 本身：取工单、送仪器、倒液，镜头默认跟着它 |
| 反应釜 / 蠕动泵 / 溶剂回收罐 | 模型推理（首滴 = TTFT，紫色回流 = 推理，蓝色馏出 = 正文）/ 每次请求 / 缓存命中 |
| 储液塔（对数刻度，85% 红环） | 上下文窗口占用 |
| 显微镜、载玻片转盘 / 分光仪 / 移液工作站 / 通风橱 | 读文件、列目录 / 搜索 / 写和编辑 / 执行命令 |
| 安全联锁 / 模式旋钮与 YOLO 钥匙 | 权限请求 / 计划模式与批准方案 |
| 气动传输管 / 废液桶 | 工具结果回灌上下文 / 失败与被拒 |
| 恒温摇床 + 记录仪 / 平行反应阵列 / 无人机坞站 | 后台任务与 monitor / 工作流 / 子 agent |
| 目标白板 + 复核台 / 监督摄像头 | 目标模式与怀疑者复核 / 待办闸门、偷懒判定、过早收工 |
| 旋转蒸发仪 + 检查点安瓿 / 液氮罐 / 磁带机 / 定时器 | 自动压缩与存档 / 记忆 / 回退 / 定时任务 |
| 质检灯板 / 仪器机柜 / 警示灯 / 总电源 / 路牌 | 14 种 hook / MCP 诊断 / 重试与自救 / 会话开始结束 / 标题 |
| 低温样品冰柜 / 流量计 | 回合完成与长期成长线 / 用量 |

## 目录

```
docs/grok-trace-events.md     grok-build 事件目录：数据源、分层、各流程状态机、字段、源码位置
docs/lab-design.md            MV-01 的画面、事件 → 实验流程映射、布局尺寸
tools/extract_grok_trace.py   ~/.grok/sessions 里的一个会话 → 统一事件格式（ATE v1）
tools/make_demo_trace.py      按源码结构体构造的全事件演示会话（构建时自动生成）
prototype/src/page.html       页面骨架：样式、HUD、对话框
prototype/src/js/*.js         脚本模块，按文件名顺序拼成一个 <script type="module">
prototype/data/               抽取出的样例 trace
prototype/build.py            拼脚本、语法检查、注入 trace，输出到 prototype/dist/
```

脚本模块：`00-core` 数据与时间线，`10-render` 纸面材质与墨线后处理，`20-kit` 几何零件库，`30-van` 车与底板，`40/45/47-lab` 各台仪器，`50-robot` 机械臂，`60-hud` 记录与仪表，`65-codex` 事件图鉴，`70-director` 事件 → 动画与对话框，`80-main` 相机、输入、主循环。

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

开场是整车全景，几秒后镜头靠近、跟着机械臂。拖动转视角，滚轮缩放，点仪器或右侧列表看详情；底部的「透视」滑块调车身外壳的透明度，「编号」开关仪器编号，「面板」收起两侧面板让车铺满画面，半圆按钮切换明暗，「章节」跳到某一段。帧率不够时会自动降低渲染分辨率，地址末尾加 `#hq` 可锁定最高画质。

左上角切换数据源：「全事件演示」是构造的 8 段会话，覆盖全部 131 种事件；「本机回放」是你自己的 grok 会话。右上「图鉴」记录每种事件出现过几次。需要人决定的地方（权限、ask_user、批准方案）会弹框让你来点，倒计时结束按记录里的结果继续；拒绝记录里批准过的操作会走中止分支。

`prototype/data/*.json` 不进版本库（含真实会话片段：prompt、命令输出、文件内容摘录），clone 后先用上面第 1 步从自己的 `~/.grok/sessions` 生成一份。
