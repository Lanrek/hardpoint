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

class BindingGroup {
    constructor(members) {
        this.members = members;
    }

    get name() {
        const memberPortNames = this.members.map(m => m.port.name);
        return this.members.length + memberPortNames.sort()[0];
    }

    get identical() {
        const itemsIdentical = function(left, right) {
            return left.itemName == right.itemName || BindingGroup.similarTurrets(left, right);
        };

        const first = this.members[0];
        for (const other of this.members.slice(1)) {
            if (!itemsIdentical(first, other)) {
                return false;
            }

            // Also check the children.
            // TODO Only looking one level deep; that may cause problems.
            for (const key of Object.keys(first.bindings)) {
                if (!itemsIdentical(first.bindings[key], other.bindings[key])) {
                    return false;
                }
            }
        }

        return true;
    };

    static similarTurrets(left, right) {
        if (!left.item || !right.item || !left.uneditable || !right.uneditable) {
            return false;
        }

        if (left.item.type == "Turret" || left.item.type == "TurretBase") {
            if (left.item.containerHash == right.item.containerHash) {
                return true;
            }
        }

        return false;
    }
    
    static makeGroups(bindings) {
        const groupable = (left, right) => {
            if (left.port.minSize != right.port.minSize) return false;
            if (left.port.maxSize != right.port.maxSize) return false;
            if (!_.isEqual(left.port.types, right.port.types)) return false;
            if (!_.isEqual(left.port.requiredTags, right.port.requiredTags)) return false;
            if (left.uneditable != right.uneditable) return false;

            // Don't group if uneditable bindings have different items equipped.
            // Similar turrets are an exception.
            if (left.uneditable) {
                if (left.itemName != right.itemName) {
                    if (!this.similarTurrets(left, right)) {
                        return false;
                    }
                }
            }

            return true;
        };

        let groups = [];
        for (const binding of bindings) {
            const match = groups.find(n => groupable(binding, n[0]))
            if (match) {
                match.push(binding);
            }
            else {
                groups.push([binding]);
            }
        }

        return groups.map(n => new BindingGroup(n));
    }
}

const app = Vue.createApp({
    computed: {
        vehicleLinks() {
            result = [];
            for (const [name, vehicle] of Object.entries(allVehicles)) {
                result.push({
                    name: vehicle.displayName,
                    target: { name: "loadout", params: { vehicleName: name }}
                });
            }

            return _.sortBy(result, "name");
        }
    }
});

// Accepts multiple groups and assumes they're all identical to the first.
app.component("selector-group", {
    template: "#selector-group",
    props: {
        groups: Array,
        level: Number
    },
    data: function() {
        return {
            prototype: this.groups[0],
            grouped: this.groups[0].identical
        };
    },
    computed: {
        bindingsArrays() {
            // When ungrouped return an array for each member of the prototype.
            const arrays = _.zip(...this.groups.map(n => n.members));

            // When grouped return an array with a single value.
            if (this.grouped) {
                return [_.flatten(arrays)];
            }

            return arrays;
        }
    },
    methods: {
        toggle() {
            this.grouped = !this.grouped;

            // When grouping ports set their attached components to match the first in the group.
            if (this.grouped) {
                const first = this.prototype.members[0];

                for (const group of this.groups) {
                    for (const other of group.members.slice(1)) {
                        other.setItem(first.itemName);

                        // TODO Only looking one level deep; that may cause problems.
                        for (const child of Object.keys(first.bindings)) {
                            other.bindings[child].setItem(first.bindings[child].itemName);
                        }
                    }
                }
            }
        },
        randomKey() {
            return _.random(0, 2 ** 64);
        }
    }
});

hoveredBindings = {
    values: []
};

