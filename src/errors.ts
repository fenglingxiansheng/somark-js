export class SoMarkError extends Error {
  code: number
  constructor(message: string = '', code: number = -1) {
    super(message)
    this.name = 'SoMarkError'
    this.code = code
  }
}

export class AuthenticationError extends SoMarkError {
  constructor(message = 'Authentication failed', code = -1) {
    super(message, code)
    this.name = 'AuthenticationError'
  }
}

export class InsufficientBalanceError extends SoMarkError {
  constructor(message = 'Insufficient balance', code = -1) {
    super(message, code)
    this.name = 'InsufficientBalanceError'
  }
}

export class RateLimitError extends SoMarkError {
  constructor(message = 'Rate limit exceeded', code = -1) {
    super(message, code)
    this.name = 'RateLimitError'
  }
}

export class UnsupportedFileError extends SoMarkError {
  constructor(message = 'Unsupported file type', code = -1) {
    super(message, code)
    this.name = 'UnsupportedFileError'
  }
}

export class FileTooLargeError extends SoMarkError {
  constructor(message = 'File too large', code = -1) {
    super(message, code)
    this.name = 'FileTooLargeError'
  }
}

export class ParseTimeoutError extends SoMarkError {
  constructor(message = 'Parse timed out', code = -1) {
    super(message, code)
    this.name = 'ParseTimeoutError'
  }
}

export class ParseFailedError extends SoMarkError {
  constructor(message = 'Parse failed', code = -1) {
    super(message, code)
    this.name = 'ParseFailedError'
  }
}

export class InvalidParamError extends SoMarkError {
  constructor(message = 'Invalid parameter', code = -1) {
    super(message, code)
    this.name = 'InvalidParamError'
  }
}

export class APIError extends SoMarkError {
  constructor(message = 'API error', code = -1) {
    super(message, code)
    this.name = 'APIError'
  }
}

export class ConnectionError extends SoMarkError {
  constructor(message = 'Connection failed', code = -1) {
    super(message, code)
    this.name = 'ConnectionError'
  }
}

export class RequestTimeoutError extends SoMarkError {
  constructor(message = 'Request timed out', code = -1) {
    super(message, code)
    this.name = 'RequestTimeoutError'
  }
}

const CODE_TO_ERROR: Record<number, new (message: string, code: number) => SoMarkError> = {
  1101: RateLimitError,
  1102: ParseTimeoutError,
  1104: UnsupportedFileError,
  1105: InvalidParamError,
  1106: InvalidParamError,
  1107: AuthenticationError,
  1108: InsufficientBalanceError,
  1111: APIError,
  1118: FileTooLargeError,
  1120: APIError,
  1123: InsufficientBalanceError,
  1124: RateLimitError,
  1132: FileTooLargeError,
  1133: InvalidParamError,
  1137: ParseFailedError,
  1138: APIError,
}

export function raiseForCode(code: number, message: string = ''): never {
  const ErrorClass = CODE_TO_ERROR[code] ?? APIError
  throw new ErrorClass(message || `API error (code=${code})`, code)
}

export { CODE_TO_ERROR }
