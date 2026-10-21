export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(error, _req, res, _next) {
  if (res.headersSent) return _next(error);
  if (error.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({
      error: {
        code: 'CSRF_INVALID',
        message: 'Your session changed or expired. Please try again.',
      },
    });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      },
    });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      error: {
        code: 'BODY_TOO_LARGE',
        message: 'Request body is too large.',
      },
    });
  }
  if (error instanceof HttpError) {
    return res
      .status(error.status)
      .json({ error: { code: error.code, message: error.message } });
  }
  console.error('API request failed.');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    },
  });
}
