def _make_item_port(item_port_element, name_override, types):
    port = {
        "name": name_override or item_port_element.get("@name"),
        "types": types,
        "flags": [x for x in item_port_element.get("@flags", "").split(" ") if x != ""],
        "minSize": int(item_port_element.get("@minsize", 0)),
        "maxSize": int(item_port_element.get("@maxsize", 0)),
        "requiredTags": item_port_element.get("@requiredTags") or item_port_element.get("@porttags"),
    }

    port["flags"] = [x.replace("$", "") for x in port["flags"]]

    # TODO Also need to split tags but the delimiter is unknown; no examples.
    if port["requiredTags"] == "":
        port["requiredTags"] = None

    port["flags"].sort()
    port["types"].sort(key=lambda x: x.get("type") + "_" + str(x.get("subtype")))

    return port
