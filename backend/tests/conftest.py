"""Shared test fixtures for all backend tests"""
import pytest
import sys
import os

# Patch environment BEFORE importing main so middleware see permissive config
os.environ.setdefault("ALLOWED_HOSTS", "*")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000,http://testserver,http://testserver.local")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.rate_limiter import limiter

class NoOpLimiter:
    def limit(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator

# Replace the limiter instance in the module before main.py imports it
import utils.rate_limiter
utils.rate_limiter.limiter = NoOpLimiter()

# Also patch it in modules that already imported it
import api.auth
api.auth.limiter = NoOpLimiter()
import api.assets_unified
api.assets_unified.limiter = NoOpLimiter()

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, get_db
from main import app
from models import User


SQLALCHEMY_DATABASE_URL = "sqlite:///./test_superapps.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with overridden DB dependency"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    """Create a test user"""
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password=User.hash_password("testpass123"),
        full_name="Test User",
        role="superadmin",
        status="active",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, test_user):
    """Login and return auth headers"""
    response = client.post("/api/v1/token", data={
        "username": "testuser",
        "password": "testpass123",
    }, headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Origin": "http://localhost:3000"}
