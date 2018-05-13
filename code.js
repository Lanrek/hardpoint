var copyShareableLink = new ClipboardJS(".clipboard-button", {
  text: function() {
    return window.location.href;
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

var hashAndEncode = function(str) {
	 const hash = hashString(str);

	 // Limit to 24 bits for nice alignment with four base64 characters.
	 const unencoded =
		String.fromCharCode((hash & 0xff0000) >> 16) +
		String.fromCharCode((hash & 0xff00) >> 8) +
		String.fromCharCode(hash & 0xff);

	return btoa(unencoded).replace(/\+/g, '-').replace(/\//g, '_');
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


class ShipId {
	constructor(specificationId, modificationId, loadoutId) {
		this.specificationId = specificationId;
		this.modificationId = modificationId;
		this.loadoutId = loadoutId;
	}

	get combinedId() {
		let key = this.specificationId;
		if (this.modificationId) {
			key += "_" + this.modificationId;
		}

		return key;
	}

	serialize() {
		return hashAndEncode(this.specificationId) + hashAndEncode(this.modificationId) + hashAndEncode(this.loadoutId);
	}

	static deserialize(str) {
		const hashedSpecificationId = str.substr(0, 4);
		const hashedModificationId = str.substr(4, 4);
		const hashedLoadoutId = str.substr(8, 4);

		const specificationId = Object.keys(shipSpecifications).find(n => hashAndEncode(n) == hashedSpecificationId);

		return new ShipId(
			specificationId,
			shipSpecifications[specificationId].modificationIds.find(n => hashAndEncode(n) == hashedModificationId),
			Object.keys(shipLoadouts).find(n => hashAndEncode(n) == hashedLoadoutId));
	}

	static findLoadout(specificationId, modificationId) {
		// This is crazy -- must be missing something about how loadouts are bound to ships.
		let loadoutId;
		const tryLoadoutId = id => {
			if (!loadoutId) {
				if (shipLoadouts[id]) {
					loadoutId = id;
				}
			}
		}

		const specificationData = shipSpecifications[specificationId]._data;
		if (modificationId) {
			tryLoadoutId(specificationId + "_" + modificationId);

			const patchFile = specificationData["Modifications"][modificationId]["@patchFile"];
			if (patchFile) {
				const fileName = patchFile.split("/").pop();
				tryLoadoutId(fileName + "_" + modificationId);
				tryLoadoutId(fileName);
			}
		}
		else
		{
			tryLoadoutId(specificationId);
			if (specificationData["@local"]) {
				// The worst hack of this mess, but necessary for the Constellation Andromeda.
				tryLoadoutId(specificationData["@local"].replace(/ /g, "_"));
			}
		}

		return new ShipId(specificationId, modificationId, loadoutId);
	}
}

class ShipSpecification {
	constructor(data) {
		this._data = data;

		this._itemPorts = this._findItemPorts(undefined);
		this._modificationItemPorts = {};
		this.modificationIds.forEach(n => this._modificationItemPorts[n] = this._findItemPorts(n));
	}

	get tags() {
		if (this._data["@itemPortTags"]) {
			return this._data["@itemPortTags"].split(" ");
		}

		return [];
	}

	get modificationIds() {
		return Object.keys(this._data["Modifications"] || {});
	}

	getCombinedId(modificationId) {
		let key = this._data["@name"];
		if (modificationId) {
			key += "_" + modificationId;
		}

		return key;
	}

	getDisplayName(modificationId) {
		// The underlying data here is rather unpleasant, but this implementation is verified against the fleet manager
		// screen in-game. Particularly the Mustang line, where the Alpha has a "CNOU" prefix and the others "C.O.".
		// Priority is given to the vehicle name in the localization file, but if that's not present it falls back to
		// the display name on the ship itself... with a patching mechanism for modifications.
		let displayName = localizationVehicles[this.getCombinedId(modificationId)];

		if (!displayName) {
			displayName = this._data["@displayname"];
			if (modificationId) {
				const elems = this._data["Modifications"][modificationId]["Elems"];
				if (elems) {
					const replacement = elems.find(e => e["@idRef"] == this._data["@id"] && e["@name"] == "displayname");
					if (replacement) {
						displayName = replacement["@value"];
					}
				}
			}
		}

		return displayName;
	}

	getItemPorts(modificationId) {
		if (modificationId) {
			return this._modificationItemPorts[modificationId];
		}

		return this._itemPorts;
	}

	getModificationLoadouts() {
		const modifications = [undefined].concat(this.modificationIds);
		let results = modifications.map(x => ShipId.findLoadout(this._data["@name"], x));

		// Filter out anything that doesn't have a valid loadout.
		results = results.filter(n => n.loadoutId);

		return results;
	}

	getAttributes(modificationId) {
		const scmVelocity = Number(this._data["ifcs"]["@SCMVelocity"]);

		const ports = this.getItemPorts(modificationId);
		const seats = ports.filter(p => p.matchesType("Seat"));
		const crewSeats = seats.filter(s =>
			_.get(s._data, "ControllerDef.UserDef.Observerables.Observerable") ||
			_.get(s._data, "ControllerDef[0].UserDef.Observerables.Observerable"));
		const mannedTurrets = ports.filter(p => p.matchesType("TurretBase", "MannedTurret"));

		const size = Number(this._data["@size"]);
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
				value: crewSeats.length + mannedTurrets.length
			},
			{
				name: "Normal Speed",
				category: "Maneuverability",
				description: "Maximum speed in normal flight",
				value: scmVelocity || 0
			},
			{
				name: "Afterburner Speed",
				category: "Maneuverability",
				description: "Maximum speed with afterburner engaged",
				value: Number(this._data["ifcs"]["@CruiseSpeed"]) || 0
			},
			{
				name: "Total Hitpoints",
				category: "Survivability",
				description: "Total hitpoints of all ship parts",
				value: this._findParts(modificationId).reduce((total, x) => total + Number(x["@damageMax"] || 0), 0)
			}
		];
	}

	_findParts(modificationId, className = undefined) {
		let unsearched = [this._data["Parts"]["Part"]];
		if (modificationId) {
			const modification = this._data["Modifications"][modificationId];
			if (modification["mod"] && modification["mod"]["Parts"]) {
				unsearched = [modification["mod"]["Parts"]["Part"]];
			}
		}

		let result = [];
		while (unsearched.length > 0) {
			const potential = unsearched.pop();

			// TODO Also need to look at the Elems of modifications for overrides!
			if (Boolean(Number(potential["@skipPart"]))) {
				continue;
			}

			if (!className || potential["@class"] == className) {
				result.push(potential);
			}

			if (potential["Parts"] && potential["Parts"]["Part"])
			{
				if (Array.isArray(potential["Parts"]["Part"])) {
					potential["Parts"]["Part"].forEach(n => unsearched.push(n));
				}
				else {
					unsearched.push(potential["Parts"]["Part"]);
				}
			}
		}

		return result;
	}

	_findItemPorts(modificationId = undefined) {
		const itemPorts = this._findParts(modificationId, "ItemPort");

		return itemPorts.filter(n => n["ItemPort"]).map(function (part) {
			return new SpaceshipItemPort(part["ItemPort"], part["@name"]);
		});
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
			this.patterns = ["Boring"];
		}
	}

	render() {
		let getValue = key => {
			let value = _.get(this.values, key);

			if (value.toFixed) {
				// Round to two places and then drop any trailing 0s.
				value = +value.toFixed(2);
			}

			return '<span class="summary-value">' + value + '</span>';
		};

		const expanded = this.patterns.map(p => {
			const replaced = p.replace(/{[^}]+}/g, n => getValue(n.slice(1, -1)));
			return "<p>" + replaced + "</p>";
		}).join("");

		return '<span class="summary">' + expanded + '</span>';
	}
}

class SpaceshipComponent {
	constructor(data) {
		this._data = data;

		this.itemPorts = this._findItemPorts();
	}

	get displayName() {
		return localizationItems[this.name] || this.name;
	}

	get name() {
		return this._data["@name"];
	}

	get type() {
		return this._data["@itemType"];
	}

	get subtype() {
		return this._data["@itemSubType"];
	}

	get size() {
		return this._data["@itemSize"];
	}

	get requiredTags() {
		if (!this._data["@requiredPortTags"]) {
			return [];
		}

		return this._data["@requiredPortTags"].split(" ");
	}

	get bulletSpeed() {
		if (this.type == "WeaponGun") {
			const ammo = this._data["ammo"];
			if (!ammo) {
				return 0;
			}

			return ammo["@speed"];
		}

		return 0;
	}

	get bulletDuration() {
		if (this.type == "WeaponGun") {
			const ammo = this._data["ammo"];
			if (!ammo) {
				return 0;
			}

			return ammo["@lifetime"];
		}

		return 0;
	}

	get bulletRange() {
		return this.bulletSpeed * this.bulletDuration;
	}

	get bulletCount() {
		if (this.type == "WeaponGun") {
			const shotgun = this._data["firemodes"]["shotgun"];
			if (shotgun) {
				return Number(shotgun["pellets"]) || 0;
			}
			return 1;
		}

		return 0;
	}

	get gunAlpha() {
		if (this.type == "WeaponGun") {
			const ammo = this._data["ammo"];
			if (!ammo) {
				return new DamageQuantity(0, 0, 0, 0);
			}

			const detonation = ammo["bullet"]["detonation"];
			let damageInfo;
			if (detonation) {
				damageInfo = detonation["explosion"]["damage"]["DamageInfo"];
			}
			else {
				damageInfo = ammo["bullet"]["damage"]["DamageInfo"];
			}

			return new DamageQuantity(
				damageInfo["@DamageDistortion"],
				damageInfo["@DamageEnergy"],
				damageInfo["@DamagePhysical"],
				damageInfo["@DamageThermal"]);
		}

		return new DamageQuantity(0, 0, 0, 0);
	}

	get gunFireRate() {
		if (this.type == "WeaponGun") {
			return Number(this._data["firemodes"]["fire"]["rate"]) || 0;
		}

		return 0;
	}

	get gunBurstDps() {
		const scaled = this.gunAlpha.scale(this.bulletCount + this.gunFireRate / 60.0);
		return scaled;
	}

	get gunSustainedDps() {
		// TODO Actually calculate heat and energy limits based on ship equipment.
		if (this.type == "WeaponGun") {
			const derived = this._data["derived"];
			const quantity = new DamageQuantity(
				derived["dps_60s_dmg_dist"],
				derived["dps_60s_dmg_enrg"],
				derived["dps_60s_dmg_phys"],
				derived["dps_60s_dmg_thrm"]);

			return quantity;
		}

		return new DamageQuantity(0, 0, 0, 0);
	}

	get missileDamage() {
		if (this.type == "Ordinance") {
			const explosion = this._data["explosion"];
			const quantity = new DamageQuantity(
				explosion["damage_distortion"],
				explosion["damage_energy"],
				explosion["damage"],
				0);

			return quantity;
		}

		return new DamageQuantity(0, 0, 0, 0);
	}

	get missileRange() {
		if (this.type == "Ordinance") {
			return this._data["derived"]["max_range"];
		}

		return 0;
	}

	get missileGuidance() {
		if (this.type == "Ordinance") {
			return this._data["missile"]["MGCS"]["tracking"]["signalType"];
		}

		return "";
	}

	get shieldCapacity() {
		return 0;
	}

	get shieldRegeneration() {
		return 0;
	}

	get shieldDownDelay() {
		return 0;
	}

	get quantumFuel() {
		return 0;
	}

	get quantumRange() {
		return 0;
	}

	get quantumEfficiency() {
		return 0;
	}

	get quantumCooldown() {
		return 0;
	}

	get quantumSpeed() {
		return 0;
	}

	get summary() {
		if (this.type == "WeaponGun") {
			let damage = "{gunAlpha.total}";
			if (this.bulletCount > 1) {
				damage += " X {bulletCount}";
			}

			return new SummaryText([
				damage + " {gunAlpha.type} damage X {gunFireRate}rpm = {gunBurstDps.total}dps",
				"{gunSustainedDps.total} sustained dps (limited by heat)",
				"{bulletSpeed}m/s projectile speed X {bulletDuration}sec = {bulletRange}m range"], this);
		}

		if (this.type == "Ordinance") {
			return new SummaryText([
				"{missileDamage.total} {missileDamage.type} damage",
				"{missileGuidance} tracking with {missileRange}m max range"], this);
		}

		return new SummaryText();
	}

	_findItemPorts() {
		if (!this._data["ports"]) {
			return [];
		}

		return this._data["ports"].map(port => new SpaceshipItemPort(port, port["@name"]));
	}
}

class DataforgeComponent {
	constructor(data) {
		this._data = data;

		this.itemPorts = this._findItemPorts();
	}

	get displayName() {
		return localizationItems[this.name] || this.name;
	}

	get name() {
		return this._data["@name"];
	}

	get type() {
		return this._data["@type"];
	}

	get subtype() {
		return this._data["Components"]["SCItem"]["ItemDefinition"]["@SubType"];
	}

	get size() {
		return this._data["@size"];
	}

	get requiredTags() {
		const tags = this._data["Components"]["SCItem"]["ItemDefinition"]["@RequiredTags"];
		if (!tags) {
			return [];
		}

		return tags.split(" ");
	}

	get bulletSpeed() {
		return 0;
	}

	get bulletDuration() {
		return 0;
	}

	get bulletRange() {
		return 0;
	}

	get bulletCount() {
		return 0;
	}

	get gunAlpha() {
		return new DamageQuantity(0, 0, 0, 0);
	}

	get gunFireRate() {
		return 0;
	}

	get gunBurstDps() {
		return new DamageQuantity(0, 0, 0, 0);
	}

	get gunSustainedDps() {
		return new DamageQuantity(0, 0, 0, 0);
	}

	get missileDamage() {
		return new DamageQuantity(0, 0, 0, 0);
	}

	get missileRange() {
		return 0;
	}

	get missileGuidance() {
		return "";
	}

	get shieldCapacity() {
		return Number(_.get(this._data,
			"Components.SCItemShieldGeneratorParams.ShieldEmitterContributions.@MaxShieldHealth", 0));
	}

	get shieldRegeneration() {
		return Number(_.get(this._data,
			"Components.SCItemShieldGeneratorParams.ShieldEmitterContributions.@MaxShieldRegen", 0));
	}

	get shieldDownDelay() {
		return Number(_.get(this._data,
			"Components.SCItemShieldGeneratorParams.ShieldEmitterContributions.@DownedRegenDelay", 0));
	}

	get quantumFuel() {
		if (this.type == "QuantumFuelTank") {
			return Number(_.get(this._data, "Components.SCItemFuelTankParams.@capacity", 0));
		}

		return 0;
	}

	get quantumRange() {
		// Underlying unit appears to be kilometers; convert to gigameters.
		return Number(_.get(this._data, "Components.SCItemQuantumDriveParams.@jumpRange", 0)) / 1000000;
	}

	get quantumEfficiency() {
		// Underlying unit appears to be fuel used per 1000km travelled.
		return Number(_.get(this._data, "Components.SCItemQuantumDriveParams.@quantumFuelRequirement", 0));
	}

	get quantumCooldown() {
		return Number(_.get(this._data, "Components.SCItemQuantumDriveParams.params.@cooldownTime", 0));
	}

	get quantumSpeed() {
		// Underlying unit appears to be m/sec; convert to megameters/sec.
		return Number(_.get(this._data, "Components.SCItemQuantumDriveParams.params.@driveSpeed", 0)) / 1000000;
	}

	get summary() {
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
				"{shieldRegeneration}/sec regeneration with a {shieldDownDelay} sec delay after dropping"], this);
		}

		if (this.type == "QuantumDrive") {
			return new SummaryText([
				"{quantumRange} gigameter jump distance at {quantumSpeed} megameters/sec",
				"Consumes {quantumEfficiency} fuel per megameter",
				"{quantumCooldown} second cooldown"], this);
		}

		return new SummaryText();
	}

	_findItemPorts() {
		let ports = this._data["Components"]["SCItem"]["ItemPorts"];
		if (!ports) {
			return [];
		}

		ports = ports["SItemPortCoreParams"]["Ports"];
		if (!ports) {
			return [];
		}

		ports = ports["SItemPortDef"];
		if (!Array.isArray(ports)) {
			ports = [ports];
		}

		return ports.map(port => new DataforgeItemPort(port));
	}
}

