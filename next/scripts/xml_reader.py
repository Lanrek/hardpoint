from xml.etree import ElementTree


class ElementDictionary(dict):
    def single(self, key):
        entry = self.get(key)

        if entry is None:
            return None

        if not isinstance(entry, list):
            raise KeyError(key + " was not a list type")

        if len(entry) > 1:
            print("    Warning: Element " + key + " has more than one value")

        if len(entry) == 0:
            return None
        else:
            return entry[0]


def read_xml_tree(element):
    tag = ElementDictionary({"@" + k.lower() : v for k, v in element.attrib.items()})
    if element.text and not element.text.isspace():
        tag["#text"] = element.text

    for child in element:
        key = child.tag.lower()
        if not key in tag:
            tag[key] = []
        tag[key].append(read_xml_tree(child))
    return tag


def read_xml_file(path):
    root = ElementTree.parse(path).getroot()
    return read_xml_tree(root)