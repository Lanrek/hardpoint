class QuantumDriveExtensions {
    constructor(item, loadout) {
        this._item = item;
        this._loadout = loadout;
    }

    get driveSpeedMm() {
        return this._item.driveSpeed / (1000 * 1000);
    }

    get minCalibrationTime() {
        return this._item.maxCalibrationRequirement / this._item.calibrationRate;
    }

    get fuelPerGm() {
        return this._item.quantumFuelRequirement * 1000;
    }

    get fuelRangeGm() {
        return this._loadout.quantumFuelCapacity / this.fuelPerGm;
    }
}

class ThrusterExtensions {
    constructor(item, loadout) {
        this._item = item;
        this._loadout = loadout;
    }

    get thrustMn() {
        return this._item.thrustCapacity / (1000 * 1000)
    }

    get accelerationGs() {
        return this._item.thrustCapacity / this._loadout.vehicle.mass / 9.80665;
    }

    get maxFuelBurn() {
        return this._item.fuelBurnRatePer10KNewton * (this._item.thrustCapacity / 10000);
    }

    get maxFuelDurationMinutes() {
        return this._loadout.hydrogenFuelCapacity / (this.maxFuelBurn * 60);
    }
}

class PortContainerExtensions {
    constructor(item, loadout) {
        this._item = item;
        this._loadout = loadout;
    }

    get portCount() {
        return Object.keys(this._item.ports).length;
    }

    get maxPortSize() {
        if (this.portCount != 0) {
            return Object.values(this._item.ports)[0].maxSize;
        }
    }
}

const extensionClasses = {
    QuantumDrive : QuantumDriveExtensions,
    MainThruster: ThrusterExtensions,
    ManneuverThruster: ThrusterExtensions,
    MissileLauncher: PortContainerExtensions,
    Turret: PortContainerExtensions,
    TurretBase: PortContainerExtensions
};

class ExtendedItem {
    constructor(item, extension) {
        this.item = item;
        this.extension = extension;
    }
}

class ItemBinding {
    constructor(loadout, port, parent) {
        this._loadout = loadout;
        this.port = port;
        this.parent = parent;

        this.setItem(loadout.getDefaultItem(this.path));
    }

    get itemName() {
        if (this.item) {
            return this.item.name;
        }
    }

    get path() {
		let result = [];
		let binding = this;

		while (binding) {
			result.unshift(binding.port.name);
			binding = binding.parent;
		}

		return result;
	}
    
    get uneditable() {
        return this.port.flags && this.port.flags.includes("uneditable");
    }

    getMatchingItems(typeFilter=undefined) {
        const matchesType = (portType, itemType, itemSubtype) => {
            return portType.type == itemType && (!portType.subtype || portType.subtype == itemSubtype);
        };

        const matchesPort = (item) => {
            if (!this.port.types.some(portType => matchesType(portType, item.type, item.subtype))) {
                return false;
            }

            if (typeFilter && item.type != typeFilter) {
                return false;
            }

            if (this.port.minSize && item.size < this.port.minSize) {
                return false;
            }

            if (this.port.maxSize && item.size > this.port.maxSize) {
                return false;
            }

            if (item.requiredTags && item.requiredTags != this._loadout.vehicle.itemPortTags) {
                return false;
            }

            return true;
        };

		const keys = Object.keys(allItems);
		const filtered = keys.filter(n => matchesPort(allItems[n]));
        return filtered.map(n => allItems[n]).map(n => new ExtendedItem(n, this._makeExtension(n)));
    }

    setItem(itemName) {
        this.item = allItems[itemName];

        if (this.item) {
            this.extension = this._makeExtension(this.item);
            
            this.bindings = {};
            for (const port of Object.values(this.item.ports)) {
                this.bindings[port.name] = new ItemBinding(this._loadout, port, this);
            }
        }
        else {
            this.extension = null;
            this.bindings = {};
        }
    }

    _makeExtension(item) {
        const extensionClass = extensionClasses[item.type];
        if (extensionClass) {
            return new extensionClass(item, this._loadout);
        }
    }
}

class VehicleLoadout {
	constructor(vehicleName) {
        this.vehicle = allVehicles[vehicleName];

        this.bindings = {};
		for (const port of this.vehicle.ports) {
			this.bindings[port.name] = new ItemBinding(this, port, null);
		}

        console.log(this);
    }

    get quantumFuelCapacity() {
        let result = 0;
        this._walkBindings(this, "QuantumFuelTank", (binding) => result += binding.item.capacity);
        return result;
    }

    get hydrogenFuelCapacity() {
        let result = 0;
        this._walkBindings(this, "FuelTank", (binding) => result += binding.item.capacity);
        return result;
    }

    getDefaultItem(path) {
        let container = this.vehicle.defaultItems;
        let entry;

        for (const part of path) {
            entry = container[part];
            if (!entry) {
                return undefined;
            }
            container = entry.children;
        }

        return entry.itemName;
    }

    _walkBindings(container, itemType, callback) {
        for (const binding of Object.values(container.bindings)) {
            if (binding.item) {
                if (binding.item.type == itemType) {
                    callback(binding);
                }
                this._walkBindings(binding, itemType, callback);
            }
        }
    }
}