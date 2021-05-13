import argparse
import fnmatch
import json
import os
import subprocess

from xml.etree import ElementTree

from xml_reader import read_xml_file, read_xml_tree
from vehicle import make_vehicle, make_loadout
from item import make_item
from ammo_params import make_ammo_params


source_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def read_lines_file(path):
    patterns = []
    with open(path, "r", encoding="UTF-8") as patterns_file:
        for line in patterns_file:
            line = line.strip()
            if len(line) > 0 and not line.startswith("#"):
                patterns.append(line)

    return patterns


def read_localization_file(path):
    localization = {}
    with open(path, "r", encoding="UTF-8") as ini_file:
        for line in ini_file:
            split = line.strip().split("=", 1)
            key = "@" + split[0]
            localization[key] = split[1]

    return localization


def write_json_file(path, content):
    with open(path, "w", encoding="UTF-8") as json_file:
        json.dump(content, json_file, indent=4)


def publish_data_file(path, variable_name):
    with open(path, "r", encoding="UTF-8") as json_file:
        content = json.load(json_file)

    publish_path = os.path.join(source_path, "data", os.path.basename(path).replace(".json", ".js"))

    with open(publish_path, "w", encoding="UTF-8") as js_file:
        js_file.write("const " + variable_name + " = ")
        json.dump(content, js_file)
        js_file.write(";")


def localize_key(container, container_key, localization):
    localization_key = container.get(container_key)
    if localization_key:
        localized = localization.get(localization_key, None)

        if localized and localized.startswith("<="):
            localized = None

        container[container_key] = localized


def find_forge_entries(game_xml_root, paths, type):
    for child in game_xml_root:
        if child.tag.startswith(type) and any(child.attrib["__path"].startswith(x) for x in paths):
            yield child


def collect_prices(extracted_path):
    hidden_patterns = read_lines_file(os.path.join(source_path, "scripts", "hidden_shops.txt"))
    id_entries = {}

    def read_price_element(element):
        products = element.single("retailproducts")
        if products:
            for node in products.get("node", []):
                id_entries[node["@id"]] = {
                    "name": node["@name"],
                    "basePrice": float(node["@baseprice"]),
                    "shops": []
                }

                read_price_element(node)

    prices = read_xml_file(os.path.join(extracted_path, "Data", "Libs", "Subsumption", "Shops", "RetailProductPrices.xml"))
    read_price_element(prices)

    def read_shop_element(element):
        layout = element.single("shoplayoutnodes")
        if layout:
            for layout_node in layout.get("shoplayoutnode", []):
                if any(fnmatch.fnmatchcase(layout_node["@name"], x) for x in hidden_patterns):
                    continue

                inventory = layout_node.single("shopinventorynodes")
                if inventory:
                    for inventory_node in inventory.get("shopinventorynode", []):
                        for transaction in inventory_node.single("transactiontypes").get("transactiontype", []):
                            if transaction and transaction["#text"] == "Buy":
                                id_entries[inventory_node["@inventoryid"]]["shops"].append(layout_node["@name"])

                read_shop_element(layout_node)


    shops = read_xml_file(os.path.join(extracted_path, "Data", "Libs", "Subsumption", "Shops", "ShopLayouts.xml"))
    read_shop_element(shops)

    name_entries = {}
    for value in id_entries.values():
        name_entries[value["name"]] = value
        #value.pop("name")
        if not value["basePrice"] or not value["shops"]:
            value["basePrice"] = None

    return name_entries


def modify_vehicle(implementation, modification_name, definition_path):
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

    available = implementation.single("modifications")["modification"]
    modification = next(x for x in available if x["@name"] == modification_name)

    if modification.get("elems"):
        elements = modification.single("elems").get("elem")
        for entry in elements:
            element = find_element(implementation, entry["@idref"])
            if element:
                element["@" + entry["@name"]] = entry["@value"]
            else:
                print("    Warning: Unable to modify element ID " + entry["@idref"])

    patch_file = modification.get("@patchfile")
    if patch_file:
        patch = read_xml_file(os.path.join(extracted_path, "Data", os.path.dirname(definition_path), patch_file + ".xml"))
        for key, value in patch.items():
            for entry in value:
                id = entry.get("@id")
                if id:
                    element = find_element(implementation, id)
                    if element:
                        element.clear()
                        element.update(entry)
                    else:
                        print("    Warning: Unable to modify element ID " + id)


