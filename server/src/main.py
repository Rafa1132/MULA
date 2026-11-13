from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from .common.config import HERMES_MODEL
from .features.auth import router as auth_router
from .features.operator import router as operator_router
from .features.operator.runtime import HermesError, check_readiness
from .features.voice import router as voice_router
from .features.memory.routes import router as memory_router
from .features.team.routes import router as team_router
from .features.forecasting.routes import router as forecasting_router

app = FastAPI(title="LARAS AI Backend", version="0.2.0")
app.include_router(auth_router)
app.include_router(operator_router)
app.include_router(voice_router)
app.include_router(memory_router)
app.include_router(team_router)
app.include_router(forecasting_router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # Credential validation responses must not echo the submitted password.
    if request.url.path.startswith("/api/auth/"):
        return JSONResponse(status_code=422, content={
            "detail": "Use a valid username (3–40 characters) and a password of 10–128 characters."
        })
    if request.url.path.startswith("/api/memory"):
        return JSONResponse(status_code=422, content={"detail": "Choose a valid memory file, content and revision, or a search question of up to 1,000 characters."})
    if request.url.path.startswith(("/api/team", "/api/forecasting")):
        return JSONResponse(status_code=422, content={"detail": "Check the submitted settings or forecast inputs. Use a CSV up to 50 KB, valid columns and a horizon of 1–90 periods."})
    if request.url.path == "/api/agents/operator/chat":
        # Validation errors must not echo uploaded business rows to clients/logs.
        return JSONResponse(status_code=422, content={
            "detail": "Use a message of 1–8,000 characters and, optionally, one UTF-8 CSV up to 50 KB with a filename of at most 120 characters."
        })
    return await request_validation_exception_handler(request, error)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "runtime": "hermes",
        "model": HERMES_MODEL,
    }


@app.get("/ready")
async def ready() -> dict[str, str]:
    try:
        await check_readiness()
    except HermesError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"status": "ok", "runtime": "hermes"}


