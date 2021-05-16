import uuid


def _make_item_port(item_port_element, name_override, types):
    port = {
        "name": (name_override or item_port_element.get("@name", "")).lower(),
        "types": types,
        "flags": [x for x in item_port_element.get("@flags", "").split(" ") if x != ""],
        "minSize": int(item_port_element.get("@minsize", 0)),
        "maxSize": int(item_port_element.get("@maxsize", 0)),
        "requiredTags": item_port_element.get("@requiredTags") or item_port_element.get("@porttags"),
    }

    # Nameless item ports on the C8 Pisces appear like a broken attempt at hiding them.
    if not port["name"]:
        print("    Warning: Adding uuid name to nameless item port")
        port["name"] = str(uuid.uuid4())

    port["flags"] = [x.replace("$", "") for x in port["flags"]]

    # TODO Also need to split tags but the delimiter is unknown; no examples.
    if port["requiredTags"] == "":
        port["requiredTags"] = None

    port["flags"].sort()
    port["types"].sort(key=lambda x: x.get("type") + "_" + str(x.get("subtype")))

    return port
