# Year Report Preview Tool

运行：

```bash
npm run preview:year-report
```

然后打开：`http://127.0.0.1:4867`

如果你已经有 Python 年报输入 JSON，可以先导出真实预览文件：

```bash
python scripts/year_report/build_year_report.py --input-json tmp/year-report-input.json --output tools/year-report-preview/data/live-report.json
```

预览工具会优先读取 `data/live-report.json`；如果该文件不存在或读取失败，则自动退回 `data/mock-report.json`。
