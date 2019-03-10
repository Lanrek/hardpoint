import argparse
import json
import os
import shutil

from xmljson import badgerfish
from xml.etree import ElementTree

def element_array(value):
	if value == None:
		return []
	if not isinstance(value, list):
		value = [value]
	return value

def convert_directory(xml_directory, json_directory):
	for root, dirs, files in os.walk(xml_directory):
		for name in files:
			if name.endswith(".xml"):
				xml_path = os.path.join(root, name)
				data = ElementTree.parse(xml_path).getroot()
				converted = badgerfish.data(data)

				json_path = os.path.join(json_directory, os.path.relpath(xml_path, xml_directory))
				json_path = json_path.replace(".xml", ".json")
				os.makedirs(os.path.dirname(json_path), exist_ok=True)

				print("Writing " + json_path)
				with open(json_path, "w", encoding="UTF-8") as json_file:
					json.dump(converted, json_file, indent=4)

def write_javascript(data, output_path, variable):
	with open(output_path, "w", encoding="UTF-8") as output_file:
		output_file.write("var " + variable + " = ")
		json.dump(data, output_file)
		output_file.write(";")

def read_json_file(path):
	with open(path, "r", encoding="UTF-8") as json_file:
		return json.load(json_file)

def walk_json_directory(directory, function):
	for root, dirs, files in os.walk(directory):
		for name in files:
			parsed = read_json_file(os.path.join(root, name))
			for key, value in parsed.items():
				identifier = key.split(".", 1)[-1]
				function(identifier, value)

def merge_items(items_directory, ammo_directory, door_loadouts_directory, output_path, localization_keys):
	included_types = ["Cooler", "EMP", "PowerPlant", "Shield", "Turret", "TurretBase", "WeaponMissile", "QuantumDrive", "QuantumFuelTank", "WeaponGun", "WeaponMining", "Ordinance", "Container", "Cargo", "Ping", "FlightController", "Door"]

	excluded_suffixes = ["_template", "_damaged"]

	combined_ammo = {}
	def add_ammo(identifier, value):
		ref = value["@__ref"]
		combined_ammo[ref] = value
	walk_json_directory(ammo_directory, add_ammo)

	combined_items = {}
	def add_item(identifier, value):
		component = value.get("Components")
		if component and not any(identifier.lower().endswith(x) for x in excluded_suffixes):
			type = component["SAttachableComponentParams"]["AttachDef"]["@Type"]
			if type in included_types:
				combined_items[identifier] = value
	walk_json_directory(items_directory, add_item)

	for key, value in combined_items.items():
		ammo_component = value["Components"].get("SAmmoContainerComponentParams")
		if ammo_component:
			ref = ammo_component["@ammoParamsRecord"]
			value["#ammoParams"] = combined_ammo[ref]

		loadout_component = value["Components"].get("SEntityComponentDefaultLoadoutParams")
		if loadout_component:
			embedded = {}
			manual_params = loadout_component["loadout"].get("SItemPortLoadoutManualParams")

			if manual_params:
				entries = element_array(manual_params["entries"].get("SItemPortLoadoutEntryParams"))
				for entry in entries:
					embedded[entry["@itemPortName"]] = entry["@entityClassName"]
			else:
				path = loadout_component["loadout"]["SItemPortLoadoutXMLParams"]["@loadoutPath"]
				if path:
					path = path.split("/")[-1].replace(".xml", ".json")
					path = os.path.join(door_loadouts_directory, path)
					if os.path.exists(path):
						loadout = read_json_file(path)
						items = loadout["Loadout"].get("Items")
						if items:
							elements = element_array(items.get("Item"))
							for entry in elements:
								embedded[entry["@portName"]] = entry["@itemName"]

			if len(embedded.keys()):
				value["#embedded"] = embedded

		localization_keys.add(value["Components"]["SAttachableComponentParams"]["AttachDef"]["Localization"]["@Name"])

		apply_filters(value, "item")

	write_javascript(combined_items, output_path, "itemData")

def hidden_vehicle_name(name):
	npc_names = ["_AI", "_Wreck", "_OLD", "probe_", "_S42", "_NoInterior", "_CitizenCon", "_Pirate", "_SimPod", "_Swarm"]
	for entry in npc_names:
		if entry in name:
			return True

	unfinished_names = ["Redeemer", "DRAK_Cutlass_DRAK", "Taurus"]
	for entry in unfinished_names:
		if entry in name:
			return True

	recolored_names = ["XIAN_Nox_Kue", "DRAK_Dragonfly_", "RSI_Constellation_Phoenix_"]
	for entry in recolored_names:
		if entry in name:
			return True

	return False

def find_element(element, id):
	children = []
	if isinstance(element, dict):
		if element.get("@id") == id:
			return element

		children = element.values()
	elif isinstance(element, list):
		children = element

	for entry in children:
		result = find_element(entry, id)
		if result:
			return result

def modify_vehicle(implementations_directory, implementation, modification_name):
	array = element_array(implementation["Vehicle"]["Modifications"]["Modification"])
	modification = next(x for x in array if x["@name"] == modification_name)

	if modification.get("Elems"):
		elements = element_array(modification["Elems"].get("Elem"))
		for entry in elements:
			element = find_element(implementation, entry["@idRef"])
			if element:
				element["@" + entry["@name"]] = entry["@value"]
			else:
				print("Modification " + modification_name + ": Unable to modify element ID " + entry["@idRef"])

	patch_file = modification.get("@patchFile")
	if patch_file:
		patch = read_json_file(os.path.join(implementations_directory, patch_file.split("/")[-1] + ".json"))
		for key, value in patch["Modifications"].items():
			id = value.get("@id")
			if id:
				element = find_element(implementation, id)
				if element:
					element.clear()
					element.update(value)
				else:
					print("Modification " + modification_name + ": Unable to modify element ID " + id)

def merge_vehicles(vehicle_directories, implementations_directory, loadouts_directory,
				   vehicle_path, loadout_path, localization_keys):
	loadout_paths = {}
	implementation_paths = {}
	modification_names = {}
	vehicle_names = {}
	def add_paths(identifier, value):
		if hidden_vehicle_name(identifier):
			print("- " + identifier)
			return
		print("+ " + identifier)

		loadout_paths[identifier] = value["Components"]["SEntityComponentDefaultLoadoutParams"]["loadout"]["SItemPortLoadoutXMLParams"]["@loadoutPath"]
		implementation_paths[identifier] = value["Components"]["VehicleComponentParams"]["@vehicleDefinition"]
		modification_names[identifier] = value["Components"]["VehicleComponentParams"]["@modification"]
		vehicle_names[identifier] = value["Components"]["VehicleComponentParams"]["@vehicleName"]
	for directory in vehicle_directories:
		walk_json_directory(directory, add_paths)

	combined_loadouts = {}
	for identifier, path in loadout_paths.items():
		path = path.split("/")[-1].replace(".xml", ".json")
		path = os.path.join(loadouts_directory, path)
		if os.path.exists(path):
			combined_loadouts[identifier] = read_json_file(path)

	combined_vehicles = {}
	for identifier, path in implementation_paths.items():
		path = path.split("/")[-1].replace(".xml", ".json")
		path = os.path.join(implementations_directory, path)
		if os.path.exists(path):
			implementation = read_json_file(path)
			if modification_names[identifier]:
				modify_vehicle(implementations_directory, implementation, modification_names[identifier])
				implementation["Vehicle"]["#modification"] = modification_names[identifier]

			combined_vehicles[identifier] = implementation["Vehicle"]

	for key, value in combined_vehicles.items():
		value["#vehicleName"] = vehicle_names[key]

		localization_keys.add(value["#vehicleName"])

		apply_filters(value, "vehicle")

	write_javascript(combined_loadouts, loadout_path, "loadoutData")
	write_javascript(combined_vehicles, vehicle_path, "vehicleData")

