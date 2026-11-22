import asyncio
import json
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
import httpx
from fastapi.testclient import TestClient

from src.features.voice import service as speech
from src.main import app
from tests.support.account_fixture import AccountFixture


class SpeechEndpointTests(AccountFixture, unittest.TestCase):
    def test_requires_account(self):
        with patch("src.features.voice.service.synthesize", new_callable=AsyncMock) as synthesize:
            self.assertEqual(TestClient(app).post("/api/speech", json={"text": "Hi"}).status_code, 401)
            synthesize.assert_not_awaited()

    def test_validates_input_before_synthesis(self):
        with patch("src.features.voice.service.synthesize", new_callable=AsyncMock) as synthesize:
            for payload in [{}, {"text": " "}, {"text": "a" * 1201}, {"text": 3},
                            {"text": "hello\x00"}, {"text": "hi", "voice": "--help"}]:
                with self.subTest(payload=str(payload)[:50]):
                    self.assertEqual(self.client.post("/api/speech", json=payload).status_code, 422)
            synthesize.assert_not_awaited()

    def test_returns_private_audio_without_adding_chat_messages(self):
        before = self.client.get("/api/conversation").json()
        with patch("src.features.voice.service.synthesize", new_callable=AsyncMock, return_value=b"RIFFaudio") as synthesize:
            response = self.client.post("/api/speech", json={"text": " Hello "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"RIFFaudio")
        self.assertEqual(response.headers["content-type"], "audio/wav")
        self.assertEqual(response.headers["cache-control"], "no-store")
        synthesize.assert_awaited_once_with("Hello")
        self.assertEqual(self.client.get("/api/conversation").json(), before)


class SpeechProviderTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        lock = patch("src.features.voice.service._synthesis_lock", asyncio.Lock())
        lock.start()
        self.addCleanup(lock.stop)

    async def test_no_shell_and_temporary_files_are_removed(self):
        directories = []

        async def launch(*args, **kwargs):
            self.assertEqual(args[0], "/usr/bin/say")
            self.assertNotIn("hello; $(secret)", args)
            source = Path(args[2])
            self.assertEqual(source.read_text(), "hello; $(secret)")
            directories.append(source.parent)
            Path(args[4]).write_bytes(b"RIFF" + bytes(44))
            process = AsyncMock()
            process.returncode = 0
            return process

        with patch("src.features.voice.service.sys.platform", "darwin"), patch("src.features.voice.service.asyncio.create_subprocess_exec", side_effect=launch):
            result = await speech.synthesize("hello; $(secret)")
        self.assertTrue(result.startswith(b"RIFF"))
        self.assertFalse(directories[0].exists())

    async def test_unsupported_platform_has_actionable_failure(self):
        with patch("src.features.voice.service.sys.platform", "linux"):
            with self.assertRaises(HTTPException) as caught:
                await speech.synthesize("hello")
        self.assertEqual(caught.exception.status_code, 503)

    async def test_busy_engine_does_not_queue(self):
        with patch("src.features.voice.service.sys.platform", "darwin"):
            async with speech._synthesis_lock:
                with self.assertRaises(HTTPException) as caught:
                    await speech.synthesize("hello")
        self.assertEqual(caught.exception.status_code, 429)

    async def test_engine_failure_is_sanitized(self):
        process = AsyncMock()
        process.returncode = 1
        with patch("src.features.voice.service.sys.platform", "darwin"), patch(
            "src.features.voice.service.asyncio.create_subprocess_exec", return_value=process
        ):
            with self.assertRaises(HTTPException) as caught:
                await speech.synthesize("private business text")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertNotIn("private business text", caught.exception.detail)

    async def test_timeout_kills_engine_and_releases_capacity(self):
        process = AsyncMock()
        process.returncode = None
        process.kill = unittest.mock.Mock()

        async def timeout(awaitable, **kwargs):
            awaitable.close()
            raise TimeoutError()

        with patch("src.features.voice.service.sys.platform", "darwin"), patch(
            "src.features.voice.service.asyncio.create_subprocess_exec", return_value=process
        ), patch("src.features.voice.service.asyncio.wait_for", side_effect=timeout):
            with self.assertRaises(HTTPException) as caught:
                await speech.synthesize("Hello")
        self.assertEqual(caught.exception.status_code, 504)
        process.kill.assert_called_once()
        self.assertFalse(speech._synthesis_lock.locked())

    async def test_cancellation_kills_process_and_cleans_files(self):
        started = asyncio.Event()
        process = AsyncMock()
        process.returncode = None
        directories = []

        async def wait():
            await asyncio.Event().wait()

        def kill():
            process.returncode = -9
            process.wait.side_effect = None

        process.wait.side_effect = wait
        process.kill = unittest.mock.Mock(side_effect=kill)

        async def launch(*args, **kwargs):
            directories.append(Path(args[2]).parent)
            started.set()
            return process

        with patch("src.features.voice.service.sys.platform", "darwin"), patch("src.features.voice.service.asyncio.create_subprocess_exec", side_effect=launch):
            task = asyncio.create_task(speech.synthesize("hello"))
            await started.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        process.kill.assert_called_once()
        self.assertFalse(directories[0].exists())
        self.assertFalse(speech._synthesis_lock.locked())



MP3 = b"ID3" + bytes(64)


class OpenRouterSpeechTests(unittest.IsolatedAsyncioTestCase):
    """The OpenRouter provider, against a fake transport: no request ever leaves the process."""

    async def asyncSetUp(self):
        for name, value in [("_synthesis_lock", asyncio.Lock())]:
            patcher = patch(f"src.features.voice.service.{name}", value)
            patcher.start()
            self.addCleanup(patcher.stop)
        for name, value in [("MULA_SPEECH_PROVIDER", "openrouter"), ("MULA_SPEECH_MODEL", "hexgrad/kokoro-82m"),
                            ("MULA_SPEECH_VOICE", "af_heart")]:
            patcher = patch.object(speech.config, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        key = patch.dict("os.environ", {"OPENROUTER_API_KEY": "sk-or-test-key"})
        key.start()
        self.addCleanup(key.stop)
        self.requests = []

    def answer_with(self, handler):
        """Route the provider's client through `handler` instead of the network."""
        def recording(request):
            self.requests.append(request)
            return handler(request)
        transport = httpx.MockTransport(recording)
        patcher = patch("src.features.voice.service.openrouter_client",
                        lambda: httpx.AsyncClient(transport=transport))
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_sends_kokoro_mp3_request_and_returns_audio(self):
        self.answer_with(lambda request: httpx.Response(200, content=MP3, headers={"content-type": "audio/mpeg"}))
        audio = await speech.synthesize("Hello there")
        self.assertEqual(audio, MP3)
        request = self.requests[0]
        self.assertEqual(str(request.url), speech.OPENROUTER_SPEECH_URL)
        self.assertEqual(request.headers["authorization"], "Bearer sk-or-test-key")
        self.assertEqual(json.loads(request.content), {
            "model": "hexgrad/kokoro-82m", "input": "Hello there", "voice": "af_heart", "response_format": "mp3"})
        self.assertEqual(speech.media_type(), "audio/mpeg")
        self.assertEqual(speech.file_extension(), "mp3")

    async def test_voice_choice_changes_the_cache_key(self):
        first = speech.provider_key()
        with patch.object(speech.config, "MULA_SPEECH_VOICE", "am_adam"):
            self.assertNotEqual(speech.provider_key(), first)

    async def test_missing_key_refuses_without_a_request(self):
        self.answer_with(lambda request: httpx.Response(200, content=MP3))
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": ""}), patch(
                "src.features.voice.service.profiles.env_values", return_value={}):
            with self.assertRaises(HTTPException) as caught:
                await speech.synthesize("hello")
        self.assertEqual(caught.exception.status_code, 503)
        self.assertIn("enable_openrouter.py", caught.exception.detail)
        self.assertEqual(self.requests, [])

    async def test_key_falls_back_to_the_runtime_settings(self):
        self.answer_with(lambda request: httpx.Response(200, content=MP3))
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": ""}), patch(
                "src.features.voice.service.profiles.env_values", return_value={"OPENROUTER_API_KEY": "sk-or-from-file"}):
            await speech.synthesize("hello")
        self.assertEqual(self.requests[0].headers["authorization"], "Bearer sk-or-from-file")

    async def test_provider_errors_are_explained_without_text_or_key(self):
        for status, expected in [(401, 503), (402, 503), (403, 503), (429, 429), (500, 503), (502, 503)]:
            with self.subTest(status=status):
                self.answer_with(lambda request, status=status: httpx.Response(
                    status, json={"error": {"code": status, "message": "upstream said private business text"}}))
                with self.assertRaises(HTTPException) as caught:
                    await speech.synthesize("private business text")
                self.assertEqual(caught.exception.status_code, expected)
                self.assertNotIn("private business text", caught.exception.detail)
                self.assertNotIn("sk-or-test-key", caught.exception.detail)

    async def test_out_of_credits_says_so(self):
        self.answer_with(lambda request: httpx.Response(402, json={"error": {"code": 402, "message": "no"}}))
        with self.assertRaises(HTTPException) as caught:
            await speech.synthesize("hello")
        self.assertIn("credits", caught.exception.detail)

    async def test_non_audio_body_is_refused(self):
        self.answer_with(lambda request: httpx.Response(200, json={"not": "audio"}))
        with self.assertRaises(HTTPException) as caught:
            await speech.synthesize("hello")
        self.assertEqual(caught.exception.status_code, 503)

    async def test_timeout_and_network_failure_release_capacity(self):
        for error, expected in [(httpx.ReadTimeout("slow"), 504), (httpx.ConnectError("down"), 503)]:
            with self.subTest(error=type(error).__name__):
                def fail(request, error=error):
                    raise error
                self.answer_with(fail)
                with self.assertRaises(HTTPException) as caught:
                    await speech.synthesize("hello")
                self.assertEqual(caught.exception.status_code, expected)
                self.assertFalse(speech._synthesis_lock.locked())

    async def test_busy_voice_does_not_queue(self):
        self.answer_with(lambda request: httpx.Response(200, content=MP3))
        async with speech._synthesis_lock:
            with self.assertRaises(HTTPException) as caught:
                await speech.synthesize("hello")
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(self.requests, [])

    async def test_mp3_check(self):
        self.assertTrue(speech.is_mp3(b"ID3\x04"))
        self.assertTrue(speech.is_mp3(b"\xff\xfb\x90"))
        self.assertFalse(speech.is_mp3(b"{\"error\""))
        self.assertFalse(speech.is_mp3(b""))


class OpenRouterSpeechEndpointTests(AccountFixture, unittest.TestCase):
    def test_route_serves_mp3_with_openrouter(self):
        with patch.object(speech.config, "MULA_SPEECH_PROVIDER", "openrouter"), patch(
                "src.features.voice.service.synthesize", new_callable=AsyncMock, return_value=MP3):
            response = self.client.post("/api/speech", json={"text": "Hello"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/mpeg")
        self.assertEqual(response.content, MP3)


if __name__ == "__main__":
    unittest.main()
