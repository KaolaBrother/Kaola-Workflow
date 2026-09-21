# Issue #1087 — runtime 解耦实现（共享块引用式 install/uninstall；设计权威 #1086，已封存）

Host 认领（bundle-1087，branch workflow/bundle-1087）。双车道并行，区域所有权：
车道 A 拥有 uninstall 路径与 registry 模块本体；车道 B 拥有 install 路径与 GC；同文件不同段的
合并冲突由集成车道解决。验证一律 hermetic（fixture home 于 tmp），禁改真实 runtime home，
`~/.dsh` 严格只读。

## Missions

- item: 车道 A（F1/F2）：uninstall.sh 只动 install.sh 写入面；Codex 自有卸载（install-codex-agent-profiles.js --uninstall）；共享引用登记模块（runtime id 集合语义 register/deregister/零引用清理）；~/.config/kaola-workflow/ 共享块生命周期（装时跳过+登记不覆写；卸时去登记，有引用保留，零引用才清；操作员覆盖保留）
  status: done
  dispatched: claude-code-KW-i1087-implA（ACP 53c09ce5975be88be327d72ba778936c，cursor 13）——产出落 worktree bundle-1087（branch workflow/bundle-1087），交付含 hermetic 实测回执（#1086 验收 (i)-(iv) 相关项）
  result: branch workflow/bundle-1087 提交 07f4d1c7+a17a0c0c（20 文件 +2065/−183）：uninstall.sh 收敛为 Claude 自面（-176 行跨家清理）；install-codex-agent-profiles.js --uninstall（×4 镜像）；scripts/kaola-workflow-shared-refs.js（×4 字节镜像，register/deregister/listRefs 契约）；七个 install-*.sh --uninstall 段接入去登记；docs/installation.md 卸载节重写。验收（Host 独立复跑，worker 报告未随回合送达）：test-issue-1087-lane-a.js 84 断言 PASS（8 突变全红）；test-uninstall-forge-branches、test-suite-registration（70 文件/67 注册）、validate-script-sync 全绿；bash -n 八脚本 OK；区域边界合规（未触 global-contract.js/install-all.sh/install.sh install 段）。席位已验收停置。

- item: 车道 B（F3/F4/F5）：GC per-target 化（--target-id、回执行=引用记录、跨 runtime DRIFT advisory）；DORMANT 行替代 NOT_INSTALLED 丢弃（回归重校验不触发 OWNER_CONFLICT）；所有 installer 末步自装 carrier（共享制品跳过+登记）；install-all.sh 纯编排器（逐行报告、--skip 修正）
  status: done
  dispatched: claude-code-KW-i1087-implB（ACP 9d9e2344c4f754d5b18e86fc05eba2b9，cursor 13）——产出落 worktree bundle-1087-laneB（branch workflow/bundle-1087-laneB），交付含 hermetic 实测回执（#1086 验收 (v)(vi) 相关项）
  result: branch workflow/bundle-1087-laneB 三提交 0de9d911/cee4cea6/8a2744e6（21 文件 +1169/−98）：global-contract.js +433（per-target --target-id、per-row 引用记录、DORMANT、advisory DRIFT、uninstall --runtime 剥 carrier+删行+去登记）；十 installer 末步自装 carrier（插件缓存副本无契约脚本时 UNAVAILABLE 仍 exit 0 保 preflight 自修）；install-all.sh 纯编排器+--skip 修正；docs（api/installation/devin/droid/dsh edition）。验收（Host 独立复跑）：test-issue-1087-lane-b.js 181 断言 PASS；test-cursor-edition.js 611 断言 PASS（含 3 镜像 parity）；bash -n 八脚本 OK；区域合规（未触 uninstall 路径）。交接集成项：①SHARED_BLOCK_ID 对齐（B 猜 kaola-config-dir）②registry 调用真实化（stub 仅 fixture，经 KAOLA_SHARED_REFS_MODULE 测试专用设置）③per-target 卸载尚无调用方——A 侧卸载器需接 global-contract uninstall --runtime④devin/droid/dsh "carrier 永不移除"措辞过期⑤CHANGELOG/README 留集成。席位已验收停置（no-session 确认）。

- item: 集成车道：合并 laneB → workflow/bundle-1087，解决区域冲突，registry/GC 簿记口径对齐，全链（四 forge）+ 集成 walkthrough + 文档勾稽（README/docs/CHANGELOG [Unreleased]）
  status: done
  dispatched: claude-code-KW-i1087-integrate（ACP 07dcec4dd42669e33a9b0667c6725d3e，两轮 cursor 13/96）
  result: 提交 79ae109f（合并，唯一冲突 codex installer exports 双行为保留）→ 478c5635（per-target carrier 卸载接线全部卸载器；CONFIG_BLOCK_ID='kaola-config' 统一，GC 从模块读、8 shell 调用方走 CLI 默认；registry 生产真实化，KAOLA_SHARED_REFS_MODULE 仅测试；registry 经事务 env.HOME 沙箱安全）→ d0b3c483（registry 改仓库原子写助手过 kernel-conformance；lane-B spawn 站点补标签）→ 16755cc4（docs 升级注记：#1087 前装 runtime 无引用记录，install-all --yes 播种；卸载 OWNER_CONFLICT 警告语义；CHANGELOG 补句）。收据绑定 16755cc4：四 forge 链全绿无豁免（claude 55 步含 #1055 oracle 绿）+ walkthrough 过 + lane-a 93/lane-b 181 断言复跑绿。Host 两项裁决：零引用删除保留（#1086 F2 语义）、卸载警告不失败保留。已知留白：plugin-cache Codex carrier UNAVAILABLE（设计内）、Devin 无卸载器（先在缺口）。席位验收停置。

- item: Finalize/Sink：验收后 finalize（归档）、sink 合并关单 #1087
  status: done
  dispatched: self（Host）
  result: doc-docking DOCKED + finalization-summary 落档；finalize --check ok → 事务 closed/archived（四链绿绑定 16755cc4）；sink 首次因网络在 closure 步拒（sink_incomplete），重试成功 status=sinked——main @ 29c7d4c4（archive 提交）含全部实现 8 提交，origin 平权，#1087 CLOSED（核验）；laneB worktree/branch 清理；暂存目录恢复归位（一次 mv 目标参数失误散落 workspace，已全部还原核对）。

- item: 发版门（Yanlei 钉死）：本仓 open issues 清零（含 P3）后，仅最小 patch 升级，Fable 终审后切版；不带尾巴发版
  status: in-flight
  dispatched: self（Host）核查（open issues=0 已核）+ Fable 终审席 claude-code-KW-i1087-release-review（--tier upgrade）
  result:
