# 修复 Cursor 具名 tier 调用语义与安装态 doctor authority，并完成真实验收

- item: 在当前 main 候选上重现并冻结 #1045 两个故障的行为验收，校正 issue 中已经被 #1044 改变的尺寸、载体或路径前提
  status: done
  dispatched: self 在 issue worktree 内只读测量当前 Cursor 生成/安装/doctor/Task 指引，再编写 focused acceptance 并记录 RED；结果落在测试文件、命令输出与 Issue 正文修正中
  result: main be2addc6 上安装态 doctor 真实 ENOENT，缺少 ~/.cursor/kaola-workflow/templates/agents/runtime-capabilities.json；focused suite 首个行为 RED 为 exact-tier post-resolution 规则缺失，#1044 后 14,783 B 操作面并非 stale；验收落在 scripts/test-issue-1045-cursor-conformance.js

- item: 以一条 schema-parameterized Cursor dispatch 规则修复 exact-tier omit-model 语义，并为已安装 doctor 提供不依赖 source checkout 的受管 capability authority
  status: done
  dispatched: self 在 issue worktree 内修改单一 Cursor adapter、生成器与安装 transaction；结果落在 runtime-capabilities.json、生成面、cursor-surface helper 与 receipt-owned authority
  result: Cursor adapter 现在规定 flat subagent_type + named model omit + exact-tier post-resolution + generic enum 非 gap + provider evidence 分层；global transaction receipt-own 同一 runtime-capabilities.json，installed doctor/ensure-target 均脱离 source checkout 通过

- item: 将修复收敛到 source、render、install、receipt、doctor、三 forge 与用户文档，保持 owner bytes、host 分层和零动态 prompt append
  status: done
  dispatched: self 在 issue worktree 内完成 package chain 注册、三 forge render parity、安装/卸载/幂等回归与 README/API/architecture/runtime/Cursor/CHANGELOG docking；结果落在当前 diff 和 validation 输出
  result: package fast/full/editions chain 已注册 focused suite；Cursor 三 forge、安装/卸载/幂等、126 profile current 与 524 routing surface 检查通过；README、API、architecture、runtime、Cursor 与 CHANGELOG 均已收敛到单 registry/零动态 append 设计

- item: 冻结候选并完成 focused/full validation、独立批量审查、真实 Cursor CLI tier/doctor acceptance 与 Issue 正文证据更新
  status: done
  dispatched: self 冻结当前候选，运行 producer-selected full chain 与精确 diff review，并通过真实 Cursor CLI 新会话采集 standard/reasoning/heavy 解析及安装态 doctor 证据；结果落在 receipts、provider transcript 与 #1045 正文
  result: 实现提交 5a0a1895；all-four receipt codeTreeHash fa13c048、四链全绿无 waiver/retry/timeout；真实 xhigh parent 三次 flat named call 均省略 model，provider stores 分别为 medium/high/xhigh；Issue #1045 正文已重写为 10,903-byte 完整设计与测量记录

- item: 修复 #1044 退役 OpenCode compact plugin 后干净 checkout 的空 allowlist 验证仍假定 canonical plugins 目录存在的独立测试残留
  status: done
  dispatched: self 在 issue worktree 内把缺失 canonical plugin 目录解释为空集合，并让 mutation probe 临时建立且完整清理该目录；结果落在 scripts/test-opencode-edition.js 与 edition/full chain
  result: 干净 worktree 不再因缺少 templates/opencode/plugins 触发 ENOENT；mutation probe 临时建目录并只在空时回收；OpenCode 874 条与完整 8-suite edition lane 均通过
