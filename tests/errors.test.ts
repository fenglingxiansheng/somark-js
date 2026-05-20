import { describe, it, expect } from 'vitest'
import {
  SoMarkError, AuthenticationError, RateLimitError, FileTooLargeError,
  APIError, raiseForCode
} from '../src/errors'

describe('error hierarchy', () => {
  it('all errors extend SoMarkError', () => {
    expect(new AuthenticationError()).toBeInstanceOf(SoMarkError)
    expect(new RateLimitError()).toBeInstanceOf(SoMarkError)
    expect(new FileTooLargeError()).toBeInstanceOf(SoMarkError)
  })

  it.each([
    [1107, AuthenticationError],
    [1101, RateLimitError],
    [1124, RateLimitError],
    [1118, FileTooLargeError],
    [1132, FileTooLargeError],
  ])('raiseForCode maps %i to %p', (code, ErrorClass) => {
    expect(() => raiseForCode(code, 'service message')).toThrow(ErrorClass)
  })

  it('raiseForCode throws APIError for unknown codes', () => {
    expect(() => raiseForCode(9999)).toThrow(APIError)
  })

  it('error has correct code property', () => {
    try { raiseForCode(1107, 'invalid') } catch (e) {
      expect((e as AuthenticationError).code).toBe(1107)
    }
  })
})
