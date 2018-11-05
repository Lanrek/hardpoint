var makeCustomizationUrl = function() {
	let url = new URL(location.href);
	url.hash = ["/customize"].concat(url.hash.split("/").slice(-1)).join("/");
	return url;
};

var copyShareableLink = new ClipboardJS(".clipboard-button", {
	text: function() {
		return makeCustomizationUrl().href;
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
	if (str.startsWith("<=")) {
		return null;
	}

	return str;
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
	constructor(data) {
		this._data = data;

		this.itemPorts = this._findItemPorts();
		this.defaultItems = this._makeDefaultItems();
	}

	get tags() {
		return this._data["vehicleSpecification"]["itemPortTags"] || [];
	}

	get shipId() {
		return new ShipId(
			this._data["vehicleSpecification"]["baseName"],
			this._data["vehicleSpecification"]["variant"]);
	}

	get displayName() {
		return nullifySentinel(this._data["displayName"]) ||
			this._data["vehicleSpecification"]["displayName"] ||
			this.shipId.combinedId;
	}

	get cargoCapacity() {
		return this._data["cargoCapacity"];
	}

	getAttributes() {
		const ifcsStates = _.keyBy(this._data["vehicleSpecification"]["movement"]["ifcsStates"], "state");
		const scmVelocity = _.get(ifcsStates, "flightSpace.scmMode.maxVelocity", 0);
		const cruiseVelocity = _.get(ifcsStates, "flightSpace.ab2CruMode.criuseSpeed", 0);

		const mannedTurrets = this.itemPorts.filter(p => p.matchesType("TurretBase", "MannedTurret"));

		const size = this._data["size"];
		let sizeCategory = "Small";
		if (!scmVelocity) {
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
				value: this._data["crewStations"] + mannedTurrets.length
			},
			{
				name: "Normal Speed",
				category: "Maneuverability",
				description: "Maximum speed in normal flight",
				value: scmVelocity
			},
			{
				name: "Afterburner Speed",
				category: "Maneuverability",
				description: "Maximum speed with afterburner engaged",
				value: cruiseVelocity
			},
			{
				name: "Total Hitpoints",
				category: "Survivability",
				description: "Total hitpoints of all ship parts",
				value: this._findParts().reduce((total, x) => total + (x["damageMax"] || 0), 0)
			}
		];
	}

	_findParts() {
		let unsearched = this._data["vehicleSpecification"]["parts"].slice();
		let result = [];
		while (unsearched.length > 0) {
			let potential = unsearched.pop();
			result.push(potential);
			potential["parts"].forEach(n => unsearched.push(n));
		}

		return result;
	}

	_findItemPorts() {
		return this._data["vehicleSpecification"]["ports"].map(x => new DataforgeItemPort(x));
	}

	_makeDefaultItems() {
		const loadout = allLoadouts[this._data["name"]];

		const makeStructure = function(hardpoints) {
			let result = {};
			if (hardpoints) {
				for (const hardpoint of hardpoints) {
					const itemName = _.get(hardpoint, "equipped.name");
					if (itemName) {
						let entry = {};
						entry.itemName = itemName;
						entry.children = makeStructure(hardpoint.hardpoints);
						result[hardpoint.name] = entry;
					}
				}
			}
			return result;
		};

		const structure = makeStructure(loadout["hardpoints"]);
		return structure;
	}
}

class DamageQuantity {
	constructor(distortion, energy, physical, thermal) {
		const makeNumber = x => Number(x) || 0;

		this._values = [makeNumber(distortion), makeNumber(energy), makeNumber(physical), makeNumber(thermal)];
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
		return DamageQuantity._fromValues(this._values.map((x, index) => x + quantity._values[index]));
	}

	scale(coefficient) {
		return DamageQuantity._fromValues(this._values.map(x => x * coefficient));
	}

	static _fromValues(values) {
		return new DamageQuantity(values[0], values[1], values[2], values[3]);
	}
}

class SummaryText {
	constructor(patterns, values) {
		this.patterns = patterns;
		this.values = values;

		if (!this.patterns) {
			this.patterns = ["No further information available"];
		}
	}

	render() {
		let getValue = key => {
			let value = _.get(this.values, key);

			if (value.toFixed) {
				// Round to two places and then drop any trailing 0s.
				value = this._formatThousands(+value.toFixed(2));
			}

			return '<span class="summary-value">' + value + '</span>';
		};

		const expanded = this.patterns.map(p => {
			const replaced = p.replace(/{[^}]+}/g, n => getValue(n.slice(1, -1)));
			return "<p>" + replaced + "</p>";
		}).join("");

		return '<span class="summary">' + expanded + '</span>';
	}

	_formatThousands(num) {
		var values = num.toString().split(".");
		return values[0].replace(/.(?=(?:.{3})+$)/g, "$&,") + ( values.length == 2 ? "." + values[1] : "" );
	}
}

