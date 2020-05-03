var makeCustomizationUrl = function() {
	let url = new URL(location.href);
	url.hash = ["/customize"].concat(url.hash.split("/").slice(-1)).join("/");
	return url;
};

var copyShareableLink = new ClipboardJS(".clipboard-button", {
	text: function() {
		const link = makeCustomizationUrl().href;
		sendEvent("Customize", "CopyLink", link);
		return link;
	}
});

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

var hashAndEncode = function(str) {
	const hash = hashString(str);
	return encodeInt24(hash);
}

// Limited to ints between 0 and 25.
var encodeSmallInt = function(num) {
	const start = "A";
	return String.fromCharCode(start.charCodeAt(0) + num);
}

var decodeSmallInt = function(str) {
	const start = "A";
	const num = str.charCodeAt(0);
	return num - start.charCodeAt(0);
}

var nullifySentinel = function(str) {
	if (str && str.startsWith("<=")) {
		return null;
	}

	return str;
}

var elementArray = function(value) {
	if (Array.isArray(value)) {
		return value;
	}

	return [value];
}

var splitTags = function(value) {
	if (value) {
		return value.split(" ");
	}

	return [];
}

var roundThreeFigures = function(num) {
	let places = 2;
	if (Math.abs(num) > 100) {
		places = 0;
	}
	else if (Math.abs(num) > 10) {
		places = 1;
	}

	return num.toFixed(places);
}

var formatNumber = function(num) {
	if (num.toFixed) {
		if (num >= 1000000000) {
			return num.toExponential();
		}

		return (+roundThreeFigures(num)).toLocaleString();
	}

	return num;
}

var sendEvent = function(category, action, label) {
	gtag('event', action, {
		'event_category': category,
		'event_label': label
	});
}


class ShipId {
	constructor(specificationId, modificationId, loadoutId) {
		this.specificationId = specificationId;
		this.modificationId = modificationId;
		this.loadoutId = loadoutId;
	}

	get combinedId() {
		return ShipId._makeCombinedId(this.specificationId, this.modificationId);
	}

	serialize() {
		return hashAndEncode(this.specificationId) + hashAndEncode(this.modificationId) + hashAndEncode(this.loadoutId);
	}

	static deserialize(str) {
		const hashedSpecificationId = str.substr(0, 4);
		const hashedModificationId = str.substr(4, 4);
		const hashedLoadoutId = str.substr(8, 4);

		const shipIds = Object.values(allVehicles).map(n => n.shipId);
		const specificationId = shipIds.find(
			n => hashAndEncode(n.specificationId) == hashedSpecificationId).specificationId;
		const modificationId = shipIds.find(
			n => hashAndEncode(n.modificationId) == hashedModificationId).modificationId;;

		return new ShipId(
			specificationId,
			modificationId,
			undefined);
	}

	static _makeCombinedId(specificationId, modificationId) {
		let key = specificationId;
		if (modificationId) {
			key += "_" + modificationId;
		}

		return key;
	}
}

class ShipSpecification {
	constructor(key, data) {
		this.name = key;
		this._data = data;

		this.itemPorts = this._findItemPorts();
		this.defaultItems = this._makeDefaultItems();
	}

	get tags() {
		return splitTags(this._data["@itemPortTags"]);
	}

	get shipId() {
		return new ShipId(
			this._data["@name"],
			this._data["#modification"]);
	}

	get displayName() {
		return nullifySentinel(allStrings[this._data["#vehicleName"]]) || this.shipId.combinedId;
	}

	get attributes() {
		const seats = this.itemPorts.filter(p => p.matchesType("Seat"));
		const crewSeats = seats.filter(s => s.hasControllerMfd);

		const mannedTurrets = this.itemPorts.filter(p => p.matchesType("TurretBase", "MannedTurret"));

		const spaceship = _.get(this._data, "MovementParams.Spaceship");
		const size = this._data["@size"];
		let sizeCategory = "Small";
		if (!spaceship) {
			sizeCategory = "Ground";
		}
		else if (size >= 4) {
			sizeCategory = "Large";
		}
		else if (size >= 3) {
			sizeCategory = "Medium";
		}

		return [
			{
				name: "Size Category",
				category: "Description",
				description: "Based on physical dimensions and mass",
				value: sizeCategory
			},
			{
				name: "Crew",
				category: "Description",
				description: "Seats with controls plus manned turrets",
				value: crewSeats.length + mannedTurrets.length
			},
			{
				name: "Total Hitpoints",
				category: "Survivability",
				description: "Total hitpoints of all ship parts -- damage to critical parts will destroy a ship faster than this implies",
				value: this._findParts().reduce((total, x) => total + (x["@damageMax"] || 0), 0)
			}
		];
	}

	_findParts(className = undefined) {
		let unsearched = elementArray(_.get(this._data, "Parts.Part", [])).slice();
		let result = [];
		while (unsearched.length > 0) {
			let potential = unsearched.pop();
			if (potential["@class"] == className || !className) {
				result.push(potential);
			}

			const inside = elementArray(_.get(potential, "Parts.Part", []))
			inside.forEach(n => unsearched.push(n));
		}

		return result;
	}

	_findItemPorts() {
		return this._findParts("ItemPort").map(x => new VehicleItemPort(x));
	}

	_makeDefaultItems() {
		return allLoadouts[this.name];
	}
}

class DamageQuantity {
	constructor(distortion, energy, physical, thermal) {
		this._values = [distortion, energy, physical, thermal];
	}

	static fromDamageInfo(damageInfo) {
		return new DamageQuantity(
			_.get(damageInfo, "@DamageDistortion", 0),
			_.get(damageInfo, "@DamageEnergy", 0),
			_.get(damageInfo, "@DamagePhysical", 0),
			_.get(damageInfo, "@DamageThermal", 0));
	}

	static _fromValueArray(values) {
		return new DamageQuantity(values[0], values[1], values[2], values[3]);
	}

	get distortion() {
		return this._values[0];
	}

	get energy() {
		return this._values[1];
	}

	get physical() {
		return this._values[2];
	}

	get thermal() {
		return this._values[3];
	}

	get total() {
		return this._values.reduce((total, x) => total + x, 0);
	}

	get type() {
		const count = this._values.reduce((total, x) => x > 0 ? total + 1 : total, 0);
		if (count > 1) {
			return "mixed"
		}
		else if (this.distortion > 0) {
			return "distortion";
		}
		else if (this.energy > 0) {
			return "energy";
		}
		else if (this.physical > 0) {
			return "physical";
		}
		else if (this.thermal > 0) {
			return "thermal";
		}
		else {
			return "none";
		}
	}

	add(quantity) {
		return DamageQuantity._fromValueArray(this._values.map((x, index) => x + quantity._values[index]));
	}

	scale(coefficient) {
		return DamageQuantity._fromValueArray(this._values.map(x => x * coefficient));
	}
}

class SummaryText {
	constructor(patterns, component, binding) {
		this.patterns = patterns;
		this.component = component;
		this.binding = binding;

		if (!this.patterns) {
			this.patterns = ["No further information available"];
		}
	}

	render(reference) {
		const getValue = key => {
			let value = this.component.getValue(key, this.binding);

			let type = "summary-value";
			if (reference && this.component.type == reference.type && this.component.name != reference.name) {
				type = "summary-value-equal";
				const baseline = reference.getValue(key, this.binding);

				if (baseline && typeof baseline != "string") {
					let increase = (a, b) => a > b;
					if (DataforgeComponent.reversedValues.includes(key)) {
						increase = (a, b) => a < b;
					}

					if (increase(value, baseline)) {
						type = "summary-value-increase";
					}
					if (increase(baseline, value)) {
						type = "summary-value-decrease";
					}
				}
			}

			value = formatNumber(value);
			return '<span class="' + type + '">' + value + '</span>';
		};

		const expanded = this.patterns.map(p => {
			const replaced = p.replace(/{[^}]+}/g, n => getValue(n.slice(1, -1)));
			return "<p>" + replaced + "</p>";
		}).join("");

		return '<span class="summary">' + expanded + '</span>';
	}
}

class DataforgeComponent {
	constructor(key, data) {
		this.name = key

		this._data = data;

		// TODO Support multiple firing modes.
		const fireAction = elementArray(_.get(this._data, "Components.SCItemWeaponComponentParams.fireActions", []))[0];

		// TODO Figure out firing action sequences.
		this._weaponSequence = elementArray(_.get(
			fireAction,
			"SWeaponActionSequenceParams.sequenceEntries.SWeaponSequenceEntryParams", []));
		this._defaultFireAction = _.get(this._weaponSequence, "[0].weaponAction", fireAction);

		this.itemPorts = this._findItemPorts();
		this._pitchLimits = this._makePitchLimits();
	}

	static get reversedValues() {
		return [
			"gunHeatPerShot",
			"powerBase",
			"powerIncrease",
			"shieldDownDelay",
			"quantumEfficiency",
			"quantumCalibrationTime",
			"quantumSpoolTime",
			"quantumCooldown",
			"missileLockTime",
			"powerToEm",
			"temperatureToIr",
			"flightAngularPower",
			"flightLinearPower"
		];
	}

	get displayName() {
		const key = _.get(this._data, "Components.SAttachableComponentParams.AttachDef.Localization.@Name");
		return nullifySentinel(allStrings[key]) || this.name;
	}

	get type() {
		return _.get(this._data, "Components.SAttachableComponentParams.AttachDef.@Type");
	}

	get subtype() {
		return _.get(this._data, "Components.SAttachableComponentParams.AttachDef.@SubType");
	}

	get size() {
		return _.get(this._data, "Components.SAttachableComponentParams.AttachDef.@Size");
	}

	get requiredTags() {
		return splitTags(_.get(this._data, "Components.SAttachableComponentParams.AttachDef.@RequiredTags"));
	}

	get turretInflections() {
		const inflections = this._pitchLimits.slice(0, -1).map(x => x["turretRotation"]);

		// Normalize to [-180, 180] which appear to be the bounds used elsewhere.
		return inflections.map(x => ((x + 180) % 360) - 180);
	}

	getTurretPitchRange(binding, yaw) {
		let result = {
			"min": this.getTurretMinPitch(binding),
			"max": this.getTurretMaxPitch(binding)
		};

		if (this._pitchLimits.length) {
			// Limits in game data appear normalized to [0, 360].
			const normalizedYaw = (360 + yaw % 360) % 360;

			const upperIndex = _.findIndex(this._pitchLimits, x => x["@TurretRotation"] > normalizedYaw);
			const upper = this._pitchLimits[upperIndex];
			const lower = this._pitchLimits[upperIndex - 1];

			// Interpolate between the surrounding points.
			const alpha = (normalizedYaw - lower["@TurretRotation"]) / (upper["@TurretRotation"] - lower["@TurretRotation"]);
			const lowerLimit = lower["@LowestAngle"] * (1 - alpha) + upper["@LowestAngle"] * alpha;
			const upperLimit = lower["@HighestAngle"] * (1 - alpha) + upper["@HighestAngle"] * alpha;

			result.min = Math.max(result.min, lowerLimit);
			result.max = Math.min(result.max, upperLimit);
		}

		return result;
	}

