import pytest


@pytest.fixture
def world(client, make_user, auth_headers, make_patient):
    """A real clinic (doctor + patient + assessment) and a demo sandbox user."""
    real_headers = auth_headers(make_user(role="doctor"))
    real_patient = make_patient(real_headers, firstName="Real", lastName="Person")
    rid = real_patient["patient_id"]
    resp = client.post("/api/risk-assessments", json={"patientId": rid, "sbp": 150, "dbp": 90}, headers=real_headers)
    assert resp.status_code == 200, resp.text
    real_aid = resp.json()["assessmentId"]
    enc = client.post("/api/encounters", json={"patientId": rid, "notes": "n"}, headers=real_headers)
    assert enc.status_code == 201, enc.text

    creds = client.post("/api/demo/start").json()
    token = client.post("/api/auth/login", json={"username": creds["username"], "password": creds["password"]}).json()["token"]
    demo_headers = {"Authorization": f"Bearer {token}"}
    demo_patients = client.get("/api/patients", headers=demo_headers).json()
    demo_pid = demo_patients[0]["patient_id"]
    demo_aid = client.get(f"/api/patients/{demo_pid}/risk-assessments", headers=demo_headers).json()[0]["assessment_id"]
    return {
        "real": real_headers, "rid": rid, "raid": real_aid,
        "demo": demo_headers, "did": demo_pid, "daid": demo_aid, "demo_patients": demo_patients,
    }


def test_each_side_lists_only_its_own_patients(client, world):
    real_ids = {p["patient_id"] for p in client.get("/api/patients", headers=world["real"]).json()}
    demo_ids = {p["patient_id"] for p in client.get("/api/patients", headers=world["demo"]).json()}
    assert real_ids == {world["rid"]}
    assert len(demo_ids) == 6 and world["rid"] not in demo_ids and not (real_ids & demo_ids)


def test_each_side_lists_only_its_own_assessments_and_stats(client, world):
    real = client.get("/api/risk-assessments", headers=world["real"]).json()
    demo = client.get("/api/risk-assessments", headers=world["demo"]).json()
    assert [a["assessment_id"] for a in real] == [world["raid"]]
    assert len(demo) == 6 and world["raid"] not in {a["assessment_id"] for a in demo}

    real_stats = client.get("/api/dashboard/stats", headers=world["real"]).json()
    demo_stats = client.get("/api/dashboard/stats", headers=world["demo"]).json()
    assert (real_stats["totalPatients"], real_stats["totalAssessments"]) == (1, 1)
    assert (demo_stats["totalPatients"], demo_stats["totalAssessments"]) == (6, 6)
    assert sum(demo_stats["riskDistribution"].values()) == 6
    assert {r["id"] for r in real_stats["recentAssessments"]} == {world["raid"]}
    assert world["raid"] not in {r["id"] for r in demo_stats["recentAssessments"]}


@pytest.mark.parametrize("actor,target", [("demo", "rid"), ("real", "did")])
def test_cross_scope_ids_are_not_found(client, world, actor, target):
    h = world[actor]
    pid = world[target]
    aid = world["raid"] if target == "rid" else world["daid"]
    assert client.get(f"/api/patients/{pid}", headers=h).status_code == 404
    assert client.patch(f"/api/patients/{pid}", json={"firstName": "X"}, headers=h).status_code == 404
    assert client.get(f"/api/patients/{pid}/encounters", headers=h).status_code == 404
    assert client.get(f"/api/patients/{pid}/risk-assessments", headers=h).status_code == 404
    assert client.post("/api/encounters", json={"patientId": pid}, headers=h).status_code == 404
    assert client.post("/api/risk-assessments", json={"patientId": pid, "sbp": 120, "dbp": 80}, headers=h).status_code == 404
    assert client.post("/api/predict", json={"patientId": pid, "sbp": 120, "dbp": 80}, headers=h).status_code == 404
    assert client.get(f"/api/risk-assessments/{aid}", headers=h).status_code == 404
    assert client.patch(f"/api/risk-assessments/{aid}/review", json={"reviewStatus": "reviewed"}, headers=h).status_code == 404
    assert client.patch(f"/api/risk-assessments/{aid}/override", json={"riskLevel": "high", "reason": "cross scope"}, headers=h).status_code == 404
    assert client.delete(f"/api/risk-assessments/{aid}", headers=h).status_code == 404
    assert client.delete(f"/api/patients/{pid}", headers=h).status_code == 404
    # nothing was changed by the failed attempts
    owner = world["real"] if target == "rid" else world["demo"]
    assert client.get(f"/api/patients/{pid}", headers=owner).status_code == 200
    assert client.get(f"/api/risk-assessments/{aid}", headers=owner).json()["review_status"] == "pending"
    assert client.get(f"/api/risk-assessments/{aid}", headers=owner).json()["override_risk_level"] is None


def test_demo_created_patient_is_owned_and_invisible_to_real_users(client, db, world, make_patient):
    created = make_patient(world["demo"], firstName="Sandbox", lastName="Only")
    with db.cursor() as cursor:
        cursor.execute("SELECT owner_user_id FROM patients WHERE id = %s", (created["patient_id"],))
        assert cursor.fetchone()["owner_user_id"] is not None
    assert created["patient_id"] not in {p["patient_id"] for p in client.get("/api/patients", headers=world["real"]).json()}
    assert client.get(f"/api/patients/{created['patient_id']}", headers=world["real"]).status_code == 404
    assert client.post("/api/risk-assessments", json={"patientId": created["patient_id"], "sbp": 130, "dbp": 80}, headers=world["demo"]).status_code == 200


def test_real_created_patient_has_no_owner(db, world):
    with db.cursor() as cursor:
        cursor.execute("SELECT owner_user_id FROM patients WHERE id = %s", (world["rid"],))
        assert cursor.fetchone()["owner_user_id"] is None


def test_two_demo_sandboxes_are_isolated(client, db, world):
    other = client.post("/api/demo/start")
    assert other.status_code == 201
    token = client.post("/api/auth/login", json={"username": other.json()["username"], "password": other.json()["password"]}).json()["token"]
    other_headers = {"Authorization": f"Bearer {token}"}
    mine = {p["patient_id"] for p in client.get("/api/patients", headers=world["demo"]).json()}
    theirs = {p["patient_id"] for p in client.get("/api/patients", headers=other_headers).json()}
    assert len(mine) == len(theirs) == 6 and not (mine & theirs)
    assert client.get(f"/api/patients/{world['did']}", headers=other_headers).status_code == 404


def test_admin_sees_real_data_only(client, make_user, auth_headers, world):
    admin = auth_headers(make_user(role="admin"))
    assert {p["patient_id"] for p in client.get("/api/patients", headers=admin).json()} == {world["rid"]}
    assert client.get(f"/api/patients/{world['did']}", headers=admin).status_code == 404
