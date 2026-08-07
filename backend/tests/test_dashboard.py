"""Dashboard endpoint tests"""


def test_dashboard_stats_returns_200(client, auth_headers):
    response = client.get("/api/v1/dashboard/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_users" in data
    assert "assets_total" in data
    assert "documents_count" in data
    assert "open_incidents" in data
    assert "active_tasks" in data


def test_dashboard_stats_requires_auth(client):
    response = client.get("/api/v1/dashboard/stats")
    assert response.status_code in [401, 403]


def test_enhanced_dashboard_returns_200(client, auth_headers):
    response = client.get("/api/v1/dashboard/enhanced", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "today" in data
    assert "week" in data
    assert "tasks" in data
    assert "priority" in data
    assert "overdue" in data


def test_recent_activity_returns_200(client, auth_headers):
    response = client.get("/api/v1/dashboard/recent-activity", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_infrastructure_status_returns_200(client, auth_headers):
    response = client.get("/api/v1/dashboard/infrastructure-status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_servers" in data
    assert "ok_count" in data


def test_today_focus_returns_200(client, auth_headers):
    response = client.get("/api/v1/tasks/today-focus", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "top_priorities" in data
    assert "due_today" in data
    assert "in_progress" in data


def test_priority_matrix_returns_200(client, auth_headers):
    response = client.get("/api/v1/tasks/priority-matrix", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "urgent" in data
    assert "normal" in data
    assert "low" in data
    assert "backlog" in data
