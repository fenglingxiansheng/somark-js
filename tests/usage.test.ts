import { describe, it, expect, vi } from 'vitest'
import { UsageClient } from '../src/resources/usage'
import { HttpClient } from '../src/http'
import { AuthenticationError } from '../src/errors'

function createMockHttp(apiKey: string | undefined): HttpClient {
  return {
    getApiKey: () => apiKey,
    post: vi.fn(),
  } as unknown as HttpClient
}

describe('UsageClient', () => {
  it('throws AuthenticationError without apiKey', async () => {
    const http = createMockHttp(undefined)
    const resource = new UsageClient(http)
    await expect(resource.get()).rejects.toThrow(AuthenticationError)
  })

  it('returns Usage object', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0, message: '',
      data: {
        remaining_paid_pages: 104410,
        remaining_free_pages_today: 295,
        remaining_free_pages_this_month: 578,
        dashboard_url: 'https://somark.tech/workbench',
      }
    })
    const resource = new UsageClient(http)
    const usage = await resource.get()
    expect(usage.remainingPaidPages).toBe(104410)
    expect(usage.remainingFreePagesToday).toBe(295)
    expect(usage.remainingFreePagesThisMonth).toBe(578)
  })

  it('emits API warnings from the resource layer', async () => {
    const http = createMockHttp('sk-test')
    ;(http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 0, message: '',
      warnings: ['usage warning'],
      data: {
        remaining_paid_pages: 104410,
        remaining_free_pages_today: 295,
        remaining_free_pages_this_month: 578,
        dashboard_url: 'https://somark.tech/workbench',
      }
    })
    const resource = new UsageClient(http)
    const spy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined)
    try {
      const usage = await resource.get()
      expect(usage.warnings).toEqual(['usage warning'])
      expect(spy).toHaveBeenCalledWith('usage warning', { type: 'SoMarkWarning' })
    } finally {
      spy.mockRestore()
    }
  })
})
