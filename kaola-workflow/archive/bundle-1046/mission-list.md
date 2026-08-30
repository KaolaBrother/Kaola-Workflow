# 将一份全局工作流契约安装到所有 Agent Runtime，并逐一证明真实读取与组合生效

- item: 重新测量 #1046 在当前 main 上的前提，枚举 registry 中全部 Runtime、现有全局载体、安装事务与 workflow-init 重复面，并把可自动判定的验收矩阵冻结为设计基线
  status: done
  dispatched: self 在 issue worktree 内只读追踪 registry、adapter、install-all、workflow-init、生成面和已有测试，并以官方文档及真实本机探针补齐各 Runtime 的发现、优先级和重载事实；结果落在测量记录、Issue 正文修正与后续验收代码
  result: 当前 workflow-init 仍向每个项目写入 5,404 B 全量通用模板，install-all 只有七安装器顺序调用且没有九宿主全局契约事务；官方资料确认 Claude/Codex/OpenCode/Kimi/ZCode 用户指令、Grok 用户 Rule、Cursor 本机用户 Rule 与 Cloud 项目 Rule 的原生载体；本机 Claude 2.1.246、Codex 0.150.1、OpenCode 1.18.23、Kimi 0.39.1、Grok 1.0.13、Cursor CLI 2026.08.25、Cursor App 3.18.9、ZCode App 3.10.1 全部存在；focused acceptance 在缺少统一 source/registry/transaction 处行为 RED

- item: 建立唯一的 runtime-neutral 全局工作流契约源，由各 Runtime adapter 渲染原生全局载体，并让 install-all 以批量预检、原子安装、检查、卸载和可追溯 receipt 管理整组目标
  status: done
  dispatched: self 在 issue worktree 内实现静态 universal source、九宿主 registry、只在安装期运行的事务执行器与 install-all 接线；结果落在 templates/global、scripts/kaola-workflow-global-contract.js、focused acceptance 和安装文档
  result: templates/global 现有 58 行单一契约源与九宿主 registry；安装事务从 registry 发现目标、合并四个 owner-safe AGENTS region、去重 Cursor CLI/App 共享 Rule、独立物化 Cursor Cloud，并以 source/render/install hash receipt 管理 install/check/uninstall；install-all 在任何 runtime 写入前运行整批事务；focused 138 条与 install-all 275 条通过

- item: 从 workflow-init 的项目 AGENTS 契约中减去全局通用规则，只保留项目事实、命令、约束、验证与本地覆盖，同时安全迁移精确受管旧字节并保护 owner 内容和活跃运行
  status: done
  dispatched: self 修改唯一 consumer template、ownership-safe migration 与六个生成入口，只在 compatible global receipt 下写入 minimal project contract，并冻结 active-run/owner-mixed 边界；结果落在 project-instruction 模块、routing renders 与 focused/full 回归
  result: workflow-init 只生成带 global_contract_schema: 1 的项目事实/命令/约束/验证/文档/本地覆盖区；迁移器先验证 CURRENT 全局 receipt，精确迁移 10.1.1 与已知旧模板并保留 owner 后缀，未知或 mixed 零写入；任一 active run 统一 active_run_preserved，AGENTS/CLAUDE/state/Mission List 均不写且无 consent/adoption bypass；架构 782、routing 506、focused 138、install-all 275 与镜像同步全部通过

- item: 冻结候选并完成 registry 派生的架构、生成、安装、迁移、所有 edition、producer chain、npm test、walkthrough 与文档验收，使任何生产字节变化都会使旧证据失效
  status: done
  dispatched: self 先从 compact-recovery 与 runtime installer 中盘点重复注入和提示词字节，按唯一全局契约原则减去重复规则，再补齐 ADR、公开文档和 diff-scoped/full 验收；结果落在冻结提交及其 exact-SHA validation receipt
  result: 候选提交 bd766e8f47ca04ae716870d441bc9f4d8ea17d50；全局源 3,293 B/58 行，普通正文 3,313 B、Grok V2 7,184 B、Cursor 注入正文 8,499 B（含 mdc 元数据 8,627 B）；四 producer chain 4/4、canonical npm test、179/179 完整 walkthrough、全局契约 154、架构 784、routing 506、install-all 275、edition suites 与 diff/generated checks 全绿；clean exact-SHA receipt 在 kaola-workflow/bundle-1046/.cache/chain-receipt.json，codeTreeHash 40556f924b287181e64c0b4425b2ac66e49650fac29d55d72df7fcce5f92e9e1

- item: 在同一冻结候选上为 Claude、Codex、OpenCode、Kimi、Grok、Cursor CLI、Cursor App、Cursor Cloud 与 ZCode 完成正控、负控、重载、组合新会话和项目覆盖的真实读取矩阵，保留版本、哈希、会话、提示词与原始响应证据
  status: done
  dispatched: self 使用候选提交的 installer/registry 为九宿主建立隔离正负控与真实新会话探针；本机 CLI/应用走原生入口，Cursor Cloud 只在明确 Cloud 环境与用户 Save 边界内执行；证据落在 kaola-workflow/bundle-1046/.cache/runtime-live-matrix/
  result: kaola-workflow/bundle-1046/.cache/runtime-live-matrix/README.md 汇总同一候选的九宿主矩阵：Codex、OpenCode、Kimi、Grok、Cursor CLI、Cursor App 与 ZCode 真实新会话 PASS；Claude 安装、静态 render、SessionStart/compact hook、组合与回归通过但 loggedIn:false，按 owner 决定记为 OWNER_ACCEPTED_MECHANICS 且不宣称模型响应；Cursor Cloud 候选安装、Draft Build、exact cold boot、hash、receipt 与空 hook 通过，exact-Build subagent 全 null 记为隔离上下文负控，发布后必须默认分支 Save Active Build 并重启 top-level Agent；本机已恢复无 nonce 正式 receipt，local targets CURRENT、Cloud REMOTE_REQUIRED

- item: 用全部设计决策、能力证据、最终测量、限制与证据定位器重写 #1046 正文，并建立该候选已准备进入 finalization 的完整结论
  status: done
  dispatched: self 以冻结候选、九宿主 live matrix、Cursor Cloud Draft/Active Build 生命周期与 Claude 认证实测为事实源重写 Issue 正文；先落本地 body 草案，待全部 live 边界收敛后再更新 GitHub，结果定位到 kaola-workflow/bundle-1046/.cache/issue-1046-body.md
  result: GitHub Issue #1046 正文已由 kaola-workflow/bundle-1046/.cache/issue-1046-body.md 重写并发布到 https://github.com/KaolaBrother/Kaola-Workflow/issues/1046，包含唯一作者源、减法架构、dispatch/compact 设计、九宿主 capability evidence、长度与 hook 测量、完整自动化、Claude owner exception、Cursor Cloud 候选/发布双门和 10.2.0 发布后收敛条件；冻结候选已具备进入 Finalization 的事实基础