class DataforgeComponent {
	constructor(data) {
		this._data = data;
		this._components = _.keyBy(this._data["components"], "name");
		this._connections = _.keyBy(this._data["connections"], "pipeClass");

		this.itemPorts = this._findItemPorts();
	}

	get displayName() {
		return nullifySentinel(this._data["displayName"]) || this.name;
	}

	get name() {
		return this._data["name"];
	}

	get type() {
		return this._data["type"]["type"];
	}

	get subtype() {
		return this._data["type"]["subType"];
	}

	get size() {
		return this._data["size"];
	}

	get requiredTags() {
		return this._data["itemRequiredTags"];
	}

	get bulletSpeed() {
		return _.get(this._components, "ammoContainer.ammo.speed", 0);
	}

	get bulletDuration() {
		return _.get(this._components, "ammoContainer.ammo.lifetime", 0);
	}

	get bulletRange() {
		return this.bulletSpeed * this.bulletDuration;
	}

	get bulletCount() {
		// TODO Support multiple firing modes.
		return _.get(this._components, "weapon.fireActions[0].pelletCount", 0);
	}

	get gunAlpha() {
		let damageInfo = _.get(this._components, "ammoContainer.ammo.areaDamage.damage");
		if (!damageInfo) {
			damageInfo = _.get(this._components, "ammoContainer.ammo.impactDamage.damage", []);
		}
		const damageMap = _.keyBy(damageInfo, "damageType");

		return new DamageQuantity(
			_.get(damageMap, "DISTORTION.value", 0),
			_.get(damageMap, "ENERGY.value", 0),
			_.get(damageMap, "PHYSICAL.value", 0),
			_.get(damageMap, "THERMAL.value", 0));
	}

	get gunFireRate() {
		// TODO Support multiple firing modes.
		return _.get(this._components, "weapon.fireActions[0].fireRate", 0);
	}

	get gunBurstDps() {
		const scaled = this.gunAlpha.scale(this.bulletCount * this.gunFireRate / 60.0);
		return scaled;
	}

	get gunStandbyHeat() {
		return _.get(this._components, "weapon.connection.heatRateOnline", 0);
	}

	get gunHeatPerShot() {
		// TODO Support multiple firing modes.
		return _.get(this._components, "weapon.fireActions[0].heatPerShot", 0);
	}

	get gunSustainedDps() {
		let sustainedRate = this.maxCooling / this.gunHeatPerShot;
		sustainedRate = Math.min(sustainedRate, this.gunFireRate / 60.0);

		const scaled = this.gunAlpha.scale(this.bulletCount * sustainedRate);
		return scaled;
	}

	get gunMaximumAmmo() {
		return _.get(this._components, "ammoContainer.maxAmmoCount", 0);
	}

	get gunMagazineDuration() {
		return this.gunMaximumAmmo * 60.0 / this.gunFireRate;
	}

	get gunMagazineDamage() {
		return this.gunAlpha.scale(this.bulletCount * this.gunMaximumAmmo);
	}

	get missileDamage() {
		const damageInfo = _.get(this._components, "missle.damage.damage", []);
		const damageMap = _.keyBy(damageInfo, "damageType");

		return new DamageQuantity(
			_.get(damageMap, "DISTORTION.value", 0),
			_.get(damageMap, "ENERGY.value", 0),
			_.get(damageMap, "PHYSICAL.value", 0),
			_.get(damageMap, "THERMAL.value", 0));
	}