	getValue(name, binding) {
		const split = name.split(".");
		const remainder = split.slice(1).join(".");

		let first = this[split[0]];
		const getterName = "get" + split[0].charAt(0).toUpperCase() + split[0].slice(1);
		const getter = this[getterName];
		if (getter) {
			first = getter.call(this, binding);
		}

		let result = first;
		if (remainder) {
			result = _.get(first, remainder);
		}

		if (result == undefined) {
			console.log("Warning: Failed to retrieve component value " + name + " for " + this.name);
			console.log(this._data);
		}
		return result;
	}

	getTurretMinYaw(binding) {
		let candidates = [-180];
		candidates.push(binding.port.minYaw);
		candidates.push(this._getStandardTurretRotationLimit("yaw", "@LowestAngle"));

		// Undefined will always sort to the end.
		candidates.sort((a, b) => b - a);
		return candidates[0];
	}

	getTurretMaxYaw(binding) {
		let candidates = [180];
		candidates.push(binding.port.maxYaw);
		candidates.push(this._getStandardTurretRotationLimit("yaw", "@HighestAngle"));

		// Undefined will always sort to the end.
		candidates.sort((a, b) => a - b);
		return candidates[0];
	}

	getTurretMinPitch(binding) {
		let candidates = [-90];
		candidates.push(binding.port.minPitch);
		candidates.push(this._getStandardTurretRotationLimit("pitch", "@LowestAngle"));

		// Undefined will always sort to the end.
		candidates.sort((a, b) => b - a);
		return candidates[0];
	}

	getTurretMaxPitch(binding) {
		let candidates = [90];
		candidates.push(binding.port.maxPitch);
		candidates.push(this._getStandardTurretRotationLimit("pitch", "@HighestAngle"));

		// Undefined will always sort to the end.
		candidates.sort((a, b) => a - b);
		return candidates[0];
	}

	getBulletSpeed(binding) {
		return _.get(this._data, "#ammoParams.@speed", 0);
	}

	getBulletDuration(binding) {
		return _.get(this._data, "#ammoParams.@lifetime", 0);
	}

	getBulletRange(binding) {
		return this.getBulletSpeed(binding) * this.getBulletDuration(binding);
	}

	getTachyonZeroDamageRange(binding) {
		return _.get(this._data, "#ammoParams.projectileParams.TachyonProjectileParams.@zeroDamageRange", 0);
	}

	getTachyonFullDamageRange(binding) {
		return _.get(this._data, "#ammoParams.projectileParams.TachyonProjectileParams.@fullDamageRange", 0);
	}

	getBulletCount(binding) {
		return _.get(_.values(this._defaultFireAction)[0], "launchParams.SProjectileLauncher.@pelletCount", 1);
	}

	getGunAlpha(binding) {
		const bullet = _.get(this._data, "#ammoParams.projectileParams.BulletProjectileParams");
		const bulletInfo = _.get(bullet, "damage.DamageInfo");
		const explosionInfo = _.get(bullet, "detonationParams.ProjectileDetonationParams.explosionParams.damage.DamageInfo");

		// TODO Need to model charged firing actions.
		const tachyonTotal = _.get(
			this._data, "#ammoParams.projectileParams.TachyonProjectileParams.damage.DamageParams.@damageTotal", 0);
		const tachyonDamage = new DamageQuantity(0, tachyonTotal, 0, 0);

		return tachyonDamage.add(DamageQuantity.fromDamageInfo(bulletInfo).add(DamageQuantity.fromDamageInfo(explosionInfo)));
	}

	getGunFireRate(binding) {
		return _.get(_.values(this._defaultFireAction)[0], "@fireRate", 0);
	}

	getGunBurstDps(binding) {
		const scaled = this.getGunAlpha(binding).scale(this.getBulletCount(binding) * this.getGunFireRate(binding) / 60.0);
		return scaled;
	}

	getGunStandbyHeat(binding) {
		return _.get(this._data, "Components.SCItemWeaponComponentParams.connectionParams.@heatRateOnline", 0);
	}

	getGunHeatPerShot(binding) {
		return _.get(_.values(this._defaultFireAction)[0], "@heatPerShot", 0);
	}

	getGunMaxCoolingPerShot(binding) {
		const secondsPerShot = 60.0 / this.getGunFireRate(binding);
		const maxCoolingEnergy = this.maxCooling * this.specificHeatCapacity;
		return maxCoolingEnergy * secondsPerShot;
	}

	getGunSustainedDps(binding) {
		const coolingEnergy = this.maxCooling * this.specificHeatCapacity * binding.customization.coolingEfficiency;

		let fireRate = this.getGunFireRate(binding);
		fireRate *= Math.min(1, coolingEnergy / this.getHeatingEnergy(binding)) || 0;

		const scaled = this.getGunAlpha(binding).scale(this.getBulletCount(binding) * fireRate / 60.0);
		return scaled;
	}

	getGunMaximumAmmo(binding) {
		return _.get(this._data, "Components.SAmmoContainerComponentParams.@maxAmmoCount", 0);
	}

	getGunMagazineDuration(binding) {
		return this.getGunMaximumAmmo(binding) * 60.0 / this.getGunFireRate(binding);
	}

	getGunMagazineDamage(binding) {
		return this.getGunAlpha(binding).scale(this.getBulletCount(binding) * this.getGunMaximumAmmo(binding));
	}

	getMissileDamage(binding) {
		const damageInfo = _.get(this._data, "Components.SCItemMissileParams.explosionParams.damage.DamageInfo");
		return DamageQuantity.fromDamageInfo(damageInfo);
	}

	getMissileRange(binding) {
		return _.get(this._data, "Components.SCItemMissileParams.targetingParams.@trackingDistanceMax", 0);
	}

	getMissileGuidance(binding) {
		return _.get(this._data, "Components.SCItemMissileParams.targetingParams.@trackingSignalType", "CrossSection");
	}

	getMissileTrackingAngle(binding) {
		return _.get(this._data, "Components.SCItemMissileParams.targetingParams.@trackingAngle", 0);
	}

	getMissileLockTime(binding) {
		return _.get(this._data, "Components.SCItemMissileParams.targetingParams.@lockTime", 0);
	}

	getMissileMaximumSpeed(binding) {
		return _.get(this._data, "Components.SCItemMissileParams.GCSParams.@linearSpeed", 0);
	}

	getMissileFlightTime(binding) {
		return _.get(this._data, "Components.SCItemMissileParams.GCSParams.@interceptTime", 0) +
			_.get(this._data, "Components.SCItemMissileParams.GCSParams.@terminalTime", 0);
	}

	getMissileFlightRange(binding) {
		return this.getMissileMaximumSpeed(binding) * this.getMissileFlightTime(binding);
	}

	getShieldCapacity(binding) {
		return _.get(this._data, "Components.SCItemShieldGeneratorParams.@MaxShieldHealth", 0);
	}

	getShieldRegeneration(binding) {
		return _.get(this._data, "Components.SCItemShieldGeneratorParams.@MaxShieldRegen", 0);
	}

	getShieldDownDelay(binding) {
		return _.get(this._data, "Components.SCItemShieldGeneratorParams.@DownedRegenDelay", 0);
	}

	getQuantumFuel(binding) {
		return _.get(this._data, "Components.SCItemFuelTankParams.@capacity", 0);
	}

	getQuantumRange(binding) {
		// Underlying unit appears to be kilometers; convert to gigameters.
		return _.get(this._data, "Components.SCItemQuantumDriveParams.@jumpRange", 0) / 1000000;
	}

	getQuantumEfficiency(binding) {
		// Underlying unit is fuel used per megameter travelled; convert to fuel/gigameter.
		return _.get(this._data, "Components.SCItemQuantumDriveParams.@quantumFuelRequirement", 0) * 1000;
	}

	getQuantumSpeed(binding) {
		// Underlying unit appears to be m/sec; convert to megameters/sec.
		return _.get(this._data, "Components.SCItemQuantumDriveParams.params.@driveSpeed", 0) / 1000000;
	}

	getQuantumCooldown(binding) {
		return _.get(this._data, "Components.SCItemQuantumDriveParams.params.@cooldownTime", 0);
	}

	getQuantumSpoolTime(binding) {
		return _.get(this._data, "Components.SCItemQuantumDriveParams.params.@spoolUpTime", 0);
	}

	getQuantumCalibrationTime(binding) {
		const required = _.get(this._data, "Components.SCItemQuantumDriveParams.params.@maxCalibrationRequirement", 0);
		const rate = _.get(this._data, "Components.SCItemQuantumDriveParams.params.@calibrationRate", 0);
		return required / rate;
	}

	get cargoCapacity() {
		// Capacity for cargo grids, both on ships and embedded into containers.
		const getScuDimension = (key) => {
			return Math.floor( _.get(dimensions, key, 0) / 1.25);
		};
		const dimensions =  _.get(this._data, "Components.SCItemCargoGridParams.dimensions", 0);

		let capacity = getScuDimension("@x") * getScuDimension("@y") * getScuDimension("@z");

		// TODO This is fairly hacky; probably need a generic system for embedded items eventually.
		const embedded = _.get(this._data, "#embedded", {});
		for (const entry of _.values(embedded)) {
			const item = allItems[entry["itemName"]];
			capacity += _.get(item, "cargoCapacity", 0);
		}

		return capacity;
	}

	getSpeed(binding) {
		return _.get(this._data, "Components.IFCSParams.@maxSpeed", 0);
	}

	getAfterburner(binding) {
		return _.get(this._data, "Components.IFCSParams.@maxAfterburnSpeed", 0);
	}

	getAngularVelocityPitch(binding) {
		return _.get(this._data, "Components.IFCSParams.maxAngularVelocity.@x", 0);
	}

	getAngularVelocityRoll(binding) {
		return _.get(this._data, "Components.IFCSParams.maxAngularVelocity.@y", 0);
	}

	getAngularVelocityYaw(binding) {
		return _.get(this._data, "Components.IFCSParams.maxAngularVelocity.@z", 0);
	}

	getThrusterType(binding) {
		return _.get(this._data, "Components.SCItemThrusterParams.@thrusterType");
	}

	getPowerUsage(binding) {
		if (binding.powerSelector == "Active") {
			return this.getPowerDraw(binding);
		}

		if (binding.powerSelector == "Standby") {
			if (this.type == "Turret" || this.type == "TurretBase") {
				// Turrets seem to draw power even when not being actively rotated.
				return this.getPowerDraw(binding);
			}

			return this.getPowerBase(binding);
		}

		return 0;
	}

	getPowerBase(binding) {
		if (this.type != "PowerPlant") {
			return _.get(this._data, "Components.EntityComponentPowerConnection.@PowerBase", 0);
		}

		return 0;
	}

	getPowerDraw(binding) {
		if (this.type != "PowerPlant") {
			return _.get(this._data, "Components.EntityComponentPowerConnection.@PowerDraw", 0);
		}

		return 0;
	}

	getPowerIncrease(binding) {
		return this.getPowerDraw(binding) - this.getPowerBase(binding);
	}

	getPowerAvailable(binding) {
		if (this.type == "PowerPlant" && binding.powerSelector != "Off") {
			return _.get(this._data, "Components.EntityComponentPowerConnection.@PowerDraw", 0);
		}

		return 0;
	}

	getPowerGeneration(binding) {
		if (this.type == "PowerPlant") {
			return this.getPowerAvailable(binding) * Math.min(1, binding.customization.powerUsageRatio || 0);
		}

		return 0;
	}

	getPowerToEm(binding) {
		return _.get(this._data, "Components.EntityComponentPowerConnection.@PowerToEM", 0);
	}

