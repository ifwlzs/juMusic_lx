import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'
import { loadPreferredReportContract } from './composables/useReportData.js'

// 启动入口：优先读取正式 report-contract.json，缺失时再回退 sample，便于直接预览真实数据。
async function bootstrap() {
  const reportContract = await loadPreferredReportContract([
    '/report-contract.json',
    '/report-contract.sample.json',
  ])
  createApp(App, {
    reportContract,
  }).mount('#app')
}

bootstrap()
