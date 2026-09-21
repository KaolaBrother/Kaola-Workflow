# Issue #1088 — Grok 4.6→4.7 适配（全部等价 id 替换；最小范围纯适配）

设计/盘点权威：issue #1088 正文（Fable 盘点：tracked 77 处命中；等价拼写 grok-4.6 / grok-4.6[effort=…] / cursor-grok-4.6-{medium,high,high-fast,xhigh} / 显示名 "Grok 4.6" / ADR URL slug models/grok-4-6；排除已发布 CHANGELOG、archive、未跟踪镜像-经 sync 再生）。发版门：本单清零后才可重启 12.2.x patch 发版。

## Missions

- item: 实现车道：先实测 4.7 精确拼写（live grok CLI 目录/models_cache、cursor 解析面），再全仓替换——templates/agents（grok subagent_default、cursor 绑定 pin）、经 sync 脚本再生的镜像（.grok*/.cursor*）、plugins/、scripts/（模型解析、安装测试）、tests fixture、docs（grok/cursor-edition、runtime-capabilities、api/installation）、README、CHANGELOG [Unreleased]；历史实测证据字符串保留原 4.6 并附 4.7 新实测行（ADR 0019 同例）；.cache red-evidence 按 archive 对待排除
  status: todo
  dispatched: claude-code-KW-i1088-impl（ACP 待记）——产出落 worktree bundle-1088（branch workflow/bundle-1088），交付含 grep 零残留收据+聚焦套件
  result:

- item: 验收：grep 零残留（白名单外）+ test-grok-edition/test-cursor-edition 等聚焦套件 + 四 forge 链 + walkthrough
  status: todo
  dispatched: self（Host 复跑核验）
  result:

- item: Finalize/Sink 关单 #1088 → 发版门重核 open=0 → Fable 终审新批次（12.2.2..main 全量）→ 重走 release 序列切最小 patch
  status: todo
  dispatched: self（Host；终审另派 Fable 席）
  result:
