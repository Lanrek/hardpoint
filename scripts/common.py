import uuid


def _make_item_port(item_port_element, name_override, types):
    port = {
        "name": (name_override or item_port_element.get("@name", "")).lower(),
        "types": types,
        "flags": [x for x in item_port_element.get("@flags", "").split(" ") if x != ""],
        "minSize": int(item_port_element.get("@minsize", 0)),
        "maxSize": int(item_port_element.get("@maxsize", 0)),
        "requiredTags": item_port_element.get("@requiredTags") or item_port_element.get("@porttags"),
        "connections": {}
    }

    connections_element = item_port_element.single("connections")
    if connections_element:
        for connection in connections_element.get("connection", []):
            port["connections"][connection.get("@pipeclass")] = connection.get("@pipe")
        for connection_param in connections_element.get("sitemportconnectionparam", []):
            port["connections"][connection_param.get("@klass")] = connection_param.get("@name")

    # Nameless item ports on the C8 Pisces appear like a broken attempt at hiding them.
    if not port["name"]:
        print("    Warning: Adding uuid name to nameless item port")
        port["name"] = str(uuid.uuid4())

    port["flags"] = [x.replace("$", "") for x in port["flags"]]

    if not port["requiredTags"]:
        port["requiredTags"] = []
    else:
        port["requiredTags"] = port["requiredTags"].split()

    port["flags"].sort()
    port["types"].sort(key=lambda x: x.get("type") + "_" + str(x.get("subtype")))

    return port
