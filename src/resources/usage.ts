import { HttpClient } from '../http.js'
import { Usage } from '../models.js'
import { AuthenticationError } from '../errors.js'
import { emitWarnings } from '../warnings.js'

export class UsageClient {
  private _http: HttpClient

  constructor(http: HttpClient) {
    this._http = http
  }

  async get(): Promise<Usage> {
    if (!this._http.getApiKey()) {
      throw new AuthenticationError('apiKey is required for usage queries.')
    }
    const result = await this._http.post('/usage', {})
    const usage = Usage.fromApi(result)
    emitWarnings(usage.warnings)
    return usage
  }
}