def write_localization_values(localization_path, localization_keys, output_file):
	localization = {}
	with open(localization_path, "r", encoding="UTF-8") as ini_file:
		for line in ini_file:
			split = line.strip().split("=", 1)
			key = "@" + split[0]
			if key in localization_keys:
				localization[key] = split[1]

	write_javascript(localization, output_file, "allStrings")

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
		"@name": None,
		"#modification": None,
		"#vehicleName": None,
		"@size": None,
		"@itemPortTags": None,
		"MovementParams.Spaceship.IFCS.states.state": "ifcsState",
		"Parts.Part": "vehiclePart"
	},
	"ifcsState": {
		"[]": "ifcsState",
		"@name": None,
		"tuning.@SCMVelocity": None,
		"tuning.@AngVelocity": None,
		"afterburner.@CruiseSpeed": None,
	},
	"vehiclePart": {
		"[]": "vehiclePart",
		"Parts.Part": "vehiclePart",
		"@name": None,
		"@class": None,
		"@damageMax": None,
		"ItemPort.@flags": None,
		"ItemPort.@minsize": None,
		"ItemPort.@maxsize": None,
		"ItemPort.@requiredTags": None,
		"ItemPort.Yaw.@min": None,
		"ItemPort.Yaw.@max": None,
		"ItemPort.Pitch.@min": None,
		"ItemPort.Pitch.@max": None,
		"ItemPort.Types.Type.@type": None,
		"ItemPort.Types.Type.@subtypes": None,
		"ItemPort.Types.Type.[].@type": None,
		"ItemPort.Types.Type.[].@subtypes": None,
		"ItemPort.ControllerDef": "controller"
	},
	"controller": {
		"[]": "controller",
		"UserDef.Observerables.Observerable": "observable"
	},
	"observable": {
		"[]": "observable",
		"@itemType": None
	},
	"item": {
		"Components.SAttachableComponentParams.AttachDef.Localization.@Name": None,
		"Components.SAttachableComponentParams.AttachDef.@Type": None,
		"Components.SAttachableComponentParams.AttachDef.@SubType": None,
		"Components.SAttachableComponentParams.AttachDef.@Size": None,
		"Components.SAttachableComponentParams.AttachDef.@RequiredTags": None,
		"#ammoParams.@speed": None,
		"#ammoParams.@lifetime": None,
		"#ammoParams.projectileParams.BulletProjectileParams.damage.DamageInfo": "damageInfo",		"#ammoParams.projectileParams.BulletProjectileParams.detonationParams.ProjectileDetonationParams": "projectileDetonation",
		"#embedded": None,
		"Components.SCItemWeaponComponentParams.connectionParams.@heatRateOnline": None,
		"Components.SAmmoContainerComponentParams.@maxAmmoCount": None,
		"Components.SCItemMissileParams.GCSParams.@trackingDistanceMax": None,
		"Components.SCItemMissileParams.GCSParams.@trackingSignalType": None,
		"Components.SCItemMissileParams.GCSParams.@trackingAngle": None,
		"Components.SCItemMissileParams.GCSParams.@lockTime": None,
		"Components.SCItemMissileParams.GCSParams.@linearSpeed": None,
		"Components.SCItemMissileParams.GCSParams.@interceptTime": None,
		"Components.SCItemMissileParams.GCSParams.@terminalTime": None,
		"Components.SCItemMissileParams.explosionParams.damage.DamageInfo": "damageInfo",
		"Components.SCItemShieldGeneratorParams.@MaxShieldHealth": None,
		"Components.SCItemShieldGeneratorParams.@MaxShieldRegen": None,
		"Components.SCItemShieldGeneratorParams.@DownedRegenDelay": None,
		"Components.SCItemFuelTankParams.@capacity": None,
		"Components.SCItemQuantumDriveParams.@jumpRange": None,
		"Components.SCItemQuantumDriveParams.@quantumFuelRequirement": None,
		"Components.SCItemQuantumDriveParams.params.@driveSpeed": None,
		"Components.SCItemQuantumDriveParams.params.@cooldownTime": None,
		"Components.SCItemQuantumDriveParams.params.@spoolUpTime": None,
		"Components.SCItemQuantumDriveParams.params.@maxCalibrationRequirement": None,
		"Components.SCItemQuantumDriveParams.params.@calibrationRate": None,
		"Components.EntityComponentPowerConnection.@PowerBase": None,
		"Components.EntityComponentPowerConnection.@PowerDraw": None,
		"Components.EntityComponentPowerConnection.@PowerToEM": None,
		"Components.SCItemFlightControllerParams.PowerParams.@AngularAccelerationPowerAmount": None,
		"Components.SCItemFlightControllerParams.PowerParams.@LinearAccelerationPowerAmount": None,
		"Components.EntityComponentHeatConnection.@TemperatureToIR": None,
		"Components.EntityComponentHeatConnection.@CoolingCoefficient": None,
		"Components.EntityComponentHeatConnection.@MaximumTemperature": None,
		"Components.EntityComponentHeatConnection.@OverheatTemperatureRatio": None,
		"Components.SCItemPowerPlantParams.@HeatFactor": None,
		"Components.SCItemShieldGeneratorParams.@HeatFactor": None,
		"Components.SCItemFlightControllerParams.HeatParams.@MinimumHeatAmount": None,
		"Components.SCItemFlightControllerParams.HeatParams.@AngularAccelerationHeatAmount": None,
		"Components.SCItemFlightControllerParams.HeatParams.@LinearAccelerationHeatAmount": None,
		"Components.SCItemCoolerParams.@HeatSinkMaxCapacityContribution": None,
		"Components.SCItemCargoGridParams.dimensions.@x": None,
		"Components.SCItemCargoGridParams.dimensions.@y": None,
		"Components.SCItemCargoGridParams.dimensions.@z": None,
		"Components.SCItemWeaponComponentParams.fireActions": "weaponAction",
		"Components.SCItemTurretParams.movementList.SCItemTurretJointMovementParams": "jointMovement",
		"Components.SCItem.ItemPorts.SItemPortCoreParams.Ports.SItemPortDef": "itemPort"
	},
	"projectileDetonation": {
		"explosionParams.damage.DamageInfo": "damageInfo"
	},
	"damageInfo": {
		"@DamageDistortion": None,
		"@DamageEnergy": None,
		"@DamagePhysical": None,
		"@DamageThermal": None
	},
	"weaponAction": {
		"[]": "weaponAction",
		"SWeaponActionSequenceParams.sequenceEntries.SWeaponSequenceEntryParams.weaponAction": "weaponAction",
		"SWeaponActionSequenceParams.sequenceEntries.SWeaponSequenceEntryParams.[].weaponAction": "weaponAction",
		"SWeaponActionFireSingleParams": "weaponActionParams",
		"SWeaponActionFireRapidParams": "weaponActionParams",
		"SWeaponActionFireChargedParams": "weaponActionParams",
		"SWeaponActionFireBeamParams": "weaponActionParams"
	},
	"weaponActionParams": {
		"@fireRate": None,
		"@heatPerShot": None,
		"projectileLaunchParams.@pelletCount": None
	},
	"jointMovement": {
		"[].pitchAxis.SCItemTurretJointMovementAxisParams": "axisParams",
		"[].yawAxis.SCItemTurretJointMovementAxisParams": "axisParams"
	},
	"axisParams": {
		"angleLimits.SCItemTurretStandardAngleLimitParams": "angleLimits",
		"angleLimits.SCItemTurretCustomAngleLimitParams.AngleLimits.SCItemTurretCustomAngleLimit.[]": "angleLimits"
	},
	"angleLimits": {
		"@TurretRotation": None,
		"@LowestAngle": None,
		"@HighestAngle": None
	},
	"itemPort": {
		"[]": "itemPort",
		"@Name": None,
		"@Flags": None,
		"@MinSize": None,
		"@MaxSize": None,
		"@PortTags": None,
		"Types.SItemPortDefTypes.@Type": None,
		"Types.SItemPortDefTypes.SubTypes.Enum.@value": None
	}
}

