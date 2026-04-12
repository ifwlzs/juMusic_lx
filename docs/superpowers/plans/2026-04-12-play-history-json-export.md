# 播放历史 JSON 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在“设置 -> 备份与恢复”中新增播放历史 JSON 导出入口，支持时间范围筛选并在导出结果中展开歌曲信息。

**Architecture:** 新增一个纯逻辑导出模块负责范围解析、历史过滤和歌曲信息展开；UI 层新增一个轻量导出弹窗组件用于收集 preset / 自定义日期，再复用现有 `ChoosePath` 保存 JSON 文件。

**Tech Stack:** React Native 0.73、TypeScript / JavaScript 混合代码、现有 `ChoosePath`、AsyncStorage 媒体来源仓库、node:test。

---

## File Structure

- `tests/media-library/play-history-export.test.js`
  负责覆盖时间范围解析、历史过滤和歌曲信息展开。
- `tests/media-library/media-source-backup.test.js`
  保持现有播放历史相关备份回归，不新增范围导出逻辑。
- `src/screens/Home/Views/Setting/settings/Backup/playHistoryExport.js`
  负责纯逻辑导出 payload 构建与时间范围解析。
- `src/screens/Home/Views/Setting/settings/Backup/actions.ts`
  增加播放历史导出 action，读取仓库数据并保存 `.json` 文件。
- `src/screens/Home/Views/Setting/settings/Backup/PlayHistoryExport.tsx`
  增加播放历史导出 UI，包括范围 preset、自定义日期输入与 `ChoosePath` 串联。
- `src/screens/Home/Views/Setting/settings/Backup/Part.tsx`
  增加“播放历史 -> 导出 JSON”入口。
- `src/lang/zh-cn.json`
  增加导出入口、时间范围筛选与校验提示文案。
- `src/lang/zh-tw.json`
  同步繁体文案。
- `src/lang/en-us.json`
  同步英文文案。

