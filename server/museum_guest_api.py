#!/usr/bin/env python3
"""Museum guestbook: a loopback-only JSON API, SQLite storage and local admin CLI.

Production requests must arrive through the documented same-origin Nginx proxy.
No third-party dependencies; Python 3.10+. Never put the database in a web root.
"""
from __future__ import annotations

import argparse
import getpass
from contextlib import closing, contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
from http.cookies import SimpleCookie, CookieError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
import unicodedata
from urllib.parse import parse_qs, unquote, urlsplit

API = "/api/museum/v1"
COOKIE = "museum_visitor"
ADMIN_COOKIE = "museum_admin"
SCHEMA_VERSION = 2
PAGE_SIZE = 20
MAX_BODY = 4096
COOKIE_TTL = 180 * 86400
SAFE_NAME = re.compile(r"[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|avif)", re.I)
URL_TEXT = re.compile(r"(?:https?://|www\.|javascript:|data:|mailto:)", re.I)
NONCE = re.compile(r"(?:0|[1-9][0-9]{0,19})")
ADMIN_NAME = re.compile(r"[a-z][a-z0-9_-]{2,31}")
ADMIN_SESSION_TTL = 12 * 3600
ADMIN_IDLE_TTL = 30 * 60
# These have letter/symbol categories but intentionally render as empty cells.
BLANK_BASES = frozenset("\u115f\u1160\u3164\uffa0\u2800")


class APIError(Exception):
    def __init__(self, status, code, message, retry_after=None):
        self.status, self.code, self.message = status, code, message
        self.retry_after = retry_after
        super().__init__(message)


@dataclass(frozen=True)
class Config:
    db: Path
    gallery_index: Path
    public_root: Path
    secret: bytes
    origin: str
    dev_static: bool = False
    trust_proxy: bool = False
    pow_bits: int = 18
    challenge_ttl: int = 180
    global_daily_writes: int = 2000
    artwork_names: int = 1000
    artwork_comments: int = 5000
    max_database_mb: int = 256

    def validate(self):
        self.db.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        database = self.db.resolve()
        root = self.public_root.resolve()
        # Also reject a source-checkout DB when an independent public root is used.
        source_root = Path(__file__).resolve().parents[1]
        if database.is_relative_to(root) or database.is_relative_to(source_root):
            raise ValueError("Database must be outside both the repository and public web root")
        if len(self.secret) < 32:
            raise ValueError("MUSEUM_SECRET must contain at least 32 bytes of high-entropy secret")
        origin = urlsplit(self.origin)
        if origin.scheme not in ("http", "https") or not origin.hostname or origin.path or origin.query or origin.fragment or origin.username:
            raise ValueError("Origin must be an exact origin, e.g. https://eytle.cn (no trailing slash)")
        if not self.dev_static and origin.scheme != "https":
            raise ValueError("Production origin must use HTTPS")
        if not 8 <= self.pow_bits <= 24 or self.challenge_ttl < 1:
            raise ValueError("PoW bits must be 8–24 and TTL must be positive")
        if min(self.global_daily_writes, self.artwork_names, self.artwork_comments, self.max_database_mb) < 1:
            raise ValueError("Storage and write caps must be positive")


SCHEMA = """
CREATE TABLE IF NOT EXISTS names (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork TEXT NOT NULL,
    text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 40),
    normalized TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
    display_votes INTEGER CHECK(display_votes IS NULL OR display_votes >= 0),
    vote_base INTEGER NOT NULL DEFAULT 0,
    UNIQUE(artwork, normalized), UNIQUE(artwork, id)
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artwork TEXT NOT NULL,
    text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 280),
    normalized TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0, 1)),
    UNIQUE(artwork, normalized)
);
CREATE TABLE IF NOT EXISTS votes (
    artwork TEXT NOT NULL,
    visitor TEXT NOT NULL,
    name_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(artwork, visitor),
    FOREIGN KEY(artwork, name_id) REFERENCES names(artwork, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS votes_by_name ON votes(name_id);
CREATE INDEX IF NOT EXISTS names_by_art ON names(artwork, hidden, id);
CREATE INDEX IF NOT EXISTS comments_by_art ON comments(artwork, hidden, id);
CREATE INDEX IF NOT EXISTS names_by_author ON names(artwork, author, created_at);
CREATE INDEX IF NOT EXISTS comments_by_author ON comments(artwork, author, created_at);
CREATE TABLE IF NOT EXISTS challenges (
    id TEXT PRIMARY KEY, visitor TEXT NOT NULL, prefix TEXT NOT NULL,
    bits INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS challenge_expiry ON challenges(expires_at);
CREATE INDEX IF NOT EXISTS challenge_visitor ON challenges(visitor);
CREATE TABLE IF NOT EXISTS rates (
    scope TEXT NOT NULL, subject TEXT NOT NULL, bucket INTEGER NOT NULL,
    count INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    PRIMARY KEY(scope, subject, bucket)
);
CREATE INDEX IF NOT EXISTS rate_expiry ON rates(expires_at);
CREATE TABLE IF NOT EXISTS moderation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL, target_id INTEGER NOT NULL,
    hidden INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner','admin')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS title_selections (
    artwork TEXT PRIMARY KEY,
    name_id INTEGER NOT NULL REFERENCES names(id) ON DELETE CASCADE,
    selected_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    artwork TEXT,
    kind TEXT,
    target_id INTEGER,
    details TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_recent ON admin_audit(id DESC);
"""


