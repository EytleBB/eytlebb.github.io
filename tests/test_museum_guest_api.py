"""Real HTTP, persistent SQLite and concurrency regression tests for the museum API.

Run: python3 -m unittest discover -s tests -p 'test_museum_guest_api.py' -v
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import replace
import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "server/museum_guest_api.py"
SPEC = importlib.util.spec_from_file_location("museum_guest_api", MODULE_PATH)
api = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = api
SPEC.loader.exec_module(api)
A, B = "0x0001.jpg", "0x0002.png"


def solve(challenge):
    nonce = 0
    while int.from_bytes(hashlib.sha256((challenge["prefix"] + str(nonce)).encode()).digest(), "big") >> (256 - challenge["bits"]):
        nonce += 1
    return {"id": challenge["id"], "nonce": str(nonce)}


class Client:
    def __init__(self, test, ip="192.0.2.1", session=True):
        self.test, self.ip, self.cookie, self.csrf = test, ip, None, None
        if session:
            status, body, headers = self.request("GET", "/session")
            assert status == 200, (status, body)
            self.csrf = body["csrf"]

    def request(self, method, endpoint, body=None, extra=None, raw=None, full_path=False):
        headers = {"Host": self.test.host, "X-Real-IP": self.ip}
        if self.cookie:
            headers["Cookie"] = self.cookie
        if method == "POST":
            headers.update({"Origin": self.test.origin, "Content-Type": "application/json", "X-CSRF-Token": self.csrf or ""})
        headers.update(extra or {})
        data = raw if raw is not None else json.dumps(body).encode() if body is not None else None
        connection = http.client.HTTPConnection("127.0.0.1", self.test.port, timeout=5)
        connection.request(method, endpoint if full_path else api.API + endpoint, data, headers)
        response = connection.getresponse()
        response_headers = dict(response.getheaders())
        text = response.read()
        status = response.status
        connection.close()
        if "Set-Cookie" in response_headers:
            self.cookie = response_headers["Set-Cookie"].split(";", 1)[0]
        try:
            body = json.loads(text)
        except ValueError:
            body = text
        return status, body, response_headers

    def proof(self):
        status, body, _ = self.request("POST", "/challenge", {})
        assert status == 200, (status, body)
        return solve(body)

    def write(self, kind, text=None, name_id=None, artwork=A, proof=None):
        body = {"proof": proof or self.proof(), "website": ""}
        body.update({"nameId": name_id} if kind == "votes" else {"text": text})
        return self.request("POST", f"/artworks/{artwork}/{kind}", body)

    def detail(self, artwork=A, query=""):
        status, body, _ = self.request("GET", f"/artworks/{artwork}{query}")
        assert status == 200, (status, body)
        return body


class MuseumGuestbookHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        directory = Path(self.temp.name)
        self.public = directory / "public"
        (self.public / "images/gallery").mkdir(parents=True)
        (self.public / "images/gallery/index.json").write_text(json.dumps([A, B]))
        (self.public / "museum.html").write_text("<!doctype html><title>museum</title>")
        self.config = api.Config(db=directory / "private/guestbook.sqlite3", gallery_index=self.public / "images/gallery/index.json", public_root=self.public, secret=b"test-secret-" * 4, origin="http://127.0.0.1:0", dev_static=True, trust_proxy=True, pow_bits=8)
        self.service = api.Guestbook(self.config)
        self.now = [1800000000]
        self.service.clock = lambda: self.now[0]
        self.server = api.GuestbookServer(("127.0.0.1", 0), self.service)
        self.port = self.server.server_port
        self.host = f"127.0.0.1:{self.port}"
        self.origin = "http://" + self.host
        self.service.config = replace(self.config, origin=self.origin)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": .01}, daemon=True)
        self.thread.start()
        self.client = Client(self)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def test_session_cookie_flags_csrf_origin_and_host(self):
        stranger = Client(self, session=False)
        status, body, headers = stranger.request("GET", "/session")
        self.assertEqual(status, 200)
        self.assertEqual(body["powBits"], 8)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        self.assertIn("Path=/api/museum/v1", headers["Set-Cookie"])
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(stranger.request("POST", "/challenge", {})[0], 403)
        self.assertEqual(self.client.request("POST", "/challenge", {}, extra={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(self.client.request("POST", "/challenge", {}, extra={"Origin": ""})[0], 403)
        self.assertEqual(self.client.request("GET", "/session", extra={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.client.request("GET", "/session", extra={"Sec-Fetch-Site": "cross-site"})[0], 403)
        self.assertEqual(self.client.request("POST", "/challenge", {}, extra={"X-CSRF-Token": "é"})[0], 403)
        no_cookie = Client(self, session=False)
        self.assertEqual(no_cookie.request("POST", "/challenge", {})[0], 401)

    def test_secure_cookie_in_production_and_signed_identity(self):
        self.service.config = replace(self.service.config, dev_static=False, origin="https://eytle.cn")
        old_origin, old_host = self.origin, self.host
        self.origin, self.host = "https://eytle.cn", "eytle.cn"
        client = Client(self, session=False)
        status, _, headers = client.request("GET", "/session")
        self.assertEqual(status, 200)
        self.assertIn("; Secure", headers["Set-Cookie"])
        client.csrf = self.client.csrf
        client.cookie = self.client.cookie[:-1] + ("0" if self.client.cookie[-1] != "0" else "1")
        self.assertEqual(client.request("POST", "/challenge", {})[0], 401)
        self.origin, self.host = old_origin, old_host

    def test_proof_success_replay_cross_visitor_and_expiry(self):
        proof = self.client.proof()
        other = Client(self, ip="192.0.2.2")
        self.assertEqual(other.write("names", "Other", proof=proof)[0], 400)
        status, body, _ = self.client.write("names", "暮光", proof=proof)
        self.assertEqual(status, 200)
        self.assertIsNone(body["artwork"]["title"])
        self.assertEqual(self.client.write("comments", "replay", proof=proof)[0], 400)
        expired = self.client.proof()
        self.now[0] += self.config.challenge_ttl
        status, body, _ = self.client.write("comments", "late", proof=expired)
        self.assertEqual((status, body["error"]["code"]), (400, "proof_expired"))
        self.assertEqual(self.client.write("comments", "late", proof=expired)[0], 400)

    def test_invalid_pow_is_consumed(self):
        status, challenge, _ = self.client.request("POST", "/challenge", {})
        self.assertEqual(status, 200)
        nonce = 0
        while int.from_bytes(hashlib.sha256((challenge["prefix"] + str(nonce)).encode()).digest(), "big") >> 248 == 0:
            nonce += 1
        bad = {"id": challenge["id"], "nonce": str(nonce)}
        self.assertEqual(self.client.write("names", "Bad", proof=bad)[0], 400)
        self.assertEqual(self.client.write("names", "Good", proof=solve(challenge))[0], 400)

    def test_normalization_duplicate_and_plain_text_injection(self):
        status, body, _ = self.client.write("names", "  Ｍｏｏｎ\n light  ")
        self.assertEqual(status, 200)
        self.assertEqual(self.client.detail()["names"][0]["text"], "Moon light")
        status, body, _ = self.client.write("names", "moon  LIGHT")
        self.assertEqual((status, body["error"]["code"]), (409, "duplicate"))
        payload = "<script>alert('x')</script> '; DROP TABLE names; --"
        self.assertEqual(self.client.write("comments", payload)[0], 200)
        self.assertEqual(self.client.detail()["comments"][0]["text"], payload)
        self.assertEqual(self.client.detail()["artwork"]["namesCount"], 1)
        self.assertEqual(self.client.write("comments", payload)[0], 409)

    def test_unicode_limits_honeypot_and_controls(self):
        self.assertEqual(self.client.write("names", "画" * 40)[0], 200)
        for text in ("画" * 41, "\x00hello", "hi\u202eevil", "https://spam.example", "", "\u200d" * 40, "\u200c", "\ufe0f" * 40, "\u0301" * 5, "\u2800", "\u3164"):
            self.assertEqual(self.client.write("names", text)[0], 400)
        self.assertEqual(self.client.write("names", "👩\u200d🎨的画室")[0], 200)
        self.assertEqual(self.client.write("comments", "\ufe0f\u200d")[0], 400)
        self.assertEqual(self.client.write("comments", "评" * 280)[0], 200)
        self.assertEqual(self.client.write("comments", "评" * 281)[0], 400)
        proof = self.client.proof()
        self.assertEqual(self.client.request("POST", f"/artworks/{A}/comments", {"text": "bot", "website": "spam", "proof": proof})[0], 400)

    def test_votes_switch_toggle_and_artwork_isolation(self):
        first = self.client.write("names", "First")[1]["id"]
        second = self.client.write("names", "Second")[1]["id"]
        other_art = self.client.write("names", "Elsewhere", artwork=B)[1]["id"]
        self.assertEqual(self.client.write("votes", name_id=other_art)[0], 404)
        self.assertEqual(self.client.write("votes", name_id=first)[0], 200)
        detail = self.client.detail()
        self.assertEqual(detail["artwork"]["title"], "First")
        self.assertEqual([(n["text"], n["votes"], n["voted"]) for n in detail["names"]], [("First", 1, True), ("Second", 0, False)])
        self.assertEqual(self.client.write("votes", name_id=second)[0], 200)
        self.assertEqual(self.client.detail()["artwork"]["title"], "Second")
        self.assertEqual(self.client.write("votes", name_id=second)[0], 200)
        self.assertIsNone(self.client.detail()["artwork"]["title"])
        self.assertIsNone(self.client.detail(B)["artwork"]["title"])

    def test_winner_tie_is_oldest_and_voted_flags_are_private(self):
        first = self.client.write("names", "First")[1]["id"]
        second = self.client.write("names", "Second")[1]["id"]
        left, right = Client(self, "192.0.2.2"), Client(self, "192.0.2.3")
        self.assertEqual(left.write("votes", name_id=second)[0], 200)
        self.assertEqual(right.write("votes", name_id=first)[0], 200)
        self.assertEqual(left.detail()["artwork"]["title"], "First")
        self.assertEqual([n["voted"] for n in left.detail()["names"]], [False, True])
        self.assertEqual([n["voted"] for n in right.detail()["names"]], [True, False])
        self.assertEqual([n["voted"] for n in self.client.detail()["names"]], [False, False])

    def seed(self, names=0, comments=0):
        with self.service.transaction() as db:
            for i in range(names):
                db.execute("INSERT INTO names(artwork,text,normalized,author,created_at) VALUES(?,?,?,?,?)", (A, f"Name {i}", f"name {i}", "seed", self.now[0]))
            for i in range(comments):
                db.execute("INSERT INTO comments(artwork,text,normalized,author,created_at) VALUES(?,?,?,?,?)", (A, f"Comment {i}", f"comment {i}", "seed", self.now[0]))

    def test_all_names_and_comments_are_accessible_by_pagination(self):
        self.seed(names=45, comments=43)
        names, comments, next_names, next_comments = [], [], 0, 0
        for _ in range(3):
            page = self.client.detail(query=f"?namesOffset={next_names}&commentsOffset={next_comments}")
            names.extend(row["id"] for row in page["names"])
            comments.extend(row["id"] for row in page["comments"])
            next_names, next_comments = page["nextNamesOffset"], page["nextCommentsOffset"]
        self.assertEqual((len(names), len(set(names))), (45, 45))
        self.assertEqual((len(comments), len(set(comments))), (43, 43))
        self.assertIsNone(next_names)
        self.assertIsNone(next_comments)
        self.assertEqual(names, sorted(names))
        self.assertEqual(comments, sorted(comments, reverse=True))
        self.assertEqual(self.client.request("GET", f"/artworks/{A}?namesOffset=-1")[0], 400)
        self.assertEqual(self.client.request("GET", f"/artworks/{A}?namesOffset=0&namesOffset=20")[0], 400)

    def test_gallery_allowlist_bulk_unknown_and_refresh(self):
        status, body, _ = self.client.request("GET", f"/artworks?ids={A},{B}")
        self.assertEqual(status, 200)
        self.assertEqual([a["id"] for a in body["artworks"]], [A, B])
        self.assertEqual(self.client.request("GET", "/artworks?ids=" + ",".join([A] * 81))[0], 400)
        self.assertEqual(self.client.request("GET", "/artworks/unknown.jpg")[0], 404)
        self.assertEqual(self.client.request("GET", "/artworks/%2e%2e%2fsecret")[0], 404)
        self.assertEqual(self.client.request("GET", "/artworks/%FF")[0], 400)
        self.assertEqual(self.client.request("GET", "/artworks/%GG")[0], 400)
        self.assertEqual(self.client.request("GET", "http://[bad", full_path=True)[0], 400)
        self.assertEqual(self.client.request("GET", "/session?" + "&".join("x=1" for _ in range(11)))[0], 400)
        index = self.config.gallery_index
        index.write_text(json.dumps([A, B, "new.webp"]))
        self.assertEqual(self.client.request("GET", "/artworks/new.webp")[0], 200)
        index.write_text(json.dumps(["../../secret"]))
        self.assertEqual(self.client.request("GET", f"/artworks/{A}")[0], 503)

    def test_http_body_content_type_size_and_json_errors(self):
        endpoint = "/challenge"
        self.assertEqual(self.client.request("POST", endpoint, raw=b"x" * 4097)[0], 413)
        self.assertEqual(self.client.request("POST", endpoint, raw=b"{")[0], 400)
        self.assertEqual(self.client.request("POST", endpoint, raw=b"\xff")[0], 400)
        self.assertEqual(self.client.request("POST", endpoint, raw=b"[]")[0], 400)
        self.assertEqual(self.client.request("POST", endpoint, raw=b"[" * 1500 + b"]" * 1500)[0], 400)
        self.assertEqual(self.client.request("POST", endpoint, {}, extra={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.client.request("POST", endpoint, {}, extra={"Transfer-Encoding": "chunked"})[0], 400)
        self.assertEqual(self.client.request("OPTIONS", endpoint)[0], 405)

    def test_quotas_cookie_reset_ip_and_global_daily_cap(self):
        for i in range(3):
            self.assertEqual(self.client.write("names", f"Name {i}")[0], 200)
        status, body, headers = self.client.write("names", "Fourth")
        self.assertEqual((status, body["error"]["code"]), (429, "rate_limited"))
        self.assertGreater(int(headers["Retry-After"]), 0)
        self.service.config = replace(self.service.config, global_daily_writes=4)
        fresh_cookie = Client(self)
        self.assertEqual(fresh_cookie.write("comments", "Cookie reset still shares global quota")[0], 200)
        status, _, _ = Client(self, "192.0.2.99").write("comments", "Global quota applies to every IP")
        self.assertEqual(status, 429)
        self.now[0] += 86400
        self.assertEqual(self.client.write("comments", "Next day")[0], 200)

    def test_ip_vote_quota_survives_cookie_resets(self):
        identity = self.client.write("names", "Name")[1]["id"]
        for i in range(12):
            self.now[0] += 61
            client = Client(self)
            self.assertEqual(client.write("votes", name_id=identity)[0], 200)
        self.now[0] += 61
        status, _, _ = Client(self).write("votes", name_id=identity)
        self.assertEqual(status, 429)
        self.assertEqual(self.client.detail()["names"][0]["votes"], 12)

    def test_artwork_storage_caps_include_hidden_content(self):
        self.service.config = replace(self.service.config, artwork_names=1, artwork_comments=1)
        identity = self.client.write("names", "Name")[1]["id"]
        self.service.moderate("name", identity, True)
        self.assertEqual(self.client.write("names", "Other")[0], 429)
        self.assertEqual(self.client.write("comments", "Comment")[0], 200)
        self.assertEqual(self.client.write("comments", "Another")[0], 429)

    def test_concurrent_votes_are_atomic_and_single_active_per_artwork(self):
        first = self.client.write("names", "First")[1]["id"]
        second = self.client.write("names", "Second")[1]["id"]
        clients = [Client(self, f"192.0.2.{i + 10}") for i in range(8)]
        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(lambda c: c.write("votes", name_id=first)[0], clients))
        self.assertEqual(statuses, [200] * 8)
        self.assertEqual(self.client.detail()["names"][0]["votes"], 8)
        voter = Client(self, "192.0.2.100")
        proofs = [voter.proof(), voter.proof()]
        def vote_once(pair):
            clone = Client(self, "192.0.2.100", session=False)
            clone.cookie, clone.csrf = voter.cookie, voter.csrf
            return clone.write("votes", name_id=pair[0], proof=pair[1])[0]
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(list(pool.map(vote_once, zip((first, second), proofs))), [200, 200])
        with self.service.connection() as db:
            visitor = self.service.visitor(voter.cookie)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM votes WHERE visitor=? AND artwork=?", (visitor, A)).fetchone()[0], 1)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_concurrent_replay_creates_only_one_comment(self):
        proof = self.client.proof()
        def write(_):
            clone = Client(self, session=False)
            clone.cookie, clone.csrf = self.client.cookie, self.client.csrf
            return clone.write("comments", "One comment", proof=proof)[0]
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = sorted(pool.map(write, range(2)))
        self.assertEqual(statuses, [200, 400])
        self.assertEqual(self.client.detail()["artwork"]["commentsCount"], 1)

    def test_restart_persistence_moderation_recomputes_winner_and_backup(self):
        first = self.client.write("names", "First")[1]["id"]
        second = self.client.write("names", "Second")[1]["id"]
        self.client.write("votes", name_id=first)
        Client(self, "192.0.2.3").write("votes", name_id=second)
        comment = self.client.write("comments", "Keep this")[1]["id"]
        restarted = api.Guestbook(self.service.config)
        restarted.clock = lambda: self.now[0]
        self.server.service = restarted
        self.service = restarted
        self.assertEqual(self.client.detail()["artwork"]["title"], "First")
        self.assertEqual(self.service.moderate("name", first, True)["title"], "Second")
        self.assertEqual(self.client.detail()["artwork"]["namesCount"], 1)
        self.assertEqual(self.client.write("votes", name_id=first)[0], 404)
        self.service.moderate("comment", comment, True)
        self.assertEqual(self.client.detail()["comments"], [])
        self.service.moderate("name", first, False)
        self.service.moderate("comment", comment, False)
        self.assertEqual(self.client.detail()["artwork"]["title"], "First")
        destination = Path(self.temp.name) / "backups/one.sqlite3"
        self.assertEqual(self.service.backup(destination), str(destination))
        with closing(sqlite3.connect(destination)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM names").fetchone()[0], 2)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
        with self.assertRaises(ValueError):
            self.service.backup(destination)
        with self.assertRaises(ValueError):
            self.service.backup(self.public / "backup.sqlite3")

    def test_ipv6_privacy_addresses_share_a_daily_prefix_quota(self):
        first = self.service.ip_hash("2001:db8:1234:5::1")
        self.assertEqual(first, self.service.ip_hash("2001:db8:1234:5:abcd:1234:5678:90ab"))
        self.assertNotEqual(first, self.service.ip_hash("2001:db8:1234:6::1"))
        self.now[0] += 86400
        self.assertNotEqual(first, self.service.ip_hash("2001:db8:1234:5::1"))

    def test_no_raw_addresses_or_session_tokens_stored_and_prune(self):
        self.client.write("comments", "Hello")
        self.client.proof()
        with self.service.connection() as db:
            dump = "\n".join(db.iterdump())
            self.assertNotIn("192.0.2.1", dump)
            self.assertNotIn(self.client.cookie.split("=", 1)[1], dump)
            self.assertNotIn(self.client.csrf, dump)
        self.now[0] += 86401
        self.service.prune()
        with self.service.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM challenges").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM rates").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM comments").fetchone()[0], 1)

    def test_static_preview_denies_internal_hidden_traversal_and_symlinks(self):
        (self.public / "server").mkdir()
        (self.public / "server/secret.py").write_text("secret")
        (self.public / "images/private.sqlite3").write_text("database")
        (self.public / "images/secret.env").write_text("secret")
        (self.public / "images/leak.png").symlink_to(self.public / "server/secret.py")
        for path in ("/.git/config", "/server/secret.py", "/images/leak.png", "/images/private.sqlite3", "/images/secret.env", "/images/%2e%2e/server/secret.py", "/images", "/AGENTS.md", "/images%00/foo", "/images\\secret"):
            self.assertIn(self.client.request("GET", path, full_path=True)[0], (400, 404), path)
        self.assertEqual(self.client.request("GET", "/museum.html", full_path=True)[0], 200)
        self.assertEqual(self.client.request("HEAD", "/museum.html", full_path=True)[0], 200)
        (self.public / "_shots").mkdir()
        (self.public / "_shots/review.html").write_text("preview")
        (self.public / "_shots/private.json").write_text("private")
        self.assertEqual(self.client.request("GET", "/_shots/review.html", full_path=True)[0], 200)
        self.assertEqual(self.client.request("GET", "/_shots/private.json", full_path=True)[0], 404)

    def test_startup_rejects_unsafe_storage_weak_secret_and_public_binding(self):
        with self.assertRaises(ValueError):
            api.Guestbook(replace(self.config, db=self.public / "data.sqlite3"))
        with self.assertRaises(ValueError):
            api.Guestbook(replace(self.config, secret=b"short"))
        with self.assertRaises(ValueError):
            api.Guestbook(replace(self.config, dev_static=False))
        with self.assertRaises(ValueError):
            api.GuestbookServer(("0.0.0.0", 0), self.service)


if __name__ == "__main__":
    unittest.main()
