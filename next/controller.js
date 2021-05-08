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
            }
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
                "Maneuverability": [
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
                "Placeholder": [
                    {
                        name: "Cargo Capacity",
                        value: "cargoCapacity",
                        units: "SCU"
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
                ]
            }
        };
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
        }
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
                this.vehicleLoadout = new VehicleLoadout(this.$route.params.vehicleName);
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
            path: "/loadouts/:vehicleName",
            component: vehicleDetails
        },
        {
            name: "grid",
            path: "/",
            component: vehicleGrid
        }
    ],
});
app.use(router);

app.use(Quasar);