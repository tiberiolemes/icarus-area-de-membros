"""Explain only the reviewed schema/community migration; reject all other control deltas."""

import json
from collections import Counter
from pathlib import Path

RIGHTS = (
	"parent",
	"role",
	"permlevel",
	"read",
	"write",
	"create",
	"delete",
	"submit",
	"cancel",
	"amend",
	"report",
	"export",
	"import",
	"share",
	"print",
	"email",
	"select",
	"if_owner",
)


def validate(before, after, root, *, migrating=True):
	old, new = before["controls"], after["controls"]
	for kind in ("User Permission", "DocShare"):
		assert {row["name"]: row for row in old[kind]} == {row["name"]: row for row in new[kind]}, kind
	user_roles = [
		{row["name"]: row for row in state["Has Role"] if row["parenttype"] == "User"} for state in (old, new)
	]
	assert user_roles[0] == user_roles[1], "User role rows changed"

	def key(row):
		return tuple(row[field] for field in ("parenttype", "parent", "parentfield", "role", "idx"))

	roles = [{key(row): row for row in state["Has Role"]} for state in (old, new)]
	assert all(len(mapped) == len(state["Has Role"]) for mapped, state in zip(roles, (old, new))), "Duplicate role binding key"
	assert roles[0].keys() == roles[1].keys(), "Role audience or order changed"
	regenerated = []
	for identity, previous in roles[0].items():
		current = roles[1][identity]
		changed = {field for field in previous if previous[field] != current[field]}
		if changed:
			assert (
				previous["parenttype"] == "Workspace"
				and previous["parent"] == "Flow"
				and previous["parentfield"] == "roles"
			)
			assert changed <= {"name", "creation", "modified"}
			regenerated.append(
				{
					"doctype": "Has Role",
					"parent": "Flow",
					"parenttype": "Workspace",
					"parentfield": "roles",
					"role": previous["role"],
					"idx": previous["idx"],
					"changed_fields": sorted(changed),
				}
			)
	assert len(regenerated) in (0, 2), "Unexpected Workspace sync delta"
	if regenerated:
		assert all(sum(row["parenttype"] == "Workspace" and row["parent"] == "Flow" and row["parentfield"] == "roles" for row in state["Has Role"]) == 2 for state in (old, new)), "Unexpected Flow role audience"
	assert all(
		not state["live_link_references"] and not state["foreign_keys_to_has_role"]
		and not any(state.get("foreign_keys_by_control", {}).values())
		for state in (before, after)
	)

	def permission(row):
		return tuple(row.get(field) or ("" if field in {"parent", "role"} else 0) for field in RIGHTS)

	# The reviewed curriculum and video-identity patches reload these four parents once.
	# Compare every other stored column, including mask/impersonate/match and idx.
	standard_rows = [{row["name"]: row for row in state["DocPerm"]} for state in (old, new)]
	regenerated_standard = []
	added_standard = {key: row for key, row in standard_rows[1].items() if key not in standard_rows[0]}
	for identity, previous in standard_rows[0].items():
		if identity in standard_rows[1]:
			assert previous == standard_rows[1][identity], "Existing DocPerm row changed"
			continue
		assert migrating and previous["parent"] in {"LMS Course", "Course Chapter", "Course Lesson", "LMS Video Watch Duration"}
		signature = {key: value for key, value in previous.items() if key not in {"name", "creation", "modified"}}
		matches = [row for row in added_standard.values() if {key: value for key, value in row.items() if key not in {"name", "creation", "modified"}} == signature]
		assert len(matches) == 1, "Regenerated DocPerm changed stored permission fields"
		current = matches[0]
		regenerated_standard.append({"doctype": "DocPerm", "parent": previous["parent"], "parenttype": previous["parenttype"], "parentfield": previous["parentfield"], "role": previous["role"], "idx": previous["idx"], "changed_fields": sorted(key for key in previous if previous[key] != current[key])})
		del added_standard[current["name"]]
	assert not regenerated_standard or Counter(row["parent"] for row in regenerated_standard) == {"LMS Course": 3, "Course Chapter": 7, "Course Lesson": 3, "LMS Video Watch Duration": 4}
	for row in added_standard.values():
		assert not any(row.get(key) for key in ("mask", "impersonate", "match")), "Unexpected new advanced permission"
	old_standard, new_standard = [
		Counter(permission(row) for row in state["DocPerm"]) for state in (old, new)
	]
	assert not old_standard - new_standard, "Existing standard rights changed"
	expected = Counter()
	new_types = {
		"LMS Account Security",
		"LMS Community",
		"LMS Community Grant",
		"LMS Discussion Decision",
		"LMS Help Feedback",
		"LMS Privacy Settings",
		"LMS Tour Progress",
	}
	for doctype in new_types if migrating else ():
		metadata = next((Path(root) / "lms/lms/doctype").glob(doctype.lower().replace(" ", "_") + "/*.json"))
		for row in json.loads(metadata.read_text())["permissions"]:
			expected[permission({"parent": doctype, **row})] += 1
	assert new_standard - old_standard == expected, {
		"unexpected": list((new_standard - old_standard - expected).elements()),
		"missing": list((expected - (new_standard - old_standard)).elements()),
	}
	old_custom, new_custom = [{row["name"]: row for row in state["Custom DocPerm"]} for state in (old, new)]
	assert old_custom.keys() <= new_custom.keys(), "Custom permission was removed"
	changed_custom = []
	for identity, previous in old_custom.items():
		current = new_custom[identity]
		changed = {field for field in previous if previous[field] != current[field]}
		if not changed:
			continue
		assert migrating, "A repeated application changed custom controls"
		assert previous["parent"] in {"Discussion Topic", "Discussion Reply"}
		assert previous["role"] in {"LMS Student", "Course Creator", "Batch Evaluator", "Moderator"}
		assert changed <= {"delete", "export", "if_owner", "modified"}
		assert current["delete"] == current["export"] == current["if_owner"] == 0
		changed_custom.append(
			{"doctype": current["parent"], "role": current["role"], "changed_fields": sorted(changed)}
		)
	added = [new_custom[key] for key in new_custom.keys() - old_custom.keys()]
	assert (
		(len(added) == 2 and {row["parent"] for row in added} == {"Discussion Topic", "Discussion Reply"})
		if migrating
		else not added
	)
	for row in added:
		assert row["role"] == "System Manager" and row["permlevel"] == 0
		assert {field for field in RIGHTS[3:] if row.get(field)} == {"read", "write", "create", "export"}
	return {
		"user_role_rows_byte_equal": len(user_roles[0]),
		"standard_permission_rows_byte_equal": len(standard_rows[0]) - len(regenerated_standard),
		"standard_reload_regenerations": regenerated_standard,
		"user_permissions_byte_equal": True,
		"docshares_byte_equal": True,
		"workspace_sync_only": regenerated,
		"repeat_scope": "functional/business no-op; exact two Flow Workspace child IDs/timestamps may regenerate through native sync" if not migrating else "incremental migration",
		"workspace_child_ids_without_live_references": True,
		"new_standard_permissions_match_versioned_schema": sum(expected.values()),
		"community_custom_permission_changes": changed_custom,
		"new_system_manager_discussion_permissions": len(added),
		"row_level_moderation_authority_tests_still_required": True,
	}


if __name__ == "__main__":
	root = Path(__file__).resolve().parents[3]
	states = [
		json.loads((root / (".local/quality/08-controls-" + name + ".json")).read_text())
		for name in ("original", "migrated")
	]
	print(json.dumps(validate(*states, root), ensure_ascii=False))
