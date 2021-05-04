import re

from .common import _make_item_port


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

            container[data["@itemportname"]] = entry

    def add_file_entries(container, items):
        elements = element_array(items.get("Item"))
        for data in elements:
            entry = {}
            entry["itemName"] = data.get("@itemName") or data.get("@itemname")
            entry["children"] = {}
            child_items = data.get("Items")
            if child_items:
                add_file_entries(entry["children"], child_items)

            container[data.get("@portName") or data["@portname"]] = entry

    manual_params = loadout_component.single("loadout").single("sitemportloadoutmanualparams")

    if manual_params:
        add_manual_entries(result, manual_params)
    else:
        # TODO Update this path for items that require it.
        path = loadout_component["loadout"]["SItemPortLoadoutXMLParams"]["@loadoutPath"]
        if path:
            path = os.path.join(extracted_path, "Data", path)
            if os.path.exists(path):
                loadout = read_json_file(path)
                items = loadout["Loadout"].get("Items")
                if items:
                    add_file_entries(result, items)

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
    damage_max = 0
    mass = 0
    control_seats = 0

    def walk_parts(container_element):
        nonlocal damage_max
        nonlocal mass
        nonlocal control_seats
        result = []

        parts_element = container_element.single("parts")
        if parts_element:
            for part_element in parts_element["part"]:
                damage_max += int(part_element.get("@damagemax", 0))
                mass += float(re.sub("[^0-9.]", "", part_element.get("@mass", "0")))

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
        "name": definition_element["@name"],
        "size": definition_element["@size"], # TODO Map to size categories in preprocessing.
        "itemPortTags": definition_element["@itemporttags"],
        "damageMax": damage_max,
        "mass": mass,
        "controlSeats": control_seats,
        "ports": ports
    }

    # TODO Also need to split tags but the delimiter is unknown; no examples.
    if result["itemPortTags"] == "":
        result["itemPortTags"] = None

    return result