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
        const result = _.clone(this);
        for (const key of this._keys) {
            result[key] += other[key];
        }

        return result;
    }

    scale(coefficient) {
        const result = _.clone(this);
        for (const key of this._keys) {
            result[key] *= coefficient;
        }

        return result;
    }
}

class DefaultExtension {
    constructor(binding, item) {
        this._binding = binding;
        this._item = item;
        this._loadout = binding._loadout;
    }

    get powerConsumed() {
        if (this._item.power) {
            if (this._binding.powerLevel == "active") {
                return this._item.power.powerDraw;
            }
            else {
                return this._item.power.powerBase;
            }
        }

        return 0;
    }

    get emSignature() {
        if (this._item.power) {
            return this.powerConsumed * this._item.power.powerToEM;
        }

        return 0;
    }
}

class ContainerExtension extends DefaultExtension {
    get cargo() {
        let result = 0;

        // TODO This only looks one level deep at defaults; good enough for now...
        if (this._item.defaultItems) {
            for (const defaultEntry of Object.values(this._item.defaultItems)) {
                const defaultItem = allItems[defaultEntry.itemName];
                if (defaultItem && defaultItem.cargo) {
                    result += defaultItem.cargo;
                }
            }
        }

        return result;
    }
}

class MissileExtension extends DefaultExtension {
    get damage() {
        return new Damage(this._item.damage);
    }
}

class PortContainerExtension extends DefaultExtension {
    get portCount() {
        return Object.keys(this._item.ports).length;
    }

    get maxPortSize() {
        if (this.portCount != 0) {
            return Object.values(this._item.ports)[0].maxSize;
        }
    }
}

class PowerPlantExtension extends DefaultExtension {
    get powerConsumed() {
        return 0;
    }

    get powerProduced() {
        return this._item.power.powerDraw;
    }

    get emSignature() {
        return this.powerProduced * this._item.power.powerToEM * this._loadout.powerUsagePercent / 100;
    }
}

class QuantumDriveExtension extends DefaultExtension {
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

class ThrusterExtension extends DefaultExtension {
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

class TurretExtension extends PortContainerExtension {
    get powerConsumed() {
        if (this._item.power) {
            return this._item.power.powerDraw;
        }

        return 0;
    }
}

class WeaponGunExtension extends DefaultExtension {
    get ammo() {
        return allAmmoParams[this._item.ammoParamsReference];
    }

    get magazineDuration() {
        return this._item.maxAmmoCount * 60.0 / this._item.weaponAction.fireRate;
    }

    get magazineDamage() {
        return this.alpha.scale(this._item.weaponAction.pelletCount).scale(this._item.maxAmmoCount);
    }

    get energyLoadType() {
        return this._binding.port.connections.WeaponAmmoLoad || this._binding.parent.port.connections.WeaponAmmoLoad;
    }

    get requestedWeaponRegen() {
        if (this._binding.powerLevel == "active") {
            return this._item.requestedRegenPerSec || 0;
        }

        return 0;
    }

    get requestedAmmoLoad() {
        if (this._binding.powerLevel == "active") {
            return this._item.requestedAmmoLoad || 0;
        }

        return 0;
    }

    get availableEnergyLoad() {
        return this.requestedAmmoLoad / Math.max(1.0, this._loadout.ammoLoadUsage[this.energyLoadType]);
    }

    get availableEnergyRegen() {
        return this.requestedWeaponRegen / Math.max(1.0, this._loadout.weaponRegenUsage[this.energyLoadType]);
    }

    get energyLoad() {
        return Math.ceil(this.availableEnergyLoad / this._item.regenerationCostPerBullet);
    }

    get energyLoadDuration() {
        return this.energyLoad * 60.0 / this._item.weaponAction.fireRate;
    }

    get energyLoadDamage() {
        return this.alpha.scale(this._item.weaponAction.pelletCount).scale(this.energyLoad);
    }

    get energyLoadRegen() {
        return this.availableEnergyLoad / this.availableEnergyRegen;
    }

    get range() {
        if (!this.ammo) {
            return 0;
        }

        return this.ammo.speed * this.ammo.lifetime;
    }

    get alpha() {
        if (!this.ammo) {
            return new Damage();
        }

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
        if (this.ammo && this.ammo.damageDrop) {
            // TODO Support other and mixed damage types for damage drop.
            const key = "energy";
            const minDistance = new Damage(this.ammo.damageDrop.minDistance);
            return minDistance[key];
        }
    }

    get dropEndRange() {
        if (this.ammo && this.ammo.damageDrop) {
            // TODO Support other and mixed damage types for damage drop.
            const key = "energy";
            const minDamage = new Damage(this.ammo.damageDrop.minDamage);
            const dropPerMeter = new Damage(this.ammo.damageDrop.dropPerMeter);
            const dropDistance = (this.alpha[key] - minDamage[key]) / dropPerMeter[key];
            return this.dropStartRange + dropDistance;
        }
    }
}

class WeaponRegenPoolExtension extends DefaultExtension {
    get energyLoadType() {
        return this._binding.port.connections.WeaponAmmoLoad || this._binding.parent.port.connections.WeaponAmmoLoad;
    }

