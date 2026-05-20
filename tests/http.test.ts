import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpClient } from '../src/http'
import { AuthenticationError } from '../src/errors'

describe('HttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses API message when raising service errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 1107, message: 'bad key from message' }),
    }))

    const client = new HttpClient({
      apiKey: 'sk-test',
      baseUrl: 'https://somark.tech/api/v1',
      timeout: 60,
      maxRetries: 0,
    })

    await expect(client.post('/usage')).rejects.toThrow(AuthenticationError)
    await expect(client.post('/usage')).rejects.toThrow('bad key from message')
  })
})
