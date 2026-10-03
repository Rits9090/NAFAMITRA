from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import config
from errors import install_error_handlers

app = FastAPI(title="NafaMitra API", version="2.0.0", redirect_slashes=False)
api_router = APIRouter(prefix="/api")

install_error_handlers(app)

# Import routes
from routes.auth_routes import router as auth_router
from routes.dashboard_routes import router as dashboard_router
from routes.customer_routes import router as customer_router
from routes.customer_portal_routes import router as portal_router
from routes.product_routes import router as product_router
from routes.sales_routes import router as sales_router
from routes.udhaar_routes import router as udhaar_router
from routes.supplier_routes import router as supplier_router
from routes.loyalty_routes import router as loyalty_router
from routes.voice_routes import router as voice_router
from routes.assistant_routes import router as assistant_router
from routes.reports_routes import router as reports_router
from routes.analytics_routes import router as analytics_router, admin_router as admin_analytics_router

api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(customer_router, prefix="/customers", tags=["customers"])
api_router.include_router(portal_router, prefix="/customer", tags=["customer-portal"])
api_router.include_router(product_router, prefix="/products", tags=["products"])
api_router.include_router(sales_router, prefix="/sales", tags=["sales"])
api_router.include_router(udhaar_router, prefix="/udhaar", tags=["udhaar"])
api_router.include_router(supplier_router, prefix="/suppliers", tags=["suppliers"])
api_router.include_router(loyalty_router, prefix="/loyalty", tags=["loyalty"])
api_router.include_router(voice_router, prefix="/voice", tags=["voice"])
api_router.include_router(assistant_router, prefix="/assistant", tags=["assistant"])
api_router.include_router(reports_router, prefix="/reports", tags=["reports"])
api_router.include_router(analytics_router)
api_router.include_router(admin_analytics_router)


@api_router.get("/config")
async def get_public_config():
    """Brand, languages, support contact, OTP mode — consumed by the SPA."""
    return config.public_config()


@api_router.post("/seed")
async def seed_demo():
    from seed_data import seed_demo_business
    from database import db
    from migrate import run_migrations
    result = await seed_demo_business(db)
    # convert freshly seeded legacy-shaped docs into the new model
    try:
        result['migrations'] = await run_migrations()
    except Exception:
        logger.exception('post-seed migration failed')
    return result


@api_router.get("/health")
async def health():
    from database import using_memory_db
    return {"status": "ok", "service": "NafaMitra API",
            "database": "memory" if using_memory_db() else "mongodb"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    from database import client, ensure_indexes, using_memory_db
    from migrate import run_migrations
    await ensure_indexes()
    try:
        result = await run_migrations()
        logger.info('migrations: %s', result)
    except Exception:
        logger.exception('migration failed (continuing)')
    if using_memory_db():
        logger.warning('MONGO_URL not set — using in-memory database (dev/test only)')


@app.on_event("shutdown")
async def shutdown():
    from database import client
    client.close()