	get missileRange() {
		return _.get(this._components, "missle.trackingDistanceMax", 0);
	}

	get missileGuidance() {
		return _.capitalize(_.get(this._components, "missle.trackingSignalType")) || "CrossSection";
	}

	get missileTrackingAngle() {
		return _.get(this._components, "missle.trackingAngle", 0);
	}

	get missileLockTime() {
		return _.get(this._components, "missle.lockTime", 0);
	}

	get missileMaximumSpeed() {
		return _.get(this._components, "missle.linearSpeed", 0);
	}

	get missileFlightTime() {
		return _.get(this._components, "missle.interceptTime", 0) + _.get(this._components, "missle.terminalTime", 0);
	}

	get missileFlightRange() {
		return this.missileMaximumSpeed * this.missileFlightTime;
	}

	get shieldCapacity() {
		return _.get(this._components, "shieldGenerator.maxShieldHealth", 0);
	}

	get shieldRegeneration() {
		return _.get(this._components, "shieldGenerator.maxShieldRegen", 0);
	}

	get shieldDownDelay() {
		return _.get(this._components, "shieldGenerator.downedRegenDelay", 0);
	}

	get quantumFuel() {
		return _.get(this._components, "quantumFuelTank.capacity", 0);
	}

	get quantumRange() {
		// Underlying unit appears to be kilometers; convert to gigameters.
		return _.get(this._components, "quantumDrive.jumpRange", 0) / 1000000;
	}

	get quantumEfficiency() {
		// Underlying unit is fuel used per megameter travelled; convert to fuel/gigameter.
		return _.get(this._components, "quantumDrive.quantumFuelRequirement", 0) * 1000;
	}

	get quantumSpeed() {
		// Underlying unit appears to be m/sec; convert to megameters/sec.
		return _.get(this._components, "quantumDrive.jump.driveSpeed", 0) / 1000000;
	}

	get quantumCooldown() {
		return _.get(this._components, "quantumDrive.jump.cooldownTime", 0);
	}

	get quantumSpoolTime() {
		return _.get(this._components, "quantumDrive.jump.spoolUpTime", 0);
	}

	get quantumCalibrationTime() {
		const required = _.get(this._components, "quantumDrive.jump.maxCalibrationRequirement", 0);
		const rate = _.get(this._components, "quantumDrive.jump.calibrationRate", 0);
		return required / rate;
	}

	get cargoCapacity() {
		// Capacity for cargo grids, both on ships and embedded into containers.
		return _.get(this._components, "cargoGrid.volume.cargoCapacity", 0);
	}

	get containerCapacity() {
		// Capacity of the cargo grids embedded in a container.
		if (this.type == "Container") {
			const ports = _.get(this._data, "ports", []);
			const embedded = ports.map(n => allItems[_.get(n, "_embedded.item.name")]).filter(n => n);
			const total = embedded.reduce((total, x) => total + x.cargoCapacity, 0);
			return total
		}

		return 0;
	}

	get powerBase() {
		if (this.type != "PowerPlant") {
			return _.get(this._connections, "POWER.powerBase", 0);
		}

		return 0;
	}

	get powerDraw() {
		if (this.type != "PowerPlant") {
			return _.get(this._connections, "POWER.powerDraw", 0);
		}

		return 0;
	}

	get powerIncrease() {
		return this.powerDraw - this.powerBase;
	}

	get powerGeneration() {
		if (this.type == "PowerPlant") {
			return _.get(this._connections, "POWER.powerDraw", 0);
		}

		return 0;
	}

	get powerToEm() {
		return _.get(this._connections, "POWER.powerToEM", 0);
	}

	get flightAngularPower() {
		return _.get(this._components, "flightController.powerUsage.angularAccelerationPowerAmount", 0);
	}

	get flightLinearPower() {
		return _.get(this._components, "flightController.powerUsage.linearAccelerationPowerAmount", 0);
	}