// Accepts multiple bindings and assumes they're all identical to the first.
app.component("item-selector", {
    template: "#item-selector",
    props: {
        bindings: Array,
        level: Number
    },
    data: function() {
        return {
            prototype: this.bindings[0],

            allRowsPagination: {
                rowsPerPage: 0
            },

            hoveredBindings: hoveredBindings
        };
    },
    computed: {
        summary() {
            if (this.prototype.item) {
                return itemProjections[this.prototype.item.type].summary(this.prototype);
            }
        },
        distinctTypes() {
            const distinct = this.prototype.port.types.map(n => n.type).filter((x, i, a) => a.indexOf(x) == i);
            return distinct.filter(n => n in itemProjections);
        },
        groupArrays() {
            // Don't recurse more than two layers deep!
            if (this.level > 2) {
                return [];
            }

            const filterBindings = (parent) => {
                let children = Object.values(parent.bindings);

                // TODO Make this into an allowlist instead; it'll save the maintenance headache.
    
                // Hide embbedded cargo grids since they're fixed.
                let filtered = children.filter(n => n.port.types.some(t => t.type != "Cargo"));
    
                // Hide magazine slots until they're worth customizing; they're distinguished by lack of types.
                filtered = filtered.filter(n => n.port.types.length);
    
                // Also hide weapon attachments until they're implemented.
                filtered = filtered.filter(n => n.port.types.some(t => t.type != "WeaponAttachment"));
    
                return filtered;
            };

            const groups = this.bindings.map(n => BindingGroup.makeGroups(filterBindings(n)));
            return _.zip(...groups);
        }
    },
    methods: {
        getColumns(type) {
            return itemProjections[type].columns;
        },
        makeGroups(bindings) {
            return BindingGroup.makeGroups(bindings);
        },
        setHoveredBindings(bindings) {
            this.hoveredBindings.values = bindings;
        },
        select(itemName) {
            this.$refs.expansion.hide();

            // Don't set component if it didn't change because that would clear the child ports unnecessarily.
            for (binding of this.bindings) {
                if (binding.itemName != itemName) {
                    binding.setItem(itemName);
                }
            }
        },
        randomKey() {
            return _.random(0, 2 ** 64);
        }
    }
});

app.component("required-items", {
    template: "#required-items",
    props: {
        loadout: VehicleLoadout
    },
    data: function() {
        return {
        };
    },
    computed: {
        stockItems() {
            const result = {};
            const walkDefaults = (container) => {
                for (const value of Object.values(container)) {
                    if (value.itemName) {
                        result[value.itemName] = (result[value.itemName] || 0) + 1;
                        walkDefaults(value.children);
                    }
                }
            };

            walkDefaults(this.loadout.vehicle.defaultItems);
            return result;
        },
        equippedItems() {
            const result = {};
            const walkBindings = (container) => {
                for (const binding of Object.values(container.bindings)) {
                    if (binding.itemName) {
                        result[binding.itemName] = (result[binding.itemName] || 0) + 1;
                        walkBindings(binding);
                    }
                }
            };

            walkBindings(this.loadout);
            return result;
        },
        requiredItems() {
            const stock = this.stockItems;
            let result = Object.entries(this.equippedItems).map(n => {
                return { name: n[0], count: n[1] }
            });

            for (const entry of result) {
                if (entry.name in stock) {
                    entry.count -= stock[entry.name];
                }

                entry.displayName = allItems[entry.name].displayName;
                entry.basePrice = allItems[entry.name].basePrice;
                entry.available = entry.basePrice > 0 && allItems[entry.name].shops.length > 0;
            }

            result = result.filter(n => n.count > 0);
            return result;
        }
    }
});