def utc(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def normalize_text(value, limit):
    if not isinstance(value, str) or len(value) > 2048:
        raise APIError(400, "invalid_text", "Please enter plain text within the character limit.")
    text = unicodedata.normalize("NFKC", value)
    if any(unicodedata.category(ch).startswith("C") and ch not in "\t\r\n\u200c\u200d" for ch in text):
        raise APIError(400, "invalid_text", "Control characters are not allowed.")
    text = " ".join(text.split())
    has_visible_base = any(unicodedata.category(ch)[0] in "LNPS" and ch not in BLANK_BASES for ch in text)
    if not 1 <= len(text) <= limit or not has_visible_base or URL_TEXT.search(text):
        raise APIError(400, "invalid_text", f"Use 1–{limit} characters of plain text, without links.")
    return text, text.casefold()


def password_hash(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 128 or len(password.encode("utf-8")) > 512:
        raise APIError(400, "invalid_password", "Use a password of 12–128 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
    return "scrypt$16384$" + salt.hex() + "$" + digest.hex()


def verify_password(password, stored):
    try:
        algorithm, cost, salt, expected = stored.split("$")
        if algorithm != "scrypt" or cost != "16384" or len(password.encode("utf-8")) > 512:
            return False
        actual = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=16384, r=8, p=1)
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, AttributeError, TypeError):
        return False


class Guestbook:
    def __init__(self, config):
        config.validate()
        self.config = config
        self.clock = time.time
        self._gallery_lock = threading.Lock()
        self._login_slots = threading.BoundedSemaphore(2)
        self._gallery_stamp = None
        self._gallery = frozenset()
        self.gallery_ids()  # Fail startup if the trusted index cannot be loaded.
        with self.connection() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version not in (0, 1, SCHEMA_VERSION):
                raise ValueError("Unsupported guestbook database schema version")
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)
            columns = {row[1] for row in db.execute("PRAGMA table_info(names)")}
            if "display_votes" not in columns:
                db.execute("ALTER TABLE names ADD COLUMN display_votes INTEGER CHECK(display_votes IS NULL OR display_votes >= 0)")
            if "vote_base" not in columns:
                db.execute("ALTER TABLE names ADD COLUMN vote_base INTEGER NOT NULL DEFAULT 0")
            db.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
        os.chmod(config.db, 0o600)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.config.db, timeout=3, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=3000")
        db.execute("PRAGMA synchronous=FULL")
        page_size = db.execute("PRAGMA page_size").fetchone()[0]
        pages = self.config.max_database_mb * 1024 * 1024 // page_size
        db.execute(f"PRAGMA max_page_count={pages}")
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def transaction(self):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
            except Exception:
                db.rollback()
                raise
            else:
                db.commit()

    def gallery_ids(self):
        path = self.config.gallery_index
        try:
            with self._gallery_lock:
                stamp = (path.stat().st_mtime_ns, path.stat().st_size)
                if stamp != self._gallery_stamp:
                    values = json.loads(path.read_text(encoding="utf-8"))
                    if not isinstance(values, list) or not values or len(values) > 100000 or any(not isinstance(v, str) or not SAFE_NAME.fullmatch(v) for v in values):
                        raise ValueError("Gallery index must contain only safe image basenames")
                    self._gallery = frozenset(values)
                    self._gallery_stamp = stamp
                return self._gallery
        except (OSError, ValueError) as exc:
            raise APIError(503, "service_busy", "The artwork index is temporarily unavailable.") from exc

    def artwork(self, value):
        if value not in self.gallery_ids():
            raise APIError(404, "artwork_not_found", "This artwork is not in the gallery.")
        return value

    def digest(self, purpose, value):
        return hmac.new(self.config.secret, (purpose + ":" + value).encode(), hashlib.sha256).hexdigest()

    def issue_cookie(self):
        payload = secrets.token_hex(24) + "." + str(int(self.clock()))
        return payload + "." + self.digest("cookie", payload)

    def visitor(self, cookie_header):
        try:
            jar = SimpleCookie()
            jar.load(cookie_header or "")
            value = jar[COOKIE].value
            if not re.fullmatch(r"[0-9a-f]{48}\.[0-9]{1,12}\.[0-9a-f]{64}", value):
                return None
            identifier, issued, signature = value.split(".")
            age = int(self.clock()) - int(issued)
            if age < -60 or age > COOKIE_TTL or not hmac.compare_digest(signature, self.digest("cookie", identifier + "." + issued)):
                return None
            return self.digest("visitor", identifier)
        except (CookieError, KeyError, ValueError):
            return None

    def csrf(self, visitor):
        return self.digest("csrf", visitor)

    def ip_hash(self, ip):
        # Day-specific keyed hashes are retained only in expiring counters.
        address = ipaddress.ip_address(ip)
        # IPv6 privacy addresses within one /64 share a quota, like one IPv4 address.
        subject = str(ipaddress.ip_network(str(address) + "/64", strict=False)) if address.version == 6 else str(address)
        return self.digest("ip:" + str(int(self.clock()) // 86400), subject)

    def rate(self, db, scope, subject, limit, period, now):
        bucket = now // period
        expiry = (bucket + 1) * period
        row = db.execute("SELECT count FROM rates WHERE scope=? AND subject=? AND bucket=?", (scope, subject, bucket)).fetchone()
        if row and row[0] >= limit:
            raise APIError(429, "rate_limited", "Please wait before trying again.", max(1, expiry - now))
        db.execute("INSERT INTO rates(scope,subject,bucket,count,expires_at) VALUES(?,?,?,1,?) ON CONFLICT(scope,subject,bucket) DO UPDATE SET count=count+1", (scope, subject, bucket, expiry))

    def read_limit(self, ip):
        now = int(self.clock())
        with self.transaction() as db:
            self.rate(db, "read-ip", ip, 180, 60, now)
            db.execute("DELETE FROM rates WHERE expires_at<?", (now - 60,))

    def challenge(self, visitor, ip):
        now = int(self.clock())
        with self.transaction() as db:
            self.rate(db, "challenge-global", "all", 5000, 3600, now)
            self.rate(db, "challenge-ip", ip, 40, 600, now)
            self.rate(db, "challenge-visitor", visitor, 20, 600, now)
            db.execute("DELETE FROM challenges WHERE expires_at<?", (now,))
            # At most three live challenges per visitor; bound DB growth on abandoned forms.
            ids = db.execute("SELECT id FROM challenges WHERE visitor=? ORDER BY expires_at DESC, rowid DESC", (visitor,)).fetchall()
            for row in ids[2:]:
                db.execute("DELETE FROM challenges WHERE id=?", (row[0],))
            identity, prefix = secrets.token_hex(16), secrets.token_hex(24) + ":"
            expiry = now + self.config.challenge_ttl
            db.execute("INSERT INTO challenges VALUES(?,?,?,?,?)", (identity, visitor, prefix, self.config.pow_bits, expiry))
        return {"id": identity, "prefix": prefix, "bits": self.config.pow_bits, "expiresAt": expiry * 1000}

    def consume_proof(self, visitor, proof):
        if not isinstance(proof, dict) or set(proof) != {"id", "nonce"} or not isinstance(proof["id"], str):
            raise APIError(400, "proof_invalid", "A fresh verification is required.")
        nonce = proof.get("nonce")
        if not isinstance(nonce, str) or not NONCE.fullmatch(nonce):
            raise APIError(400, "proof_invalid", "Verification was invalid.")
        now = int(self.clock())
        with self.transaction() as db:
            row = db.execute("SELECT * FROM challenges WHERE id=? AND visitor=?", (proof["id"], visitor)).fetchone()
            if row:
                db.execute("DELETE FROM challenges WHERE id=?", (proof["id"],))
        # Consumption commits even when expired/invalid or a later business rule fails.
        if not row:
            raise APIError(400, "proof_invalid", "Verification was already used or does not belong to this visitor.")
        if row["expires_at"] <= now:
            raise APIError(400, "proof_expired", "Verification expired. Please try again.")
        digest = hashlib.sha256((row["prefix"] + nonce).encode("ascii")).digest()
        if int.from_bytes(digest, "big") >> (256 - row["bits"]):
            raise APIError(400, "proof_invalid", "Verification was invalid.")

    def summary(self, db, artwork):
        winner = db.execute("""SELECT n.id,n.text,
            MAX(0,COALESCE(n.display_votes + COUNT(v.visitor) - n.vote_base,COUNT(v.visitor))) AS total
            FROM names n LEFT JOIN votes v ON v.name_id=n.id
            WHERE n.artwork=? AND n.hidden=0 GROUP BY n.id
            ORDER BY total DESC,n.created_at ASC,n.id ASC LIMIT 1""", (artwork,)).fetchone()
        selected = db.execute("SELECT n.id,n.text FROM title_selections s JOIN names n ON n.id=s.name_id WHERE s.artwork=? AND n.hidden=0", (artwork,)).fetchone()
        if selected:
            winner = db.execute("""SELECT n.id,n.text,
                MAX(0,COALESCE(n.display_votes + COUNT(v.visitor) - n.vote_base,COUNT(v.visitor))) AS total
                FROM names n LEFT JOIN votes v ON v.name_id=n.id WHERE n.id=? GROUP BY n.id""", (selected["id"],)).fetchone()
        names = db.execute("SELECT COUNT(*) FROM names WHERE artwork=? AND hidden=0", (artwork,)).fetchone()[0]
        comments = db.execute("SELECT COUNT(*) FROM comments WHERE artwork=? AND hidden=0", (artwork,)).fetchone()[0]
        return {"id": artwork, "title": winner["text"] if winner else None, "titleVotes": winner["total"] if winner else 0, "namesCount": names, "commentsCount": comments}

    def summaries(self, identities):
        if not identities or len(identities) > 80:
            raise APIError(400, "invalid_request", "Request between 1 and 80 artworks.")
        identities = list(dict.fromkeys(self.artwork(value) for value in identities))
        with self.connection() as db:
            db.execute("BEGIN")
            result = [self.summary(db, artwork) for artwork in identities]
            db.commit()
        return {"artworks": result}

    def detail(self, artwork, visitor, names_offset=0, comments_offset=0):
        self.artwork(artwork)
        with self.connection() as db:
            db.execute("BEGIN")
            summary = self.summary(db, artwork)
            names = db.execute("""SELECT n.id,n.text,n.created_at,
                MAX(0,COALESCE(n.display_votes + COUNT(v.visitor) - n.vote_base,COUNT(v.visitor))) AS votes,
                MAX(CASE WHEN v.visitor=? THEN 1 ELSE 0 END) AS voted
                FROM names n LEFT JOIN votes v ON v.name_id=n.id WHERE n.artwork=? AND n.hidden=0
                GROUP BY n.id ORDER BY votes DESC,n.created_at ASC,n.id ASC LIMIT ? OFFSET ?""", (visitor or "", artwork, PAGE_SIZE + 1, names_offset)).fetchall()
            comments = db.execute("SELECT id,text,created_at FROM comments WHERE artwork=? AND hidden=0 ORDER BY id DESC LIMIT ? OFFSET ?", (artwork, PAGE_SIZE + 1, comments_offset)).fetchall()
            db.commit()
        return {
            "artwork": summary,
            "names": [{"id": row["id"], "text": row["text"], "votes": row["votes"], "voted": bool(row["voted"]), "createdAt": utc(row["created_at"])} for row in names[:PAGE_SIZE]],
            "comments": [{"id": row["id"], "text": row["text"], "createdAt": utc(row["created_at"])} for row in comments[:PAGE_SIZE]],
            "nextNamesOffset": names_offset + PAGE_SIZE if len(names) > PAGE_SIZE else None,
            "nextCommentsOffset": comments_offset + PAGE_SIZE if len(comments) > PAGE_SIZE else None,
        }

    def mutate(self, artwork, kind, visitor, ip, body):
        self.artwork(artwork)
        if not isinstance(body.get("website", ""), str) or body.get("website", ""):
            raise APIError(400, "invalid_request", "Unable to accept this submission.")
        if kind in ("names", "comments"):
            text, normalized = normalize_text(body.get("text"), 40 if kind == "names" else 280)
        elif kind == "votes":
            name_id = body.get("nameId")
            if isinstance(name_id, bool) or not isinstance(name_id, int) or not 0 < name_id <= 9223372036854775807:
                raise APIError(400, "invalid_request", "Choose a valid name.")
        else:
            raise APIError(404, "not_found", "Unknown endpoint.")
        self.consume_proof(visitor, body.get("proof"))
        now = int(self.clock())
        with self.transaction() as db:
            self.rate(db, "writes-global", "all", self.config.global_daily_writes, 86400, now)
            self.rate(db, "writes-ip-minute", ip, 12, 60, now)
            self.rate(db, "writes-ip-day", ip, 120, 86400, now)
            self.rate(db, "writes-visitor-minute", visitor, 6, 60, now)
            self.rate(db, "writes-visitor-day", visitor, 50, 86400, now)
            if kind == "votes":
                self.rate(db, "votes-ip-art-day", ip + ":" + artwork, 12, 86400, now)
                target = db.execute("SELECT id FROM names WHERE id=? AND artwork=? AND hidden=0", (name_id, artwork)).fetchone()
                if not target:
                    raise APIError(404, "name_not_found", "This name is no longer available.")
                old = db.execute("SELECT name_id FROM votes WHERE artwork=? AND visitor=?", (artwork, visitor)).fetchone()
                if old and old[0] == name_id:
                    db.execute("DELETE FROM votes WHERE artwork=? AND visitor=?", (artwork, visitor))
                    voted = False
                else:
                    db.execute("INSERT INTO votes(artwork,visitor,name_id,created_at) VALUES(?,?,?,?) ON CONFLICT(artwork,visitor) DO UPDATE SET name_id=excluded.name_id,created_at=excluded.created_at", (artwork, visitor, name_id, now))
                    voted = True
                # A manual selection is temporary: the next public vote returns
                # the artwork to its normal vote-driven ranking.
                db.execute("DELETE FROM title_selections WHERE artwork=?", (artwork,))
                return {"ok": True, "voted": voted, "artwork": self.summary(db, artwork)}
            self.rate(db, "text-ip-day", ip, 40, 86400, now)
            self.rate(db, kind + "-visitor-art-day", visitor + ":" + artwork, 3 if kind == "names" else 10, 86400, now)
            cap = self.config.artwork_names if kind == "names" else self.config.artwork_comments
            if db.execute(f"SELECT COUNT(*) FROM {kind} WHERE artwork=?", (artwork,)).fetchone()[0] >= cap:
                raise APIError(429, "limit_reached", "This artwork has reached its contribution limit.", 86400)
            try:
                row = db.execute(f"INSERT INTO {kind}(artwork,text,normalized,author,created_at) VALUES(?,?,?,?,?)", (artwork, text, normalized, visitor, now))
            except sqlite3.IntegrityError as exc:
                raise APIError(409, "duplicate", "This contribution has already been submitted.") from exc
            return {"ok": True, "id": row.lastrowid, "artwork": self.summary(db, artwork)}

    def moderate(self, kind, identity, hidden):
        table = {"name": "names", "comment": "comments"}.get(kind)
        if not table or identity < 1:
            raise ValueError("Choose name or comment and a positive id")
        with self.transaction() as db:
            row = db.execute(f"SELECT artwork FROM {table} WHERE id=?", (identity,)).fetchone()
            if not row:
                raise ValueError("Contribution not found")
            db.execute(f"UPDATE {table} SET hidden=? WHERE id=?", (int(hidden), identity))
            if kind == "name" and hidden:
                db.execute("DELETE FROM title_selections WHERE artwork=? AND name_id=?", (row["artwork"], identity))
            db.execute("INSERT INTO moderation(kind,target_id,hidden,created_at) VALUES(?,?,?,?)", (kind, identity, int(hidden), int(self.clock())))
            self.audit(db, None, "hide" if hidden else "restore", row["artwork"], kind, identity)
            return self.summary(db, row["artwork"])

    def audit(self, db, actor, action, artwork=None, kind=None, target_id=None, details=None):
        db.execute("INSERT INTO admin_audit(actor_id,actor_name,action,artwork,kind,target_id,details,created_at) VALUES(?,?,?,?,?,?,?,?)",
                   (actor["id"] if actor else None, actor["username"] if actor else "server-cli", action, artwork, kind, target_id, json.dumps(details or {}, ensure_ascii=False), int(self.clock())))

    def create_admin(self, actor, username, password):
        if not isinstance(username, str) or not ADMIN_NAME.fullmatch(username):
            raise APIError(400, "invalid_username", "Use 3–32 lowercase letters, numbers, underscores or hyphens, starting with a letter.")
        hashed = password_hash(password)
        with self.transaction() as db:
            if actor is None:
                if db.execute("SELECT 1 FROM admin_users LIMIT 1").fetchone():
                    raise APIError(409, "already_initialized", "An owner already exists.")
                role = "owner"
            elif actor["role"] == "owner":
                role = "admin"
            else:
                raise APIError(403, "forbidden", "Owner access is required.")
            try:
                row = db.execute("INSERT INTO admin_users(username,password_hash,role,created_at) VALUES(?,?,?,?)", (username, hashed, role, int(self.clock())))
            except sqlite3.IntegrityError as exc:
                raise APIError(409, "duplicate", "This username is in use.") from exc
            self.audit(db, actor, "user_create", kind="user", target_id=row.lastrowid, details={"username": username, "role": role})
        return {"id": row.lastrowid, "username": username, "role": role, "active": True}

    def admin_login(self, username, password, ip):
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 100 or len(password) > 512:
            raise APIError(401, "login_failed", "Username or password is incorrect.")
        now = int(self.clock())
        with self.transaction() as db:
            self.rate(db, "admin-login-global", "all", 200, 60, now)
            self.rate(db, "admin-login-ip", ip, 20, 900, now)
            self.rate(db, "admin-login-user", self.digest("login", username.lower()), 10, 900, now)
        with self.connection() as db:
            row = db.execute("SELECT * FROM admin_users WHERE username=? AND active=1", (username,)).fetchone()
        # Keep the expensive check on unknown accounts to reduce enumeration.
        fallback = "scrypt$16384$" + "00" * 16 + "$" + "00" * 64
        if not self._login_slots.acquire(timeout=2):
            raise APIError(503, "service_busy", "Please try signing in again shortly.")
        try:
            matches = verify_password(password, row["password_hash"] if row else fallback)
        finally:
            self._login_slots.release()
        if not matches or not row:
            raise APIError(401, "login_failed", "Username or password is incorrect.")
        token = secrets.token_hex(32)
        with self.transaction() as db:
            current = db.execute("SELECT id,username,role FROM admin_users WHERE id=? AND active=1", (row["id"],)).fetchone()
            if not current:
                raise APIError(401, "login_failed", "Username or password is incorrect.")
            db.execute("DELETE FROM admin_sessions WHERE expires_at<=? OR last_seen<?", (now, now - ADMIN_IDLE_TTL))
            db.execute("INSERT INTO admin_sessions VALUES(?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), row["id"], now + ADMIN_SESSION_TTL, now))
            self.audit(db, current, "login")
        return token, {"username": row["username"], "role": row["role"], "csrf": self.digest("admin-csrf", token)}

    def admin_identity(self, cookie_header):
        try:
            jar = SimpleCookie()
            jar.load(cookie_header or "")
            token = jar[ADMIN_COOKIE].value
        except (CookieError, KeyError, ValueError):
            token = ""
        if not re.fullmatch(r"[0-9a-f]{64}", token):
            raise APIError(401, "admin_session_required", "Please sign in.")
        now = int(self.clock())
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        with self.transaction() as db:
            row = db.execute("""SELECT u.id,u.username,u.role,s.expires_at,s.last_seen FROM admin_sessions s
                JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=? AND u.active=1""", (token_hash,)).fetchone()
            if not row or row["expires_at"] <= now or row["last_seen"] <= now - ADMIN_IDLE_TTL:
                db.execute("DELETE FROM admin_sessions WHERE token_hash=?", (token_hash,))
                raise APIError(401, "admin_session_required", "Please sign in again.")
            if now - row["last_seen"] >= 30:
                db.execute("UPDATE admin_sessions SET last_seen=? WHERE token_hash=?", (now, token_hash))
        return dict(row), token_hash, self.digest("admin-csrf", token)

    def admin_logout(self, actor, token_hash):
        with self.transaction() as db:
            db.execute("DELETE FROM admin_sessions WHERE token_hash=?", (token_hash,))
            self.audit(db, actor, "logout")

    def admin_users(self, actor):
        if actor["role"] != "owner":
            raise APIError(403, "forbidden", "Owner access is required.")
        with self.connection() as db:
            return [{"id": row["id"], "username": row["username"], "role": row["role"], "active": bool(row["active"])}
                    for row in db.execute("SELECT id,username,role,active FROM admin_users ORDER BY id")]

    def admin_user_change(self, actor, identity, body):
        if actor["role"] != "owner" or identity == actor["id"]:
            raise APIError(403, "forbidden", "Only the owner may change other accounts.")
        action = body.get("action")
        if action not in ("disable", "enable", "password"):
            raise APIError(400, "invalid_request", "Unknown account action.")
        hashed = password_hash(body.get("password")) if action == "password" else None
        with self.transaction() as db:
            row = db.execute("SELECT username,role FROM admin_users WHERE id=?", (identity,)).fetchone()
            if not row or row["role"] == "owner":
                raise APIError(404, "not_found", "Account not found.")
            if action == "password":
                db.execute("UPDATE admin_users SET password_hash=? WHERE id=?", (hashed, identity))
            else:
                db.execute("UPDATE admin_users SET active=? WHERE id=?", (int(action == "enable"), identity))
            db.execute("DELETE FROM admin_sessions WHERE user_id=?", (identity,))
            self.audit(db, actor, "user_" + action, kind="user", target_id=identity, details={"username": row["username"]})
        return {"ok": True}

    def admin_artworks(self):
        identities = sorted(self.gallery_ids())
        with self.connection() as db:
            db.execute("BEGIN")
            result = [self.summary(db, artwork) for artwork in identities]
            db.commit()
        return result

    def admin_detail(self, artwork, offset=0):
        self.artwork(artwork)
        with self.connection() as db:
            db.execute("BEGIN")
            names = db.execute("""SELECT n.id,n.text,n.hidden,n.created_at,n.display_votes,n.vote_base,
                COUNT(v.visitor) AS real_votes,
                MAX(0,COALESCE(n.display_votes + COUNT(v.visitor) - n.vote_base,COUNT(v.visitor))) AS votes
                FROM names n LEFT JOIN votes v ON v.name_id=n.id WHERE n.artwork=? GROUP BY n.id
                ORDER BY votes DESC,n.created_at,n.id LIMIT 101 OFFSET ?""", (artwork, offset)).fetchall()
            comments = db.execute("SELECT id,text,hidden,created_at FROM comments WHERE artwork=? ORDER BY id DESC LIMIT 101 OFFSET ?", (artwork, offset)).fetchall()
            selection = db.execute("SELECT name_id FROM title_selections WHERE artwork=?", (artwork,)).fetchone()
            summary = self.summary(db, artwork)
            db.commit()
        return {"artwork": summary, "selectedNameId": selection[0] if selection else None,
                "names": [{"id": r["id"], "text": r["text"], "hidden": bool(r["hidden"]), "votes": r["votes"], "realVotes": r["real_votes"], "votesAdjusted": r["display_votes"] is not None, "createdAt": utc(r["created_at"])} for r in names[:100]],
                "comments": [{"id": r["id"], "text": r["text"], "hidden": bool(r["hidden"]), "createdAt": utc(r["created_at"])} for r in comments[:100]],
                "nextNamesOffset": offset + 100 if len(names) > 100 else None,
                "nextCommentsOffset": offset + 100 if len(comments) > 100 else None}

    def admin_change(self, actor, kind, identity, body):
        table = {"name": "names", "comment": "comments"}.get(kind)
        if not table or not isinstance(identity, int) or identity < 1:
            raise APIError(400, "invalid_request", "Choose a valid entry.")
        action = body.get("action")
        if action not in ("hide", "restore", "edit", "delete", "votes", "title") or action in ("votes", "title") and kind != "name":
            raise APIError(400, "invalid_request", "Unknown moderation action.")
        normalized = None
        if action == "edit":
            text, normalized = normalize_text(body.get("text"), 40 if kind == "name" else 280)
        if action == "votes":
            votes = body.get("votes")
            if type(votes) is not int or not 0 <= votes <= 1000000000:
                raise APIError(400, "invalid_request", "Set a vote count from 0 to 1,000,000,000.")
        with self.transaction() as db:
            row = db.execute(f"SELECT id,artwork,text,hidden FROM {table} WHERE id=?", (identity,)).fetchone()
            if not row:
                raise APIError(404, "not_found", "Entry not found.")
            artwork = row["artwork"]
            details = {}
            if action in ("hide", "restore"):
                db.execute(f"UPDATE {table} SET hidden=? WHERE id=?", (int(action == "hide"), identity))
                if action == "hide" and kind == "name":
                    db.execute("DELETE FROM title_selections WHERE artwork=? AND name_id=?", (artwork, identity))
            elif action == "edit":
                try:
                    db.execute(f"UPDATE {table} SET text=?,normalized=? WHERE id=?", (text, normalized, identity))
                except sqlite3.IntegrityError as exc:
                    raise APIError(409, "duplicate", "This text already exists for the artwork.") from exc
                details = {"previousLength": len(row["text"]), "newLength": len(text)}
            elif action == "delete":
                db.execute(f"DELETE FROM {table} WHERE id=?", (identity,))
                details = {"deleted": True}
            elif action == "votes":
                current = db.execute("SELECT COUNT(*) FROM votes WHERE name_id=?", (identity,)).fetchone()[0]
                db.execute("UPDATE names SET display_votes=?,vote_base=? WHERE id=?", (votes, current, identity))
                details = {"previousRealVotes": current, "displayVotes": votes}
            elif action == "title":
                if row["hidden"]:
                    raise APIError(409, "hidden_entry", "Restore this name before selecting it.")
                db.execute("INSERT INTO title_selections(artwork,name_id,selected_at) VALUES(?,?,?) ON CONFLICT(artwork) DO UPDATE SET name_id=excluded.name_id,selected_at=excluded.selected_at", (artwork, identity, int(self.clock())))
            self.audit(db, actor, action, artwork, kind, identity, details)
            return {"ok": True, "artwork": self.summary(db, artwork)}

    def admin_clear_title(self, actor, artwork):
        self.artwork(artwork)
        with self.transaction() as db:
            db.execute("DELETE FROM title_selections WHERE artwork=?", (artwork,))
            self.audit(db, actor, "title_auto", artwork)
            return {"ok": True, "artwork": self.summary(db, artwork)}

    def admin_audit_entries(self, actor, offset=0):
        with self.connection() as db:
            rows = db.execute("SELECT id,actor_name,action,artwork,kind,target_id,details,created_at FROM admin_audit ORDER BY id DESC LIMIT 101 OFFSET ?", (offset,)).fetchall()
        return {"entries": [{"id": r["id"], "actor": r["actor_name"], "action": r["action"], "artwork": r["artwork"], "kind": r["kind"], "targetId": r["target_id"], "details": json.loads(r["details"]), "createdAt": utc(r["created_at"])} for r in rows[:100]], "nextOffset": offset + 100 if len(rows) > 100 else None}

    def backup(self, destination):
        destination = Path(destination).resolve()
        if destination.is_relative_to(self.config.public_root.resolve()) or destination.is_relative_to(Path(__file__).resolve().parents[1]):
            raise ValueError("Backup must be outside repository and public web root")
        if destination.exists():
            raise ValueError("Backup destination already exists")
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        with self.connection() as source, closing(sqlite3.connect(destination)) as target:
            source.backup(target)
        return str(destination)

    def prune(self):
        now = int(self.clock())
        with self.transaction() as db:
            challenges = db.execute("DELETE FROM challenges WHERE expires_at<=?", (now,)).rowcount
            rates = db.execute("DELETE FROM rates WHERE expires_at<=?", (now,)).rowcount
            sessions = db.execute("DELETE FROM admin_sessions WHERE expires_at<=? OR last_seen<=?", (now, now - ADMIN_IDLE_TTL)).rowcount
        return {"challengesRemoved": challenges, "rateCountersRemoved": rates, "adminSessionsRemoved": sessions}


class GuestbookServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 64

    def __init__(self, address, service):
        if not ipaddress.ip_address(address[0]).is_loopback:
            raise ValueError("Museum API binds to loopback only")
        self.service = service
        self.slots = threading.BoundedSemaphore(32)
        super().__init__(address, Handler)

    def get_request(self):
        request, address = super().get_request()
        request.settimeout(8)
        return request, address

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\nRetry-After: 2\r\n\r\n")
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.slots.release()
            raise

    def handle_error(self, request, client_address):
        # socketserver otherwise prints client addresses in unexpected-error tracebacks.
        print("Museum guestbook request failed unexpectedly.", file=sys.stderr)

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "MuseumGuestbook"
    sys_version = ""
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        # Do not log addresses, cookie values, CSRF/proof tokens or submitted text.
        pass

    @property
    def service(self):
        return self.server.service

    def json_response(self, status, data, cookie=None, retry_after=None, admin_cookie=None):
        payload = json.dumps(data, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Vary", "Cookie, Origin")
        if cookie:
            secure = "; Secure" if not self.service.config.dev_static else ""
            self.send_header("Set-Cookie", f"{COOKIE}={cookie}; HttpOnly; SameSite=Strict; Path={API}; Max-Age={COOKIE_TTL}{secure}")
        if admin_cookie is not None:
            secure = "; Secure" if not self.service.config.dev_static else ""
            age = ADMIN_SESSION_TTL if admin_cookie else 0
            self.send_header("Set-Cookie", f"{ADMIN_COOKIE}={admin_cookie}; HttpOnly; SameSite=Strict; Path={API}/admin; Max-Age={age}{secure}")
        self.send_header("Referrer-Policy", "no-referrer")
        if retry_after is not None:
            self.send_header("Retry-After", str(retry_after))
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        if self.command != "HEAD":
            self.wfile.write(payload)

    def guarded(self):
        try:
            self.dispatch()
        except APIError as exc:
            body = {"code": exc.code, "message": exc.message}
            if exc.retry_after is not None:
                body["retryAfter"] = exc.retry_after
            self.json_response(exc.status, {"error": body}, retry_after=exc.retry_after)
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            self.close_connection = True
        except (sqlite3.Error, OSError):
            self.json_response(503, {"error": {"code": "service_busy", "message": "The guestbook is temporarily unavailable. Please try again later."}}, retry_after=5)

    do_GET = guarded
    do_POST = guarded
    do_HEAD = guarded
    do_OPTIONS = guarded

    def client_ip(self):
        value = self.client_address[0]
        if self.service.config.trust_proxy:
            value = self.headers.get("X-Real-IP", value)
        try:
            return str(ipaddress.ip_address(value))
        except ValueError:
            raise APIError(400, "invalid_request", "Invalid proxy address.")

    def check_origin(self, mutation=False):
        expected = self.service.config.origin
        if self.headers.get("Host") != urlsplit(expected).netloc:
            raise APIError(403, "origin_forbidden", "This host is not allowed.")
        origin = self.headers.get("Origin")
        if (mutation and not origin) or (origin and origin != expected) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise APIError(403, "origin_forbidden", "This request must come from the museum website.")

    def body(self):
        if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) != 1:
            raise APIError(400, "invalid_request", "One Content-Length header is required.")
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or not 0 < int(length) <= MAX_BODY:
            raise APIError(413, "body_too_large", "The request is too large.")
        if self.headers.get_content_type() != "application/json":
            raise APIError(415, "invalid_request", "Use application/json.")
        raw = self.rfile.read(int(length))
        if len(raw) != int(length):
            raise APIError(400, "invalid_request", "The request is incomplete.")
        try:
            value = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError, RecursionError):
            raise APIError(400, "invalid_request", "Use valid UTF-8 JSON.")
        if not isinstance(value, dict):
            raise APIError(400, "invalid_request", "Use a JSON object.")
        return value

    def dispatch(self):
        if len(self.path) > 4096:
            raise APIError(414, "invalid_request", "The URL is too long.")
        try:
            parsed = urlsplit(self.path)
        except ValueError:
            raise APIError(400, "invalid_request", "Invalid URL.")
        if parsed.scheme or parsed.netloc or re.search(r"%(?![0-9a-fA-F]{2})", parsed.path):
            raise APIError(400, "invalid_request", "Invalid URL.")
        try:
            path = unquote(parsed.path, errors="strict")
        except UnicodeError:
            raise APIError(400, "invalid_request", "Invalid URL encoding.")
        if "\x00" in path or "\\" in path:
            raise APIError(400, "invalid_request", "Invalid URL.")
        self.check_origin(mutation=self.command == "POST")
        if not (path == API or path.startswith(API + "/")):
            if self.service.config.dev_static and self.command in ("GET", "HEAD"):
                return self.static(path)
            raise APIError(404, "not_found", "Unknown endpoint.")
        if self.command not in ("GET", "POST"):
            raise APIError(405, "method_not_allowed", "Method not allowed.")
        ip = self.service.ip_hash(self.client_ip())
        self.service.read_limit(ip)
        if path == API + "/admin" or path.startswith(API + "/admin/"):
            return self.admin_dispatch(path, parsed.query, ip)
        visitor = self.service.visitor(self.headers.get("Cookie"))
        if self.command == "POST":
            if not visitor:
                raise APIError(401, "session_required", "Please reopen the guestbook to start a session.")
            csrf = self.headers.get("X-CSRF-Token", "")
            if not re.fullmatch(r"[0-9a-f]{64}", csrf) or not hmac.compare_digest(csrf, self.service.csrf(visitor)):
                raise APIError(403, "csrf_invalid", "Please refresh your guestbook session.")
            body = self.body()
            if path == API + "/challenge":
                if body:
                    raise APIError(400, "invalid_request", "Challenge requests take an empty object.")
                return self.json_response(200, self.service.challenge(visitor, ip))
            match = re.fullmatch(re.escape(API) + r"/artworks/([^/]+)/(names|comments|votes)", path)
            if match:
                return self.json_response(200, self.service.mutate(match[1], match[2], visitor, ip, body))
        else:
            try:
                query = parse_qs(parsed.query, keep_blank_values=True, max_num_fields=10)
            except ValueError:
                raise APIError(400, "invalid_request", "Too many query parameters.")
            if path == API + "/session":
                cookie = None
                if not visitor:
                    cookie = self.service.issue_cookie()
                    visitor = self.service.visitor(COOKIE + "=" + cookie)
                return self.json_response(200, {"csrf": self.service.csrf(visitor), "powBits": self.service.config.pow_bits}, cookie=cookie)
            if path == API + "/health":
                return self.json_response(200, {"ok": True})
            if path == API + "/artworks":
                if set(query) != {"ids"} or len(query["ids"]) != 1:
                    raise APIError(400, "invalid_request", "Provide artwork ids once.")
                return self.json_response(200, self.service.summaries(query["ids"][0].split(",")))
            match = re.fullmatch(re.escape(API) + r"/artworks/([^/]+)", path)
            if match:
                if set(query) - {"namesOffset", "commentsOffset"}:
                    raise APIError(400, "invalid_request", "Unknown pagination parameter.")
                offsets = []
                for name in ("namesOffset", "commentsOffset"):
                    values = query.get(name, ["0"])
                    if len(values) != 1 or not re.fullmatch(r"[0-9]{1,6}", values[0]):
                        raise APIError(400, "invalid_request", "Invalid pagination offset.")
                    offsets.append(int(values[0]))
                return self.json_response(200, self.service.detail(match[1], visitor, *offsets))
        raise APIError(404, "not_found", "Unknown endpoint.")

    def admin_dispatch(self, path, query_string, ip):
        base = API + "/admin"
        if self.command == "POST" and path == base + "/login":
            body = self.body()
            token, session = self.service.admin_login(body.get("username"), body.get("password"), ip)
            return self.json_response(200, session, admin_cookie=token)
        actor, token_hash, csrf = self.service.admin_identity(self.headers.get("Cookie"))
        if self.command == "POST":
            supplied = self.headers.get("X-CSRF-Token", "")
            if not re.fullmatch(r"[0-9a-f]{64}", supplied) or not hmac.compare_digest(supplied, csrf):
                raise APIError(403, "csrf_invalid", "Refresh your admin session.")
            body = self.body()
            if path == base + "/logout":
                self.service.admin_logout(actor, token_hash)
                return self.json_response(200, {"ok": True}, admin_cookie="")
            if path == base + "/users":
                return self.json_response(200, self.service.create_admin(actor, body.get("username"), body.get("password")))
            match = re.fullmatch(re.escape(base) + r"/users/([1-9][0-9]*)", path)
            if match:
                return self.json_response(200, self.service.admin_user_change(actor, int(match[1]), body))
            match = re.fullmatch(re.escape(base) + r"/entries/(name|comment)/([1-9][0-9]*)", path)
            if match:
                return self.json_response(200, self.service.admin_change(actor, match[1], int(match[2]), body))
            match = re.fullmatch(re.escape(base) + r"/artworks/([^/]+)/title", path)
            if match and body.get("action") == "auto":
                return self.json_response(200, self.service.admin_clear_title(actor, match[1]))
        elif self.command == "GET":
            try:
                query = parse_qs(query_string, keep_blank_values=True, max_num_fields=4)
            except ValueError:
                raise APIError(400, "invalid_request", "Too many query parameters.")
            if path == base + "/session":
                return self.json_response(200, {"username": actor["username"], "role": actor["role"], "csrf": csrf})
            if path == base + "/users" and not query:
                return self.json_response(200, {"users": self.service.admin_users(actor)})
            if path == base + "/artworks" and not query:
                return self.json_response(200, {"artworks": self.service.admin_artworks()})
            if path == base + "/audit" or re.fullmatch(re.escape(base) + r"/artworks/[^/]+", path):
                if set(query) - {"offset"} or len(query.get("offset", ["0"])) != 1 or not re.fullmatch(r"[0-9]{1,7}", query.get("offset", ["0"])[0]):
                    raise APIError(400, "invalid_request", "Invalid offset.")
                offset = int(query.get("offset", ["0"])[0])
                if path == base + "/audit":
                    return self.json_response(200, self.service.admin_audit_entries(actor, offset))
                artwork = path[len(base + "/artworks/"):]
                return self.json_response(200, self.service.admin_detail(artwork, offset))
        raise APIError(404, "not_found", "Unknown admin endpoint.")

    def static(self, path):
        """Opt-in local preview; explicit public asset classes, no directory listing."""
        parts = Path(path.lstrip("/")).parts
        if not parts:
            parts = ("index.html",)
        if any(part.startswith(".") or part in ("..", "server", "scripts", "tests", "docs", "deploy", "files") for part in parts):
            raise APIError(404, "not_found", "Not found.")
        allowed_root = {"index.html", "museum.html", "museum-admin.html", "mc-calc.html", "favicon.ico", "robots.txt"}
        public_types = {
            "js": {".js"}, "css": {".css"},
            "images": {".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg", ".tiff", ".json"},
            "fonts": {".woff", ".woff2", ".ttf", ".otf", ".txt"},
            "audio": {".mp3", ".ogg", ".wav", ".m4a"},
            "logs": {".json", ".txt"},
            "_shots": {".html", ".js", ".css", ".png", ".webp"},
        }
        public_dirs = set(public_types)
        if parts[0] in public_types and Path(parts[-1]).suffix.lower() not in public_types[parts[0]]:
            raise APIError(404, "not_found", "Not found.")
        if parts[0] not in public_dirs and not (len(parts) == 1 and parts[0] in allowed_root):
            raise APIError(404, "not_found", "Not found.")
        root = self.service.config.public_root.resolve()
        if any(root.joinpath(*parts[:i]).is_symlink() for i in range(1, len(parts) + 1)):
            raise APIError(404, "not_found", "Not found.")
        target = root.joinpath(*parts).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise APIError(404, "not_found", "Not found.")
        # Large originals/audio stream in chunks. Internal files cannot be exposed via symlinks.
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        with target.open("rb") as source:
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(os.fstat(source.fileno()).st_size))
            self.send_header("Cache-Control", "no-cache")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            if self.command != "HEAD":
                while block := source.read(65536):
                    self.wfile.write(block)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("serve", "moderate", "list", "backup", "prune", "admin-bootstrap", "admin-reset-password"))
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--public-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--gallery-index", type=Path)
    parser.add_argument("--origin", default=os.environ.get("MUSEUM_ORIGIN"))
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--dev-static", action="store_true")
    parser.add_argument("--trust-proxy", action="store_true")
    parser.add_argument("--pow-bits", type=int, default=18)
    parser.add_argument("--kind", choices=("name", "comment"))
    parser.add_argument("--id", type=int)
    parser.add_argument("--hidden", choices=("yes", "no"))
    parser.add_argument("--artwork")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--destination", type=Path)
    parser.add_argument("--username")
    parser.add_argument("--password-stdin", action="store_true")
    args = parser.parse_args(argv)
    os.umask(0o077)
    secret = os.environ.get("MUSEUM_SECRET", "").encode()
    if args.dev_static and not secret:
        # Persist the development secret next to the external DB so restarts keep votes.
        secret_path = args.db.resolve().parent / "development.secret"
        if secret_path.is_relative_to(args.public_root.resolve()) or secret_path.is_relative_to(Path(__file__).resolve().parents[1]):
            parser.error("Development database/secret must be outside the repository and public root")
        secret_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as output:
                output.write(secrets.token_hex(32))
        except FileExistsError:
            pass
        secret = secret_path.read_text().strip().encode()
    config = Config(db=args.db, public_root=args.public_root, gallery_index=args.gallery_index or args.public_root / "images/gallery/index.json", secret=secret, origin=args.origin or (f"http://127.0.0.1:{args.port}" if args.dev_static else "https://eytle.cn"), dev_static=args.dev_static, trust_proxy=args.trust_proxy, pow_bits=args.pow_bits)
    try:
        service = Guestbook(config)
        if args.action == "serve":
            server = GuestbookServer(("127.0.0.1", args.port), service)
            print(f"Museum guestbook listening on 127.0.0.1:{args.port}; origin={config.origin}", flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
            finally:
                server.server_close()
            return
        if args.action in ("admin-bootstrap", "admin-reset-password"):
            if not args.username:
                parser.error("Specify --username")
            password = sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass.getpass("Admin password: ")
            if args.action == "admin-bootstrap":
                result = service.create_admin(None, args.username, password)
            else:
                hashed = password_hash(password)
                with service.transaction() as db:
                    row = db.execute("SELECT id FROM admin_users WHERE username=?", (args.username,)).fetchone()
                    if not row:
                        raise APIError(404, "not_found", "Account not found.")
                    db.execute("UPDATE admin_users SET password_hash=? WHERE id=?", (hashed, row["id"]))
                    db.execute("DELETE FROM admin_sessions WHERE user_id=?", (row["id"],))
                    service.audit(db, None, "user_password_recovery", kind="user", target_id=row["id"], details={"username": args.username})
                result = {"ok": True, "username": args.username}
        elif args.action == "moderate":
            if not args.kind or not args.id or args.hidden is None:
                parser.error("moderate requires --kind, --id, --hidden yes|no")
            result = service.moderate(args.kind, args.id, args.hidden == "yes")
        elif args.action == "backup":
            if not args.destination:
                parser.error("backup requires --destination")
            result = {"backup": service.backup(args.destination)}
        elif args.action == "prune":
            result = service.prune()
        else:
            if not args.kind or not args.artwork or args.offset < 0:
                parser.error("list requires --kind, --artwork and nonnegative --offset")
            service.artwork(args.artwork)
            table = "names" if args.kind == "name" else "comments"
            with service.connection() as db:
                result = [dict(row) for row in db.execute(f"SELECT id,artwork,text,hidden,created_at FROM {table} WHERE artwork=? ORDER BY id LIMIT 100 OFFSET ?", (args.artwork, args.offset))]
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, APIError, OSError, sqlite3.Error) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