	getTemperatureToIr(binding) {
		return _.get(this._data, "Components.EntityComponentHeatConnection.@TemperatureToIR", 0);
	}

	get startCoolingTemperature() {
		return _.get(this._data, "Components.EntityComponentHeatConnection.@StartCoolingTemperature", 0);
	}

	get specificHeatCapacity() {
		// Joules / Kelvin; mass and SHC are specified with identical units.
		return _.get(this._data, "Components.EntityComponentHeatConnection.@SpecificHeatCapacity", 0) *
			_.get(this._data, "Components.EntityComponentHeatConnection.@Mass", 0);
	}

	get maxCooling() {
		// Kelvin / second
		return _.get(this._data, "Components.EntityComponentHeatConnection.@MaxCoolingRate", 0);
	}

	getOverheatTemperature(binding) {
		return _.get(this._data, "Components.EntityComponentHeatConnection.@OverheatTemperature", 0);
	}

	getOverheatTime(binding) {
		const heatingEnergy = this.getHeatingEnergy(binding);
		const coolingEnergy = this.maxCooling * this.specificHeatCapacity * binding.customization.coolingEfficiency;

		const temperatureDelta = this.getOverheatTemperature(binding) - this.startCoolingTemperature;
		const overheatEnergy = temperatureDelta * this.specificHeatCapacity;

		return overheatEnergy / (heatingEnergy - coolingEnergy);
	}

	getCurrentTemperature(binding) {
		// TODO Implement!
		return 0;
	}

	getHeatingEnergy(binding) {
		const base = _.get(this._data, "Components.EntityComponentHeatConnection.@ThermalEnergyBase", 0);
		const draw = _.get(this._data, "Components.EntityComponentHeatConnection.@ThermalEnergyDraw", 0);

		if (this.type == "PowerPlant") {
			if (binding.powerSelector == "Active") {
				const ratio = this.getPowerGeneration(binding) / this.getPowerAvailable(binding);
				return ratio * draw;
			}
		}

		if (this.type == "WeaponGun") {
			if (binding.powerSelector == "Active") {
				// TODO This is a terrible hack, but it exactly matches empirical data. Either there's a bug with
				// weapon sequences -- maybe delay-related -- or I'm missing a large part of the heating equation.
				let fireRate = this.getGunFireRate(binding);
				if (this._weaponSequence.length > 1) {
					fireRate = 258;
				}

				return this.getGunHeatPerShot(binding) * fireRate / 60.0;
			}
		}

		if (binding.powerSelector == "Active") {
			return draw;
		}

		if (binding.powerSelector == "Standby") {
			return base;
		}

		return 0;
	}

	getCoolingUsage(binding) {
		// TODO Doesn't account for radiative cooling.
		if (this.specificHeatCapacity == 0) {
			return 0;
		}

		const maxCoolingEnergy = this.maxCooling * this.specificHeatCapacity;
		return Math.min(this.getHeatingEnergy(binding), maxCoolingEnergy);
	}

	getCoolingAvailable(binding) {
		if (this.type == "Cooler" && binding.powerSelector != "Off") {
			return _.get(this._data, "Components.SCItemCoolerParams.@CoolingRate", 0);
		}

		return 0;
	}

	getCoolingEfficiency(binding) {
		return binding.customization.coolingEfficiency;
	}

	getEmSignature(binding) {
		const powerFlow = (this.getPowerGeneration(binding) + this.getPowerUsage(binding));
		return powerFlow * this.getPowerToEm(binding);
	}

	getIrSignature(binding) {
		return this.getCurrentTemperature(binding) * this.getTemperatureToIr(binding);
	}

	getSummary(binding) {
		if (this.type == "WeaponGun") {
			let damage = "{gunAlpha.total}";
			if (this.getBulletCount(binding) > 1) {
				damage += " X {bulletCount}";
			}

			let summary = new SummaryText([
				"{gunBurstDps.total} dps = " + damage + " {gunAlpha.type} damage X {gunFireRate} rpm",
				"{gunSustainedDps.total} sustained dps ({gunHeatPerShot} heat/shot; {gunMaxCoolingPerShot} max cooling/shot X {coolingEfficiency} efficiency)"],
				this, binding);

			if (this.getOverheatTime(binding) > 0) {
				summary.patterns.push("Overheats after {overheatTime} seconds of continuous fire");
			}

			if (this.getTachyonFullDamageRange(binding) > 0)
			{
				summary.patterns.push("{tachyonZeroDamageRange} meter range with reduced damage after {tachyonFullDamageRange} meters");
			}
			else {
				summary.patterns.push("{bulletRange} meter range = {bulletSpeed} m/s projectile speed X {bulletDuration} seconds");
			}

			if (this.getGunMaximumAmmo(binding) > 0) {
				summary.patterns.push("{gunMaximumAmmo} rounds deplete in {gunMagazineDuration} seconds for potentially {gunMagazineDamage.total} damage");
			}

			return summary;
		}

		if (this.type == "Turret" || this.type == "TurretBase") {
			if (this.itemPorts[0]) {
				return new SummaryText(["{itemPorts.length} size {itemPorts.[0].maxSize} item ports"], this, binding);
			}
		}

		if (this.type == "MissileLauncher") {
			return new SummaryText(["{itemPorts.length} size {itemPorts.[0].maxSize} missiles"], this, binding);
		}

		if (this.type == "Shield") {
			return new SummaryText([
				"{shieldCapacity} shield capacity",
				"Regenerates {shieldRegeneration} capacity/second with a {shieldDownDelay} second delay after dropping"],
				this, binding);
		}

		if (this.type == "QuantumDrive") {
			return new SummaryText([
				"{quantumRange} gigameter jump distance at {quantumSpeed} megameters/sec",
				"Consumes {quantumEfficiency} fuel per gigameter",
				"Calibrates in no less than {quantumCalibrationTime} seconds and spools in {quantumSpoolTime} seconds",
				"{quantumCooldown} second cooldown after jumping"],
				this, binding);
		}

		if (this.type == "Missile") {
			return new SummaryText([
				"{missileDamage.total} {missileDamage.type} damage",
				"{missileLockTime} seconds lock time with {missileRange} meter lock range",
				"{missileGuidance} sensors with {missileTrackingAngle} degree view",
				"{missileFlightRange} meter flight = {missileMaximumSpeed} m/s speed X {missileFlightTime} seconds"],
				this, binding);
		}

		if (this.type == "Container") {
			return new SummaryText(["{cargoCapacity} SCUs cargo capacity"], this, binding);
		}

		if (this.type == "PowerPlant") {
			return new SummaryText([
				"{powerAvailable} maximum power generation per second"],
				this, binding);
		}

		if (this.type == "Cooler") {
			return new SummaryText(["{coolingAvailable} max cooling / second"], this, binding);
		}

		return new SummaryText();
	}

	_getTurretRotationLimits(axis) {
		const params = _.get(this._data, "Components.SCItemTurretParams.movementList.SCItemTurretJointMovementParams");
		if (params != undefined) {
			const matched = params.find(x => _.keys(x[axis + "Axis"]).length > 0);
			return _.get(matched, axis + "Axis.SCItemTurretJointMovementAxisParams.angleLimits");
		}
	}

	_getStandardTurretRotationLimit(axis, limit) {
		return _.get(this._getTurretRotationLimits(axis), "SCItemTurretStandardAngleLimitParams." + limit);
	}

	_makePitchLimits() {
		const pitchLimits = _.get(
			this._getTurretRotationLimits("pitch"),
			"SCItemTurretCustomAngleLimitParams.AngleLimits.SCItemTurretCustomAngleLimit");

		if (pitchLimits != undefined && pitchLimits.length > 1) {
			// Duplicate the first entry but wrapped around 360 degrees.
			let expanded = pitchLimits.slice();
			let wrapped = _.cloneDeep(expanded[0]);
			wrapped["@TurretRotation"] += 360;
			expanded.push(wrapped);
			return expanded;
		}

		return [];
	}

	_findItemPorts() {
		const ports = _.get(this._data, "Components.SCItem.ItemPorts.SItemPortCoreParams.Ports.SItemPortDef", []);
		return elementArray(ports).map(x => new DataforgeItemPort(x));
	}
}

class ItemPortType {
	constructor(type, subtype) {
		this.type = type;
		this.subtype = subtype;
	}
}

class BaseItemPort {
	availableComponents(tags) {
		let keys = Object.keys(allItems);
		keys = keys.filter(n => !n.toLowerCase().includes("test_") && !n.includes("_Template"));
		return keys.filter(n => this.matchesComponent(tags, allItems[n]));
	}

	matchesType(type, subtype) {
		if (!this.types) {
			return false;
		}

		return this.types.some(function (portType) {
			if (portType.type != type) {
				return false;
			}

			// Match all subtypes when looking for interesting types.
			// The explicit "UNDEFINED" is for quantum drives; it's unclear why they're special.
			if (subtype != undefined && subtype != "UNDEFINED") {
				// It looks like subtypes are ports constraining what components can fit,
				// the subtypes on components aren't constraints just informative.
				// TODO Or maybe I'm just missing a lot of implicit defaults and rules?
				if (portType.subtype != undefined && portType.subtype != subtype) {
					return false;
				}
			}

			return true;
		});
	}

	matchesComponent(tags, component) {
		if (!this.matchesType(component.type, component.subtype)) {
			return false;
		}

		if (this.minSize != undefined&& component.size < this.minSize) {
			return false;
		}

		if (this.maxSize != undefined && component.size > this.maxSize) {
			return false;
		}

		if (component.requiredTags) {
			const portTags = tags.concat(this.tags);

			for (const tag of component.requiredTags) {
				if (!portTags.includes(tag)) {
					return false;
				}
			}
		}

		return true;
	}
}

class VehicleItemPort extends BaseItemPort {
	constructor(data) {
		super();

		this._data = data;

		this.name = data["@name"];
		this.editable = !_.get(data, "ItemPort.@flags", "").includes("uneditable");
		this.types = this._makeTypes();
	}

	get hasControllerMfd()
	{
		const immutableScreens = ["Screen_TV", "habitation_bed_screen"];

		const controller = elementArray(_.get(this._data, "ItemPort.ControllerDef"));
		const observables = elementArray(_.get(controller, "[0].UserDef.Observerables.Observerable", []));
		const mfds = observables.filter(x => !immutableScreens.includes(_.get(x, "@screensAvail", "")));
		return mfds.length > 0;
	}

	get minSize() {
		return _.get(this._data, "ItemPort.@minsize");
	}

	get maxSize() {
		return _.get(this._data, "ItemPort.@maxsize");
	}

	get tags() {
		return splitTags(_.get(this._data, "ItemPort.@requiredTags"));
	}

	get minYaw() {
		return _.get(this._data, "ItemPort.Yaw.@min");
	}

	get maxYaw() {
		return _.get(this._data, "ItemPort.Yaw.@max");
	}

	get minPitch() {
		// Necessary for the Constellation and the Khartu-al -- not sure why.
		// Default value determined by comparing pitch range to yaw range on the Andromeda.
		if (this._minPitch == 0 && this._maxPitch == 0) {
			return -2.5;
		}

		return this._minPitch;
	}

	get maxPitch() {
		// Necessary for the Constellation and the Khartu-al -- not sure why.
		// Default value determined by comparing pitch range to yaw range on the Andromeda.
		if (this._minPitch == 0 && this._maxPitch == 0) {
			return 2.5;
		}

		return this._maxPitch;
	}