class ItemPortType {
	constructor(type, subtypes) {
		this.type = type;

		this.subtypes = [];
		if (subtypes) {
			this.subtypes = subtypes.split(",");
		}
	}
}

class BaseItemPort {
	availableComponents(tags) {
		return Object.keys(mergedComponents).filter(n => this.matchesComponent(tags, mergedComponents[n]));
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
				if (portType.subtypes.length > 0) {
					if (!portType.subtypes.some(s => s == subtype)) {
						return false;
					}
				}
			}

			return true;
		});
	}

	matchesComponent(tags, component) {
		if (!this.matchesType(component.type, component.subtype)) {
			return false;
		}

		if (this.minSize != undefined && component.size < this.minSize) {
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

class SpaceshipItemPort extends BaseItemPort {
	constructor(data, name) {
		super();

		this._data = data;

		this.name = name;
		this.editable = !(data["@flags"] || "").includes("uneditable");
	}

	get minSize() {
		return this._data['@minsize'];
	}

	get maxSize() {
		return this._data['@maxsize'];
	}

	get tags() {
		if (this._data["@portTags"]) {
			return this._data["@portTags"].split(" ");
		}

		return [];
	}

	get types() {
		if (this._data == undefined || this._data["Types"] == undefined) {
			return [];
		}

		let types = this._data["Types"]["Type"];
		if (!Array.isArray(types)) {
			types = [types];
		}

		return types.map(x => {
			const type = x["@type"];

			// It looks like there are implicit defaults; the Sabre is an example.
			let subtypes = x["@subtypes"];
			if (!subtypes) {
				if (type == "WeaponGun") {
					subtypes = "Gun";
				}
				else if (type == "Turret") {
					subtypes = "GunTurret";
				}
			}

			return new ItemPortType(type, subtypes);
		});
	}
}

class DataforgeItemPort extends BaseItemPort {
	constructor(data) {
		super();

		this._data = data;

		this.name = data["@Name"];
		this.editable = !(data["@Flags"] || "").includes("uneditable");
	}

	get minSize() {
		return this._data['@MinSize'];
	}

	get maxSize() {
		return this._data['@MaxSize'];
	}

	get tags() {
		if (this._data["@PortTags"]) {
			return this._data["@PortTags"].split(" ");
		}

		return [];
	}

	get types() {
		const subtypes = this._data["Types"]["SItemPortDefTypes"]["SubTypes"];
		if (subtypes) {
			var subtype = subtypes["Enum"]["@value"];
		}

		const type = new ItemPortType(
			this._data["Types"]["SItemPortDefTypes"]["@Type"],
			subtype);
		return [type];
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
	constructor(port, parentBinding, loadout = undefined) {
		this.port = port;
		this.parentBinding = parentBinding;
		this.childBindings = {};

		this.defaultComponent = undefined;
		if (loadout) {
			const defaultComponentName = this._getComponentFromLoadout(loadout);
			if (defaultComponentName) {
				this.defaultComponent = mergedComponents[defaultComponentName];
			}
		}

		this._setSelectedComponent(this.defaultComponent, loadout);
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

	// Takes a loadout only for initial construction; changes will leave it undefined.
	_setSelectedComponent(component, loadout = undefined) {
		this._selectedComponent = component;

		// Also update the children when the selected component changes.
		this.childBindings = {};
		if (component) {
			for (const childPort of component.itemPorts) {
				// Make the new child reactive.
				Vue.set(this.childBindings, childPort.name, new ItemBinding(childPort, this, loadout));
			}
		}
	}

	_getComponentFromLoadout(loadout) {
		let container = loadout;
		let entry;

		for (const portName of this.portPath) {
			if (!container) {
				return undefined;
			}
			entry = container.find(n => n[portName] != undefined);
			container = _.get(entry, "attached");
		}

		return _.get(entry, this.portPath.slice(-1)[0]);
	}
}

class ShipCustomization {
	constructor(shipId) {
		this.shipId = shipId;

		this.childBindings = {};
		for (const shipPort of this._specification.getItemPorts(this.shipId.modificationId)) {
			this.childBindings[shipPort.name] = new ItemBinding(shipPort, undefined, this._loadout);
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

	static deserialize(str) {
		const version = str.substr(0, 1);
		const shipId = str.substr(1, 12);
		let customization = new ShipCustomization(ShipId.deserialize(shipId));

		const findComponent = (hashedName) => {
			// TODO Also restrict this to matching components, to reduce hash collision chance.
			const componentName = Object.keys(mergedComponents).find(k => hashAndEncode(k) == hashedName);
			return mergedComponents[componentName];
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
		return this._specification.getDisplayName(this.shipId.modificationId) || this.shipId.combinedId;
	}

	get manufacturer() {
		const split = this.displayName.split(/[ _]/);
		return split[0].trim();
	}

	get shortName() {
		const split = this.displayName.split(/[ _]/);
		return split.slice(1).join(" ").trim();
	}

	// Abstracted because ship modifications will probably have their own tags eventually.
	get tags() {
		return this._specification.tags;
	}

	getAttributes(category=undefined) {
		const quantumFuel = this._getAllAttachedComponents().reduce((total, x) => total + x.quantumFuel, 0);
		const quantumEfficiency = this._getAllAttachedComponents().reduce((total, x) => total + x.quantumEfficiency, 0);

		let attributes = this._specification.getAttributes(this.shipId.modificationId);

		attributes = attributes.concat([
			{
				name: "Name",
				category: "Description",
				value: this.shortName
			},
			{
				name: "Manufacturer",
				category: "Description",
				value: this.manufacturer
			},
			{
				name: "Total Shields",
				category: "Survivability",
				description: "Total capacity of all shield generators",
				value: Math.round(this._getAllAttachedComponents().reduce((total, x) => total + x.shieldCapacity, 0))
			},
			{
				name: "Total Burst DPS",
				category: "Damage",
				description: "Total gun DPS without considering heat, power, or ammo",
				value: Math.round(this._getAllAttachedComponents().reduce((total, x) => total + x.gunBurstDps.total, 0))
			},
			{
				name: "Total Sustained DPS",
				description: "Total gun DPS that can be sustained indefinitely",
				category: "Damage",
				value: Math.round(this._getAllAttachedComponents().reduce((total, x) => total + x.gunSustainedDps.total, 0))
			},
			{
				name: "Total Missile Damage",
				description: "Total potential damage of all missiles",
				category: "Damage",
				value: Math.round(this._getAllAttachedComponents().reduce((total, x) => total + x.missileDamage.total, 0))
			},
			{
				name: "Quantum Speed",
				description: "Max quantum travel speed in megameters/sec",
				category: "Travel",
				value: _.round(this._getAllAttachedComponents().reduce((total, x) => total + x.quantumSpeed, 0), 2)
			},
			{
				name: "Quantum Fuel",
				description: "Total capacity of all quantum fuel tanks",
				category: "Travel",
				value: Math.round(quantumFuel)
			},
			{
				name: "Quantum Range",
				description: "Megameters of quantum travel range based on fuel capacity",
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
		return shipSpecifications[this.shipId.specificationId];
	}

	get _loadout() {
		return shipLoadouts[this.shipId.loadoutId];
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
for (const key of Object.keys(shipSpecifications)) {
	shipSpecifications[key] = new ShipSpecification(shipSpecifications[key]);
}

var mergedComponents = {}
for (const key of Object.keys(dataforgeComponents)) {
	mergedComponents[key] = new DataforgeComponent(dataforgeComponents[key]);
}
for (const key of Object.keys(spaceshipComponents)) {
	if (!(key in mergedComponents)) {
		mergedComponents[key] = new SpaceshipComponent(spaceshipComponents[key]);
	}
}

var localizationItems = {};
var localizationVehicles = {};
for (const entry of localizationStrings) {
	if (entry["item_Name"]) {
		localizationItems[entry["item"]] = entry["item_Name"];
	}
	else if (entry["vehicle_Name"]) {
		localizationVehicles[entry["item"]] = entry["vehicle_Name"];
	}
}


// Immutable array of customizations for all the stock ships.
// Needs to be global so that it can be referenced from the router on initial page load.
const makeDefaultShipCustomizations = function() {
	const unflattened = Object.values(shipSpecifications).map(n => n.getModificationLoadouts());
	const flattened = unflattened.reduce((total, n) => total.concat(n), []);

	// TODO This filtering mechanism is terrible.

	const npcModifications = ["Pirate", "S42", "SQ42", "Dead", "CalMason", "Weak"];
	let filtered = flattened.filter(x => !x.modificationId || !npcModifications.some(n => x.modificationId.includes(n)));

	const npcSpecifications = ["Turret", "Old"];
	filtered = filtered.filter(x => !npcSpecifications.some(n => x.specificationId.includes(n)));

	const unfinishedSpecifications = ["Lightning", "Hull_C", "Cydnus", "Bengal", "Javelin"];
	filtered = filtered.filter(x => !unfinishedSpecifications.some(u => x.specificationId.includes(u)));

	const customizations = filtered.map(n => new ShipCustomization(n));

	const npcDisplayNames = ["XIAN", "VNCL", "Vanduul Glaive"];
	return customizations.filter(x => !npcDisplayNames.some(n => x.displayName.includes(n)));
};
var defaultShipCustomizations = makeDefaultShipCustomizations();


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
			return mergedComponents[this.componentName];
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
					binding.selectedComponent = mergedComponents[name];
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
					title: 'Action',
					fixed: "left",
					minWidth: 90,
					align: 'center',
					render: (h, params) => {
						return h('Button', {
							props: {
								type: "primary",
								size: "small"
							},
							on: {
								click: () => {
									this.customize(params.row.serialized)
								}
							}
						}, 'Customize');
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
					title: "Name",
					key: "Name",
					sortable: true,
					fixed: "left",
					minWidth: 155,
					ellipsis: true
				},
				{
					title: " ",
					fixed: "left",
					width: 30,
					align: "center",
					render: (h, params) => {
						return h("Checkbox", {
							props: {
								value: this.selected.has(params.row.key),
								disabled: this.comparing
							},
							on: {
								input: (value) => {
									if (value) {
										this.selected.add(params.row.key);
									}
									else {
										this.selected.delete(params.row.key);
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
					minWidth: 80
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
			return defaultShipCustomizations.filter(c => {
				return c.displayName.toLowerCase().includes(this.searchInput.toLowerCase());
			}).map(c => {
				const attributes = c.getAttributes();
				let reduced = attributes.reduce((total, a) => {
					total[a.name] = a.value;
					return total;
				}, {});

				// Used for navigation to the customization page.
				reduced.serialized = c.serialize();

				// Used for uniquely identifying rows to select.
				// TODO This will need to incorporate loadout name.
				reduced.key = reduced.serialized;

				return reduced;
			}).filter(c => {
				return !this.comparing || this.selected.has(c.key);
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
		customize(serialized) {
			this.$router.push({ name: 'customize', params: { serialized: serialized }});
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
			selectedCustomization: {},

			// Also defines the section display order.
			sectionNames: ["Guns", "Missiles", "Systems"],
			expandedSections: ["Guns", "Missiles"],
			// Also defines the section precedence order; lowest precedence is first.
			sectionDefinitions: {
				"Guns": ["WeaponGun", "Turret", "TurretBase"],
				"Missiles": ["WeaponMissile"],
				"Systems": ["Cooler", "Shield", "PowerPlant", "QuantumDrive"]
			},

			damageColumns: [
				{
					title: "Damage",
					key: "name"
				},
				{
					title: " ",
					key: "value",
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
				url.hash = "/customize/" + serialized;

				history.replaceState(history.state, document.title, url.href);
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

			// Hide AmmoBox item ports until they're worth customizing.
			return childGroups.filter(g => !g.members[0].port.matchesType("AmmoBox"));
		},
	},

	// TODO These hooks feel janky -- there should be a better way make the selection reactive.
	created() {
		this.selectedCustomization = ShipCustomization.deserialize(this.$route.params.serialized);
	},
	beforeRouteUpdate(to, from, next) {
		this.selectedCustomization = ShipCustomization.deserialize(to.params.serialized);
		next();
	}
});

Vue.use(VueRouter)
const router = new VueRouter({
	routes: [
		{
			name: "list",
			path: '/',
			component: shipList
		},
		{
			name: "customize",
			path: '/customize/:serialized',
			component: shipDetails
		},
		{
			// For inbound links from external sites to have a coherent URL.
			path: '/ships/:combinedId',
			redirect: to => {
				const customization = defaultShipCustomizations.find(c => c.shipId.combinedId == to.params.combinedId);
				if (customization) {
					return {name: 'customize', params: {serialized: customization.serialize()}};

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
		}
	},
	methods: {
		onNavigationSelect: function(name) {
			if (name == "comparison") {
				this.$router.push({name: "list"});
			}
			else {
				this.$router.push({name: 'customize', params: {serialized: name}});
			}
		}
	}
}).$mount('#app');