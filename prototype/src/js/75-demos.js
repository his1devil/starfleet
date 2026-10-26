// ═════════════════════════ demos: events this machine has no recorded sample of yet ═════════════════════════
const demoBusy = {};
function demoEvent(type, data, cls, tag, text) { const ev = { type, demo: true, d: data, n: S_.turn }; feed(cls, tag, text, ev, null, true); return ev; }
function seq(steps) { clock.hold++; const end = Math.max(...steps.map(s => s[0])); steps.forEach(([t, fn]) => afterReal(t, fn)); afterReal(end + 0.05, () => { clock.hold = Math.max(0, clock.hold - 1); }); }
function setDemoBtn(name, disabled) { const b = document.querySelector(`[data-demo="${name}"]`); if (b) b.disabled = disabled; }
function animCtx(from, to, sec, demo) { const t0 = performance.now(); const tick = () => { const k = clamp((performance.now() - t0) / (sec * 1000), 0, 1); setCtx(Math.round(lerp(from, to, ease(k))), demo); if (k < 1) requestAnimationFrame(tick); }; tick(); }
// drops running along a hose (a list of points), for transfers between instruments
function hoseFlow(pts, hex, n = 14, dur = 1.6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V(...p)));
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * dur * 0.6;
    afterReal(t0, () => {
      const d = { u: 0 };
      const tick = () => { d.u += 0.05; const p = curve.getPointAt(Math.min(1, d.u)); fx.drops.emit(p, V(0, 0, 0), hex, 0.12, 0.6, { g: 0 }); if (d.u < 1) afterReal(0.03, tick); };
      tick();
    });
  }
}
const DEMOS = {
  compact() {
    const real = S_.ctx || 0, before = Math.round(WINDOW_TOKENS * 0.86), after2 = 61240, RV = ST.rotavap.refs;
    seq([
      [0, () => { animCtx(real, before, 1.6, true); toast('演示', '模拟上下文涨到 86%'); focus('tower'); robotTask([['say', '储液塔越过红线', 'watch'], ['move', ST.tower.work.clone()]], { pri: 4, expire: sceneClock + 6 }); }],
      [1.8, () => { demoEvent('auto_compact_started', { sessionUpdate: 'auto_compact_started', tokens_used: before, context_window: WINDOW_TOKENS, percentage: 86, reason: 'Context window 86% full' }, 'err', '旋蒸', '上下文 86% ≥ 85% · 自动压缩开始'); stState('tower', 'error', 4); stState('rotavap', 'busy', 9); focus('rotavap'); RV.fillGoal = 1; RV.spinGoal = 1; RV.scr.paint({ title: '35 mbar · 旋转', lines: [], rows: 1 }); hoseFlow([[TOWER.x, TOWER.y0 - 5, TOWER.z + TOWER.r + 13], [-130, FLOOR + 6, 0], [-150, FLOOR + 30, 50], [ROTA.x - 3, ROTA.y + 34, ROTA.z - 1]], FLUID.context, 22, 2.4); robotTask([['say', '旋蒸浓缩上下文', 'work'], ['move', ST.rotavap.work.clone()]], { pri: 4, expire: sceneClock + 8 }); }],
      [2.3, () => demoEvent('memory_flush', { note: '本机 memory_enabled = false' }, 'hook', '记忆', '记忆未开启 → 跳过 memory flush')],
      [2.7, () => { ROBOT.scan = 1; demoEvent('hook_execution', { sessionUpdate: 'hook_execution', event_name: 'pre_compact', runs: [] }, 'hook', '质检', 'pre_compact · 0 个'); }],
      [3.0, () => { animCtx(before, 140000, 2.6, true); demoEvent('summary_request', { prompt: '9 段 <summary> 模板', attempts: '最多 3 次，<500 字视为退化重试', wall_clock_secs: 300 }, 'req', '进样', '摘要请求 · 9 段 summary 模板'); }],
      [6.2, () => { RV.recvGoal = 1; demoEvent('compaction_checkpoint', { sessionUpdate: 'compaction_checkpoint', checkpoint_id: '7c1e…', prompt_index_at_compaction: SESSION.turnCount, checkpoint_file: 'compaction_checkpoints/7c1e….json', schema_version: 1 }, 'sys', '存档', '写入 compaction_checkpoint（只落盘，不发给客户端）'); }],
      [7.0, () => {
        RV.fillGoal = 0.25;
        const v = spawnVial(FLUID.context, MAT.paper, V(ROTA.x + 13, ROTA.y + 8 + 3, ROTA.z - 12));
        robotTask([['say', '浓缩液送回储液塔', 'work'], ...pickSteps(v, V(ROTA.x + 13, ROTA.y + 11, ROTA.z - 12)), ...pourSteps(FLUID.context, '浓缩液倒回储液塔'), ['say', '待命', 'idle']], { pri: 4, expire: sceneClock + 20, onSkip: () => v.removeFromParent() });
      }],
      [7.4, () => { animCtx(140000, after2, 1.4, true); demoEvent('auto_compact_completed', { sessionUpdate: 'auto_compact_completed', tokens_before: before, tokens_after: after2, elapsed_ms: 18400 }, 'ok', '旋蒸', `压缩完成 · ${fmtK(before)} → ${fmtK(after2)} · 18.4s`); toast('里程碑', '第一次压缩（演示）'); }],
      [7.8, () => { ROBOT.scan = 1; demoEvent('hook_execution', { sessionUpdate: 'hook_execution', event_name: 'post_compact', runs: [] }, 'hook', '质检', 'post_compact · 0 个'); }],
      [11, () => { RV.spinGoal = 0; RV.fillGoal = 0; RV.recvGoal = 0; RV.scr.paint({ title: '35 mbar', lines: [], rows: 1 }); animCtx(after2, real, 1.2, false); setDemoBtn('compact', false); demoBusy.compact = false; }],
    ]);
  },
  subagent() {
    const sid = '01a3f' + Math.random().toString(16).slice(2, 8), D = ST.dock.refs;
    const card = $('#subcard');
    const prog = (turns, tools, tok, pct, secs) => { card.hidden = false; $('#sub-state').textContent = '外派中'; $('#sub-line').textContent = `explore · 只读 · ${turns} 轮 · ${tools} 次工具 · ${fmtK(tok)} token · ${secs}s`; $('#sub-bar').style.width = pct + '%'; };
    const away = V(DOCK.x + 260, ROOF + 260, DOCK.z + 120);
    const fly = (from, to, dur, done, dir = 1) => { D.flight = { a: from.clone(), b: to.clone(), c: from.clone().lerp(to, 0.5).add(V(0, 60, 0)), t: 0, dur, done, dir }; };
    seq([
      [0, () => {
        demoEvent('tool_call', { sessionUpdate: 'tool_call', title: 'spawn_subagent', rawInput: { description: '调研 ACP 事件流', subagent_type: 'explore', background: true, prompt: '列出 grok-build 的全部 sessionUpdate 类型' } }, 'tool', '工单', 'spawn_subagent · explore · 调研 ACP 事件流');
        const v = spawnVial(FLUID.tool, MAT.amberlamp, SPOT.order);
        focus('dock');
        robotTask([['say', '把样品交给无人机', 'work'], ...pickSteps(v, SPOT.order), ['move', V(DOCK.x, headAt(DOCK.y + 12), DOCK.z - 4)], ['open'], ['put', v, { parent: D.drone, pos: V(0, -11.6, 0) }], ['move', V(DOCK.x, 160, DOCK.z - 8)], ['say', '待命', 'idle']], { pri: 4, expire: sceneClock + 20, onSkip: () => v.removeFromParent() });
      }],
      [5.2, () => {
        demoEvent('subagent_spawned', { sessionUpdate: 'subagent_spawned', subagent_id: sid, child_session_id: sid, parent_session_id: SESSION.id, subagent_type: 'explore', description: '调研 ACP 事件流', capability_mode: 'read-only', model: SESSION.model }, 'sys', '外派', '子 agent 已生成 · explore · 只读');
        stState('dock', 'busy', 10); prog(0, 0, 0, 0, 0);
        fly(D.home, V(DOCK.x, ROOF + 30, DOCK.z), 1.6, () => fly(V(DOCK.x, ROOF + 30, DOCK.z), away, 2.2, () => { D.drone.visible = false; }));
      }],
      [7.4, () => { prog(1, 3, 12400, 30, 8); setStatus('dock', '外派中 · 1 轮'); demoEvent('subagent_progress', { sessionUpdate: 'subagent_progress', subagent_id: sid, duration_ms: 8000, turn_count: 1, tool_call_count: 3, tokens_used: 12400, context_usage_pct: 1, tools_used: ['grep', 'read_file'], error_count: 0 }, 'sys', '外派', '进度 · 1 轮 · 3 次工具 · 12.4K token'); }],
      [9.6, () => { prog(2, 6, 17100, 70, 31); setStatus('dock', '外派中 · 2 轮'); demoEvent('subagent_progress', { sessionUpdate: 'subagent_progress', subagent_id: sid, duration_ms: 31000, turn_count: 2, tool_call_count: 6, tokens_used: 17100, context_usage_pct: 2, tools_used: ['grep', 'read_file', 'list_dir'], error_count: 0 }, 'sys', '外派', '进度 · 2 轮 · 6 次工具 · 17.1K token'); }],
      [11.8, () => {
        demoEvent('subagent_finished', { sessionUpdate: 'subagent_finished', subagent_id: sid, child_session_id: sid, status: 'completed', tool_calls: 7, turns: 2, duration_ms: 41200, tokens_used: 18240, output: 'ACP 标准 9 种 sessionUpdate，xAI 扩展约 45 种…', will_wake: true }, 'ok', '外派', '子 agent 完成 · 7 次工具 · 2 轮 · 41.2s · 18.2K token');
        $('#sub-state').textContent = '已返回'; $('#sub-bar').style.width = '100%';
        D.drone.visible = true;
        const carried = D.drone.children.find(c => c.userData.vial);
        if (carried) recolorVial(carried, FLUID.ok, FLUID.ok);
        fly(away, V(DOCK.x, ROOF + 30, DOCK.z), 2.2, () => fly(V(DOCK.x, ROOF + 30, DOCK.z), D.home, 1.6, () => {
          const vv = D.drone.children.find(c => c.userData.vial);
          if (!vv) return;
          const base = V(DOCK.x, DOCK.y + 2, DOCK.z - 6);
          dropItem(vv, world, base);
          robotTask([['say', '取回子 agent 的结果', 'work'], ...pickSteps(vv, base), ...pourSteps(FLUID.ok, '结果倒回储液塔'), ['say', '待命', 'idle']], { pri: 4, expire: sceneClock + 25, onSkip: () => vv.removeFromParent() });
        }), -1);
        toast('里程碑', '第一个子 agent（演示）');
      }],
      [16.4, () => { demoEvent('auto_wake', { prompt_id: `subagent-completed-${sid}` }, 'sys', '唤醒', '后台子 agent 完成 → 自动唤醒父会话开新回合'); }],
      [22, () => { $('#subcard').hidden = true; setDemoBtn('subagent', false); demoBusy.subagent = false; }],
    ]);
  },
  runaway() {
    const R = ST.reactor.refs, keep = R.mixGoal.clone();
    const smoke = on => { R.runaway = on; };
    seq([
      [0, () => { focus('reactor'); R.heatGoal = 1; smoke(true); stState('reactor', 'error', 7); ROBOT.mode = 'error'; toast('警报', '失控反应 · 模型请求接连失败（演示）', true); demoEvent('retry_state', { sessionUpdate: 'retry_state', type: 'retrying', attempt: 1, maxRetries: 15, reason: 'HTTP 503 Service Unavailable' }, 'fog', '失控', '重试 1/15 · HTTP 503（退避 2s）'); R.scr.paint({ a: 'RETRY 1/15', b: 'HTTP 503' }); robotTask([['say', '反应失控', 'error'], ['move', ST.reactor.work.clone()]], { pri: 5, expire: sceneClock + 6 }); }],
      [2.6, () => { demoEvent('retry_state', { sessionUpdate: 'retry_state', type: 'retrying', attempt: 2, maxRetries: 15, reason: 'stream error: connection reset' }, 'fog', '失控', '重试 2/15 · 连接被重置（退避 4s）'); R.scr.paint({ a: 'RETRY 2/15', b: 'conn reset' }); }],
      [4.8, () => { demoEvent('sampling_retrying', { kind: 'DoomLoopDetected', doom_loop_triggers: ['tail_repetition:6@thinking'], doom_loop_aborted_at_chunk: 412 }, 'fog', '振荡', 'doom-loop：思考尾部重复 → 第 412 个 chunk 处掐断，重采样 1/2'); R.bz = 2.4; R.scr.paint({ a: 'OSCILLATE', b: 'chunk 412' }); }],
      [7.2, () => { demoEvent('repair', { note: '演示：氮气淬灭，重采样成功' }, 'ok', '淬灭', '打开氮气 · 重采样成功，反应恢复平稳'); R.quench = 2.2; smoke(false); R.bz = 0; R.mixGoal.copy(keep); }],
      [9.6, () => { R.heatGoal = 0; ROBOT.mode = 'idle'; R.scr.paint({ a: 'IDLE', b: 'stable' }); toast('里程碑', '压住了失控反应（演示）'); }],
      [11, () => { setDemoBtn('runaway', false); demoBusy.runaway = false; }],
    ]);
  },
};