def convert_vehicles(game_xml_root, extracted_path, localization, prices):
    hidden_patterns = read_lines_file(os.path.join(source_path, "scripts", "hidden_vehicles.txt"))
    vehicle_paths = ["libs/foundry/records/entities/spaceships", "libs/foundry/records/entities/groundvehicles"]

    vehicles = {}

    for element in find_forge_entries(game_xml_root, vehicle_paths, "EntityClassDefinition"):
        identifier = element.tag.split(".", 1)[-1]
        if any(fnmatch.fnmatchcase(identifier, x) for x in hidden_patterns):
            continue

        print("Converting vehicle and default loadout for " + identifier)

        entity = read_xml_tree(element)
        definition_path = entity.single("components").single("vehiclecomponentparams")["@vehicledefinition"]
        modification_name = entity.single("components").single("vehiclecomponentparams")["@modification"]

        definition = read_xml_file(os.path.join(extracted_path, "Data", definition_path))

        if modification_name:
            modify_vehicle(definition, modification_name, definition_path)
        
        converted = make_vehicle(definition)
        if converted:
            converted["name"] = identifier
            if modification_name:
                converted["modificationName"] = modification_name

            loadout_component = entity.single("components").single("sentitycomponentdefaultloadoutparams")
            converted["defaultItems"] = make_loadout(loadout_component, extracted_path)

            converted["displayName"] = entity.single("components").single("vehiclecomponentparams")["@vehiclename"]
            localize_key(converted, "displayName", localization)

            price_details = prices.get(identifier)
            if price_details:
                converted.update(price_details)

            vehicles[identifier] = converted

    write_json_file(os.path.join(extracted_path, "vehicles.json"), vehicles)


def convert_items(game_xml_root, extracted_path, localization, prices):
    hidden_patterns = read_lines_file(os.path.join(source_path, "scripts", "hidden_items.txt"))
    item_paths = [
        "libs/foundry/records/entities/scitem/doors",
        "libs/foundry/records/entities/scitem/ships",
        "libs/foundry/records/entities/scitem/vehicles"]

    items = {}

    for element in find_forge_entries(game_xml_root, item_paths, "EntityClassDefinition"):
        identifier = element.tag.split(".", 1)[-1]
        if any(fnmatch.fnmatchcase(identifier, x) for x in hidden_patterns):
            continue

        print("Converting item for " + identifier)

        entity = read_xml_tree(element)
        converted = make_item(entity)
        if converted:
            converted["name"] = identifier
            localize_key(converted, "displayName", localization)

            loadout_component = entity.single("components").single("sentitycomponentdefaultloadoutparams")
            if loadout_component:
                converted["defaultItems"] = make_loadout(loadout_component, extracted_path)

            price_details = prices.get(identifier)
            if price_details:
                converted.update(price_details)

            items[identifier] = converted

    write_json_file(os.path.join(extracted_path, "items.json"), items)


def convert_ammo_params(game_xml_root, extracted_path):
    ammo_param_paths = ["libs/foundry/records/ammoparams/vehicle"]

    ammo_params = {}

    for element in find_forge_entries(game_xml_root, ammo_param_paths, "AmmoParams"):
        identifier = element.tag.split(".", 1)[-1]

        print("Converting ammo params for " + identifier)

        entity = read_xml_tree(element)
        converted = make_ammo_params(entity)
        if converted:
            converted["name"] = identifier
            ammo_params[converted["reference"]] = converted

    write_json_file(os.path.join(extracted_path, "ammo_params.json"), ammo_params)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--extract", "-e", action="store_true")
    parser.add_argument("--convert", "-c", action="store_true")
    parser.add_argument("--publish", "-p", action="store_true")
    parser.add_argument("--version", "-v", required=True)
    arguments = parser.parse_args()

    # TODO Retrieve these from a config file.
    # TODO Also support PTU variations.
    unp4k_path = os.path.join(source_path, "..", "..", "unp4k-suite-v3.13.21")
    p4k_path = "C:/Games/StarCitizen/LIVE/Data.p4k"

    extracted_path = os.path.join(source_path, "extracted", arguments.version)
    if arguments.extract:
        os.makedirs(extracted_path)
        subprocess.check_call([os.path.join(unp4k_path, "unp4k.exe"), p4k_path, "*.xml"], cwd=extracted_path)
        subprocess.check_call([os.path.join(unp4k_path, "unp4k.exe"), p4k_path, "*.ini"], cwd=extracted_path)
        subprocess.check_call([os.path.join(unp4k_path, "unforge.exe"), "."], cwd=extracted_path)

    if arguments.convert:
        localization = read_localization_file(os.path.join(extracted_path, "Data", "Localization", "english", "global.ini"))
        prices = collect_prices(extracted_path)

        game_xml_root = ElementTree.parse(os.path.join(extracted_path, "Data", "Game.xml")).getroot()
        convert_vehicles(game_xml_root, extracted_path, localization, prices)
        convert_items(game_xml_root, extracted_path, localization, prices)
        convert_ammo_params(game_xml_root, extracted_path)

    # TODO Don't be sad and make these constants.
    if arguments.publish:
        publish_data_file(os.path.join(extracted_path, "vehicles.json"), "allVehicles")
        publish_data_file(os.path.join(extracted_path, "items.json"), "allItems")
        publish_data_file(os.path.join(extracted_path, "ammo_params.json"), "allAmmoParams")