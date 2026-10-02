import hashlib
import importlib.util
import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("world_actions", ROOT / "tools/blender/world_actions.py")
world_actions = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(world_actions)


class BlenderWorldActionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source_bytes = (ROOT / "worlds/island/world-source.json").read_bytes()
        cls.source = json.loads(cls.source_bytes)

    def plan(self, actions, source_bytes=None):
        source_bytes = source_bytes or self.source_bytes
        return {
            "protocol": world_actions.PROTOCOL,
            "sourceHash": "sha256:" + hashlib.sha256(source_bytes).hexdigest(),
            "actions": actions,
        }

    def test_matching_empty_plan_preserves_source(self):
        result, actions = world_actions.validate_plan(self.plan([]), self.source_bytes)
        self.assertEqual(result, self.source)
        self.assertEqual(actions, [])

    def test_add_and_update_asset_object(self):
        item = {
            "id": "tw-object:test-prop",
            "kind": "asset-instance",
            "label": "Test prop",
            "assetId": "sha256:" + "a" * 64,
            "priority": "visible",
            "transform": {"position": [1, 2, 3], "yaw": 0},
            "scale": [1, 1, 1],
            "collision": {"shape": "none", "enabled": False},
        }
        actions = [
            {"op": "object.add", "object": item},
            {"op": "object.update", "id": item["id"], "fields": {"label": "Updated prop"}},
        ]
        result, _ = world_actions.validate_plan(self.plan(actions), self.source_bytes)
        self.assertEqual(result["objects"][-1]["label"], "Updated prop")

    def test_rejects_stale_source_hash(self):
        plan = self.plan([])
        plan["sourceHash"] = "sha256:" + "0" * 64
        with self.assertRaisesRegex(ValueError, "does not match"):
            world_actions.validate_plan(plan, self.source_bytes)

    def test_rejects_invalid_collision_update(self):
        object_id = self.source["objects"][0]["id"]
        actions = [{"op": "object.update", "id": object_id, "fields": {"collision": {"enabled": True}}}]
        with self.assertRaises(ValueError):
            world_actions.validate_plan(self.plan(actions), self.source_bytes)

    def test_rejects_invalid_compound_collision(self):
        source = json.loads(self.source_bytes)
        compound = next(item for item in source["objects"] if item["collision"].get("shape") == "compound")
        compound["collision"]["boxes"][0]["yaw"] = 361
        source_bytes = json.dumps(source, separators=(",", ":")).encode()
        with self.assertRaisesRegex(ValueError, "compound collision yaw"):
            world_actions.validate_plan(self.plan([], source_bytes), source_bytes)

    def test_rejects_arbitrary_action(self):
        with self.assertRaisesRegex(ValueError, "unsupported Blender action"):
            world_actions.validate_plan(self.plan([{"op": "python.exec", "code": "pass"}]), self.source_bytes)

    def test_accepts_and_rejects_portal_frame_styles(self):
        source = json.loads(self.source_bytes)
        source["portals"][0]["visual"] = "timber"
        source_bytes = json.dumps(source, separators=(",", ":")).encode()
        result, _ = world_actions.validate_plan(self.plan([], source_bytes), source_bytes)
        self.assertEqual(result["portals"][0]["visual"], "timber")
        source["portals"][0]["visual"] = "glass"
        bad_bytes = json.dumps(source, separators=(",", ":")).encode()
        with self.assertRaisesRegex(ValueError, "visual must be"):
            world_actions.validate_plan(self.plan([], bad_bytes), bad_bytes)


if __name__ == "__main__":
    unittest.main()
