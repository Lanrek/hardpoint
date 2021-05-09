class Damage {
    constructor(damage) {
        for (const [key, value] of Object.entries(this._sources)) {
            this[key] = damage ? damage[value] : 0;
        }
    }

    get total() {
        let result = 0;
        for (const key of this._keys) {
            result += this[key];
        }

        return result;
    }

    get type() {
        let result;
        for (const key of this._keys) {
            if (this[key] > 0) {
                if (result) {
                    result = "mixed";
                }
                else {
                    result = key;
                }
            }
        }

        return result;
    }

    get _keys() {
        return Object.keys(this._sources);
    }

    get _sources() {
        return {
            "distortion": "damageDistortion",
            "energy": "damageEnergy",
            "physical": "damagePhysical",
            "thermal": "damageThermal"
        };
    }

    add(other) {
        const result = _.cloneDeep(this);
        for (const key of this._keys) {
            result[key] += other[key];
        }

        return result;
    }

    scale(coefficient) {
        const result = _.cloneDeep(this);
        for (const key of this._keys) {
            result[key] *= coefficient;
        }

        return result;
    }
}

class MissileExtensions {
    constructor(item, loadout) {
        this._item = item;
        this._loadout = loadout;
    }

    get damage() {
        return new Damage(this._item.damage);
    }

    get flightTime() {
        return this._item.interceptTime + this._item.terminalTime;
    }

    get flightRange() {
        return this.flightTime * this._item.linearSpeed;
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

class WeaponGunExtensions {
    constructor(item, loadout) {
        this._item = item;
        this._loadout = loadout;
    }

    get ammo() {
        return allAmmoParams[this._item.ammoParamsReference];
    }

    get magazineDuration() {
        return this._item.maxAmmoCount * 60.0 / this._item.weaponAction.fireRate;
    }

    get magazineDamage() {
        return this.alpha.scale(this._item.weaponAction.pelletCount).scale(this._item.maxAmmoCount);
    }

    get range() {
        return this.ammo.speed * this.ammo.lifetime;
    }

    get alpha() {
        let result = new Damage(this.ammo.damage);

        const explosion = new Damage(this.ammo.explosionDamage);
        if (explosion) {
            result = result.add(explosion);
        }

        return result;
    }

    get burstDps() {
        if (!this.ammo) {
            return new Damage();
        }

        return this.alpha.scale(this._item.weaponAction.pelletCount).scale(this._item.weaponAction.fireRate / 60.0);
    }

    get droppedAlpha() {
        if (this.ammo.damageDrop) {
            return new Damage(this.ammo.damageDrop.minDamage);
        }

        return this.alpha;
    }

    get droppedDps() {
        if (this.ammo && this.ammo.damageDrop) {
            return this.droppedAlpha.scale(this._item.weaponAction.pelletCount).scale(this._item.weaponAction.fireRate / 60.0);
        }

        return this.burstDps;
    }

    get dropStartRange() {
        if (this.ammo.damageDrop) {
            // TODO Support other and mixed damage types for damage drop.
            const key = "energy";
            const minDistance = new Damage(this.ammo.damageDrop.minDistance);
            return minDistance[key];
        }
    }

    get dropEndRange() {
        if (this.ammo.damageDrop) {
            // TODO Support other and mixed damage types for damage drop.
            const key = "energy";
            const minDamage = new Damage(this.ammo.damageDrop.minDamage);
            const dropPerMeter = new Damage(this.ammo.damageDrop.dropPerMeter);
            const dropDistance = (this.alpha[key] - minDamage[key]) / dropPerMeter[key];
            return this.dropStartRange + dropDistance;
        }
    }
}

const extensionClasses = {
    MainThruster: ThrusterExtensions,
    ManneuverThruster: ThrusterExtensions,
    Missile: MissileExtensions,
    MissileLauncher: PortContainerExtensions,
    QuantumDrive : QuantumDriveExtensions,
    Turret: PortContainerExtensions,
    TurretBase: PortContainerExtensions,
    WeaponGun: WeaponGunExtensions
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

        this.setItem(undefined);
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

	get customized() {
		// TODO This doesn't handle that case where a port has been set back to its default component,
		// but now has empty child ports -- it shows as not customized, although the children are changed.
		const hasDefaultItem = this.itemName != this._loadout.getDefaultItem(this.path);
		return hasDefaultItem || Object.values(this.bindings).some(n => n.customized);
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

        const setDefaultItems = (container) => {
            for (const binding of Object.values(container.bindings)) {

                binding.setItem(this.getDefaultItem(binding.path));
                setDefaultItems(binding);
            }
        };
        setDefaultItems(this);
    }

    get manufacturerDisplayName() {
		const split = this.vehicle.displayName.split(/[ _]/);
		return split[0].trim();
	}

	get vehicleDisplayName() {
		const split = this.vehicle.displayName.split(/[ _]/);
		return split.slice(1).join(" ").trim();
	}

    get cargoCapacity() {
        let result = 0;
        this._walkBindings(this, "Cargo", (binding) => result += binding.item.cargo);
        return result;
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

    get quantumDrive() {
        let result = {};
        this._walkBindings(this, "QuantumDrive", (binding) => result = binding);
        return result;
    }

    get flightController() {
        let result = {};
        this._walkBindings(this, "FlightController", (binding) => result = binding);
        return result;
    }

    get maxTurnRate() {
        return Math.max(_.get(this, "flightController.item.maxAngularVelocityX"), _.get(this, "flightController.item.maxAngularVelocityZ"));
    }

    get mainAccelerationGs() {
        let result = 0;
        this._walkBindings(this, "MainThruster", (binding) => result += binding.extension.accelerationGs);
        return result;
    }

    get burstDps() {
        let result = 0;
        this._walkBindings(this, "WeaponGun", (binding) => result += binding.extension.burstDps.total);
        return result;
    }

    get shieldCapacity() {
        let result = 0;
        this._walkBindings(this, "Shield", (binding) => result += binding.item.maxShieldHealth);
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

const defaultLoadouts = {};
for (const vehicleName of Object.keys(allVehicles)) {
    defaultLoadouts[vehicleName] = new VehicleLoadout(vehicleName);
}