app.component("vehicle-details", {
    template: "#vehicle-details",
    data: function() {
        return {
            vehicleLoadout: {},

            // Also defines the section display order.
            sectionNames: ["Guns", "Missiles", "Systems", "Flight"],
            // Also defines the section precedence order; highest precedence is first.
            // Rockets are classified as WeaponGun but generally share MissileLauncher hardpoints.
            sectionTypes: {
                "Missiles": ["MissileLauncher"],
                "Guns": ["WeaponGun", "Turret", "TurretBase"],
                "Systems": ["Cooler", "Shield", "PowerPlant", "QuantumDrive", "FuelIntake"],
                "Flight": ["MainThruster", "ManneuverThruster"]
            },

            summaryCards: {
                "Maneuver": [
                    {
                        name: "Combat Speed",
                        value: "flightController.item.scmSpeed",
                        units: "m/sec"
                    },
                    {
                        name: "Pitch Rate",
                        value: "flightController.item.maxAngularVelocityX",
                        units: "deg/sec"
                    },
                    {
                        name: "Max Speed",
                        value: "flightController.item.maxSpeed",
                        units: "m/sec"
                    },
                    {
                        name: "Yaw Rate",
                        value: "flightController.item.maxAngularVelocityZ",
                        units: "deg/sec"
                    },
                    {
                        name: "Main Acceleration",
                        value: "mainAccelerationGs",
                        units: "Gs"
                    },
                    {
                        name: "Roll Rate",
                        value: "flightController.item.maxAngularVelocityY",
                        units: "deg/sec"
                    }
                ],
                "Combat": [
                    {
                        name: "Burst DPS",
                        value: "burstDps",
                        units: "dps"
                    },
                    {
                        name: "Shield Capacity",
                        value: "shieldCapacity",
                        units: "hp"
                    },
                    {
                        name: "Min Hitpoints",
                        value: "vehicle.damageMin",
                        units: "hp"
                    },
                    {
                        name: "Max Hitpoints",
                        value: "vehicle.damageMax",
                        units: "hp"
                    }
                ],
                "Travel": [
                    {
                        name: "Hydrogen Fuel",
                        value: "hydrogenFuelCapacity",
                        units: "units"
                    },
                    {
                        name: "Quantum Fuel",
                        value: "quantumFuelCapacity",
                        units: "units"
                    },
                    {
                        name: "Cargo Capacity",
                        value: "cargoCapacity",
                        units: "SCU"
                    }
                ],
                "Power": [
                    {
                        name: "Cargo Capacity",
                        value: "cargoCapacity",
                        units: "SCU"
                    }
                ]
            }
        };
    },
    watch: {
        vehicleLoadout: {
            handler: function(val) {
                const serialized = serialize(val);

                let url = new URL(location.href);
                const previous = url.href;
                url.hash = url.hash.split("/").slice(0, 3).concat(serialized).join("/");

                if (url != previous) {
                    // Hack around the router not tracking changes to the URL and breaking the back button.
                    history.state.current = url.hash.replace("#", "");

                    history.replaceState(history.state, "", url.href);
                }
            },
            deep: true
        }
    },
    computed: {
        sectionBindings() {
            const result = {};
            for (const name of this.sectionNames) {
                result[name] = [];
            }

            for (const binding of Object.values(this.vehicleLoadout.bindings)) {
                for (const [name, types] of Object.entries(this.sectionTypes)) {
                    if (binding.port.types.filter(pair => types.includes(pair.type)).length > 0) {
                        result[name].push(binding);
                        break;
                    }
                }
            }

            return result;
        },
        summaryValues() {
            const result = _.cloneDeep(this.summaryCards);
            for (const card of Object.values(result)) {
                for (const entry of card) {
                    entry.value = _round_number(_.get(this.vehicleLoadout, entry.value));
                }
            }

            return result;
        },
        showTurretCoverage() {
			if (!turretRotationsDefined[this.vehicleLoadout.vehicle.name]) {
				return false;
			}

			const turretTypes = ["Turret", "TurretBase"];
			const turrets = Object.values(this.vehicleLoadout.bindings).filter(
				n => n.item && turretTypes.includes(n.item.type));

			return turrets.length > 0;
		},
    },
    methods: {
        makeGroups(bindings) {
            return BindingGroup.makeGroups(bindings);
        },
        randomKey() {
            return _.random(0, 2 ** 64);
        }
    },
    created() {
        setLoadout = () => {
            if (this.$route.name == "loadout") {
                if (this.$route.params.serialized) {
                    this.vehicleLoadout = deserialize(this.$route.params.serialized, this.$route.params.vehicleName)
                }
                else {
                    this.vehicleLoadout = new VehicleLoadout(this.$route.params.vehicleName);
                }
            }
        };
        setLoadout();

        this.$watch(() => this.$route.params, setLoadout);
    }
});
const vehicleDetails = app.component("vehicle-details");

app.component("vehicle-grid", {
    template: "#vehicle-grid",
    data: function() {
        return {
            allRowsPagination: {
                rowsPerPage: 0
            },

            searchText: null,

            columns: vehicleColumns
        };
    },
    computed: {
        loadouts() {
            return _.sortBy(Object.values(defaultLoadouts), "vehicle.name");
        }
    },
    methods: {
        filterRows(rows, terms, cols, getCellValue) {
            return rows.filter(n => n.vehicle.displayName.toLowerCase().includes(this.searchText.toLowerCase()));
        },
        navigate(row) {
            this.$router.push({ name: "loadout", params: { vehicleName: row.vehicle.name }});
        }
    }
});
const vehicleGrid = app.component("vehicle-grid");

const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes: [
        {
            name: "loadout",
            path: "/loadouts/:vehicleName/:serialized?",
            component: vehicleDetails
        },
        {
            name: "grid",
            path: "/",
            component: vehicleGrid
        },

        // Routes for backward-compatibility with the old site.
        {
            path: "/customize/:serialized",
            redirect: to => {
                const vehicleName = deserializeV1VehicleName(to.params.serialized);
                if (!(vehicleName in allVehicles)) {
                    return { name: "grid" }
                }

                return {
                    name: "loadout",
                    params: {
                        vehicleName: vehicleName,
                        serialized: to.params.serialized
                    }
                }
            }
        },
        {
			path: "/ships/:vehicleName",
            redirect: to => {
                if (!(to.params.vehicleName in allVehicles)) {
                    return { name: "grid" }
                }

                return {
                    name: "loadout",
                    params: {
                        vehicleName: to.params.vehicleName
                    }
                }
            }
        }
    ],
});
app.use(router);

app.use(Quasar);