	get _minPitch() {
		return _.get(this._data, "ItemPort.Pitch.@min");
	}

	get _maxPitch() {
		return _.get(this._data, "ItemPort.Pitch.@max");
	}

	_makeTypes() {
		const entries = elementArray(_.get(this._data, "ItemPort.Types.Type", []));

		const result = [];
		for (const entry of entries) {
			let subtypes = [undefined];
			if (entry["@subtypes"]) {
				subtypes = entry["@subtypes"].split(",");
			}

			for (const subtype of subtypes) {
				result.push(new ItemPortType(entry["@type"], subtype));
			}
		}

		return result;
	}
}

class DataforgeItemPort extends BaseItemPort {
	constructor(data) {
		super();
		this._data = data;
	}

	get name() {
		return this._data["@Name"];
	}

	get editable() {
		return !this._data["@Flags"].includes("uneditable");
	}

	get minSize() {
		return this._data["@MinSize"];
	}

	get maxSize() {
		return this._data["@MaxSize"];
	}

	get tags() {
		return splitTags(this._data["@PortTags"]);
	}

	get types() {
		const types = _.get(this._data, "Types.SItemPortDefTypes", []);
		return elementArray(types).map(x => new ItemPortType(x["@Type"], _.get(x, "SubTypes.Enum.@value")));
	}
}

class ItemBindingGroup {
	constructor(members) {
		this.members = members;
	}

	get name() {
		return this.members.length + this.memberPortNames.sort()[0];
	}

	get memberPortNames() {
		return this.members.map(m => m.port.name);
	}

	get allIdentical() {
		const componentsIdentical = function(left, right) {
			// TODO This groups together slightly different turrets even when they're editable.
			return _.get(left, "name") == _.get(right, "name") || ItemBindingGroup.turretsSimilar(left, right);
		};

		const first = this.members[0];
		const firstComponent = first.selectedComponent;

		for (const other of this.members.slice(1)) {
			const otherComponent = other.selectedComponent;
			if (!componentsIdentical(firstComponent, otherComponent)) {
				return false;
			}

			// Also check the children when this is at the root level.
			// TODO Currently ignoring third-level ports.
			if (first.portPath.length == 1) {
				for (const childName of Object.keys(first.childBindings)) {
					const firstChild = first.childBindings[childName];
					const otherChild = other.childBindings[childName];
					if (!componentsIdentical(firstChild.selectedComponent, otherChild.selectedComponent)) {
						return false;
					}
				}
			}
		}

		return true;
	};

	static turretsSimilar(left, right) {
		return (_.get(left, "type") == "TurretBase" || _.get(right, "type") == "Turret") &&
			_.get(left, "type") == _.get(right, "type") &&
			_.get(left, "itemPorts.length") == _.get(right, "itemPorts.length") &&
			_.get(left, "itemPorts.[0].maxSize") == _.get(right, "itemPorts.[0].maxSize")
	}

	static findGroups(bindings) {
		if (bindings == undefined) {
			return undefined;
		}

		let groups = [];
		for (const binding of bindings) {
			const groupIndex = groups.findIndex(g =>
				g[0].port.minSize == binding.port.minSize &&
				g[0].port.maxSize == binding.port.maxSize &&
				g[0].port.editable == binding.port.editable &&
				// Handle the case where uneditable item ports have different components attached.
				(
					g[0].port.editable ||
					_.get(g[0].selectedComponent, "name") == _.get(binding.selectedComponent, "name") ||
					// Handle the case where uneditable turrets don't differ in interesting ways.
					ItemBindingGroup.turretsSimilar(g[0].selectedComponent, binding.selectedComponent)
				) &&
				_.isEqual(g[0].port.types, binding.port.types) &&
				_.isEqual(g[0].port.tags, binding.port.tags));

			if (groupIndex >= 0) {
				groups[groupIndex].push(binding);
			}
			else {
				groups.push([binding]);
			}
		}

		return groups.map(g => new ItemBindingGroup(g));
	};
}

class ItemBinding {
	constructor(port, parentBinding, customization, defaultItems = undefined) {
		this.port = port;
		this.parentBinding = parentBinding;
		this.childBindings = {};
		this.customization = customization;

		this.defaultComponent = undefined;
		if (defaultItems) {
			const defaultComponentName = this._getDefaultComponent(defaultItems);

			if (defaultComponentName) {
				this.defaultComponent = allItems[defaultComponentName];
			}
		}

		this._setSelectedComponent(this.defaultComponent, defaultItems);

		const defaultActiveTypes = ["Turret", "TurretBase", "WeaponGun", "PowerPlant", "Cooler", "Misc"];
		this._powerSelector = "Standby";
		if (this.selectedComponent) {
			if (defaultActiveTypes.includes(this.selectedComponent.type)) {
				this._powerSelector = "Active";
			}

			if (this.selectedComponent.getThrusterType(this) == "Main") {
				this._powerSelector = "Active";
			}
		}
	}

	get powerSelector() {
		let rootBinding = this;
		while (rootBinding.parentBinding) {
			rootBinding = rootBinding.parentBinding;
		}

		return rootBinding._powerSelector;
	}

	set powerSelector(value) {
		this._powerSelector = value;
	}

	get selectedComponent() {
		return this._selectedComponent;
	}

	set selectedComponent(component) {
		if (this.port.editable) {
			this._setSelectedComponent(component);
		}
	}

	get childGroups() {
		return ItemBindingGroup.findGroups(Object.values(this.childBindings));
	}

	get customized() {
		// TODO This doesn't handle that case where a port has been set back to its default component,
		// but now has empty child ports -- it shows as not customized, although the children are changed.
		const thisCustomized = _.get(this.selectedComponent, "name") != _.get(this.defaultComponent, "name");
		return thisCustomized || Object.values(this.childBindings).some(n => n.customized);
	}

	get portPath() {
		let result = [];
		let binding = this;

		while (binding) {
			result.unshift(binding.port.name);
			binding = binding.parentBinding;
		}

		return result;
	}

	// Takes defaultItems only for initial construction; changes will leave it undefined.
	_setSelectedComponent(component, defaultItems = undefined) {
		this._selectedComponent = component;

		// Also update the children when the selected component changes.
		this.childBindings = {};
		if (component) {
			for (const childPort of component.itemPorts) {
				// Make the new child reactive.
				Vue.set(this.childBindings, childPort.name, new ItemBinding(childPort, this, this.customization, defaultItems));
			}
		}
	}

	_getDefaultComponent(defaultItems) {
		let container = defaultItems;
		let entry;

		for (const portName of this.portPath) {
			if (!container) {
				return undefined;
			}
			entry = container[portName];
			container = _.get(entry, "children");
		}

		const result = _.get(entry, "itemName");
		return result;
	}
}

class ShipCustomization {
	constructor(shipId, storageKey = null, name = null) {
		this.shipId = shipId;
		this.storageKey = storageKey;
		this.name = name;

		this.childBindings = {};
		for (const shipPort of this._specification.itemPorts) {
			this.childBindings[shipPort.name] = new ItemBinding(shipPort, undefined, this, this._specification.defaultItems);
		}

		this.childGroups = ItemBindingGroup.findGroups(Object.values(this.childBindings));

		this.calculateDerivedValues();

		// TODO Not really the right spot for this, but it's quick and convenient...
		this.hoveredBindings = [];
	}

