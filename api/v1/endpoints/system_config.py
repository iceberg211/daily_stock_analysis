# -*- coding: utf-8 -*-
"""System configuration endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse

from api.deps import get_system_config_service
from api.v1.schemas.common import ErrorResponse
from api.v1.schemas.system_config import (
    ImportSystemConfigEnvResponse,
    SystemConfigConflictResponse,
    SystemConfigResponse,
    SystemConfigSchemaResponse,
    SystemConfigValidationErrorResponse,
    TestLLMChannelRequest,
    TestLLMChannelResponse,
    UpdateSystemConfigRequest,
    UpdateSystemConfigResponse,
    ValidateSystemConfigRequest,
    ValidateSystemConfigResponse,
)
from src.services.system_config_service import ConfigConflictError, ConfigValidationError, SystemConfigService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/config",
    response_model=SystemConfigResponse,
    responses={
        200: {"description": "Configuration loaded"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Get system configuration",
    description="Read current configuration from .env and return raw values.",
)
def get_system_config(
    include_schema: bool = Query(True, description="Whether to include schema metadata"),
    service: SystemConfigService = Depends(get_system_config_service),
) -> SystemConfigResponse:
    """Load and return current system configuration."""
    try:
        payload = service.get_config(include_schema=include_schema)
        return SystemConfigResponse.model_validate(payload)
    except Exception as exc:
        logger.error("Failed to load system configuration: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to load system configuration",
            },
        )


@router.get(
    "/config/env-export",
    responses={
        200: {"description": "Exported `.env` content"},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Export `.env` file",
    description="Download the active `.env` file as plain text.",
)
def export_system_env(
    service: SystemConfigService = Depends(get_system_config_service),
) -> PlainTextResponse:
    """Export active `.env` content for backup."""
    try:
        payload = service.export_env_content()
        headers = {
            "Content-Disposition": f'attachment; filename="{payload["filename"]}"',
        }
        return PlainTextResponse(
            content=payload["content"],
            media_type="text/plain; charset=utf-8",
            headers=headers,
        )
    except Exception as exc:
        logger.error("Failed to export system `.env`: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to export `.env`",
            },
        )


@router.post(
    "/config/env-import",
    response_model=ImportSystemConfigEnvResponse,
    responses={
        200: {"description": "Imported `.env` content"},
        400: {"description": "Invalid `.env` file", "model": ErrorResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Import `.env` file",
    description="Import uploaded `.env` content and optionally reload runtime config.",
)
def import_system_env(
    file: UploadFile = File(..., description="`.env` file to import"),
    reload_now: bool = Query(True, description="Whether to reload runtime config immediately"),
    service: SystemConfigService = Depends(get_system_config_service),
) -> ImportSystemConfigEnvResponse:
    """Import full `.env` file from uploaded content."""
    try:
        content_bytes = file.file.read()
        payload = service.import_env_content(
            content_bytes=content_bytes,
            reload_now=reload_now,
        )
        return ImportSystemConfigEnvResponse.model_validate(payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_env_file",
                "message": str(exc),
            },
        )
    except Exception as exc:
        logger.error("Failed to import system `.env`: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to import `.env`",
            },
        )
    finally:
        try:
            file.file.close()
        except Exception:
            pass


@router.put(
    "/config",
    response_model=UpdateSystemConfigResponse,
    responses={
        200: {"description": "Configuration updated"},
        400: {"description": "Validation failed", "model": SystemConfigValidationErrorResponse},
        409: {"description": "Version conflict", "model": SystemConfigConflictResponse},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Update system configuration",
    description="Update key-value pairs in .env. Mask token preserves existing secret values.",
)
def update_system_config(
    request: UpdateSystemConfigRequest,
    service: SystemConfigService = Depends(get_system_config_service),
) -> UpdateSystemConfigResponse:
    """Validate and persist system configuration updates."""
    try:
        payload = service.update(
            config_version=request.config_version,
            items=[item.model_dump() for item in request.items],
            mask_token=request.mask_token,
            reload_now=request.reload_now,
        )
        return UpdateSystemConfigResponse.model_validate(payload)
    except ConfigValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "validation_failed",
                "message": "System configuration validation failed",
                "issues": exc.issues,
            },
        )
    except ConfigConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "config_version_conflict",
                "message": "Configuration has changed, please reload and retry",
                "current_config_version": exc.current_version,
            },
        )
    except Exception as exc:
        logger.error("Failed to update system configuration: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to update system configuration",
            },
        )


@router.post(
    "/config/validate",
    response_model=ValidateSystemConfigResponse,
    responses={
        200: {"description": "Validation completed"},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Validate system configuration",
    description="Validate submitted configuration values without writing to .env.",
)
def validate_system_config(
    request: ValidateSystemConfigRequest,
    service: SystemConfigService = Depends(get_system_config_service),
) -> ValidateSystemConfigResponse:
    """Run pre-save validation only."""
    try:
        payload = service.validate(items=[item.model_dump() for item in request.items])
        return ValidateSystemConfigResponse.model_validate(payload)
    except Exception as exc:
        logger.error("Failed to validate system configuration: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to validate system configuration",
            },
        )


@router.post(
    "/config/llm/test-channel",
    response_model=TestLLMChannelResponse,
    responses={
        200: {"description": "Channel test completed"},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Test one LLM channel",
    description="Run a minimal LLM request against one unsaved or saved channel definition.",
)
def test_llm_channel(
    request: TestLLMChannelRequest,
    service: SystemConfigService = Depends(get_system_config_service),
) -> TestLLMChannelResponse:
    """Validate and test one channel definition without writing `.env`."""
    try:
        payload = service.test_llm_channel(
            name=request.name,
            protocol=request.protocol,
            base_url=request.base_url,
            api_key=request.api_key,
            models=request.models,
            enabled=request.enabled,
            timeout_seconds=request.timeout_seconds,
        )
        return TestLLMChannelResponse.model_validate(payload)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "validation_error",
                "message": str(exc),
            },
        )
    except Exception as exc:
        logger.error("Failed to test LLM channel: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to test LLM channel",
            },
        )


@router.get(
    "/config/schema",
    response_model=SystemConfigSchemaResponse,
    responses={
        200: {"description": "Schema loaded"},
        500: {"description": "Internal server error", "model": ErrorResponse},
    },
    summary="Get system configuration schema",
    description="Return categorized field metadata used for dynamic settings form rendering.",
)
def get_system_config_schema(
    service: SystemConfigService = Depends(get_system_config_service),
) -> SystemConfigSchemaResponse:
    """Return schema metadata for system configuration fields."""
    try:
        payload = service.get_schema()
        return SystemConfigSchemaResponse.model_validate(payload)
    except Exception as exc:
        logger.error("Failed to load system configuration schema: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": "Failed to load system configuration schema",
            },
        )
