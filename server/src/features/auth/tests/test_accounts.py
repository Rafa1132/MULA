import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from src.common import config
from src.features.auth import accounts
from src.main import app
from tests.support.account_fixture import AccountFixture
from tests.support.runtime_fixture import answer, gateway, stream_response


class AccountTests(AccountFixture, unittest.TestCase):
    def test_unauthenticated_requests_cannot_read_or_chat(self):
        other = TestClient(app)
        self.assertEqual(other.get('/api/conversation').status_code, 401)
        self.assertEqual(other.post('/api/agents/operator/chat', json={'message': 'hi'}).status_code, 401)

    def test_password_hashes_cookie_and_logout_revocation(self):
        token = self.client.cookies.get('mula_session')
        with accounts.database() as db:
            record = db.execute('SELECT * FROM accounts').fetchone()
            self.assertNotEqual(record['password_hash'], 'long-password-123')
            self.assertNotEqual(db.execute('SELECT token_hash FROM sessions').fetchone()['token_hash'], token)
        self.client.post('/api/auth/logout')
        old = TestClient(app)
        old.cookies.set('mula_session', token)
        self.assertEqual(old.get('/api/auth/me').status_code, 401)
        response = self.client.post('/api/auth/login', json={'username': 'OWNER', 'password': 'long-password-123'})
        self.assertEqual(response.status_code, 200)
        self.assertIn('HttpOnly', response.headers['set-cookie'])
        self.assertIn('SameSite=strict', response.headers['set-cookie'])
        self.assertEqual(response.json()['conversation_id'], self.account['conversation_id'])
        self.assertNotIn('password_hash', response.json())

    def test_expired_session_is_rejected(self):
        with accounts.database() as db:
            db.execute('UPDATE sessions SET expires = %s', (int(time.time()) - 1,))
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_validation_duplicates_and_login_throttling(self):
        credentials = {'username': 'owner', 'password': 'long-password-123'}
        self.assertEqual(self.client.post('/api/auth/signup', json=credentials).status_code, 409)
        self.assertEqual(self.client.post('/api/auth/signup', json={'username': 'new', 'password': 'short'}).status_code, 422)
        for _ in range(5):
            self.assertEqual(self.client.post('/api/auth/login', json={'username': 'owner', 'password': 'incorrect-password'}).status_code, 401)
        self.assertEqual(self.client.post('/api/auth/login', json=credentials).status_code, 429)

    def test_strict_rules_by_default_and_relaxed_rules_for_development(self):
        other = TestClient(app)
        self.assertEqual(other.get('/api/auth/rules').json(), {'relaxed': False, 'invite_required': False})
        for username, password in (('ab', 'long-password-123'), ('has space', 'long-password-123'), ('valid', 'short')):
            self.assertEqual(other.post('/api/auth/signup', json={'username': username, 'password': password}).status_code, 422)
        with patch.object(config, 'MULA_RELAXED_AUTH', True):
            self.assertEqual(other.get('/api/auth/rules').json(), {'relaxed': True, 'invite_required': False})
            response = other.post('/api/auth/signup', json={'username': ' A b ', 'password': 'x'})
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(response.json()['username'], 'a b')
            # Empty values are still refused, and the password is still hashed.
            for username, password in (('', 'x'), ('   ', 'x'), ('someone', '')):
                self.assertEqual(other.post('/api/auth/signup', json={'username': username, 'password': password}).status_code, 422)
            self.assertEqual(TestClient(app).post('/api/auth/login', json={'username': 'a b', 'password': 'x'}).status_code, 200)
        with accounts.database() as db:
            self.assertNotEqual(db.execute("SELECT password_hash FROM accounts WHERE username = 'a b'").fetchone()['password_hash'], 'x')

    def test_invite_code_gates_sign_up_but_not_sign_in(self):
        code = 'a1b2c3d4e5f6a7b8c9d0'
        other = TestClient(app)
        with patch.object(config, 'MULA_INVITE_CODE', code):
            self.assertEqual(other.get('/api/auth/rules').json(), {'relaxed': False, 'invite_required': True})
            for invite in (None, '', 'wrong-code-wrong-code', code[:-1]):
                with self.subTest(invite=invite):
                    body = {'username': 'invited', 'password': 'long-enough-password'}
                    if invite is not None:
                        body['invite'] = invite
                    response = other.post('/api/auth/signup', json=body)
                    self.assertEqual(response.status_code, 403)
                    self.assertNotIn(code, response.text)
            with accounts.database() as db:
                self.assertIsNone(db.execute("SELECT id FROM accounts WHERE username = 'invited'").fetchone())
            response = other.post('/api/auth/signup', json={'username': 'invited', 'password': 'long-enough-password', 'invite': f' {code} '})
            self.assertEqual(response.status_code, 201, response.text)
            # Existing accounts sign in without it, and sign-in never takes an invite field.
            self.assertEqual(TestClient(app).post('/api/auth/login', json={'username': 'invited', 'password': 'long-enough-password'}).status_code, 200)
            self.assertEqual(TestClient(app).post('/api/auth/login', json={'username': 'invited', 'password': 'long-enough-password', 'invite': code}).status_code, 422)
        # Without a configured code, sign-up ignores the field.
        self.assertEqual(TestClient(app).post('/api/auth/signup', json={'username': 'open', 'password': 'long-enough-password', 'invite': 'anything'}).status_code, 201)

    def test_short_invite_codes_refuse_to_start(self):
        import os
        import subprocess
        import sys
        env = {**os.environ, 'MULA_INVITE_CODE': 'short'}
        result = subprocess.run([sys.executable, '-c', 'import src.common.config'], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('at least 16 characters', result.stderr)

    def test_relaxed_rules_refuse_to_start_with_secure_cookies(self):
        import os
        import subprocess
        import sys
        env = {**os.environ, 'MULA_RELAXED_AUTH': 'true', 'LARAS_SECURE_COOKIES': 'true'}
        result = subprocess.run([sys.executable, '-c', 'import src.common.config'], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('MULA_RELAXED_AUTH is for local development', result.stderr)

    def test_history_ownership_and_login_continuity(self):
        second = TestClient(app)
        self.switch_to_new_account('second', second)
        with gateway(lambda request: stream_response(answer('Hello owner'))):
            self.assertEqual(self.client.post('/api/agents/operator/chat', json={'message': 'Private business'}).status_code, 200)
            owner_session = self.client.get('/api/conversation').json()['session_id']
            forbidden = second.post('/api/agents/operator/chat', json={'message': 'hi', 'session_id': owner_session})
        self.assertEqual(forbidden.status_code, 403)
        self.assertEqual(second.get('/api/conversation').json()['messages'], [])
        saved = self.client.get('/api/conversation').json()
        self.assertEqual([m['text'] for m in saved['messages']], ['Private business', 'Hello owner'])
        self.assertNotEqual(second.get('/api/conversation').json()['session_id'], saved['session_id'])
        # The second account can't open the owner's project at all.
        self.assertEqual(second.get('/api/conversation', headers={'X-Mula-Project': self.project['id']}).status_code, 404)
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/login', json={'username': 'owner', 'password': 'long-password-123'})
        self.assertEqual(self.client.get('/api/conversation').json(), saved)

    def test_streamed_reply_is_saved(self):
        with gateway(lambda request: stream_response(answer('Saved stream'))):
            self.client.post('/api/agents/operator/chat', json={'message': 'hello', 'stream': True})
        saved = self.client.get('/api/conversation').json()['messages'][-1]
        self.assertEqual(saved['text'], 'Saved stream')
        self.assertIsNone(saved['note'])
