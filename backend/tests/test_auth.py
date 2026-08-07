"""Auth endpoint tests"""

ORIGIN_HEADERS = {"Origin": "http://localhost:3000"}


def test_login_success(client, test_user):
    response = client.post("/api/v1/token", data={
        "username": "testuser",
        "password": "testpass123",
    }, headers=ORIGIN_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert not data.get("requires_2fa", False)


def test_login_wrong_password(client, test_user):
    response = client.post("/api/v1/token", data={
        "username": "testuser",
        "password": "wrongpass",
    }, headers=ORIGIN_HEADERS)
    assert response.status_code == 401


def test_login_nonexistent_user(client):
    response = client.post("/api/v1/token", data={
        "username": "nonexistent",
        "password": "testpass123",
    }, headers=ORIGIN_HEADERS)
    assert response.status_code == 401


def test_users_me_returns_user(client, auth_headers):
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert "modules" in data


def test_users_me_requires_auth(client):
    response = client.get("/api/v1/users/me")
    assert response.status_code in [401, 403]


def test_health_endpoint_returns_200(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data


def test_health_live_returns_200(client):
    response = client.get("/health/live")
    assert response.status_code == 200


def test_health_ready_returns_200(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
