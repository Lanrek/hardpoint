var hashString = function(str) {
    let hash = 0;
    if (!str) {
        return hash;
    }

    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = (hash * 31) + c;
        hash |= 0;
    }

    return hash;
};

 // Align to 24 bits for nice alignment with four base64 characters.
var encodeInt24 = function(num) {
    const unencoded =
        String.fromCharCode((num & 0xff0000) >> 16) +
        String.fromCharCode((num & 0xff00) >> 8) +
        String.fromCharCode(num & 0xff);

    return btoa(unencoded).replace(/\+/g, '-').replace(/\//g, '_');
}

var decodeSmallInt = function(str) {
    const start = "A";
    const num = str.charCodeAt(0);
    return num - start.charCodeAt(0);
}

var hashAndEncode = function(str) {
    const hash = hashString(str);
    return encodeInt24(hash);
}

// Limited to ints between 0 and 25.
var encodeSmallInt = function(num) {
    const start = "A";
    return String.fromCharCode(start.charCodeAt(0) + num);
}

// Serialization format: <version><bindingList> with the vehicleName alongside
// <bindingList>: <count>{<typeDiscriminator><groupName or portName><componentName><bindingList of children>}
// All string keys and values are hashed to 24 bits. All elements are individually base64 encoded.
const serialize = (loadout) => {
    let str = "2";

    const walk = (bindings) => {
        const serializeBinding = (binding) => {
            const children = walk(binding.bindings);
            return "B" + hashAndEncode(binding.port.name) + hashAndEncode(binding.itemName) + children;
        };

        const serializeGroup = (group) => {
            const template = group.members[0];

            // Select the children for the template by preferring those that were customized. This ensures any child
            // set on a group is serialized, and doesn't rely on defaults which are inconsistent within the group.
            // TODO This probably isn't correct for third-level ports...
            let childBindings = {};
            for (const portName of Object.keys(template.bindings)) {
                const customized = group.members.map(m => m.bindings[portName]).find(b => b.customized);
                childBindings[portName] = customized || template.bindings[portName];
            }

            const children = walk(childBindings);
            return "G" + hashAndEncode(group.name) + hashAndEncode(template.itemName) + children;
        };

        let result = "";
        let count = 0;
        const groups = BindingGroup.makeGroups(Object.values(bindings));
        let remaining = Object.values(bindings).filter(b => b.customized);
        remaining = remaining.filter(b => b.port.types.some(t => t.type in itemProjections));

        for (const group of groups.filter(g => g.members.length > 1)) {
            if (group.identical && group.members.some(m => remaining.some(r => r.port.name == m.port.name))) {
                result += serializeGroup(group);
                count += 1;
                remaining = remaining.filter(r => !group.members.some(g => g.port.name == r.port.name));
            }
        }

        for (const binding of remaining) {
            result += serializeBinding(binding);
            count += 1;
        }

        return encodeSmallInt(count) + result;
    };

    str += walk(loadout.bindings);
    return str;
}

const deserialize = (str, vehicleName) => {
    let prefix = 1;
    const version = str.substr(0, 1);

    if (version == "1") {
        // Skip the old inline shipId.
        prefix += 12;
    }

    let loadout = new VehicleLoadout(vehicleName);

    const findItem = (hashedName, prototypeBinding) => {
        return prototypeBinding.getMatchingItems().map(n => n.item.name).find(k => hashAndEncode(k) == hashedName);
    };

    const walk = (containers, index) => {
        const count = decodeSmallInt(str.substr(index, 1));
        index += 1;

        for (let current = 0; current < count; current += 1) {
            const discriminator = str.substr(index, 1);
            const name = str.substr(index + 1, 4);
            const value = str.substr(index + 5, 4);
            index += 9;

            let bindings = [];
            if (discriminator == "B") {
                const portName = Object.keys(containers[0].bindings).find(k => hashAndEncode(k) == name);

                for (const container of containers) {
                    const binding = container.bindings[portName];
                    bindings.push(binding);
                }
            }
            else if (discriminator == "G") {
                const groups = BindingGroup.makeGroups(Object.values(containers[0].bindings));
                const groupName = groups.map(g => g.name).find(n => hashAndEncode(n) == name);

                for (const container of containers) {
                    const prototypeGroup = groups.find(g => g.name == groupName);
                    for (const portName of prototypeGroup.members.map(n => n.port.name)) {
                        bindings.push(container.bindings[portName]);
                    }
                }
            }
            else {
                throw new Error("Invalid discriminator '" + discriminator + "'");
            }

            const itemName = findItem(value, bindings[0]);

            // Don't set the item if it didn't change, because that would clear the child ports unnecessarily.
            // Set it if it's changing for other group members, though.
            if (!bindings.every(b => b.itemName == itemName)) {
                bindings.forEach(b => b.setItem(itemName));
            }

            index = walk(bindings, index);
        }

        return index;
    };

    walk([loadout], prefix);
    return loadout;
}

const deserializeV1VehicleName = (str) => {
    const hashedbaseName = str.substr(1, 4);
    const hashedModificationName = str.substr(5, 4);
    const match = Object.values(allVehicles).find(n =>
        hashAndEncode(n.baseName) == hashedbaseName &&
        hashAndEncode(n.modificationName) == hashedModificationName);
    if (match) {
        return match.name;
    }
}

class LoadoutStorage {
    constructor() {
        this._loadouts = {};

        try {
            for (const [storageKey, value] of Object.entries(localStorage)) {
                try {
                    const entry = JSON.parse(value);

                    // Migrate old saved loadouts.
                    if (!entry.vehicleName) {
                        entry.vehicleName = deserializeV1VehicleName(entry.value);
                        entry.loadoutName = entry.name;
                        entry.serialized = serialize(deserialize(entry.value, entry.vehicleName));

                        this.set(entry.vehicleName, entry.loadoutName, storageKey, entry.serialized);
                    }

                    this._loadouts[storageKey] = deserialize(entry.serialized, entry.vehicleName);
                    this._loadouts[storageKey].metadata = new LoadoutMetadata(entry.vehicleName, entry.serialized, entry.loadoutName, storageKey);
                }
                catch (ex) {
                    console.warn("Failed to read loadout", ex);
                }
            }
        }
        catch (ex) {
            console.warn("Failed to read local storage", ex);
        }
    }

    get loadouts() {
        return Object.values(this._loadouts);
    }

    get(storageKey) {
        if (storageKey in this._loadouts) {
            return _.clone(this._loadouts[storageKey].metadata);
        }
    }

    set(metadata) {
        try {
            // Make a copy to avoid unintentional mutation of the cache.
            this._loadouts[metadata.storageKey] = deserialize(metadata.serialized, metadata.vehicleName);
            this._loadouts[metadata.storageKey].metadata = _.clone(metadata);

            localStorage.setItem(metadata.storageKey, JSON.stringify(metadata));
        }
        catch (ex) {
            console.warn("Failed to write local storage", ex);
        }
    }

    remove(storageKey) {
        try {
            delete this._loadouts[storageKey];

            localStorage.removeItem(storageKey);
        }
        catch (ex) {
            console.warn("Failed to write local storage", ex);
        }
    }
}