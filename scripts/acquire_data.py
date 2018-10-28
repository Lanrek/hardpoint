import argparse
import json
import os
import urllib.parse

from urllib.request import urlopen

def set_query_parameter(url, name, value):
	url_parts = list(urllib.parse.urlparse(url))
	query = dict(urllib.parse.parse_qsl(url_parts[4]))

	query[name] = value
	url_parts[4] = urllib.parse.urlencode(query)

	return urllib.parse.urlunparse(url_parts)

def get_json(url):
	print("Calling " + url)
	response = urlopen(url)
	contents = response.read()
	parsed = json.loads(contents)
	return parsed

def combine_pages(api):
	result = []
	next = api
	while next:
		parsed = get_json(next)
		key, value = parsed["_embedded"].popitem()
		result += value

		if "next" in parsed["_links"]:
			next = parsed["_links"]["next"]["href"]
		else:
			next = None

	return result

def download_pointers(directory, pointers):
	for entry in pointers:
		url = entry["_links"]["self"]["href"]
		url = set_query_parameter(url, "projection", "full")
		data = get_json(url)
		output_file = os.path.join(directory, data["name"] + ".json")
		print("Writing " + output_file)
		with open(output_file, "w", encoding="UTF-8") as fp:
			json.dump(data, fp, indent=4)

def download_vehicles(vehicles_directory):
	def hidden(name):
		npc_names = ["_AI", "_Wreck", "_OLD", "probe_", "_S42", "_NoInterior", "_CitizenCon", "_Pirate", "_SimPod", "_Swarm"]
		for entry in npc_names:
			if entry in name:
				print("Hiding NPC vehicle named " + name)
				return True

		unfinished_names = ["Redeemer", "DRAK_Cutlass_DRAK", "Taurus"]
		for entry in unfinished_names:
			if entry in name:
				print("Hiding unfinished vehicle named " + name)
				return True

		recolored_names = ["XIAN_Nox_Kue", "DRAK_Dragonfly_"]
		for entry in recolored_names:
			if entry in name:
				print("Hiding recolored vehicle named " + name)
				return True

		return False

	pointers = combine_pages("http://dev.gamedata.scnis.io/api/vehicles")
	pointers = [x for x in pointers if not hidden(x["name"])]

	if not os.path.exists(vehicles_directory):
		os.makedirs(vehicles_directory)

	download_pointers(vehicles_directory, pointers)

def download_items(items_directory):
	included_types = ["Cooler", "EMP", "PowerPlant", "Shield", "Turret", "TurretBase", "WeaponMissile", "QuantumDrive", "QuantumFuelTank", "WeaponGun", "WeaponMining", "Ordinance"]

	for type in included_types:
		type_directory = os.path.join(items_directory, type)
		if not os.path.exists(type_directory):
			os.makedirs(type_directory)

		url = set_query_parameter("http://dev.gamedata.scnis.io/api/items/search/byType", "type", type)
		pointers = combine_pages(url)

		download_pointers(type_directory, pointers)

def write_javascript(data, output_file, variable):
	with open(output_file, "w", encoding="UTF-8") as fp:
		fp.write("var " + variable + " = ")
		json.dump(data, fp)
		fp.write(";")

def download_meta(output_file, variable):
	data = get_json("http://dev.gamedata.scnis.io/api/meta")
	write_javascript(data, output_file, variable)

def merge_directory(directory, output_file, variable, filter_name):
	combined = {}
	for root, dirs, files in os.walk(directory):
		for name in files:
			with open(os.path.join(root, name), "r", encoding="UTF-8") as fp:
				parsed = json.load(fp)
				combined[parsed["name"]] = parsed

	for object in combined.values():
		apply_filters(object, filter_name)

	write_javascript(combined, output_file, variable)

def make_filter_usage_key(filter_name, path):
	return filter_name + " | " + path

def increment_filter_usage(filter_name, path):
	key = make_filter_usage_key(filter_name, path)
	filter_usage[key] += 1

