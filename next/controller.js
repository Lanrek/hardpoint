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
                    target: { name: "vehicle", params: { vehicleName: name }}
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

            const filterBindings = (parent) => {
                const children = Object.values(parent.bindings);
                return children.filter(n => n.port.types.some(t => significantTypes.includes(t.type)));
            };

            const groups = this.bindings.map(n => BindingGroup.makeGroups(filterBindings(n)));

            // Don't recurse more than two layers deep!
            if (this.level > 1 && groups[0].length > 0) {
                console.log("Warning: Found third-level ports with significant types!", groups[0])
                return [];
            }

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
        setPowerLevel(level) {
            for (binding of this.bindings) {
                binding.powerLevel = level;
            }
        },
        randomKey() {
            return _.random(0, 2 ** 64);
        }
    }
});

app.component("custom-loadout", {
    template: "#custom-loadout",
    props: {
        loadout: VehicleLoadout
    },
    data: function() {
        return {
            saveDialog: false,
            loadoutName: this.loadout.loadoutName
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
                        if (!binding.uneditable) {
                            result[binding.itemName] = (result[binding.itemName] || 0) + 1;
                        }
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
    },
    methods: {
        clickSave() {
            this.saveDialog = true;
        },
        saveLoadout() {
            const serialized = serialize(this.loadout);
            loadoutStorage.set(this.loadout.vehicle.name, this.loadoutName, serialized);
            this.$router.replace({
                name: "loadout",
                params: {
                    vehicleName: this.loadout.vehicle.name,
                    loadoutName: this.loadoutName,
                    serialized: serialized
                }
            });
        },
        removeLoadout() {
            const serialized = serialize(this.loadout);
            loadoutStorage.set(this.loadout.vehicle.name, this.loadoutName, undefined);
            this.$router.replace({
                name: "vehicle",
                params: {
                    vehicleName: this.loadout.vehicle.name,
                    serialized: serialized
                }
            });
        }
    }
});

const sectionTypes = {
    "Missiles": ["MissileLauncher", "Missile"],
    "Guns": ["WeaponGun", "Turret", "TurretBase"],
    "Systems": ["Cooler", "Shield", "PowerPlant", "QuantumDrive", "FuelIntake"],
    "Flight": ["MainThruster", "ManneuverThruster"]
};
const significantTypes = _.flatten(Object.values(sectionTypes));

app.component("vehicle-details", {
    template: "#vehicle-details",
    data: function() {
        return {
            vehicleLoadout: {},

            // Also defines the section display order.
            sectionNames: ["Guns", "Missiles", "Systems", "Flight"],
            // Also defines the section precedence order; highest precedence is first.
            // Rockets are classified as WeaponGun but generally share MissileLauncher hardpoints.
            sectionTypes: sectionTypes
        };
    },
    watch: {
        vehicleLoadout: {
            handler: function(val) {
                const serialized = serialize(val);

                let url = new URL(location.href);
                const previous = url.href;
                let depth = 3;
                if (this.$route.name == "loadout") {
                    depth += 2;
                }
                url.hash = url.hash.split("/").slice(0, depth).concat(serialized).join("/");

                if (url != previous) {
                    // Hack around the router not tracking changes to the URL and breaking the back button.
                    history.state.current = url.hash.replace("#", "");

                    history.replaceState(history.state, "", url.href);
                }

                if (this.$route.name == "loadout") {
                    loadoutStorage.set(this.vehicleLoadout.vehicle.name, this.$route.params.loadoutName, serialized);
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
            let result;
            if (this.vehicleLoadout.flightController.item) {
                result = _.cloneDeep(spaceSummaryCards);
            }
            else {
                result = _.cloneDeep(groundSummaryCards);
            }

            for (const card of Object.values(result)) {
                for (const entry of card) {
                    entry.value = _roundNumber(_.get(this.vehicleLoadout, entry.value));
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
            if (this.$route.name == "vehicle" || this.$route.name == "loadout") {
                if (this.$route.params.serialized) {
                    this.vehicleLoadout = deserialize(
                        this.$route.params.serialized,
                        this.$route.params.vehicleName,
                        this.$route.params.loadoutName)
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

            searchText: null
        };
    },
    computed: {
        columns() {
            let columns = vehicleColumns;
            if (!loadoutStorage.all.length) {
                columns = columns.filter(n => n.name != "loadoutName");
            }

            return columns;
        },
        loadouts() {
            const combined = Object.values(defaultLoadouts).concat(loadoutStorage.all)
            return _.sortBy(combined, "loadoutName", "vehicle.name");
        }
    },
    methods: {
        filterRows(rows, terms, cols, getCellValue) {
            return rows.filter(n => n.vehicle.displayName.toLowerCase().includes(this.searchText.toLowerCase()));
        },
        navigate(row) {
            if (row.loadoutName) {
                this.$router.push({
                    name: "loadout",
                    params: {
                        vehicleName: row.vehicle.name,
                        loadoutName: row.loadoutName,
                        serialized: serialize(row)
                    }
                });
            }
            else {
                this.$router.push({ name: "vehicle", params: { vehicleName: row.vehicle.name }});
            }
        }
    }
});
const vehicleGrid = app.component("vehicle-grid");

const loadoutStorage = new LoadoutStorage();

const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes: [
        {
            name: "vehicle",
            path: "/vehicles/:vehicleName/:serialized?",
            component: vehicleDetails
        },
        {
            name: "loadout",
            path: "/vehicles/:vehicleName/loadouts/:loadoutName/:serialized?",
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
                    name: "vehicle",
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
                    name: "vehicle",
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