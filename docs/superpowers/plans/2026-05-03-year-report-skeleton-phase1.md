# Year Report Skeleton Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前仓库缺少年报实现代码的情况下，先落一版可运行的 Python 年报骨架，固化 `P21`、`P31`、`L04` 以及用户确认的新页面顺序。

**Architecture:** 先通过 Python 测试把页面顺序与最小字段 contract 钉死，再新增 `scripts/year_report/build_year_report.py` 输出最小年报结构，最后补充字段 contract 文档，给后续页面细化与前端渲染留出稳定入口。

**Tech Stack:** Python、pytest、Markdown 设计文档

---

## 一、文件职责与改动范围

### 预计新增文件

- `scripts/year_report/build_year_report.py`
  - 年报骨架构建入口
  - 返回基础 `report -> pages` 结构
  - 先输出用户确认的核心页面占位数据

- `tests/python/test_year_report_build.py`
  - 年报骨架存在性测试
  - 页面顺序测试
  - `P21` / `P31` / `L04` 最小 contract 测试

- `docs/superpowers/references/year-report-v2-field-contract.md`
  - 记录当前阶段已经固化的页面字段 contract

## 二、任务分解

### Task 1: 先用测试钉死页面顺序与 contract

**Files:**
- Create: `tests/python/test_year_report_build.py`

- [ ] **Step 1: 写模块存在性测试**
- [ ] **Step 2: 写页面顺序测试，要求 `P20 -> P21 -> P23 -> P24 -> P31 -> L01 -> L04 -> L02 -> L03 -> P32` 按顺序出现**
- [ ] **Step 3: 写 `P21` / `P31` / `L04` 最小字段 contract 测试**
- [ ] **Step 4: 运行 `python -m pytest tests/python/test_year_report_build.py -v`，确认先失败**

### Task 2: 实现最小年报骨架

**Files:**
- Create: `scripts/year_report/build_year_report.py`

- [ ] **Step 1: 创建 `build_year_report()` 最小实现，返回 `year` 与 `pages`**
- [ ] **Step 2: 补齐测试要求的页面顺序**
- [ ] **Step 3: 补齐 `P21` / `P31` / `L04` 最小字段 contract 占位结构**
- [ ] **Step 4: 运行 `python -m pytest tests/python/test_year_report_build.py -v`，确认通过**

### Task 3: 补 contract 文档

**Files:**
- Create: `docs/superpowers/references/year-report-v2-field-contract.md`

- [ ] **Step 1: 记录 `P21` / `P31` / `L01` / `L04` 当前最小字段 contract**
- [ ] **Step 2: 再跑一次 `python -m pytest tests/python/test_year_report_build.py -v` 作为回归确认**