def apply_filters(object, filter_name, previous=""):
	filter = filters[filter_name]

	if type(object) is list:
		path = previous + "[]"
		next = path + "."

		for item in object:
			if path in filter and filter[path]:
				increment_filter_usage(filter_name, path)
				apply_filters(item, filter[path])
			else:
				apply_filters(item, filter_name, next)
	else:
		for key in list(object):
			path = previous + key
			next = path + "."

			if path in filter:
				if filter[path]:
					increment_filter_usage(filter_name, path)
					apply_filters(object[key], filter[path])
				else:
					increment_filter_usage(filter_name, path)
			elif any(x.startswith(path + ".") for x in filter):
				apply_filters(object[key], filter_name, next)
			else:
				del object[key]

filters = {
	"vehicle": {
		"name": None,
		"size": None,
		"tags": None,
		"displayName": None,
		"vehicleSpecification.baseName": None,
		"vehicleSpecification.variant": None,
		"vehicleSpecification.displayName": None,
		"vehicleSpecification.movement.ifcsStates.[].state": None,
		"vehicleSpecification.movement.ifcsStates.[].scmMode.maxVelocity": None,
		"vehicleSpecification.movement.ifcsStates.[].ab2CruMode.criuseSpeed": None,
		"vehicleSpecification.parts.[]": "vehicle_part",
		"vehicleSpecification.ports.[]": "port",
		"hardpoints.[]": "vehicle_hardpoint",
	},
	"vehicle_part": {
		"mass": None,
		"damageMax": None,
		"parts.[]": "vehicle_part",
		"ports.[]": "port"
	},
	"vehicle_hardpoint": {
		"name": None,
		"item.name": None,
		"name": None,
		"item.ports.[].name": None,
		"item.ports.[]._embedded.item.name": None,
		"hardpoints.[]": "vehicle_hardpoint"
	},
	"item": {
		"name": None,
		"size": None,
		"itemRequiredTags": None,
		"displayName": None,
		"type.type": None,
		"type.subType": None,
		"components.[].name": None,
		"components.[].ammo.speed": None,
		"components.[].ammo.lifetime": None,
		"components.[].ammo.areaDamage.damage": None,
		"components.[].ammo.impactDamage.damage": None,
		"components.[].maxAmmoCount": None,
		"components.[].fireActions.[].name": None,
		"components.[].fireActions.[].pelletCount": None,
		"components.[].fireActions.[].fireRate": None,
		"components.[].damage.damage": None,
		"components.[].trackingDistanceMax": None,
		"components.[].trackingSignalType": None,
		"components.[].maxShieldHealth": None,
		"components.[].maxShieldRegen": None,
		"components.[].downedRegenDelay": None,
		"components.[].capacity": None,
		"components.[].jumpRange": None,
		"components.[].quantumFuelRequirement": None,
		"components.[].jump.cooldownTime": None,
		"components.[].jump.driveSpeed": None,
		"ports.[]": "port"
	},
	"port": {
		"name": None,
		"uneditable": None,
		"minSize": None,
		"maxSize": None,
		"portTags": None,
		"_embedded.item.name": None,
		"acceptsTypes.[].type": None,
		"acceptsTypes.[].subType": None
	}
}

filter_usage = {}
for filter_name, filter in filters.items():
	for path in filter.keys():
		filter_usage[make_filter_usage_key(filter_name, path)] = 0

parser = argparse.ArgumentParser()
parser.add_argument("--download", "-d", action="store_true")
parser.add_argument("--merge", "-m", action="store_true")
parser.add_argument("--snapshot", "-s", default="scratch")
arguments = parser.parse_args()

snapshot_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "snapshots", arguments.snapshot))
vehicles_directory = os.path.join(snapshot_path, "vehicles")
items_directory = os.path.join(snapshot_path, "items")

if arguments.download:
	download_vehicles(vehicles_directory)
	download_items(items_directory)
	download_meta(os.path.join(snapshot_path, "meta.js"), "metaData")

if arguments.merge:
	merge_directory(vehicles_directory, os.path.join(snapshot_path, "vehicles.js"), "vehicleData", "vehicle")
	merge_directory(items_directory, os.path.join(snapshot_path, "items.js"), "itemData", "item")

	for key, value in filter_usage.items():
		print("{:>6} {}".format(value, key))