	// Serialization format: <shipId><bindingList>
	// <bindingList>: <count>{<typeDiscriminator><groupName or portName><componentName><bindingList of children>}
	// All string keys and values are hashed to 24 bits. All elements are individually base64 encoded.
	serialize() {
		let str = "1";
		str += this.shipId.serialize();

		const walk = (bindings, groups) => {
			const serializeBinding = (binding) => {
				const children = walk(binding.childBindings, binding.childGroups);
				return "B" + hashAndEncode(binding.port.name) + hashAndEncode(binding.selectedComponent.name) + children;
			};

			const serializeGroup = (group) => {
				const template = group.members[0];

				// Select the children for the template by preferring those that were customized. This ensures any child
				// set on a group is serialized, and doesn't rely on defaults which are inconsistent within the group.
				// TODO This probably isn't correct for third-level ports...
				let childBindings = {};
				for (const portName in template.childBindings) {
					const customized = group.members.map(m => m.childBindings[portName]).find(b => b.customized);
					childBindings[portName] = customized || template.childBindings[portName];
				}

				const children = walk(childBindings, template.childGroups);
				return "G" + hashAndEncode(group.name) + hashAndEncode(template.selectedComponent.name) + children;
			};

			let result = "";
			let count = 0;
			let remaining = Object.values(bindings).filter(b => b.customized);

			for (const group of groups.filter(g => g.members.length > 1)) {
				if (group.allIdentical && group.members.some(m => remaining.some(r => r.port.name == m.port.name))) {
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

		str += walk(this.childBindings, this.childGroups);
		return str;
	}

	static deserialize(str, storageKey = null, name = null) {
		const version = str.substr(0, 1);
		const shipId = str.substr(1, 12);
		let customization = new ShipCustomization(ShipId.deserialize(shipId), storageKey, name);

		const findComponent = (hashedName) => {
			// TODO Also restrict this to matching components, to reduce hash collision chance.
			const componentName = Object.keys(allItems).find(k => hashAndEncode(k) == hashedName);
			return allItems[componentName];
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
					const portName = Object.keys(containers[0].childBindings).find(k => hashAndEncode(k) == name);

					for (const container of containers) {
						const binding = container.childBindings[portName];
						bindings.push(binding);
					}
				}
				else if (discriminator == "G") {
					const groupName = containers[0].childGroups.map(g => g.name).find(n => hashAndEncode(n) == name);

					for (const container of containers) {
						const group = container.childGroups.find(g => g.name == groupName);
						for (const binding of group.members) {
							bindings.push(binding);
						}
					}
				}
				else {
					throw new Error("Invalid discriminator '" + discriminator + "'");
				}

				const component = findComponent(value);

				// Don't set component if it didn't change, because that would clear the child ports unnecessarily.
				// Set it if it's changing for other group members, though. Multi-select should stick and be consistent.
				if (!bindings.every(b => _.get(b.selectedComponent, "name") == _.get(component, "name"))) {
					bindings.forEach(b => b.selectedComponent = component);
				}

				index = walk(bindings, index);
			}

			return index;
		};

		walk([customization], 13);
		return customization;
	}

	get displayName() {
		return this._specification.displayName;
	}

	get shipManufacturer() {
		const split = this.displayName.split(/[ _]/);
		return split[0].trim();
	}

	get shipName() {
		const split = this.displayName.split(/[ _]/);
		return split.slice(1).join(" ").trim();
	}

	// Abstracted because ship modifications will probably have their own tags eventually.
	get tags() {
		return this._specification.tags;
	}

	get coolingEfficiency() {
		return Math.min(1, 1 / this.coolingUsageRatio);
	}

	get powerEfficiency() {
		return Math.min(1, 1 / this.powerUsageRatio);
	}

	// TODO This is a terrible pattern; need a more general solution to data caching outside components.
	calculateDerivedValues() {
		// Avoids infinite loops because these are scalars and Vue can detect when they don't change.
		// The ordering of these operations is critical since they build on each other.
		this.powerUsageRatio = this._getPowerUsageRatio();
		this.coolingUsageRatio = this._getCoolingUsageRatio();
	}

	get attributes() {
		const allComponents = this._allComponentBindings;
		const activeComponents = allComponents.filter(n => n.powerSelector == "Active");

		const quantumFuel = this._sumComponentValue(allComponents, "quantumFuel");
		const quantumEfficiency = this._sumComponentValue(allComponents, "quantumEfficiency");

		const powerUsage = this._sumComponentValue(allComponents, "powerUsage");
		const powerAvailable = this._sumComponentValue(allComponents, "powerAvailable");

		const coolingUsage = this._sumComponentValue(allComponents, "coolingUsage");
		const coolingAvailable = this._sumComponentValue(allComponents, "coolingAvailable");

		const cargoCapacity = this._sumComponentValue(allComponents, "cargoCapacity");

		const maxPitch = this._sumComponentValue(allComponents, "angularVelocityPitch");
		const maxRoll = this._sumComponentValue(allComponents, "angularVelocityRoll");
		const maxYaw = this._sumComponentValue(allComponents, "angularVelocityYaw");
		const maxTurn = Math.max(maxYaw, maxPitch);

		let attributes = this._specification.attributes;
		attributes = attributes.concat([
			{
				name: "Normal Speed",
				category: "Maneuverability",
				description: "Normal flight speed",
				value: this._sumComponentValue(allComponents, "speed")
			},
			{
				name: "Maximum Speed",
				category: "Maneuverability",
				description: "Maximum flight speed",
				value: this._sumComponentValue(allComponents, "afterburner")
			},
			{
				name: "Yaw Rate Limit",
				category: "Maneuverability",
				description: "Maximum yaw rate in degrees/second not considering acceleration",
				value: maxYaw
			},
			{
				name: "Pitch Rate Limit",
				category: "Maneuverability",
				description: "Maximum pitch rate in degrees/second not considering acceleration",
				value: maxPitch
			},
			{
				name: "Turn Rate Limit",
				category: "Maneuverability",
				description: "Maximum yaw or pitch rate in degrees/second not considering acceleration",
				value: maxTurn,
				comparison: true
			},
			{
				name: "Roll Rate Limit",
				category: "Maneuverability",
				description: "Maximum roll rate in degrees/second not considering acceleration",
				value: maxRoll
			},
			{
				name: "Loadout Name",
				category: "Description",
				value: this.name
			},
			{
				name: "Ship Name",
				category: "Description",
				value: this.shipName
			},
			{
				name: "Manufacturer",
				category: "Description",
				value: this.shipManufacturer
			},
			{
				name: "Cargo Capacity",
				category: "Travel",
				description: "Total cargo capacity in SCUs",
				value: cargoCapacity
			},
			{
				name: "Power Generation",
				category: "Power",
				description: "Total power generating capacity of all power plants",
				value: Math.round(powerAvailable)
			},
			{
				name: "Power Usage",
				category: "Power",
				description: "Sum of the power consumption of all components in their current state",
				value: Math.round(powerUsage)
			},
			{
				name: "Power Usage Ratio",
				category: "Power",
				description: "Percentage of power generation capacity used by current settings",
				value: Math.round(100 * (powerUsage) / powerAvailable) + "%"
			},
			{
				name: "Power Efficiency",
				category: "Power",
				description: "Reduced effectiveness of components because of insufficient power",
				value: Math.round(100 * this.powerEfficiency) + "%"
			},
			{
				name: "Cooling Available",
				category: "Cooling",
				description: "Total heat dissipation capacity of all coolers",
				value: Math.round(coolingAvailable)
			},
			{
				name: "Cooling Usage",
				category: "Cooling",
				description: "Total heat dissipation need of all components.",
				value: Math.round(coolingUsage)
			},
			{
				name: "Cooling Usage Ratio",
				category: "Cooling",
				description: "Percentage of cooling capacity used by current settings",
				value: Math.round(100 * (coolingUsage) / coolingAvailable) + "%"
			},
			{
				name: "Cooling Efficiency",
				category: "Cooling",
				description: "Reduced effectiveness of components because of insufficient cooling",
				value: Math.round(100 * this.coolingEfficiency) + "%"
			},
			{
				name: "Total Shields",
				category: "Survivability",
				description: "Total capacity of all shield generators",
				value: Math.round(this._sumComponentValue(allComponents, "shieldCapacity"))
			},
			{
				name: "Total Burst DPS",
				category: "Guns",
				description: "Total gun DPS without considering heat, power, or ammo",
				value: Math.round(this._sumComponentValue(activeComponents, "gunBurstDps.total"))
			},
			{
				name: "Total Sustained DPS",
				description: "Total gun DPS that can be sustained without overheating",
				category: "Guns",
				value: Math.round(this._sumComponentValue(activeComponents, "gunSustainedDps.total"))
			},
			{
				name: "Missile Count",
				description: "Number of missiles equipped",
				category: "Missiles",
				value: allComponents.filter(n => n.selectedComponent.type == "Missile").length
			},
			{
				name: "Total Missile Damage",
				description: "Total potential damage of all missiles",
				category: "Missiles",
				value: Math.round(this._sumComponentValue(allComponents, "missileDamage.total"))
			},
			{
				name: "Quantum Speed",
				description: "Max quantum travel speed in megameters/sec",
				category: "Travel",
				value: _.round(this._sumComponentValue(allComponents, "quantumSpeed"), 2)
			},
			{
				name: "Quantum Fuel",
				description: "Total capacity of all quantum fuel tanks",
				category: "Travel",
				value: Math.round(quantumFuel)
			},
			{
				name: "Quantum Range",
				description: "Gigameters of quantum travel range based on fuel capacity",
				category: "Travel",
				value: Math.round(quantumFuel / quantumEfficiency) || 0
			},
			{
				name: "EM Signature",
				description: "Total EM signature emitted by the vehicle",
				category: "Signature",
				value: Math.round(this._sumComponentValue(allComponents, "emSignature"))
			},
			{
				name: "IR Signature",
				description: "Total IR signature emitted by the vehicle",
				category: "Signature",
				value: Math.round(this._sumComponentValue(allComponents, "irSignature"))
			}
		]);

		const overrides = shipAttributeOverrides[this.shipId.combinedId];
		if (overrides) {
			Object.keys(overrides).forEach(k => attributes.find(a => a.name == k).value = overrides[k]);
		}

		return attributes;
	}

	get _specification() {
		return allVehicles[this.shipId.combinedId];
	}

	get _allComponentBindings() {
		const traverse = (binding) => {
			let result = [binding];
			for (const child of Object.values(binding.childBindings)) {
				result = result.concat(traverse(child));
			}

			return result;
		};

		let result = [];
		for (const binding of Object.values(this.childBindings)) {
			result = result.concat(traverse(binding));
		}

		result = result.filter(n => n.selectedComponent);
		return result;
	}

	_sumComponentValue(components, name) {
		return components.reduce((total, x) => total + x.selectedComponent.getValue(name, x), 0);
	}

	_getPowerUsageRatio() {
		const allComponents = this._allComponentBindings;
		const powerUsage = this._sumComponentValue(allComponents, "powerUsage");
		const powerAvailable = this._sumComponentValue(allComponents, "powerAvailable");

		return powerUsage / powerAvailable;
	}

	_getCoolingUsageRatio() {
		const allComponents = this._allComponentBindings;
		const coolingUsage = this._sumComponentValue(allComponents, "coolingUsage");
		const coolingAvailable = this._sumComponentValue(allComponents, "coolingAvailable");

		return coolingUsage / coolingAvailable;
	}
}


// Translate underlying data into model objects.
var allLoadouts = loadoutData;

var allVehicles = {}
for (const key of Object.keys(vehicleData)) {
	const specification = new ShipSpecification(key, vehicleData[key]);
	allVehicles[specification.shipId.combinedId] = specification;
}

var allItems = {}
for (const key of Object.keys(itemData)) {
	allItems[key] = new DataforgeComponent(key, itemData[key]);
}


// Immutable array of customizations for all the stock ships.
// Needs to be global so that it can be referenced from the router on initial page load.
const makeDefaultShipCustomizations = function() {
	const customizations = Object.values(allVehicles).map(n => new ShipCustomization(n.shipId));
	return customizations;
};
var defaultShipCustomizations = makeDefaultShipCustomizations();

// Ensure there's a turret rotation entry for any port that can mount a turret.
var turretRotationsDefined = {};
for (customization of Object.values(defaultShipCustomizations)) {
	const turretTypes = ["Turret", "TurretBase"];
	const turrets = Object.values(customization.childBindings).filter(
		b => turretTypes.some(t => b.port.matchesType(t)));

	const overrideIds = turrets.map(b => customization.shipId.specificationId + "." + b.port.name);
	const missing = overrideIds.filter(n => _.get(turretRotations, n) == undefined);
	if (missing.length == 0) {
		turretRotationsDefined[customization.shipId.combinedId] = true;
	}
	else {
		console.log("Warning: Missing turret rotations for " + customization.shipId.combinedId);
		missing.forEach(n => console.log("  " + n));
	}
}


// Storage layer for customizations.
class LoadoutStorage {
	constructor() {
		this._stored = {};

		for (const key of Object.keys(localStorage)) {
			try {
				const value = localStorage.getItem(key);
				const deserialized = JSON.parse(value);
				this._stored[key] = ShipCustomization.deserialize(deserialized.value, key, deserialized.name);
			}
			catch (ex) {
				console.warn(ex);
				console.warn("Unable to load saved loadout " + key);
			}
		}
	}

	get all() {
		return Object.values(this._stored);
	}

	get(key) {
		return this._stored[key];
	}

	set(customization, value = undefined) {
		if (!value) {
			value = customization.serialize();
		}

		this._stored[customization.storageKey] = customization;
		const serialized = JSON.stringify({name: customization.name, value: value});

		try {
			localStorage.setItem(customization.storageKey, serialized);
		}
		catch (ex) {
			console.warn(ex);
			console.warn("Unable to save loadout " + customization.storageKey);
		}
	}