    get availableWeaponRegen() {
        if (this._binding.powerLevel == "active") {
            return this._item.regenFillRate;
        }

        return 0;
    }

    get availableAmmoLoad() {
        if (this._binding.powerLevel == "active") {
            return this._item.ammoLoad;
        }

        return 0;
    }
}

const extensionClasses = {
    Container: ContainerExtension,
    MainThruster: ThrusterExtension,
    ManneuverThruster: ThrusterExtension,
    Missile: MissileExtension,
    MissileLauncher: PortContainerExtension,
    PowerPlant: PowerPlantExtension,
    QuantumDrive : QuantumDriveExtension,
    Turret: TurretExtension,
    TurretBase: TurretExtension,
    WeaponGun: WeaponGunExtension,
    WeaponRegenPool: WeaponRegenPoolExtension
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

        this.powerLevel = "active";

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
        // Don't consider ports without significant types customized.
        if (!this.port.types.some(t => significantTypes.includes(t.type))) {
            return false;
        }

        const defaultItemName = this._loadout.getDefaultItem(this.path) || this._defaultItem();
        return this.itemName != defaultItemName || Object.values(this.bindings).some(n => n.customized);
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

            for (const tag of item.requiredTags) {
                if (!this.port.requiredTags.includes(tag) && !this._loadout.vehicle.itemPortTags.includes(tag)) {
                    return false;
                }
            }

            for (const tag of this.port.requiredTags) {
                if (!item.requiredTags.includes(tag)) {
                    return false;
                }
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
                const child = new ItemBinding(this._loadout, port, this);

                const defaultItemName = child._defaultItem();
                if (defaultItemName && defaultItemName in allItems) {
                    child.setItem(defaultItemName);
                }

                this.bindings[port.name] = child;
            }
        }
        else {
            this.extension = null;
            this.bindings = {};
        }
    }

    _defaultItem() {
        if (this.parent) {
            return _.get(this.parent, "item.defaultItems." + this.port.name + ".itemName");
        }
    }

    _makeExtension(item) {
        const extensionClass = extensionClasses[item.type] || DefaultExtension;
        const extension = new extensionClass(this, item);
        return extension;
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
                // Skip items added by their parent item's default loadout.
                if (!binding.item) {
                    binding.setItem(this.getDefaultItem(binding.path));
                    setDefaultItems(binding);
                }
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

    get vehicleType() {
        if (!this.flightController.item) {
            return "Ground";
        }

        return "Space";
    }

    get sizeCategory() {
        const categories = {
            1: "Small",
            2: "Small",
            3: "Medium",
            4: "Large",
            5: "Large",
            6: "Capital"
        }

        return categories[this.vehicle.size];
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
        if (this.flightController.item) {
            let result = 0;
            this._walkBindings(this, "MainThruster", (binding) => {
                if (binding.item.thrusterType == "Main") {
                    result += binding.extension.accelerationGs;
                }
            });
            return result;
        }
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

    get ammoLoadUsage() {
        const result = {
            "WeaponAmmoLoadCrew": 0,
            "WeaponAmmoLoadTurret": 0
        };

        for (const key of Object.keys(result)) {
            let produced = 0;
            let consumed = 0;
            this._walkBindings(this, "WeaponRegenPool", (binding) => {
                if (binding.extension.energyLoadType == key) {
                    produced += binding.extension.availableAmmoLoad;
                }
            });
            this._walkBindings(this, "WeaponGun", (binding) => {
                if (binding.extension.energyLoadType == key) {
                    consumed += binding.extension.requestedAmmoLoad;
                }
            });

            result[key] = consumed / produced;
        }

        return result;
    }

    get weaponRegenUsage() {
        const result = {
            "WeaponAmmoLoadCrew": 0,
            "WeaponAmmoLoadTurret": 0
        };

        for (const key of Object.keys(result)) {
            let produced = 0;
            let consumed = 0;
            this._walkBindings(this, "WeaponRegenPool", (binding) => {
                if (binding.extension.energyLoadType == key) {
                    produced += binding.extension.availableWeaponRegen;
                }
            });
            this._walkBindings(this, "WeaponGun", (binding) => {
                if (binding.extension.energyLoadType == key) {
                    consumed += binding.extension.requestedWeaponRegen;
                }
            });

            result[key] = consumed / produced;
        }

        return result;
    }

    get powerUsagePercent() {
        let powerProduced = 0;
        let powerConsumed = 0;
        this._walkBindings(this, undefined, (binding) => {
            if (binding.item.type == "PowerPlant") {
                powerProduced += binding.extension.powerProduced;
            }

            powerConsumed += binding.extension.powerConsumed;
        });

        return 100 * powerConsumed / powerProduced;
    }

    get emSignature() {
        let result = 0;
        this._walkBindings(this, undefined, (binding) => result += binding.extension.emSignature);
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
                if (!itemType || binding.item.type == itemType) {
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