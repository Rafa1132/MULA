import os
import sqlite3
import unittest

from src.features.auth import accounts
from src.features.memory import notes, service, store
from src.features.memory.filters import MemoryRefused
from tests.support.account_fixture import AccountFixture


class ParseTests(unittest.TestCase):
    def test_frontmatter_links_and_tags(self):
        text = ("---\ntags: [supplier, '#coffee']\naliases: Aroma\nessential: true\ntitle: ignored\nmula_id: 9\nopened: 2026-01-05\n---\n"
                "# Heading is not a tag\nDelivers on Tuesdays via [[Budi|our buyer]] and ![[Price list.md#2026]]. #beans #2026\n"
                "See [[decisions/Q4 pricing]] and http://example.com/#anchor.\n"
                "```\n[[In code]] #incode\n```\nInline `[[Also code]]` stays out.\n")
        parsed = notes.parse("suppliers", "Aroma Coffee", text)
        self.assertEqual(parsed["path"], "suppliers/Aroma Coffee")
        # Every property is kept as written (the file is the owner's); dates become ISO text.
        self.assertEqual(parsed["frontmatter"], {"tags": ["supplier", "coffee"], "aliases": ["Aroma"], "essential": True,
                                                 "title": "ignored", "mula_id": 9, "opened": "2026-01-05"})
        self.assertEqual(parsed["text"], text)
        self.assertTrue(parsed["essential"])
        self.assertEqual([(target, alias) for target, alias, _ in parsed["links"]],
                         [("Budi", "our buyer"), ("Price list", None), ("decisions/Q4 pricing", None)])
        self.assertEqual(parsed["tags"], ["supplier", "coffee", "beans"])
        self.assertIn("Delivers on Tuesdays", parsed["links"][0][2])

    def test_invalid_names_and_frontmatter_are_refused(self):
        for folder, title in (("", "a/b"), ("", "Price [2026]"), ("", "#tag"), ("", ".hidden"), ("", " "),
                              ("Facts", "Mine"), ("facts/sub", "Mine"), ("a/b/c/d/e/f/g/h/i", "Deep"), ("../up", "Escape"),
                              ("", "About the business")):
            with self.subTest(folder=folder, title=title), self.assertRaises(MemoryRefused):
                notes.parse(folder, title, "Body")
        for text in ("---\ntags: [unclosed\n---\n", "---\n- a list\n---\n",
                     "---\nessential: maybe\n---\n", "---\nno closing line\n", "bell \x07 character"):
            with self.subTest(text=text[:20]), self.assertRaises(MemoryRefused):
                notes.parse("", "Note", text)

    def test_sensitive_filter_runs_line_by_line(self):
        # A business phone on one line and the word "customer" on another is fine…
        notes.parse("", "Contacts", "Shop phone: +62 812 3456 7890\n\nOur best customer is a cafe.")
        # …but a customer's contact on one line is refused, and so is a key anywhere, even in code.
        for text in ("Customer Rina: +62 812 3456 7890", "```\napi_key: sk-test-abcdefghijklmnop\n```"):
            with self.subTest(text=text[:12]), self.assertRaises(MemoryRefused):
                notes.parse("", "Contacts", text)

    def test_vault_files_are_read_leniently(self):
        # Nested properties are shown as JSON text rather than refused.
        self.assertEqual(notes.parse("", "Note", "---\nnested: {a: 1}\n---\nBody")["frontmatter"], {"nested": '{"a": 1}'})
        # What Mula would refuse to write still shows when it is already in the vault, with a warning.
        for text, warning in (("---\ntags: [unclosed\n---\nBody [[Link]]", "not valid YAML"), ("---\nno closing line\n[[Link]]", "no closing"),
                              ("Customer Rina: +62 812 3456 7890", "")):
            with self.subTest(text=text[:12]):
                read = notes.read_file("people", "Rina", text)
                self.assertIsNotNone(read["warning"])
                self.assertIn(warning, read["warning"])
                self.assertEqual(read["text"], text)
        self.assertEqual([target for target, _, _ in notes.read_file("", "N", "---\nbad: [\n---\nSee [[Link]]")["links"]], ["Link"])
        self.assertIsNone(notes.read_file("", "N", "Fine.")["warning"])

    def test_retarget_keeps_alias_and_heading_and_skips_code(self):
        body = "[[Old]] and [[old#Prices|see prices]] and ![[Old^b1]]\n`[[Old]]`\n```\n[[Old]]\n```\n[[Other]]"
        result, changed = notes.retarget_links(body, {notes.key("Old")}, "New")
        self.assertEqual(changed, 3)
        self.assertEqual(result, "[[New]] and [[New#Prices|see prices]] and ![[New^b1]]\n`[[Old]]`\n```\n[[Old]]\n```\n[[Other]]")