	remove(key) {
		delete this._stored[key];
		localStorage.removeItem(key);
	}
}
var loadoutStorage = new LoadoutStorage();


// Represents a group on potentially multiple parents. If there are all multiple parents, they are assumed
// to be identical ports with identical components. If parents is undefined, the group is on the ship.
var itemPortGroup = Vue.component('item-port-group', {
	template: '#item-port-group',
	props: ['customization', 'groupName', 'parentBindings'],
	data: function() {
		const allGroups = this.getAllGroups();

		return {
			allGroups: allGroups,
			prototypeGroup: allGroups[0],
			linked: allGroups[0].allIdentical
		}
	},
	computed: {
		linkable: function() {
			return this.prototypeGroup.members.length > 1;
		},
		buttonText: function() {
			if (this.linked) {
				return "Unlink";
			}

			return "Link";
		}
	},
	methods: {
		getAllGroups: function() {
			if (this.parentBindings) {
				return this.parentBindings.map(b => b.childGroups.find(g => g.name == this.groupName));
			}
			else {
				return [this.customization.childGroups.find(g => g.name == this.groupName)];
			}
		},
		getBindingMap: function() {
			let arrays = [];
			for (const prototypeMember of this.prototypeGroup.members) {
				arrays.push({
					prototypeBinding: prototypeMember,
					targetBindings: this.allGroups.map(g => g.members.find(m => m.port.name == prototypeMember.port.name))});
			}

			if (this.linked) {
				arrays = [{
					prototypeBinding: this.prototypeGroup.members[0],
					targetBindings: arrays.reduce((total, a) => total.concat(a.targetBindings), [])}];
			}

			return arrays;
		},
		onClick: function() {
			this.linked = !this.linked;

			// When linking item ports, set their attached components to match the first in the group.
			if (this.linked) {
				const selectedBinding = this.allGroups[0].members[0];
				const childBindings = this.allGroups[0].members[0].childBindings;

				for (const group of this.allGroups) {
					for (const other of group.members) {
						// Always set the component when linking a group. Multi-select should stick and be consistent.
						other.selectedComponent = selectedBinding.selectedComponent;
						other.powerSelector = selectedBinding.powerSelector;

						// TODO Currently ignoring third-level ports.
						if (other.portPath.length == 1) {
							for (const childName of Object.keys(childBindings)) {
								other.childBindings[childName].selectedComponent = childBindings[childName].selectedComponent;
							}
						}
					}
				}
			}

			sendEvent("Customize", "Link", this.linked);
		}
	}
});

var componentDisplay = Vue.component("component-display", {
	template: "#component-display",
	props: ["componentName", "disabled", "bindings", "referenceName"],
	computed: {
		component: function () {
			return allItems[this.componentName];
		},
		reference: function () {
			return allItems[this.referenceName];
		}
	},
	methods: {
		formatNumber: formatNumber
	}
});

// itemPorts and parentItemPorts are arrays, so the selector can be bound to multiple item ports.
// If so, the selector assumes all the ports are all identical to the first!
var componentSelector = Vue.component('component-selector', {
	template: '#component-selector',
	props: ['customization', 'bindings', 'nested'],
	data: function() {
		return {
			visible: false
		}
	},
	computed: {
		availableComponents: function () {
			return this.bindings[0].port.availableComponents(this.customization.tags);
		},
		label: function () {
			const port = this.bindings[0].port;
			let size = port.minSize;
			if (port.minSize != port.maxSize)
			{
				size += "-" + port.maxSize;
			}

			let name = port.name;
			if (this.bindings.length > 1) {
				name += " and similar";
			}

			return name + " (size " + size + ")";
		},
		selectedComponentName: function() {
			const component = this.bindings[0].selectedComponent;
			return _.get(component, "name");
		},
		activePowerName: function() {
			const type = _.get(this.bindings[0].selectedComponent, "type");
			if (type == "WeaponGun" || type == "MissileLauncher" || type == "Turret" || type == "TurretBase" || type == "Misc") {
				return "Firing";
			}
			if (type == "Shield") {
				return "Recharging";
			}
			if (type == "QuantumDrive") {
				return "Spooling";
			}

			return "Active";
		},
		hasStandby: function() {
			const type = _.get(this.bindings[0].selectedComponent, "type");
			if (type == "PowerPlant" || type == "Cooler") {
				return false;
			}

			return true;
		}
	},
	methods: {
		onVisibleChange: function(visible) {
			this.visible = visible;

			// Fix the width of the dropdown dynamically since the dropdown widget doesn't handle padding.
			const elementWidth = this.$refs["dropdown"].$el.offsetWidth;
			this.$refs["dropdown"].$refs["drop"].$el.style.width = elementWidth + "px";

			if (this.visible) {
				sendEvent("Customize", "ViewComponents", this.bindings[0].port.name);
			}
		},
		onClick: function(name) {
			// Don't set component if it didn't change, because that would clear the child ports unnecessarily.
			// Set it if it's changing for other group members, though. Multi-select should stick and be consistent.
			if (!this.bindings.every(b => _.get(b.selectedComponent, "name") == name)) {
				for (const binding of this.bindings) {
					binding.selectedComponent = allItems[name];
				}
			}

			sendEvent("Customize", "SelectComponent", name);
		},
		onPowerSelectorChange: function(value) {
			for (const binding of this.bindings) {
				binding.powerSelector = value;
			}

			sendEvent("Customize", "ChangePower", value);
		}
	}
});

var actualMaterial = new THREE.MeshLambertMaterial({
	side: THREE.DoubleSide,
	depthTest: false,
	color: 0x7b7b7b,
	opacity: 0.25,
	transparent: true
});

var hoverMaterial = new THREE.MeshLambertMaterial({
	side: THREE.DoubleSide,
	depthTest: false,
	color: 0x2d8cf0,
	opacity: 0.25,
	transparent: true
});

var stencilMaterial = new THREE.MeshLambertMaterial({
	colorWrite: false,
	depthWrite: false,
	side: THREE.DoubleSide
});

var coverageDisplay = Vue.component("coverage-display", {
	template: "#coverage-display",
	props: ["customization"],
	data: function() {
		return {
			selectedView: "Side"
		}
	},
	watch: {
		customization: {
			handler: function(value) {
				this.makeCoverageSegments();
				this.renderScene();
			},
			deep: true
		},
		selectedView: function(value) {
			sendEvent("Customize", "ChangeCoverageView", value);
		}
	},
	methods: {
		renderScene: function() {
			const gl = this.renderer.context;
			this.renderer.clear();

			this.camera.near = this.cameraDistance;
			this.camera.updateProjectionMatrix();

			for (const scenes of Object.values(this.segments)) {
				this.renderer.clearStencil();

				gl.enable(gl.STENCIL_TEST);

				// Increment the stencil buffer for each face.
				gl.stencilFunc(gl.ALWAYS, 1, 0xff);
				gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
				this.renderer.render(scenes.stencil, this.camera);

				// Only render when there are an uneven number of faces behind the near clip plane.
				// Decrement the stencil buffer when drawing the actual object to prevent any self-overlap.
				gl.stencilFunc(gl.EQUAL, 1, 0x01);
				gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
				this.renderer.render(scenes.actual, this.camera);

				gl.disable(gl.STENCIL_TEST);
			}

			this.camera.near = 5;
			this.camera.updateProjectionMatrix();

			this.renderer.render(this.baseScene, this.camera);
		},
		updateControls: function() {
			requestAnimationFrame(this.updateControls);

			this.controls.update();
		},
		onControlsChange: function(change) {
			const position = change.target.object.position;
			const sum = position.x + position.y + position.z;

			if (sum != this.cameraDistance) {
				this.selectedView = "Free";
			}

			this.renderScene();
		},
		onResize: function(event, extra = 0) {
			this.$refs.canvas.width = this.$refs.container.offsetWidth - extra;
			this.$refs.canvas.height = this.$refs.canvas.width;

			this.camera.updateProjectionMatrix();

			this.renderer.setSize(this.$refs.canvas.width, this.$refs.canvas.height);

			this.controls.handleResize();

			this.renderScene();
		},
		onViewChange: function(value) {
			if (this.selectedView != "Free") {
				this.positionCamera();
				this.renderScene();
			}
		},
		positionCamera: function() {
			this.camera.position.set(
				this.cameraDistance * (this.selectedView == "Front"),
				this.cameraDistance * (this.selectedView == "Side"),
				this.cameraDistance * (this.selectedView == "Top"));

			if (this.selectedView == "Top") {
				this.camera.up.set(1, 0, 0);
			}
			else {
				this.camera.up.set(0, 0, 1);
			}
			this.camera.lookAt(0, 0, 0);

			this.camera.updateProjectionMatrix();
		},
		sphericalToCartesian: function(yawInDegrees, pitchInDegrees, radius) {
			// Measures 0 degrees pitch as z = 0 and 90 degrees pitch is +Z.
			// Measures 0 degrees yaw as +X, and 90 degrees yaw as +Y.
			var yawInRadians = yawInDegrees * Math.PI / 180.0;
			var pitchInRadians = pitchInDegrees * Math.PI / 180.0;

			return new THREE.Vector3(
				radius * Math.cos(pitchInRadians) * Math.cos(yawInRadians),
				radius * Math.cos(pitchInRadians) * Math.sin(yawInRadians),
				radius * Math.sin(pitchInRadians)
			);
		},
		makeCoverageSegments: function() {
			for (const scenes of Object.values(this.segments)) {
				for (mesh of scenes.actual.children.filter(c => c.type == "Mesh")) {
					scenes.actual.remove(mesh);
				}
				for (mesh of scenes.stencil.children.filter(c => c.type == "Mesh")) {
					scenes.stencil.remove(mesh);
				}
				scenes.geometry.dispose();
			}
			this.renderer.renderLists.dispose();
			this.segments = {};

			const getMaxRange = binding => {
				return _.max(Object.values(binding.childBindings).filter(
					n => n.selectedComponent).map(
					n => n.selectedComponent.getBulletRange(n)));
			};

			const turretTypes = ["Turret", "TurretBase"];
			const turrets = Object.values(this.customization.childBindings).filter(
				n => turretTypes.includes(_.get(n, "selectedComponent.type")));
			const maxRange = _.max(turrets.map(n => getMaxRange(n)));
			for (const binding of turrets) {
				const range = getMaxRange(binding);

				// Exclude turrets without guns attached.
				if (range) {
					this.makeCoverageSegment(binding, range / maxRange);
				}
			}
		},
		makeCoverageSegment: function(binding, relativeDistance) {
			const distance = this.sceneRadius * relativeDistance;

			const minYaw = binding.selectedComponent.getTurretMinYaw(binding);
			const maxYaw = binding.selectedComponent.getTurretMaxYaw(binding);

			const yawSlices = Math.ceil(Math.abs((maxYaw - minYaw) / 10));
			const pitchSlices = yawSlices;

			const yawIncrement = (maxYaw - minYaw) / yawSlices;
			let yawSamples = Array.from({length: yawSlices + 1}, (v, i) => minYaw + yawIncrement * i);
			const inflections = binding.selectedComponent.turretInflections.filter(i => i > minYaw && i < minYaw);
			yawSamples = yawSamples.concat(inflections);
			yawSamples.sort((a, b) => a - b);

			var geometry = new THREE.Geometry();
			geometry.vertices.push(
				new THREE.Vector3(0, 0, 0));

			let lastVertex = 0;
			for (let yawIndex = 0; yawIndex < yawSamples.length; yawIndex += 1) {
				const pitchRange = binding.selectedComponent.getTurretPitchRange(binding, yawSamples[yawIndex]);
				const pitchIncrement = (pitchRange.max - pitchRange.min) / pitchSlices;
				const pitchSamples = Array.from({length: pitchSlices + 1}, (v, i) => pitchRange.min + pitchIncrement * i);

				for (const pitchSample of pitchSamples) {
					geometry.vertices.push(this.sphericalToCartesian(
						yawSamples[yawIndex], pitchSample, distance));
				}

				lastVertex += pitchSamples.length;
				const currentYawVertex = lastVertex - pitchSamples.length + 1;
				const previousYawVertex = lastVertex - pitchSamples.length * 2 + 1;
				const centerVertex = 0;

				// Need two yaw samples to draw a slice.
				if (yawIndex > 0) {
					for (let pitchIndex = 0; pitchIndex < pitchSamples.length - 1; pitchIndex += 1) {
						const previousFloor = previousYawVertex + pitchIndex;
						const previousCeiling = previousYawVertex + pitchIndex + 1;
						const currentFloor = currentYawVertex + pitchIndex;
						const currentCeiling = currentYawVertex + pitchIndex + 1;

						// Arc face quad.
						geometry.faces.push(new THREE.Face3(previousFloor, previousCeiling, currentCeiling));
						geometry.faces.push(new THREE.Face3(previousFloor, currentCeiling, currentFloor));
					}

					const firstFloor = previousYawVertex;
					const firstCeiling = previousYawVertex + pitchSlices;
					const lastFloor = currentYawVertex;
					const lastCeiling = currentYawVertex + pitchSlices;

					// Min pitch floor and max pitch ceiling.
					geometry.faces.push(new THREE.Face3(centerVertex, firstFloor, lastFloor));
					geometry.faces.push(new THREE.Face3(centerVertex, lastCeiling, firstCeiling));
				}

				// Min and max yaw sides if yaw is bounded.
				if (maxYaw - minYaw < 360) {
					for (let pitchIndex = 0; pitchIndex < pitchSamples.length - 1; pitchIndex += 1) {
						if (yawIndex == 0) {
							geometry.faces.push(new THREE.Face3(
								centerVertex, currentYawVertex + pitchIndex + 1, currentYawVertex + pitchIndex));
						}

						if (yawIndex == yawSlices) {
							geometry.faces.push(new THREE.Face3(
								centerVertex, currentYawVertex + pitchIndex, currentYawVertex + pitchIndex + 1));
						}
					}
				}
			}

			geometry.computeFaceNormals();
			geometry.computeVertexNormals();

			const overrideId = this.customization.shipId.specificationId + "." + binding.port.name
			const flip = _.get(turretRotations, overrideId + ".flip", false);
			const rollOffset = _.get(turretRotations, overrideId + ".roll", 0);
			const yawOffset = _.get(turretRotations, overrideId + ".yaw", 0);

			if (flip) {
				let matrix = new THREE.Matrix4();
				matrix.elements[5] = -1;
				geometry.applyMatrix(matrix);
			}
			geometry.rotateX(rollOffset * Math.PI / 180);
			geometry.rotateZ(yawOffset * Math.PI / 180);

			let result = {
				actual: new THREE.Scene(),
				stencil: new THREE.Scene(),
				geometry: geometry
			};

			let material = actualMaterial;
			if (this.customization.hoveredBindings.some(b => b == binding || b.parentBinding == binding)) {
				material = hoverMaterial;
			}

			result.actual.add(new THREE.Mesh(geometry, material));
			result.actual.add(new THREE.AmbientLight());
			result.stencil.add(new THREE.Mesh(geometry, stencilMaterial));

			// Not Vue.set reactively because nothing is watching the segments.
			this.segments[binding.port.name] = result;
		}
	},
	mounted() {
		this.cameraDistance = 500;
		this.sceneRadius = 100;

		const width = 2 * this.sceneRadius;
		const height = 2 * this.sceneRadius;
		const near = 5;
		const far = this.cameraDistance * 2;
		this.camera = new THREE.OrthographicCamera(
			width / -2, width / 2, height / 2, height / -2, near, far);
		this.positionCamera();

		this.controls = new THREE.TrackballControls(this.camera, this.$refs.canvas);
		this.controls.rotateSpeed = 1.5;
		this.controls.noZoom = true;
		this.controls.noPan = true;
		this.controls.staticMoving = true;
		this.controls.dynamicDampingFactor = 0.3;
		this.controls.addEventListener("change", this.onControlsChange);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.$refs.canvas,
			antialias: true,
			stencil: true,
			alpha: true
		});
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.setPixelRatio(window.devicePixelRatio || 1);
		this.renderer.autoClear = false;

		this.baseScene = new THREE.Scene();

		const axesHelper = new THREE.AxesHelper(this.sceneRadius);
		this.baseScene.add(axesHelper);

		let placeholder = new THREE.Mesh(
			new THREE.ConeGeometry(10, 25, 3),
			new THREE.MeshPhongMaterial({color: 0x606060, flatShading: true}));
		placeholder.rotation.z = -Math.PI / 2;
		this.baseScene.add(placeholder);

		this.baseScene.add(new THREE.AmbientLight(0xB10DC9));
		let directional = new THREE.DirectionalLight();
		directional.position.x = -0.15;
		directional.position.y = -0.25;
		directional.position.z = 1;
		this.baseScene.add(directional);

		this.segments = {};
		this.makeCoverageSegments();

		// The extra 16 pixels of width when mounted probably comes from gutters...
		this.onResize(undefined, 16);

		this.updateControls();

		window.addEventListener("resize", this.onResize);
	},
	beforeDestroy() {
		window.removeEventListener("resize", this.onResize);

		this.controls.dispose();

		this.renderer.dispose();
		this.renderer.forceContextLoss();
		this.renderer = undefined;
	}
});