	get coolingCoefficient() {
		return _.get(this._connections, "HEAT.coolingCoefficient", 0);
	}

	get overheatTemperature() {
		const maxTemperature = _.get(this._connections, "HEAT.maximumTemperature", 0);
		const overheatRatio = _.get(this._connections, "HEAT.overheatTemperatureRatio", 0);

		return maxTemperature * overheatRatio;
	}

	get maxCooling() {
		// Newton's law of cooling; ambient temperature deduced to be 0.
		const afterOneSec = this.overheatTemperature * Math.exp(-1 * this.coolingCoefficient);
		return this.overheatTemperature - afterOneSec;
	}

	get summary() {
		if (this.type == "WeaponGun") {
			let damage = "{gunAlpha.total}";
			if (this.bulletCount > 1) {
				damage += " X {bulletCount}";
			}

			let summary = new SummaryText([
				"{gunBurstDps.total} dps = " + damage + " {gunAlpha.type} damage X {gunFireRate} rpm",
				"{gunSustainedDps.total} sustained dps ({gunHeatPerShot} heat/shot with {maxCooling} max cooling/sec)",
				"{bulletRange} meter range = {bulletSpeed} m/s projectile speed X {bulletDuration} seconds"], this);

			if (this.gunMaximumAmmo > 0) {
				summary.patterns.push("{gunMaximumAmmo} rounds deplete in {gunMagazineDuration} seconds for potentially {gunMagazineDamage.total} damage");
			}

			summary.patterns.push("{powerBase} power/second in standby and an additional {powerIncrease} when firing");

			return summary;
		}

		if (this.type == "Turret" || this.type == "TurretBase") {
			if (this.itemPorts[0]) {
				return new SummaryText(["{itemPorts.length} size {itemPorts.[0].maxSize} item ports"], this);
			}
		}

		if (this.type == "WeaponMissile") {
			return new SummaryText(["{itemPorts.length} size {itemPorts.[0].maxSize} missiles"], this);
		}

		if (this.type == "Shield") {
			return new SummaryText([
				"{shieldCapacity} shield capacity",
				"Regenerates {shieldRegeneration} capacity/second with a {shieldDownDelay} second delay after dropping",
				"{powerBase} power/second in standby and an additional {powerIncrease} when recharging"], this);
		}

		if (this.type == "QuantumDrive") {
			return new SummaryText([
				"{quantumRange} gigameter jump distance at {quantumSpeed} megameters/sec",
				"Consumes {quantumEfficiency} fuel per gigameter",
				"Calibrates in no less than {quantumCalibrationTime} seconds and spools in {quantumSpoolTime} seconds",
				"{quantumCooldown} second cooldown after jumping"], this);
		}

		if (this.type == "Ordinance") {
			return new SummaryText([
				"{missileDamage.total} {missileDamage.type} damage",
				"{missileLockTime} seconds lock time with {missileRange} meter lock range",
				"{missileGuidance} sensors with {missileTrackingAngle} degree view",
				"{missileFlightRange} meter flight = {missileMaximumSpeed} m/s speed X {missileFlightTime} seconds"], this);
		}

		if (this.type == "Container") {
			return new SummaryText([
				"{containerCapacity} SCUs cargo capacity"], this);
		}

		if (this.type == "PowerPlant") {
			return new SummaryText([
				"{powerGeneration} maximum power generation per second",
				"{powerToEm} increase in EM signature per power generated"], this);
		}

		return new SummaryText();
	}

