# 交付 Issue #1044 的跨 runtime compact 恢复、始终加载 dispatch 合约与 Cursor 模型策略控制

- item: 建立 #1044 的行为验收与真实 RED 基线，覆盖 prompt binding、compact 恢复、并发隔离、长度预算和 Cursor 模型策略
  status: done
  dispatched: 独立测试作者在 issue worktree 内编写并运行验收测试；结果落在新增或更新的测试文件及其 RED 运行记录中
  result: 基线 SHA 1aed7eaafceb0f948397240da9cd225bb38c9e04；最终架构验收的真实 RED 为 Cursor 64/782、ZCode edition 31/854、ZCode hook protocol 10/22、ZCode install trust 13/34，早期 sidecar/cards oracle 后因设计被实测推翻而退役

- item: 交付可恢复的 prompt bundle、runtime helper 与 cards 架构，并以 additive 迁移保持旧入口可用直到新路径有证据
  status: done
  dispatched: 只读代码探索者梳理现有生成、hook、安装与 compact 数据流；结果以内联架构地图返回主代理
  result: 架构地图完成；后续实跑证明 session sidecar/token/chunk/tool gate 会增加上下文和自锁面，故 compact-time JS helper 与实际 9 个无消费者 cards 已全部撤销，替代结果是公共 dispatch/recovery skeleton、runtime overlay、Claude/Codex 静态 artifact 与 Grok/Cursor native Rule

- item: 让七个 runtime 的 hook、安装和 dispatch/model 适配器收敛到统一协议，清除已测 stale/duplicate 映射
  status: done
  dispatched: 实现角色在 issue worktree 内负责七 runtime 的 hook/schema/capability/model adapter 与 helper 安装清单，不改 cards、routing skeleton 或验收测试；结果落在其生产文件、focused test 记录及内联变更清单
  result: Claude/Codex 各收敛为一个 SessionStart(compact) 静态读取，Grok 收敛为一个 project/global native Rule，Cursor 收敛为空 hooks + 三宿主共享 alwaysApply Rule，OpenCode/Kimi/ZCode 不新增 prompt lifecycle；runtime-capabilities.json 固化 profile/carrier/tier/tool/custody/background/resume/nesting/reload 与未知边界，普通 tool recovery 成本为 0 B/0 subprocess

- item: 完成生成 surface 的语义压缩、文档与所有 edition 的 source-to-render-to-install 收敛
  status: done
  dispatched: self 在 issue worktree 内完成公共文档、生成 surface、edition 同步与长度/prose census 测量；结果落在生产文档、生成树和最终测量记录
  result: 两个 routing skeleton、公共 dispatch/recovery skeleton 与 runtime overlay 形成一套作者框架；七 runtime 的 Next 缩短 43.6%–45.6%，Finalize 缩短 42.4%–46.1%；24 routing surfaces byte-match、126 profiles render 通过，README/CHANGELOG/API/architecture/conventions/runtime/Cursor/Grok/Kimi/ZCode 文档与 Issue #1044 正文已更新

- item: 冻结候选并完成独立审查、真实 runtime acceptance matrix 与最终化就绪证据
  status: done
  dispatched: 独立验收作者在共享 issue worktree 内仅重构 scripts/test-runtime-agent-architecture.js 的 #1044 stale oracle 并分类真实语义缺口；self 负责生产语义恢复、全链、runtime 实测、Issue 正文与候选冻结
  result: Issue #1044 正文已重写为 17,015 B 的 Design of Record，记录两次 Grok hook FAIL 与 native Rule compact PASS、Cursor CLI compact PASS 及 App/Cloud 边界、七 runtime capability/长度/hash/信任迁移；最终 npm test、七 edition、24-surface parity、install-all dry-run、diff check 与 walkthrough 179/179（spawn census 2118）全部 PASS，候选 Finalization-ready，Issue 保持 OPEN 且未执行 archive/close/sink

- item: 纠正首次 RED 中 compact bootstrap 与 hook 签发 token 的验收内部冲突，并重新冻结测试 oracle
  status: done
  dispatched: 原独立测试作者仅修正验收，使 compact hook 只注入有界 bootstrap、PreToolUse 签发 token、PostToolUse 确认 chunk；结果落在 #1044 两个新增测试及更新后的 RED 记录
  result: 该 oracle 曾纠正内部冲突，但真实 ZCode/普通工具测量随后否决了 token/chunk/tool gate 前提；验收已再次冻结为直接 post-compact injection、Cursor persistent Rule 与 0 tool-hook 成本

- item: 将 ZCode 旧 edition oracle 的直接 event 扫描机械迁移到已实测的 3.10.1 hooks.events matcher-row schema，不改变验收含义
  status: done
  dispatched: 独立测试作者仅更新 scripts/test-zcode-edition.js 的事件/命令读取 helper 与受影响断言，使其读取 hooks.events matcher rows；结果落在该测试文件和 GREEN/剩余失败记录
  result: schema 探索完成；最终 ZCode edition 不再安装 hook declarations，测试改为验证空 config、无 executable hook、receipt-owned 精确迁移与外来数据保留，最终 877/877 GREEN

- item: 按 ZCode 官方 hook 子进程协议补齐 compact 上下文注入与 PreToolUse/Stop 阻断语义，证明 hook 真正驱动主模型循环而非只记录失败
  status: done
  dispatched: 原独立测试作者仅为 scripts/test-zcode-edition.js 或 #1044 runtime adapter 验收补充官方协议 RED，覆盖 SessionStart source=compact 的 hookSpecificOutput.additionalContext、PreToolUse deny、Stop block 与 exit-code 语义；生产 adapter 由 self 修复，结果落在测试记录与 runtime hook adapter
  result: 官方协议与本机 3.10.1/3.10.1.6272 已测，随后 live PreToolUse 运行自锁，故产品化 hook 被撤销；协议测试保留为 32/32 的反回归/迁移边界，最终用户与项目 config 不含 Kaola hook

- item: 将 ZCode 安装收敛为 Codex 风格的工作区 hook 待审核授权，并打通授权后不依赖模型猜测 session id 或私有路径的首次 prompt binding
  status: done
  dispatched: self 在 issue worktree 内负责 ZCode 项目级待审核载体、去重迁移、用户授权说明与首次绑定协议；原独立测试作者负责同一 worktree 的 focused acceptance 并先证明 RED；结果落在安装/同步/runtime helper、生成提示词、测试、文档和实机新会话证据中，任何真实批准动作仍须用户在对话中即时确认
  result: 实测推翻工作区 hook 前提，最终安装无审批流、无 hook declarations；升级只删除 receipt-owned exact rows/same-byte shells，修改过的 legacy shell 与 foreign config 保留，install trust 47/47 GREEN