var sizeCategoryOrder = ["Ground", "Small", "Medium", "Large", "Capital"];

var shipList = Vue.component('ship-list', {
	template: '#ship-list',
	data: function() {
		return {
			searchInput: "",
			tableHeight: this.getTableHeight(),
			selected: new Set(),
			comparing: false,
			compareDisabled: true,
			attributeColumns: [
				{
					title: " ",
					fixed: "left",
					minWidth: 55,
					align: "center",
					render: (h, params) => {
						let destination = {name: "customize", params: {serialized: params.row.serialized}};
						if (params.row.storageKey) {
							destination.name = "loadout";
							destination.params.storageKey = params.row.storageKey;
						}

						const edit = h("Button", {
							props: {
								type: "primary",
								size: "small"
							}
						}, "Edit");

						return h("router-link", {
							props: {
								to: destination
							}
						}, [edit]);
					}
				},
				{
					title: "Mnfr",
					key: "Manufacturer",
					filters: this.getAttributeFilter("Manufacturer"),
					filterMethod: (value, row) => row["Manufacturer"] == value,
					fixed: "left",
					minWidth: 60,
					ellipsis: true
				},
				{
					title: "Ship",
					key: "Ship Name",
					sortable: true,
					fixed: "left",
					minWidth: 155,
					ellipsis: true
				},
				this.addDefaultLoadoutFilter({
					title: "Loadout",
					key: "Loadout Name",
					sortable: true,
					sortMethod: (a, b, type) => {
						return ((a || "") > (b || "") ? 1 : -1) * (type == "asc" ? 1 : -1);
					},
					filters: ["Stock", "Custom"].map(s => { return {label: s, value: s}}),
					filterMethod: (value, row) => value == "Custom" ? row["Loadout Name"] : !row["Loadout Name"],
					fixed: "left",
					minWidth: 115,
					ellipsis: true
				}),
				{
					title: " ",
					fixed: "left",
					width: 30,
					align: "center",
					render: (h, params) => {
						return h("Checkbox", {
							props: {
								value: this.selected.has(params.row.selectionKey),
								disabled: this.comparing
							},
							on: {
								input: (value) => {
									if (value) {
										this.selected.add(params.row.selectionKey);
									}
									else {
										this.selected.delete(params.row.selectionKey);
									}

									// Binding to the size property doesn't work, so track it manually.
									this.compareDisabled = this.selected.size == 0;

									this.$emit("input", value)
								}
							}
						});
					}
				},
				{
					title: "Size",
					key: "Size Category",
					sortable: true,
					sortMethod: (a, b, type) => {
						return (sizeCategoryOrder.indexOf(a) > sizeCategoryOrder.indexOf(b) ? 1 : -1) * (type == "asc" ? 1 : -1);
					},
					renderHeader: this.renderSortableHeaderWithTooltip,
					filters: sizeCategoryOrder.map(s => { return {label: s, value: s}}),
					filterMethod: (value, row) => row["Size Category"] == value,
					minWidth: 75
				},
				{
					title: "Crew",
					key: "Crew",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 65
				},
				{
					title: "Cargo",
					key: "Cargo Capacity",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 70
				},
				{
					title: "Turn",
					key: "Turn Rate Limit",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 60
				},
				{
					title: "SCM Speed",
					key: "Normal Speed",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 100
				},
				{
					title: "Max Speed",
					key: "Maximum Speed",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 100
				},
				{
					title: "HP",
					key: "Total Hitpoints",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 60
				},
				{
					title: "Shields",
					key: "Total Shields",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 80
				},
				{
					title: "DPS",
					key: "Total Sustained DPS",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 60
				},
				{
					title: "Burst DPS",
					key: "Total Burst DPS",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 95
				},
				{
					title: "Missiles",
					key: "Total Missile Damage",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 85
				},
				{
					title: "Qntm Speed",
					key: "Quantum Speed",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 105
				},
				{
					title: "Qntm Range",
					key: "Quantum Range",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 105
				}
			]
		}
	},
	computed: {
		shipAttributes: function() {
			return loadoutStorage.all.concat(defaultShipCustomizations).filter(c => {
				const searchable = (c.displayName + " " + c.name).toLowerCase();
				return searchable.includes(this.searchInput.toLowerCase());
			}).map(c => {
				let reduced = c.attributes.reduce((total, a) => {
					total[a.name] = a.value;
					return total;
				}, {});

				// Used for navigation to the customization page.
				reduced.serialized = c.serialize();

				// Used for linking to saved loadouts.
				reduced.storageKey = c.storageKey;

				// Used for uniquely identifying rows to select.
				reduced.selectionKey = reduced.serialized + reduced.storageKey;

				return reduced;
			}).filter(c => {
				return !this.comparing || this.selected.has(c.selectionKey);
			});
		},
		shipAttributeDescriptions: function() {
			return defaultShipCustomizations[0].attributes.reduce((total, a) => {
				total[a.name] = a.description;
				return total;
			}, {});
		}
	},
	methods: {
		getTableHeight() {
			// TODO This is a terribly sad hack, but it's good enough for now.
			const headerHeight = 60;
			const footerHeight = 52;
			const contentPadding = 16;
			const controlsHeight = 32;
			return window.innerHeight - (headerHeight + footerHeight + controlsHeight + contentPadding * 3);
		},
		onResize(event) {
			this.tableHeight = this.getTableHeight();
		},
		onCompareSelected(event) {
			this.comparing = !this.comparing;
			sendEvent("Comparison", "Compare", this.comparing);
		},
		onSortChange(event) {
			sendEvent("Comparison", "Sort", event.key);
		},
		onFilterChange(event) {
			sendEvent("Comparison", "Filter", event.key);
		},
		getAttributeFilter(key) {
			const unique = [...new Set(defaultShipCustomizations.map(c => c.attributes.find(e => e.name == key).value))];
			return unique.sort().map(x => {
				return {label: x, value: x}});
		},
		addDefaultLoadoutFilter: function(column) {
			// This dance is necessary because having the key present even if undefined makes the filter icon blue.

			if (this.$route.name == "saved") {
				column.filteredValue = ["Custom"];
			}

			return column;
		},
		renderSortableHeaderWithTooltip(h, params) {
			const tooltip = h(
				"Tooltip", {
					props: {
						content: this.shipAttributeDescriptions[params.column.key],
						placement: "top",
						transfer: true
					}
				},
				params.column.title);

			return h(
				"span", {
					on: {
						click: () => {
							const table = this.$refs.table;
							const header = table.$children[0];
							header.handleSortByHead(params.index);
						}
					},
					class: "ivu-table-cell-sort"
				},
				[tooltip]);
		}
	},
	watch: {
		searchInput: function(value) {
			sendEvent("Comparison", "Search", value);
		}
	},
	mounted() {
		window.addEventListener('resize', this.onResize);
	},
	beforeDestroy() {
		window.removeEventListener('resize', this.onResize);
	}
});