	_findItemPorts() {
		return this._data["ports"].map(x => new DataforgeItemPort(x));
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
			// TODO The explicit "UNDEFINED" is for quantum drives; confirm with testing.
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

class DataforgeItemPort extends BaseItemPort {
	constructor(data) {
		super();

		this._data = data;

		this.name = data["name"];
		this.editable = !data["uneditable"];
	}

	get minSize() {
		return this._data["minSize"];
	}

	get maxSize() {
		return this._data["maxSize"];
	}

	get tags() {
		return this._data["portTags"];
	}

	get types() {
		return this._data["acceptsTypes"].map(x => new ItemPortType(x["type"], x["subType"]));
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
			return _.get(left, "name") == _.get(right, "name");
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
				// TODO Consider allowing different types of turrets that share child ports to group.
				(g[0].port.editable || _.get(g[0].selectedComponent, "name") == _.get(binding.selectedComponent, "name")) &&
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
	constructor(port, parentBinding, defaultItems = undefined) {
		this.port = port;
		this.parentBinding = parentBinding;
		this.childBindings = {};

		this.defaultComponent = undefined;
		if (defaultItems) {
			const defaultComponentName = this._getDefaultComponent(defaultItems);

			if (defaultComponentName) {
				this.defaultComponent = allItems[defaultComponentName];
			}
		}

		this._setSelectedComponent(this.defaultComponent, defaultItems);
	}

	get selectedComponent() {
		return this._selectedComponent;
	}

	set selectedComponent(component) {
		this._setSelectedComponent(component);
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
				Vue.set(this.childBindings, childPort.name, new ItemBinding(childPort, this, defaultItems));
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
			this.childBindings[shipPort.name] = new ItemBinding(shipPort, undefined, this._specification.defaultItems);
		}

		this.childGroups = ItemBindingGroup.findGroups(Object.values(this.childBindings));
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

	getAttributes(category=undefined, context=undefined) {
		const allComponents = this._getAllAttachedComponents();
		const weaponComponents = allComponents.filter(x => x.type == "WeaponGun");
		const shieldComponents = allComponents.filter(x => x.type == "Shield");

		const quantumFuel = allComponents.reduce((total, x) => total + x.quantumFuel, 0);
		const quantumEfficiency = allComponents.reduce((total, x) => total + x.quantumEfficiency, 0);
		const containerCapacity = allComponents.reduce((total, x) => total + x.containerCapacity, 0);

		const powerUsages = [
			{
				name: "Standby Usage",
				category: "Power Usage",
				description: "Total power consumption of all components in standby mode",
				value: Math.round(allComponents.reduce((total, x) => total + x.powerBase, 0)),
				_disabled: true
			},
			{
				name: "Weapons Firing Usage",
				category: "Power Usage",
				description: "Additional power consumed when all weapons are firing",
				value: Math.round(weaponComponents.reduce((total, x) => total + x.powerIncrease, 0))
			},
			{
				name: "Shield Recharge Usage",
				category: "Power Usage",
				description: "Additional power consumed when shields are actively recharging",
				value: Math.round(shieldComponents.reduce((total, x) => total + x.powerIncrease, 0))
			},
			{
				name: "Forward Acceleration Usage",
				category: "Power Usage",
				description: "Additional power consumed when accelerating forward",
				value: Math.round(allComponents.reduce((total, x) => total + x.flightLinearPower, 0))
			},
			{
				name: "Maneuvering Usage",
				category: "Power Usage",
				description: "Additional power consumed when applying rotational acceleration",
				value: Math.round(allComponents.reduce((total, x) => total + x.flightAngularPower, 0))
			}
		];

		let selectedPowerUsage = 0;
		if (context) {
			selectedPowerUsage = _.sum(powerUsages.filter(x => x.name in context.selectedPowerUsages).map(x => x.value));
		}

		let attributes = this._specification.getAttributes();
		attributes = attributes.concat(powerUsages);

		attributes = attributes.concat([
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
				category: "Utility",
				description: "Total cargo capacity in SCUs",
				value: this._specification.cargoCapacity + containerCapacity
			},
			{
				name: "Power Generation",
				category: "Power",
				description: "Total power generating capacity of all power plants",
				value: Math.round(allComponents.reduce((total, x) => total + x.powerGeneration, 0))
			},
			{
				name: "Selected Power Usage",
				category: "Power",
				description: "Sum of all selected power usages",
				value: selectedPowerUsage
			},
			{
				name: "Total Shields",
				category: "Survivability",
				description: "Total capacity of all shield generators",
				value: Math.round(allComponents.reduce((total, x) => total + x.shieldCapacity, 0))
			},
			{
				name: "Total Burst DPS",
				category: "Damage",
				description: "Total gun DPS without considering heat, power, or ammo",
				value: Math.round(allComponents.reduce((total, x) => total + x.gunBurstDps.total, 0))
			},
			{
				name: "Total Sustained DPS",
				description: "Total gun DPS that can be sustained indefinitely",
				category: "Damage",
				value: Math.round(allComponents.reduce((total, x) => total + x.gunSustainedDps.total, 0))
			},
			{
				name: "Total Missile Damage",
				description: "Total potential damage of all missiles",
				category: "Damage",
				value: Math.round(allComponents.reduce((total, x) => total + x.missileDamage.total, 0))
			},
			{
				name: "Quantum Speed",
				description: "Max quantum travel speed in megameters/sec",
				category: "Travel",
				value: _.round(allComponents.reduce((total, x) => total + x.quantumSpeed, 0), 2)
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
			}
		]);

		const overrides = shipAttributeOverrides[this.shipId.combinedId];
		if (overrides) {
			Object.keys(overrides).forEach(k => attributes.find(a => a.name == k).value = overrides[k]);
		}

		if (category) {
			attributes = attributes.filter(n => n.category == category);
		}
		return attributes;
	}

	get _specification() {
		return allVehicles[this.shipId.combinedId];
	}

	_getAllAttachedComponents() {
		const traverse = (binding) => {
			let result = [binding.selectedComponent];
			for (const child of Object.values(binding.childBindings)) {
				result = result.concat(traverse(child));
			}

			return result;
		};

		let result = [];
		for (const binding of Object.values(this.childBindings)) {
			result = result.concat(traverse(binding));
		}

		result = result.filter(n => n);
		return result;
	}
}


// Translate underlying data into model objects.
var allLoadouts = loadoutData;

var allVehicles = {}
for (const key of Object.keys(vehicleData)) {
	const specification = new ShipSpecification(vehicleData[key]);
	allVehicles[specification.shipId.combinedId] = specification;
}

var allItems = {}
for (const key of Object.keys(itemData)) {
	allItems[key] = new DataforgeComponent(itemData[key]);
}


// Immutable array of customizations for all the stock ships.
// Needs to be global so that it can be referenced from the router on initial page load.
const makeDefaultShipCustomizations = function() {
	const customizations = Object.values(allVehicles).map(n => new ShipCustomization(n.shipId));
	return customizations;
};
var defaultShipCustomizations = makeDefaultShipCustomizations();


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
				const selectedComponent = this.allGroups[0].members[0].selectedComponent;
				const childBindings = this.allGroups[0].members[0].childBindings;

				for (const group of this.allGroups) {
					for (const other of group.members) {
						// Always set the component when linking a group. Multi-select should stick and be consistent.
						other.selectedComponent = selectedComponent;

						// TODO Currently ignoring third-level ports.
						if (other.portPath.length == 1) {
							for (const childName of Object.keys(childBindings)) {
								other.childBindings[childName].selectedComponent = childBindings[childName].selectedComponent;
							}
						}
					}
				}
			}
		}
	}
});

