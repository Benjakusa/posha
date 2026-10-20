import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { ErrorCodes } from '@posha/shared';

interface RequestWithId {
  id?: string;
}

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  traceId: string;
}

function codeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ErrorCodes.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ErrorCodes.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCodes.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCodes.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCodes.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCodes.RATE_LIMITED;
    case HttpStatus.INTERNAL_SERVER_ERROR:
      return ErrorCodes.INTERNAL_SERVER_ERROR;
    default:
      return status >= 500 ? ErrorCodes.INTERNAL_SERVER_ERROR : ErrorCodes.HTTP_ERROR;
  }
}

function titleForStatus(status: number): string {
  const frameworkTitle = HttpStatus[status];
  if (typeof frameworkTitle !== 'string') {
    return 'Request Failed';
  }
  return frameworkTitle
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function toProblemDetails(exception: unknown, traceId: string): ProblemDetails {
  const status =
    exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
  const title = titleForStatus(status);

  return {
    type: 'about:blank',
    title,
    status,
    code: codeForStatus(status),
    detail: status >= 500 ? 'An unexpected error occurred.' : 'The request could not be processed.',
    traceId,
  };
}

@Catch()
export class ProblemDetailsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<{
      status: (status: number) => {
        type: (contentType: string) => { json: (body: unknown) => void };
      };
      setHeader: (name: string, value: string) => void;
    }>();
    const activeTraceId = trace.getActiveSpan()?.spanContext().traceId;
    const traceId = activeTraceId ?? request.id ?? 'unavailable';
    const problem = toProblemDetails(exception, traceId);

    response.setHeader('x-request-id', traceId);
    response.status(problem.status).type('application/problem+json').json(problem);
  }
}
