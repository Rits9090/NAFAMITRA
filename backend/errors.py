"""Friendly API error handling.

Technical details (mongo error codes, stack traces) go to the server log —
shopkeepers only ever see human readable messages.
"""
import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger('nafamitra')


class AppError(Exception):
    """Application error with a human-friendly message."""

    def __init__(self, message: str, status_code: int = 400, code: str = 'bad_request',
                 message_mr: str | None = None, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.message_mr = message_mr
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class NotFound(AppError):
    def __init__(self, message='Not found', message_mr=None):
        super().__init__(message, 404, 'not_found', message_mr)


class Unauthorized(AppError):
    def __init__(self, message='Please sign in again.', message_mr=None):
        super().__init__(message, 401, 'unauthorized', message_mr)


class Forbidden(AppError):
    def __init__(self, message='You do not have permission to do this.', message_mr=None):
        super().__init__(message, 403, 'forbidden', message_mr)


class Conflict(AppError):
    def __init__(self, message='This conflicts with existing data.', message_mr=None):
        super().__init__(message, 409, 'conflict', message_mr)


# Codes that should be logged with full detail but never shown to the user.
_TECHNICAL_CODES = {
    'DuplicateKey': 'duplicate key',
    'InvalidId': 'invalid id',
    'ConfigurationError': 'configuration',
}


def _friendly_fallback(exc: Exception) -> tuple[str, str, int]:
    name = type(exc).__name__
    if name in _TECHNICAL_CODES:
        return 'We couldn\'t save that just now. Please try again.', 'सध्या जतन करता आले नाही. कृपया पुन्हा प्रयत्न करा.', 500
    logger.exception('Unhandled error: %s', name)
    return 'Something went wrong. Please try again.', 'काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.', 500


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        rid = request.headers.get('x-request-id') or uuid.uuid4().hex[:12]
        if exc.status_code >= 500:
            logger.error('[%s] %s %s -> %s', rid, request.method, request.url.path, exc.message)
        else:
            logger.info('[%s] %s %s -> %s (%s)', rid, request.method, request.url.path, exc.message, exc.code)
        return JSONResponse(
            status_code=exc.status_code,
            content={'error': {'code': exc.code, 'message': exc.message,
                               'message_mr': exc.message_mr, 'details': exc.details,
                               'request_id': rid}},
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        rid = request.headers.get('x-request-id') or uuid.uuid4().hex[:12]
        message, message_mr, status = _friendly_fallback(exc)
        logger.error('[%s] %s %s crashed: %s', rid, request.method, request.url.path, repr(exc))
        return JSONResponse(
            status_code=status,
            content={'error': {'code': 'internal', 'message': message,
                               'message_mr': message_mr, 'request_id': rid}},
        )