class NoteApiTests(AccountFixture, unittest.TestCase):
    def create(self, title, text="", folder="", status=201):
        response = self.client.post("/api/memory/notes", json={"folder": folder, "title": title, "text": text})
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def edit(self, note, status=200, **changes):
        body = {"folder": note["folder"], "title": note["title"], "text": note["text"], "base_version": note["version"], **changes}
        response = self.client.put(f"/api/memory/notes/{note['id']}", json=body)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def graph(self):
        response = self.client.get("/api/memory/graph")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        return {node["id"]: node for node in body["nodes"]}, {(edge["source"], edge["target"]) for edge in body["edges"]}, body

    def notes_dir(self):
        return self.data_dir / "workspaces" / self.account["id"] / "memory" / "notes"

    def test_links_resolve_ghosts_and_mentions(self):
        aroma = self.create("Aroma Coffee", "Supplier. Buyer is [[Budi]]. #supplier", folder="suppliers")["note"]
        nodes, edges, body = self.graph()
        aroma_id = f"note:{aroma['id']}"
        self.assertEqual(nodes["ghost:budi"]["kind"], "ghost")
        self.assertIn((aroma_id, "ghost:budi"), edges)
        self.assertEqual(nodes[aroma_id]["folder"], "suppliers")
        self.assertEqual(nodes[aroma_id]["tags"], ["supplier"])
        self.assertEqual(body["tags"], [{"tag": "supplier", "count": 1}])
        # The two Facts notes are always there, in the Facts folder.
        self.assertEqual((nodes["facts:business"]["folder"], nodes["facts:owner"]["title"]), ("Facts", "About the owner"))
        # Creating the missing note turns the ghost into a real link (titles match case-insensitively).
        budi = self.create("budi", "Our buyer.", folder="people")["note"]
        nodes, edges, _ = self.graph()
        self.assertNotIn("ghost:budi", nodes)
        self.assertIn((aroma_id, f"note:{budi['id']}"), edges)
        self.assertEqual(nodes[aroma_id]["links"], 1)
        # A fact can link to a note too, and shows up among its mentions.
        self.client.post("/api/memory/entries", json={"target": "business", "fact": "Buy beans through [[Budi]] every Monday."})
        detail = self.client.get(f"/api/memory/notes/{budi['id']}").json()
        self.assertEqual([(m.get("note_id"), m.get("fact_id") is not None) for m in detail["mentions"]], [(aroma["id"], False), (None, True)])
        self.assertIn("Buyer is [[Budi]]", detail["mentions"][0]["context"])
        self.assertIn(("facts:business", f"note:{budi['id']}"), self.graph()[1])

    def test_edits_add_versions_and_refuse_stale_or_duplicate_saves(self):
        note = self.create("Opening hours", "We open at 8.")["note"]
        saved = self.edit(note, text="We open at 9.")
        self.assertEqual((saved["outcome"], saved["note"]["version"], saved["note"]["versions"]), ("saved", 2, 2))
        # The editor's base version is stale now: refused rather than overwriting version 2.
        self.edit(note, status=409, text="We open at 10.")
        self.assertEqual(self.edit(saved["note"], text="We open at 9.")["outcome"], "unchanged")
        self.create("opening HOURS", status=409)
        self.create("Bad", "Customer Rina: +62 812 3456 7890", status=422)
        # History is append-only in the database itself, and the audit has hashes, not text.
        with store.open_store(self.account["id"]) as db:
            for statement in ("DELETE FROM note_versions", "UPDATE note_versions SET body = 'x'", "DELETE FROM notes",
                              "UPDATE notes SET created_at = 'x'"):
                with self.subTest(statement=statement), self.assertRaises(sqlite3.DatabaseError):
                    db.execute(statement)
            actions = [row["action"] for row in db.execute("SELECT action FROM audit ORDER BY id")]
            details = " ".join(row["detail"] for row in db.execute("SELECT detail FROM audit"))
        self.assertEqual(actions, ["note_created", "note_saved", "note_refused"])
        self.assertNotIn("We open", details)
        self.assertNotIn("Rina", details)

    def test_rename_reports_stale_links_and_relink_updates_them(self):
        target = self.create("Q4 pricing", "Prices.", folder="decisions")["note"]
        linking = self.create("Aroma", "See [[Q4 pricing#Beans|the prices]] and [[decisions/Q4 pricing]].")["note"]
        self.client.post("/api/memory/entries", json={"target": "business", "fact": "Prices follow [[Q4 pricing]] this year."})
        renamed = self.edit(target, title="2026 pricing")
        self.assertEqual((renamed["stale_links"], renamed["stale_facts"]), (1, 1))
        self.assertEqual(renamed["renamed_from"], {"folder": "decisions", "title": "Q4 pricing"})
        nodes, _, _ = self.graph()
        self.assertIn("ghost:q4 pricing", nodes)
        response = self.client.post(f"/api/memory/notes/{target['id']}/relink", json={"from_folder": "decisions", "from_title": "Q4 pricing"})
        self.assertEqual(response.json(), {"updated": 1, "stale_facts": 1})
        updated = self.client.get(f"/api/memory/notes/{linking['id']}").json()
        self.assertEqual(updated["body"], "See [[2026 pricing#Beans|the prices]] and [[2026 pricing]].")
        self.assertEqual(updated["versions"], 2)
        nodes, edges, _ = self.graph()
        self.assertNotIn("ghost:decisions/q4 pricing", nodes)
        self.assertIn((f"note:{linking['id']}", f"note:{target['id']}"), edges)

    def write(self, rel, text, encoding="utf-8"):
        path = self.notes_dir().joinpath(*rel.split("/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(text, bytes):
            path.write_bytes(text)
        else:
            path.write_text(text, encoding=encoding)
        return path

    def note_at(self, nodes, folder, title):
        found = [node for node in nodes.values() if node["kind"] == "note" and node["folder"] == folder and node["title"] == title]
        self.assertEqual(len(found), 1, f"{folder}/{title}")
        return found[0]

    def test_files_added_in_obsidian_show_up_without_any_marker(self):
        self.notes_dir().mkdir(parents=True, exist_ok=True)
        self.write("01 Overview/Mula Overview.md", "---\ntags: [mula]\nstatus: {draft: true}\n---\nSee [[Agent Loop]] and [[Nowhere]].")
        self.write("02 Runtime/Agent Loop.md", "The loop. #runtime")
        self.write("02 Runtime/Broken.md", "---\ntags: [unclosed\n---\nStill [[Agent Loop]].")
        self.write("People/Rina.md", "Customer Rina: +62 812 3456 7890")
        self.write(".obsidian/workspace.md", "Obsidian's own settings.")
        self.write(".trash/Old.md", "Thrown away.")
        self.write("Images/picture.png", b"\x89PNG")
        self.write("Latin1.md", "caf\xe9".encode("latin-1"))
        self.write("Facts/Mine.md", "In the reserved folder.")
        (self.notes_dir() / "Empty folder" / "Inner").mkdir(parents=True)
        nodes, edges, body = self.graph()
        overview = self.note_at(nodes, "01 Overview", "Mula Overview")
        loop = self.note_at(nodes, "02 Runtime", "Agent Loop")
        self.assertIn((overview["id"], loop["id"]), edges)
        self.assertIn((overview["id"], "ghost:nowhere"), edges)
        self.assertEqual(overview["tags"], ["mula"])
        self.assertEqual(sorted(node["title"] for node in nodes.values() if node["kind"] == "note"), ["Agent Loop", "Broken", "Mula Overview", "Rina"])
        self.assertEqual(body["folders"], ["01 Overview", "02 Runtime", "Empty folder", "Empty folder/Inner", "Images", "People"])
        self.assertEqual(sorted(item["path"] for item in body["skipped"]), ["Facts/Mine.md", "Latin1.md"])
        # Problems are warnings on the note, never a reason to hide the owner's file.
        broken = self.client.get(f"/api/memory/notes/{self.note_at(nodes, '02 Runtime', 'Broken')['note_id']}").json()
        self.assertIn("not valid YAML", broken["warning"])
        self.assertIn((f"note:{broken['id']}", loop["id"]), edges)
        rina = self.client.get(f"/api/memory/notes/{self.note_at(nodes, 'People', 'Rina')['note_id']}").json()
        self.assertIsNotNone(rina["warning"])
        detail = self.client.get(f"/api/memory/notes/{overview['note_id']}").json()
        self.assertEqual(detail["text"], "---\ntags: [mula]\nstatus: {draft: true}\n---\nSee [[Agent Loop]] and [[Nowhere]].")
        self.assertEqual(detail["frontmatter"]["status"], '{"draft": true}')
        with store.open_store(self.account["id"]) as db:
            self.assertEqual({row["actor"] for row in db.execute("SELECT actor FROM note_versions")}, {"vault"})

    def test_obsidian_edits_moves_and_deletes_become_history(self):
        path = self.write("Ideas/Draft.md", "First thought.")
        nodes, _, _ = self.graph()
        note_id = self.note_at(nodes, "Ideas", "Draft")["note_id"]
        opened = self.client.get(f"/api/memory/notes/{note_id}").json()
        # Edited in Obsidian: a new version, and an editor opened before it can't overwrite it.
        path.write_text("Second thought.", encoding="utf-8")
        os.utime(path, ns=(path.stat().st_atime_ns, path.stat().st_mtime_ns + 1_000_000))
        self.edit(opened, status=409, text="Mula's edit.")
        reread = self.client.get(f"/api/memory/notes/{note_id}").json()
        self.assertEqual((reread["text"], reread["versions"]), ("Second thought.", 2))
        self.assertEqual(path.read_text(encoding="utf-8"), "Second thought.")
        # Moved in Obsidian with the same text: the same note, in its new place.
        moved = self.notes_dir() / "Archive 2026" / "Draft renamed.md"
        moved.parent.mkdir()
        os.rename(path, moved)
        nodes, _, _ = self.graph()
        self.assertEqual(self.note_at(nodes, "Archive 2026", "Draft renamed")["note_id"], note_id)
        # Deleted in Obsidian: archived, with its versions kept.
        moved.unlink()
        nodes, _, _ = self.graph()
        self.assertNotIn(f"note:{note_id}", nodes)
        gone = self.client.get(f"/api/memory/notes/{note_id}").json()
        self.assertEqual((gone["archived"], gone["versions"]), (True, 3))

    def test_mula_writes_the_vault_without_replacing_or_deleting_anything(self):
        mine = self.write("suppliers/Branding.md", "My own file, written in Obsidian.")
        # A new note never replaces a file, even one Mula hasn't indexed yet or that differs in capitals.
        self.create("branding", "Mula's text.", folder="suppliers", status=409)
        self.assertEqual(mine.read_text(encoding="utf-8"), "My own file, written in Obsidian.")
        note = self.create("Aroma", "---\ntags: [supplier]\n---\nBeans.", folder="suppliers")["note"]
        path = self.notes_dir() / "suppliers" / "Aroma.md"
        # The file is exactly what was typed: no fields of Mula's are added.
        self.assertEqual(path.read_text(encoding="utf-8"), "---\ntags: [supplier]\n---\nBeans.")
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(note["text"], "---\ntags: [supplier]\n---\nBeans.")
        # Renaming moves the file; the old folder stays, with the owner's file in it.
        self.edit(note, status=409, title="Branding")
        moved = self.edit(note, folder="vendors")["note"]
        self.assertFalse(path.exists())
        self.assertTrue((self.notes_dir() / "vendors" / "Aroma.md").is_file())
        self.assertTrue(mine.is_file())
        # Archiving moves the file to .trash, as Obsidian does; nothing is deleted.
        self.assertEqual(self.client.post(f"/api/memory/notes/{note['id']}/archive").status_code, 200)
        self.assertEqual((self.notes_dir() / ".trash" / "Aroma.md").read_text(encoding="utf-8"), "---\ntags: [supplier]\n---\nBeans.")
        self.assertTrue((self.notes_dir() / "vendors").is_dir())
        self.assertEqual(self.client.post(f"/api/memory/notes/{note['id']}/archive").status_code, 409)
        self.edit(moved, status=409, text="Back")
        self.assertEqual(self.client.get(f"/api/memory/notes/{note['id']}").json()["versions"], 2)
        # New folders are real folders, and stay even while empty.
        response = self.client.post("/api/memory/folders", json={"folder": "Recipes/Cold"})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertTrue((self.notes_dir() / "Recipes" / "Cold").is_dir())
        self.assertEqual(self.client.post("/api/memory/folders", json={"folder": "recipes/cold"}).status_code, 409)
        self.assertEqual(self.client.post("/api/memory/folders", json={"folder": "Facts"}).status_code, 422)
        self.assertEqual(self.client.post("/api/memory/folders", json={"folder": "../out"}).status_code, 422)
        self.assertIn("Recipes/Cold", self.graph()[2]["folders"])

    def test_same_title_in_two_folders_and_notes_from_before_the_vault(self):
        top = self.create("Index", "Top.")["note"]
        nested = self.create("Index", "Nested.", folder="02 Runtime")["note"]
        linking = self.create("Map", "[[Index]] and [[02 Runtime/Index]].")["note"]
        _, edges, _ = self.graph()
        self.assertIn((f"note:{linking['id']}", f"note:{top['id']}"), edges)
        self.assertIn((f"note:{linking['id']}", f"note:{nested['id']}"), edges)
        # A store from before the vault was the source of truth knows notes but not their files:
        # the files are adopted by path, not duplicated.
        with store.open_store(self.account["id"]) as db:
            db.execute("DELETE FROM vault_files")
        nodes, _, _ = self.graph()
        self.assertEqual(len([node for node in nodes.values() if node["kind"] == "note"]), 3)
        self.assertEqual(self.client.get(f"/api/memory/notes/{top['id']}").json()["text"], "Top.")

    def test_a_store_from_before_the_vault_is_migrated_in_place(self):
        path = store.memory_folder(self.account["id"]) / "store.sqlite3"
        old = sqlite3.connect(path)
        old.executescript("""
            CREATE TABLE notes (id INTEGER PRIMARY KEY, actor TEXT NOT NULL, created_at TEXT NOT NULL, archived_at TEXT);
            CREATE TABLE note_versions (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id), version INTEGER NOT NULL,
                folder TEXT NOT NULL, title TEXT NOT NULL, frontmatter TEXT NOT NULL, body TEXT NOT NULL, actor TEXT NOT NULL,
                created_at TEXT NOT NULL, UNIQUE (note_id, version));
            CREATE TABLE note_index (note_id INTEGER PRIMARY KEY REFERENCES notes(id), version INTEGER NOT NULL, folder TEXT NOT NULL,
                title TEXT NOT NULL, title_key TEXT NOT NULL UNIQUE, path_key TEXT NOT NULL UNIQUE, essential INTEGER NOT NULL, updated_at TEXT NOT NULL);
            INSERT INTO notes VALUES (1, 'owner', '2026-11-01', NULL);
            INSERT INTO note_versions VALUES (1, 1, 1, 'Test', 'dawd', '{}', 'Old body.', 'owner', '2026-11-01');
            INSERT INTO note_index VALUES (1, 1, 'Test', 'dawd', 'dawd', 'test/dawd', 0, '2026-11-01');
        """)
        old.commit()
        old.close()
        with store.open_store(self.account["id"]) as db:
            self.assertIn("text", store.columns(db, "note_versions"))
            self.assertIn("warning", store.columns(db, "note_index"))
            self.assertEqual(db.execute("SELECT title FROM note_index").fetchone()["title"], "dawd")
            self.assertEqual(db.execute("SELECT text FROM note_versions").fetchone()["text"], None)
            indexes = {row["name"] for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'note_index'")}
            self.assertIn("note_index_title", indexes)
        # The old version reads back from its parts; its file is adopted on the next scan.
        self.write("Test/dawd.md", "Old body.")
        detail = self.client.get("/api/memory/notes/1").json()
        self.assertEqual((detail["text"], detail["archived"]), ("Old body.", False))
        self.create("dawd", folder="Elsewhere")

    def test_notes_are_private_to_the_account_and_stay_out_of_the_operator_prompt(self):
        note = self.create("Secret recipe", "Cardamom and palm sugar.")["note"]
        self.client.post("/api/memory/entries", json={"target": "business", "fact": "We sell cardamom coffee."})
        results = self.client.post("/api/memory/search", json={"question": "cardamom"}).json()["results"]
        self.assertEqual([result["kind"] for result in results], ["fact", "note"])
        self.assertEqual(results[1]["title"], "Secret recipe")
        _, other = accounts.create_account("other", "other-long-password")
        self.assertEqual(service.search(other["id"], "cardamom"), [])
        self.assertEqual([node["kind"] for node in service.graph(other["id"])["nodes"]], ["facts", "facts"])
        with self.assertRaises(Exception) as caught:
            service.note(other["id"], note["id"])
        self.assertEqual(caught.exception.status_code, 404)
        # Retrieval for the Operator is unchanged: facts only, never note text.
        sources = service.retrieve(self.account["id"], "cardamom palm sugar")
        self.assertEqual([source["fact"] for source in sources], ["We sell cardamom coffee."])
        self.assertNotIn("palm sugar", service.context_for(self.account["id"], sources))
        self.assertEqual(self.client.get("/api/memory/notes/999").status_code, 404)


if __name__ == "__main__":
    unittest.main()
