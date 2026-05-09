import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadPreferredReportContract } from '../composables/useReportData.js'

describe('loadPreferredReportContract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('优先加载真实 report-contract.json，成功后不再回退 sample', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async (url) => ({
      ok: true,
      json: async () => ({
        meta: { year: url === '/report-contract.json' ? 2026 : 2025 },
        pages: [],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const contract = await loadPreferredReportContract([
      '/report-contract.json',
      '/report-contract.sample.json',
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/report-contract.json')
    expect(contract.meta.year).toBe(2026)
  })

  it('真实 contract 不存在时回退 sample contract', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async (url) => {
      if (url === '/report-contract.json') {
        return {
          ok: false,
          status: 404,
        }
      }
      return {
        ok: true,
        json: async () => ({
          meta: { year: 2025 },
          pages: [{ page_id: 'P01' }],
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const contract = await loadPreferredReportContract([
      '/report-contract.json',
      '/report-contract.sample.json',
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/report-contract.json')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/report-contract.sample.json')
    expect(contract.meta.year).toBe(2025)
    expect(contract.pages).toHaveLength(1)
  })
})
