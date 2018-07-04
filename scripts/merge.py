import os
import json

def load_directory(directory_path, include=None):
	result = {}
	for entry in os.listdir(directory_path):
		if include and not entry in include:
			continue

		entry_path = os.path.join(directory_path, entry)
		if os.path.isfile(entry_path) and entry_path.endswith(".json"):
			print("Adding " + entry_path)
			with open(entry_path, "r", encoding="UTF-8") as fp:
				result[entry.replace(".json", "")] = json.load(fp)
		elif os.path.isdir(entry_path):
			result = {**result, **load_directory(entry_path)}

	return result

def write_json(content, output_file, variable):
	with open(output_file, "w", encoding="UTF-8") as fp:
		fp.write("var " + variable + " = ")
		json.dump(content, fp)

def merge_directory(directory_path, output_file, variable, include=None):
	content = load_directory(directory_path, include)
	write_json(content, output_file, variable)

def adjust_file(file_path, output_file, variable):
	with open(file_path, "r", encoding="UTF-8") as fp:
		content = json.load(fp)
	write_json(content, output_file, variable)


snapshot_name = "3.2.0-792285"
root_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
snapshot_path = os.path.join(root_path, "snapshots", snapshot_name)
data_path = os.path.join(root_path, "data", snapshot_name)

if not os.path.exists(data_path):
	os.makedirs(data_path)

merge_directory(
	os.path.join(snapshot_path, "ships", "specs"),
	os.path.join(data_path, "shipSpecifications.js"),
	"shipSpecifications")
merge_directory(
	os.path.join(snapshot_path, "ships", "loads"),
	os.path.join(data_path, "shipLoadouts.js"),
	"shipLoadouts")
merge_directory(
	os.path.join(snapshot_path, "components", "spaceships"),
	os.path.join(data_path, "spaceshipComponents.js"),
	"spaceshipComponents")
merge_directory(
	os.path.join(snapshot_path, "components", "df"),
	os.path.join(data_path, "dataforgeComponents.js"),
	"dataforgeComponents",
	["Cooler", "EMP", "PowerPlant", "Shield", "Turret", "TurretBase", "WeaponMissile", "QuantumDrive", "QuantumFuelTank", "WeaponGun", "WeaponMining"])

adjust_file(
	os.path.join(snapshot_path, "local", "global.json"),
	os.path.join(data_path, "localizationStrings.js"),
	"localizationStrings")