var componentDisplay = Vue.component('component-display', {
	template: '#component-display',
	props: ['componentName', 'disabled'],
	computed: {
		component: function () {
			return allItems[this.componentName];
		}
	}
});

// itemPorts and parentItemPorts are arrays, so the selector can be bound to multiple item ports.
// If so, the selector assumes all the ports are all identical to the first!
var componentSelector = Vue.component('component-selector', {
	template: '#component-selector',
	props: ['customization', 'bindings'],
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
		}
	},
	methods: {
		onVisibleChange: function(visible) {
			this.visible = visible;

			// Fix the width of the dropdown dynamically since the dropdown widget doesn't handle padding.
			const elementWidth = this.$refs["dropdown"].$el.offsetWidth;
			this.$refs["dropdown"].$refs["drop"].$el.style.width = elementWidth + "px";
		},
		onClick: function(name) {
			// Don't set component if it didn't change, because that would clear the child ports unnecessarily.
			// Set it if it's changing for other group members, though. Multi-select should stick and be consistent.
			if (!this.bindings.every(b => _.get(b.selectedComponent, "name") == name)) {
				for (const binding of this.bindings) {
					binding.selectedComponent = allItems[name];
				}
			}
		}
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
						return h('Button', {
							props: {
								type: "primary",
								size: "small"
							},
							on: {
								click: () => {
									this.customize(params.row.serialized, params.row.storageKey)
								}
							}
						}, "Edit");
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
					title: "SCM",
					key: "Normal Speed",
					sortable: true,
					renderHeader: this.renderSortableHeaderWithTooltip,
					minWidth: 60
				},
				{
					title: "Afterburner",
					key: "Afterburner Speed",
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
				const attributes = c.getAttributes();
				let reduced = attributes.reduce((total, a) => {
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
			return defaultShipCustomizations[0].getAttributes().reduce((total, a) => {
				total[a.name] = a.description;
				return total;
			}, {});
		}
	},
	methods: {
		customize(serialized, storageKey = undefined) {
			if (storageKey) {
				this.$router.push({ name: "loadout", params: {storageKey: storageKey, serialized: serialized}});
			}
			else {
				this.$router.push({ name: "customize", params: {serialized: serialized}});
			}
		},
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
		},
		getAttributeFilter(key) {
			const unique = [...new Set(defaultShipCustomizations.map(c => c.getAttributes().find(e => e.name == key).value))];
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

			// Dictionary where the values are ignored to make a reactive set.
			selectedPowerUsages: {"Standby Usage": true, "Weapons Firing Usage": true, "Maneuvering Usage": true},

			// Also defines the section display order.
			sectionNames: ["Guns", "Missiles", "Systems"],
			expandedSections: ["Guns", "Missiles", "Systems"],
			// Also defines the section precedence order; lowest precedence is first.
			sectionDefinitions: {
				"Guns": ["WeaponGun", "Turret", "TurretBase"],
				"Missiles": ["WeaponMissile"],
				"Systems": ["Cooler", "Shield", "PowerPlant", "QuantumDrive"]
			},

			utilityColumns: [
				{
					title: "Utility",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			],
			powerColumns: [
				{
					title: "Power",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			],
			powerUsageColumns: [
				{
					width: 30,
					align: "center",
					render: (h, params) => {
						return h("Checkbox", {
							props: {
								value: params.row.name in this.selectedPowerUsages,
								disabled: params.row._disabled
							},
							on: {
								input: (value) => {
									if (value) {
										Vue.set(this.selectedPowerUsages, params.row.name, true);
									}
									else {
										Vue.delete(this.selectedPowerUsages, params.row.name);
									}

									this.$emit("input", value)
								}
							}
						});
					}
				},
				{
					title: "Power",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			],
			damageColumns: [
				{
					title: "Damage",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			],
			maneuverabilityColumns: [
				{
					title: "Maneuverability",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			],
			survivabilityColumns: [
				{
					title: "Survivability",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			],
			travelColumns: [
				{
					title: "Travel",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					align: "right",
					width: 60
				}
			]
		}
	},
	watch: {
		selectedCustomization: {
			handler: function(val) {
				const serialized = val.serialize();

				let url = new URL(location.href);
				url.hash = url.hash.split("/").slice(0, -1).concat(serialized).join("/");
				history.replaceState(history.state, document.title, url.href);

				if (val.storageKey) {
					loadoutStorage.set(val, serialized);
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
		}
	},
	methods: {
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

			const filtered = sectionalized.filter(g => !excludedTypes.some(e => g.members[0].port.matchesType(e, undefined)));
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
		},
		onClickDelete: function(event) {
			loadoutStorage.remove(this.selectedCustomization.storageKey);
			this.selectedCustomization.storageKey = undefined;
			this.selectedCustomization.name = undefined;

			// Update the URL back to the non-loadout version of the same customization.
			history.replaceState(history.state, document.title, makeCustomizationUrl().href);
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
			return metaData.dataload.gameDataVersion;
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