filter_usage = {}
for filter_name, filter in filters.items():
	for path in filter.keys():
		filter_usage[make_filter_usage_key(filter_name, path)] = 0

parser = argparse.ArgumentParser()
parser.add_argument("--json", "-j", action="store_true")
parser.add_argument("--merge", "-m", action="store_true")
parser.add_argument("--copy", "-c", action="store_true")
parser.add_argument("--snapshot", "-s", default="scratch")
arguments = parser.parse_args()

data_directory = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
snapshot_directory = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "snapshots", arguments.snapshot))
xml_directory = os.path.join(snapshot_directory, "xml")
json_directory = os.path.join(snapshot_directory, "json")

# Data/Localization/english/global.ini
localization_path = os.path.join(xml_directory, "global.ini")

# Data/Game.dcb/libs/foundry/records/entities/scitem/doors
# Data/Game.dcb/libs/foundry/records/entities/scitem/ships
# Data/Game.dcb/libs/foundry/records/entities/scitem/vehicles
items_directory = os.path.join(json_directory, "scitem")

# Data/Game.dcb/libs/foundry/records/ammoparams/vehicle
ammo_directory = os.path.join(json_directory, "ammoparams", "vehicle")

vehicle_directories = [
	# Data/Game.dcb/libs/foundry/records/entities/spaceships
	os.path.join(json_directory, "spaceships"),

	# Data/Game.dcb/libs/foundry/records/entities/groundvehicles
	os.path.join(json_directory, "groundvehicles")
]

# Data/Scripts/Entities/Vehicles/Implementations/Xml (with flatted subdirectories)
implementations_directory = os.path.join(json_directory, "Entities", "Vehicles")

# Data/Scripts/Loadouts/Vehicles (with flatted subdirectories)
vehicle_loadouts_directory = os.path.join(json_directory, "Loadouts", "Vehicles")

# Data/Scripts/Loadouts/Objects/Doors (with flatted subdirectories)
door_loadouts_directory = os.path.join(json_directory, "Loadouts", "Doors")

if arguments.json:
	convert_directory(xml_directory, json_directory)

if arguments.merge:
	localization_keys = set()

	merge_items(
		items_directory,
		ammo_directory,
		door_loadouts_directory,
		os.path.join(snapshot_directory, "items.js"),
		localization_keys)

	merge_vehicles(
		vehicle_directories,
		implementations_directory,
		vehicle_loadouts_directory,
		os.path.join(snapshot_directory, "vehicles.js"),
		os.path.join(snapshot_directory, "loadouts.js"),
		localization_keys)

	write_localization_values(
		localization_path,
		localization_keys,
		os.path.join(snapshot_directory, "strings.js"))

	for key, value in filter_usage.items():
		print("{:>6} {}".format(value, key))

if arguments.copy:
	for entry in os.listdir(snapshot_directory):
		if entry.endswith(".js"):
			path = os.path.join(snapshot_directory, entry)
			print("Copying " + path + " to " + data_directory)
			shutil.copy(path, data_directory)