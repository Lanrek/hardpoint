import os
import re

from common import _make_item_port
from xml_reader import read_xml_file


def make_loadout(loadout_component, extracted_path):
    result = {}

    def add_manual_entries(container, manual_params):
        elements = manual_params.single("entries").get("sitemportloadoutentryparams", [])
        for data in elements:
            entry = {}
            entry["itemName"] = data["@entityclassname"]
            entry["children"] = {}
            child_params = data.single("loadout").single("sitemportloadoutmanualparams")
            if child_params:
                add_manual_entries(entry["children"], child_params)

            container[data["@itemportname"].lower()] = entry

    def add_file_entries(container, loadout):
        items = loadout.single("items")
        if items:
            for item in items.get("item", []):
                entry = {}
                entry["itemName"] = item.get("@itemname")
                entry["children"] = {}
                add_file_entries(entry["children"], item)

                container[item["@portname"].lower()] = entry

    manual_params = loadout_component.single("loadout").single("sitemportloadoutmanualparams")

    if manual_params:
        add_manual_entries(result, manual_params)
    else:
        path = loadout_component.single("loadout").single("sitemportloadoutxmlparams")["@loadoutpath"]
        if path:
            path = os.path.join(extracted_path, "Data", path)
            if os.path.exists(path):
                loadout = read_xml_file(path)
                add_file_entries(result, loadout)

    return result


def _has_control_seat(item_port_element):
    for controller_element in item_port_element.get("controllerdef", []):
        user_element = controller_element.single("userdef")
        if user_element:
            observerables_element = user_element.single("observerables")
            if observerables_element:
                for observerable_element in observerables_element.get("observerable", []):
                    immutable_screens = ["Screen_TV", "habitation_bed_screen"]
                    if any(x not in immutable_screens for x in observerable_element["@screensavail"]):
                        return True
    return False


def make_vehicle(definition_element):
    critical_part_damage = {}
    damage_max = 0
    mass = 0
    control_seats = 0

    def walk_parts(container_element):
        nonlocal critical_part_damage
        nonlocal damage_max
        nonlocal mass
        nonlocal control_seats
        result = []

        parts_element = container_element.single("parts")
        if parts_element:
            for part_element in parts_element["part"]:
                part_damage = int(part_element.get("@damagemax", 0))
                if part_damage > 0:
                    if "damagebehaviors" in part_element:
                        for behavior_element in part_element.single("damagebehaviors").get("damagebehavior", []):
                            for group in behavior_element.get("group", []):
                                if group["@name"] == "Destroy":
                                    critical_part_damage[part_element["@name"]] = part_damage

                damage_max += part_damage
                mass += float(re.sub("[^0-9.]", "", part_element.get("@mass", "0")))
                if part_element.get("@mass", "").endswith("d"):
                    mass *= 64

                if part_element["@class"] == "ItemPort":
                    item_port_element = part_element.single("itemport")
                    if item_port_element:
                        types = []
                        types_element = item_port_element.single("types")
                        if types_element:
                            for type_element in types_element["type"]:
                                subtypes_attribute = type_element.get("@subtypes")
                                port_subtypes = [None]
                                if subtypes_attribute:
                                    port_subtypes = subtypes_attribute.split(",")
                                
                                for subtype in port_subtypes:
                                    types.append({
                                        "type": type_element["@type"],
                                        "subtypes": subtype
                                    })

                        port = _make_item_port(item_port_element, part_element["@name"], types)
                        result.append(port)

                        for axis in ["yaw", "pitch"]:
                            if axis in item_port_element:
                                port[axis + "Min"] = int(item_port_element.single(axis).get("@min", 0))
                                port[axis + "Max"] = int(item_port_element.single(axis).get("@max", 0))

                        if _has_control_seat(item_port_element):
                            control_seats += 1

                result.extend(walk_parts(part_element))

        return result

    ports = walk_parts(definition_element)

    result = {
        "baseName": definition_element["@name"],
        "size": definition_element.get("@size"),
        "itemPortTags": definition_element["@itemporttags"],
        "damageMax": damage_max,
        "damageCriticalPart": critical_part_damage,
        "mass": mass,
        "controlSeats": control_seats,
        "ports": ports
    }

    if critical_part_damage:
        result["damageMin"] = min(critical_part_damage.values())

    if not result["itemPortTags"]:
        result["itemPortTags"] = []
    else:
        result["itemPortTags"] = result["itemPortTags"].split()

    return result