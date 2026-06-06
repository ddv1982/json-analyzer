import type { ProblemDetails } from '../commands'

export function problem(
  errorType: string,
  title: string,
  detail: string,
  position?: ProblemDetails['position'],
): ProblemDetails {
  return {
    error_type: errorType,
    title,
    status:
      errorType === 'parse_error' ||
      errorType === 'json_parse_error' ||
      errorType === 'invalid_request' ||
      errorType === 'unsupported_file_upload_option'
        ? 400
        : errorType === 'curl_guardrail_denied'
          ? 403
          : errorType === 'curl_timeout'
            ? 504
            : null,
    detail,
    instance: null,
    position,
  }
}