var shipDetails = Vue.component('ship-details', {
	template: '#ship-details',
	data: function() {
		return {
			showModal: false,
			loadoutName: "",

			selectedCustomization: {},

			// Also defines the section display order.
			sectionNames: ["Guns", "Missiles", "Systems", "Flight"],
			expandedSections: ["Guns", "Missiles", "Systems", "Flight"],
			// Also defines the section precedence order; lowest precedence is first.
			sectionDefinitions: {
				"Guns": ["WeaponGun", "Turret", "TurretBase", "Misc"],
				"Missiles": ["MissileLauncher"],
				"Systems": ["Cooler", "Shield", "PowerPlant", "QuantumDrive"],
				"Flight": ["MainThruster", "ManneuverThruster"]
			},

			summaryColumns: [
				{
					title: "Summary",
					key: "name1",
					render: (h, p) => this.renderNameCell(h, p, "1", "bottom", -16),
					width: 85
				},
				{
					title: " ",
					key: "value1",
				},
				{
					title: " ",
					key: "name2",
					render: (h, p) => this.renderNameCell(h, p, "2", "bottom", -16),
					width: 115
				},
				{
					title: " ",
					key: "value2"
				},
				{
					title: " ",
					key: "name3",
					render: (h, p) => this.renderNameCell(h, p, "3", "bottom", -16),
					width: 110
				},
				{
					title: " ",
					key: "value3",
					width: 60
				}
			],

			missileColumns: [
				{
					title: "Missiles",
					key: "name",
					render: this.renderNameCell
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 75
				}
			],
			maneuverabilityColumns: [
				{
					title: "Maneuverability",
					key: "name",
					render: this.renderNameCell
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 75
				}
			],
			survivabilityColumns: [
				{
					title: "Survivability",
					key: "name",
					render: this.renderNameCell
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 75
				}
			],
			travelColumns: [
				{
					title: "Travel",
					key: "name",
					render: this.renderNameCell
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 75
				}
			]
		}
	},
	watch: {
		selectedCustomization: {
			handler: function(val) {
				val.calculateDerivedValues();

				const serialized = val.serialize();

				let url = new URL(location.href);
				const previous = url.href;
				url.hash = url.hash.split("/").slice(0, -1).concat(serialized).join("/");

				if (url != previous) {
					history.replaceState(history.state, document.title, url.href);

					if (val.storageKey) {
						loadoutStorage.set(val, serialized);
					}
				}
			},
			deep: true
		}
	},
	computed: {
		scdbLink: function() {
			const combined = this.selectedCustomization.shipId.combinedId;
			return "http://starcitizendb.com/ships/" + combined.split("_")[0] + "/" + combined;
		},
		wikiLink: function() {
			const combined = this.selectedCustomization.shipId.combinedId;
			return "https://starcitizen.tools/" + combined;
		},
		modalAction: function() {
			if (this.selectedCustomization.storageKey) {
				return "Rename";
			}

			return "Save";
		},
		modalTitle: function() {
			return this.modalAction + " Loadout";
		},
		showTurretCoverage: function() {
			if (!turretRotationsDefined[this.selectedCustomization.shipId.combinedId]) {
				return false;
			}

			const turretTypes = ["Turret", "TurretBase"];
			const turrets = Object.values(this.selectedCustomization.childBindings).filter(
				n => turretTypes.includes(_.get(n, "selectedComponent.type")));

			return turrets.length > 0;
		},
		attributes: function() {
			return this.selectedCustomization.attributes;
		},
		summaryData: function() {
			const usageSummary = (usageName, availableName, ratioName) => {
				const usage = this.attributes.find(n => n.name == usageName);
				const available = this.attributes.find(n => n.name == availableName);
				const ratio = this.attributes.find(n => n.name == ratioName);
				const summary = formatNumber(usage.value) + " / " + formatNumber(available.value);
				return summary + " (" + ratio.value + " efficiency)";
			};

			const powerSummary = usageSummary("Power Usage", "Power Generation", "Power Efficiency");
			const coolingSummary = usageSummary("Cooling Usage", "Cooling Available", "Cooling Efficiency");

			const burstDps = this.attributes.find(n => n.name == "Total Burst DPS");
			const sustainedDps = this.attributes.find(n => n.name == "Total Sustained DPS");

			const emSignature = this.attributes.find(n => n.name == "EM Signature");
			const irSignature = this.attributes.find(n => n.name == "IR Signature");

			return [
				{
					name1: "Power",
					iconType1: "md-flash",
					iconColor1: "LightSeaGreen",
					value1: powerSummary,
					description1: "Total power used by all components compared to total power available" +
						" -- exceeding power capacity inhibits or disables impacted components",
					name2: "EM Signature",
					iconType2: "ios-magnet",
					iconColor2: "rgb(190,85,4)",
					value2: formatNumber(emSignature.value),
					description2: emSignature.description,
					name3: "Burst DPS",
					value3: formatNumber(burstDps.value),
					description3: burstDps.description
				},
				{
					name1: "Cooling",
					iconType1: "ios-snow",
					iconColor1: "SteelBlue",
					value1: coolingSummary,
					description1: "Total cooling used by all components compared to total cooling available" +
						" -- exceeding cooling capacity causes components to cool at a reduced rate",
					name2: "IR Signature",
					iconType2: "ios-flame",
					iconColor2: "DarkRed",
					value2: formatNumber(irSignature.value),
					description2: irSignature.description,
					name3: "Sustained DPS",
					value3: formatNumber(sustainedDps.value),
					description3: sustainedDps.description
				}
			];
		}
	},
	methods: {
		getAttributes(category) {
			return this.attributes.filter(n => n.category == category && !n.comparison);
		},
		getSectionBindingGroups: function(sectionName) {
			const sectionIndex = Object.keys(this.sectionDefinitions).indexOf(sectionName);
			let excludedTypes = [];
			Object.keys(this.sectionDefinitions).forEach((x, index) => {
				if (index > sectionIndex) {
					excludedTypes = excludedTypes.concat(this.sectionDefinitions[x]);
				}
			});

			const sectionTypes = this.sectionDefinitions[sectionName];
			const candidates = this.selectedCustomization.childGroups;
			const sectionalized = candidates.filter(g => sectionTypes.some(t => g.members[0].port.matchesType(t, undefined)));

			let filtered = sectionalized.filter(g => !excludedTypes.some(e => g.members[0].port.matchesType(e, undefined)));

			// Hide modules (tragically type "Misc") that don't contain item ports with weapons on them.
			filtered = filtered.filter(g =>
				g.members[0].port.types.some(t => t.type != "Misc") ||
				g.members[0].childGroups.some(c => c.members[0].port.types.some(t => t.type == "WeaponGun")));

			return filtered;
		},
		getChildBindingGroups: function (prototypeBinding) {
			const childGroups = prototypeBinding.childGroups;

			// Hide embbedded cargo grids since they're fixed.
			let filtered = childGroups.filter(g => g.members[0].port.types.some(t => t.type != "Cargo"));

			// Hide magazine slots until they're worth customizing; they're distinguished by lack of types.
			filtered = filtered.filter(g => g.members[0].port.types.length);

			// Also hide weapon attachments until they're implemented.
			filtered = filtered.filter(g => g.members[0].port.types.some(t => t.type != "WeaponAttachment"));

			return filtered;
		},
		onOpenModal: function(event) {
			this.showModal = true;
			this.loadoutName = this.selectedCustomization.name || "Custom";
		},
		onCancelModal: function(event) {
			this.showModal = false;
		},
		onConfirmModal: function(event) {
			this.showModal = false;

			if (!this.selectedCustomization.storageKey) {
				const key = encodeInt24(_.random(0, 2 ** 24)) + encodeInt24(_.random(0, 2 ** 24));
				this.selectedCustomization.storageKey = key;
			}

			this.selectedCustomization.name = this.loadoutName;
			loadoutStorage.set(this.selectedCustomization);

			// Update URL now that the loadout is saved.
			let url = new URL(location.href);
			url.hash = ["/loadouts", this.selectedCustomization.storageKey].concat(url.hash.split("/").slice(-1)).join("/");
			history.replaceState(history.state, document.title, url.href);

			sendEvent("Customize", "Save", this.selectedCustomization.name);
		},
		onClickDelete: function(event) {
			sendEvent("Customize", "Delete", this.selectedCustomization.name);

			loadoutStorage.remove(this.selectedCustomization.storageKey);
			this.selectedCustomization.storageKey = undefined;
			this.selectedCustomization.name = undefined;

			// Update the URL back to the non-loadout version of the same customization.
			history.replaceState(history.state, document.title, makeCustomizationUrl().href);
		},
		onMouseOver: function(bindings) {
			this.selectedCustomization.hoveredBindings = bindings;
		},
		onMouseLeave: function() {
			this.selectedCustomization.hoveredBindings = [];
		},
		renderNameCell(h, params, suffix = "", placement = "left", offset = "0") {
			let name = params.row["name" + suffix];
			const iconType = params.row["iconType" + suffix];
			if (iconType) {
				icon = h(
					"icon", {
						props: {
							type: iconType,
							size: 14,
							color: params.row["iconColor" + suffix]
						}
					}
				);
				name = [icon, name];
			}

			const tooltip = h(
				"Tooltip", {
					props: {
						content: params.row["description" + suffix],
						placement: placement,
						transfer: true,
						offset: "0, " + offset,
						options: {
							modifiers: {
								flip: {
									enabled: false
								}
							}
						}
					}
				},
				name);

			return tooltip;
		}
	},
	created() {
		const storageKey = this.$route.params.storageKey;
		const serialized = this.$route.params.serialized;

		const retrieved = loadoutStorage.get(storageKey);
		if (storageKey && retrieved) {
			this.selectedCustomization = ShipCustomization.deserialize(serialized, storageKey, retrieved.name);
		}
		else {
			this.selectedCustomization = ShipCustomization.deserialize(serialized);

			// Update URL for the case when the saved loadout didn't exist on this browser.
			history.replaceState(history.state, document.title, makeCustomizationUrl().href);
		}
	}
});

Vue.use(VueRouter)
const router = new VueRouter({
	routes: [
		{
			name: "list",
			path: "/",
			component: shipList
		},
		{
			name: "saved",
			path: "/loadouts",
			component: shipList
		},
		{
			name: "loadout",
			path: "/loadouts/:storageKey/:serialized",
			component: shipDetails
		},
		{
			name: "customize",
			path: "/customize/:serialized",
			component: shipDetails
		},
		{
			// For inbound links from external sites to have a coherent URL.
			path: "/ships/:combinedId",
			redirect: to => {
				const customization = defaultShipCustomizations.find(c => c.shipId.combinedId == to.params.combinedId);
				if (customization) {
					return {name: "customize", params: {serialized: customization.serialize()}};

				}

				return {name: "list"};
			}
		},
		{
			path: "*",
			component: shipList
		}
	]
});

router.afterEach((to, from) => {
	gtag('config', gaTrackingId, {'page_path': to.path});
});

var app = new Vue({
	router,
	el: '#app',
	computed: {
		shipCustomizations: function() {
			return defaultShipCustomizations;
		},
		gameDataVersion: function() {
			return "3.9.0-LIVE-5125346";
		}
	},
	methods: {
		onNavigationSelect: function(name) {
			if (name == "comparison") {
				this.$router.push({name: "list"});
			}
			else if (name == "saved") {
				this.$router.push({name: "saved"});
			}
			else {
				this.$router.push({name: 'customize', params: {serialized: name}});
			}
		}
	}
}).$mount('#app');