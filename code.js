class ShipId {
	constructor(specificationId, modificationId, loadoutId) {
		this.specificationId = specificationId;
		this.modificationId = modificationId;
		this.loadoutId = loadoutId;
	}

	static findLoadout(specificationId, modificationId) {
		// This is crazy -- must be missing something about how loadouts are bound to ships.
		var loadoutId = undefined;
		var tryLoadoutId = id => {
			if (!loadoutId) {
				if (shipLoadouts[id]) {
					loadoutId = id;
				}
			}
		}

		var specificationData = shipSpecifications[specificationId]._data;
		if (modificationId) {
			tryLoadoutId(specificationId + "_" + modificationId);

			var patchFile = specificationData["Modifications"][modificationId]["@patchFile"];
			if (patchFile) {
				var fileName = patchFile.split("/").pop();
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

	getItemPorts(modificationId) {
		if (modificationId) {
			return this._modificationItemPorts[modificationId];
		}

		return this._itemPorts;
	}

	getModificationLoadouts() {
		var modifications = [undefined].concat(this.modificationIds);
		var results = modifications.map(x => ShipId.findLoadout(this._data["@name"], x));

		// Filter out anything that doesn't have a valid loadout.
		results = results.filter(n => n.loadoutId);

		return results;
	}

	getAttributes(modificationId) {
		return [
			{
				name: "Normal Speed",
				category: "Maneuverability",
				value: Number(this._data["ifcs"]["@SCMVelocity"]) || 0
			},
			{
				name: "Afterburner Speed",
				category: "Maneuverability",
				value: Number(this._data["ifcs"]["@ABSCM"]) || 0
			},
			{
				name: "Cruise Speed",
				category: "Maneuverability",
				value: Number(this._data["ifcs"]["@CruiseSpeed"]) || 0
			},
			{
				name: "Total Hitpoints",
				category: "Survivability",
				value: this._findParts(modificationId).reduce((total, x) => total + Number(x["@damageMax"] || 0), 0)
			}
		];
	}

	_findParts(modificationId, className = undefined) {
		var unsearched = [this._data["Parts"]["Part"]];
		if (modificationId) {
			var modification = this._data["Modifications"][modificationId];
			if (modification["mod"] && modification["mod"]["Parts"]) {
				unsearched = [modification["mod"]["Parts"]["Part"]];
			}
		}

		var result = [];
		while (unsearched.length > 0) {
			var potential = unsearched.pop();

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
		var itemPorts = this._findParts(modificationId, "ItemPort");

		return itemPorts.filter(n => n["ItemPort"]).map(function (part) {
			return new SpaceshipItemPort(part["ItemPort"], part["@name"]);
		});
	}
}

class DamageQuantity {
	constructor(distortion, energy, physical, thermal) {
		var makeNumber = x => Number(x) || 0;

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
		var count = this._values.reduce((total, x) => x > 0 ? total + 1 : total, 0);
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
		var getValue = key => {
			var split = key.split(".");

			var value = this.values;
			split.forEach(n => {
				if (n.startsWith("[")) {
					var index = Number(n.slice(1, -1));
					value = value[index];
				}
				else {
					value = value[n]
				}
			});

			if (value.toFixed) {
				// Round to two places and then drop any trailing 0s.
				value = +value.toFixed(2);
			}

			return '<span class="summary-value">' + value + '</span>';
		};

		var expanded = this.patterns.map(p => {
			var replaced = p.replace(/{[^}]+}/g, n => getValue(n.slice(1, -1)));
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
			var ammo = this._data["ammo"];
			if (!ammo) {
				return 0;
			}

			return ammo["@speed"];
		}

		return 0;
	}

	get bulletDuration() {
		if (this.type == "WeaponGun") {
			var ammo = this._data["ammo"];
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
			var shotgun = this._data["firemodes"]["shotgun"];
			if (shotgun) {
				return Number(shotgun["pellets"]) || 0;
			}
			return 1;
		}

		return 0;
	}

	get gunAlpha() {
		if (this.type == "WeaponGun") {
			var ammo = this._data["ammo"];
			if (!ammo) {
				return new DamageQuantity(0, 0, 0, 0);
			}

			var damageInfo = ammo["bullet"]["damage"]["DamageInfo"];
			var quantity = new DamageQuantity(
				damageInfo["@DamageDistortion"],
				damageInfo["@DamageEnergy"],
				damageInfo["@DamagePhysical"],
				damageInfo["@DamageThermal"]);
			return quantity;
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
		var scaled = this.gunAlpha.scale(this.bulletCount + this.gunFireRate / 60.0);
		return scaled;
	}

	get gunSustainedDps() {
		// TODO Actually calculate heat and energy limits based on ship equipment.
		if (this.type == "WeaponGun") {
			var derived = this._data["derived"];
			var quantity = new DamageQuantity(
				derived["dps_60s_dmg_dist"],
				derived["dps_60s_dmg_enrg"],
				derived["dps_60s_dmg_phys"],
				derived["dps_60s_dmg_thrm"]);

			return quantity;
		}

		return new DamageQuantity(0, 0, 0, 0);
	}

	get totalShields() {
		return 0;
	}

	get summary() {
		if (this.type == "WeaponGun") {
			var damage = "{gunAlpha.total}";
			if (this.bulletCount > 1) {
				damage += " X {bulletCount}";
			}

			return new SummaryText([
				damage + " {gunAlpha.type} damage X {gunFireRate}rpm = {gunBurstDps.total}dps",
				"{gunSustainedDps.total} sustained dps (limited by heat)",
				"{bulletSpeed}m/s projectile speed X {bulletDuration}sec = {bulletRange}m range"], this);
		}

		if (this.type == "WeaponMissile") {
			return new SummaryText(["{itemPorts.length} size {itemPorts.[0].maxSize} missiles"], this);
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
		var tags = this._data["Components"]["SCItem"]["ItemDefinition"]["@RequiredTags"];
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

	get totalShields() {
		var params = this._data["Components"]["SCItemShieldGeneratorParams"];
		if (params) {
			return Number(params["ShieldEmitterContributions"]["@MaxShieldHealth"]);
		}

		return 0;
	}

	get summary() {
		if (this.type == "Turret" || this.type == "TurretBase") {
			if (this.itemPorts[0]) {
				return new SummaryText(["{itemPorts.length} size {itemPorts.[0].maxSize} item ports"], this);
			}
		}

		return new SummaryText();
	}

	_findItemPorts() {
		var ports = this._data["Components"]["SCItem"]["ItemPorts"];
		if (!ports) {
			return [];
		}

		var ports = ports["SItemPortCoreParams"]["Ports"];
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
			if (subtype != undefined) {
				if (!portType.subtypes.some(s => s == subtype)) {
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

		if (this.minSize != undefined && component.size < this.minSize) {
			return false;
		}

		if (this.maxSize != undefined && component.size > this.maxSize) {
			return false;
		}

		if (component.requiredTags) {
			var portTags = tags.concat(this.tags);

			for (var tag of component.requiredTags) {
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

		var types = this._data["Types"]["Type"];
		if (!Array.isArray(types)) {
			types = [types];
		}

		return types.map(x => {
			var type = x["@type"];

			// It looks like there are implicit defaults; the Sabre is an example.
			var subtypes = x["@subtypes"];
			if (!subtypes) {
				if (type == "WeaponGun") {
					subtypes = "Gun";
				}
				else if (type == "Turret") {
					subtypes = "GunTurret";
				}
				else {
					subtypes = "Default";
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
		var subtypes = this._data["Types"]["SItemPortDefTypes"]["SubTypes"];
		if (subtypes) {
			var subtype = subtypes["Enum"]["@value"];
		}

		var type = new ItemPortType(
			this._data["Types"]["SItemPortDefTypes"]["@Type"],
			subtype);
		return [type];
	}
}

class BoundItemPort {
	constructor(portName, componentName) {
		this.portName = portName;
		this.componentName = componentName;
		this.children = {};
	}
}

class ShipCustomization {
	constructor(shipId) {
		this.shipId = shipId;
		this._bindings = {};
	}

	// Abstracted because ship modifications will probably have their own tags eventually.
	get tags() {
		return this._specification.tags;
	}

	getAttributes(category=undefined) {
		var attributes = this._specification.getAttributes(this.shipId.modificationId);

		attributes = attributes.concat([
			{
				name: "Total Shields",
				category: "Survivability",
				value: Math.round(this._getAttachedComponents().reduce((total, x) => total + x.totalShields, 0))
			},
			{
				name: "Total Burst DPS",
				category: "Damage",
				value: Math.round(this._getAttachedComponents().reduce((total, x) => total + x.gunBurstDps.total, 0))
			},
			{
				name: "Total Sustained DPS",
				category: "Damage",
				value: Math.round(this._getAttachedComponents().reduce((total, x) => total + x.gunSustainedDps.total, 0))
			}
		]);

		if (category) {
			attributes = attributes.filter(n => n.category == category);
		}
		return attributes;
	}

	getItemPortsMatchingTypes(types) {
		return this._specification.getItemPorts(this.shipId.modificationId).filter(function (port) {
			return types.some(n => port.matchesType(n, undefined));
		});
	}

	setAttachedComponent(portName, parentPortName, componentName) {
		var bindings = this._bindings;
		if (parentPortName) {
			// The parent port might be missing from the binding tree because it's set on the loadout
			// not the customization. Copy the parent binding from the loadout first in that case.
			if (!bindings[parentPortName]) {
				Vue.set(bindings, parentPortName, new BoundItemPort(parentPortName, this.getAttachedComponent(parentPortName).name));
			}
			bindings = bindings[parentPortName].children;
		}

		Vue.set(bindings, portName, new BoundItemPort(portName, componentName));
	}

	getAttachedComponent(portName, parentPortName) {
		var componentName;

		// First check if the component is customized in the binding tree.
		if (parentPortName) {
			if (this._bindings[parentPortName]) {
				var children = this._bindings[parentPortName].children;
				if (portName in children) {
					componentName = children[portName].componentName;
				}
				else {
					// If the parent port is customized, don't fall back to the loadout for the children.
					// Ports often have similar names, so it might match even with a different parent.
					return undefined;
				}
			}
		}
		else {
			if (this._bindings[portName]) {
				componentName = this._bindings[portName].componentName;
			}
		}

		// If the component isn't found in the binding tree, fall back to the loadout.
		if (!componentName) {
			if (parentPortName) {
				var entry = this._loadout.find(n => n[parentPortName] != undefined);
				if (!entry) {
					return undefined;
				}

				var attached = entry["attached"];
				if (!attached) {
					return undefined;
				}

				var childEntry = attached.find(n => n[portName] != undefined);
				if (!childEntry) {
					return undefined;
				}
				componentName = childEntry[portName];
			}
			else {
				var entry = this._loadout.find(n => n[portName] != undefined);
				if (!entry) {
					return undefined;
				}

				componentName = entry[portName];
			}
		}

		return mergedComponents[componentName];
	}

	get _specification() {
		return shipSpecifications[this.shipId.specificationId];
	}

	get _loadout() {
		return shipLoadouts[this.shipId.loadoutId];
	}

	_getAttachedComponents() {
		var attached = [];

		var directPorts = this._specification.getItemPorts(this.shipId.modificationId);
		directPorts.forEach(x => {
			var component = this.getAttachedComponent(x.name);
			attached.push(component);
			if (component) {
				component.itemPorts.forEach(c => attached.push(this.getAttachedComponent(c.name, x.name)));
			}
		});
		attached = attached.filter(n => n);

		return attached;
	}
}


// Translate underlying data into model objects.
for (key of Object.keys(shipSpecifications)) {
	shipSpecifications[key] = new ShipSpecification(shipSpecifications[key]);
}

var mergedComponents = {}
for (key of Object.keys(dataforgeComponents)) {
	mergedComponents[key] = new DataforgeComponent(dataforgeComponents[key]);
}
for (key of Object.keys(spaceshipComponents)) {
	if (!(key in mergedComponents)) {
		mergedComponents[key] = new SpaceshipComponent(spaceshipComponents[key]);
	}
}


var componentDisplay = Vue.component('component-display', {
	template: '#component-display',
	props: ['componentName', 'disabled'],
	data: function() {
		return {
		}
	},
	computed: {
		component: function () {
			return mergedComponents[this.componentName];
		}
	}
});

var componentSelector = Vue.component('component-selector', {
	template: '#component-selector',
	props: ['customization', 'itemPort', 'parentPortName'],
	data: function() {
		return {
			selectedComponentName: this.getSelectedComponentName(),
			visible: false
		}
	},
	computed: {
		availableComponents: function () {
			return this.itemPort.availableComponents(this.customization.tags);
		},
		label: function () {
			var size = this.itemPort.minSize;
			if (this.itemPort.minSize != this.itemPort.maxSize)
			{
				size += "-" + this.itemPort.maxSize;
			}
			return this.itemPort.name + " (size " + size + ")";
		}
	},
	watch: {
		selectedComponentName: function (val) {
			this.customization.setAttachedComponent(this.itemPort.name, this.parentPortName, val);
		},

		// Invalidate the selected component when the properties change from widget reuse.
		// TODO Not sure why this is necessary...
		customization: function(val) {
			this.selectedComponentName = this.getSelectedComponentName();
		},
		itemPort: function(val) {
			this.selectedComponentName = this.getSelectedComponentName();
		},
		parentPortName: function(val) {
			this.selectedComponentName = this.getSelectedComponentName();
		}
	},
	methods: {
		onVisibleChange: function(visible) {
			this.visible = visible;

			// Fix the width of the dropdown dynamically since the dropdown widget doesn't handle padding.
			var elementWidth = this.$refs["dropdown"].$el.offsetWidth;
			this.$refs["dropdown"].$refs["drop"].$el.style.width = elementWidth + "px";
		},
		onClick: function(name) {
			this.selectedComponentName = name;
		},
		getSelectedComponentName: function () {
			var component = this.customization.getAttachedComponent(this.itemPort.name, this.parentPortName);
			if (component) {
				return component.name;
			}
		},
	}
});

var shipList = Vue.component('ship-list', {
	template: '#ship-list',
	data: function() {
		return {
			attributeColumns: [
				{
					title: "Loadout",
					key: "loadoutId",
					sortable: true,
					width: 240
				},
				{
					title: "SCM",
					key: "Normal Speed",
					sortable: true
				},
				{
					title: "Afterburner",
					key: "Normal Speed",
					sortable: true
				},
				{
					title: "Cruise",
					key: "Normal Speed",
					sortable: true
				},
				{
					title: "HP",
					key: "Total Hitpoints",
					sortable: true
				},
				{
					title: "Shields",
					key: "Total Shields",
					sortable: true
				},
				{
					title: "DPS",
					key: "Total Sustained DPS",
					sortable: true
				},
				{
					title: "Burst DPS",
					key: "Total Burst DPS",
					sortable: true
				},
				{
					title: 'Action',
					width: 150,
					align: 'center',
					render: (h, params) => {
						return h('Button', {
							on: {
								click: () => {
									this.customize(params.index)
								}
							}
						}, 'Customize');
					}
				}
			]
		}
	},
	computed: {
		shipCustomizations: function() {
			return this.$root.shipIds.map(n => new ShipCustomization(n));
		},
		shipAttributes: function() {
			var attributes = this.shipCustomizations.map(c => {
				var attributes = c.getAttributes();
				var reduced = attributes.reduce((total, a) => {
					total[a.name] = a.value;
					return total;
				}, {});
				reduced.specificationId = c.shipId.specificationId;
				reduced.modificationId = c.shipId.modificationId;
				reduced.loadoutId = c.shipId.loadoutId;
				return reduced;
			});
			return attributes;
		}
	},
	methods: {
		customize(index) {
			this.$router.push({ name: 'ships', params: { shipIdIndex: index }})
		}
	}
});

var shipDetails = Vue.component('ship-details', {
	template: '#ship-details',
	data: function() {
		return {
			selectedCustomization: {},

			expandedSections: ["Weapons"],
			sections: {
				"Weapons": ['WeaponMissile', 'WeaponGun', 'Turret', 'TurretBase'],
				"Systems": ['Cooler', 'Shield', 'PowerPlant']
			},

			damageColumns: [
				{
					title: "Damage",
					key: "name"
				},
				{
					title: " ",
					key: "value",
					width: 100
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
					width: 100
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
					width: 100
				}
			]
		}
	},
	computed: {
		selectedShipIdIndex() {
			return Number(this.$route.params.shipIdIndex);
		}
	},
	methods: {
		getAttachedComponentName: function (portName, childPortName = undefined) {
			var component = this.selectedCustomization.getAttachedComponent(portName, childPortName);
			if (component) {
				return component.name;
			}
		},
		getAttachedComponentItemPorts: function (portName) {
			var component = this.selectedCustomization.getAttachedComponent(portName);
			if (component) {
				return component.itemPorts;
			}
		},
		onChange: function(shipIdIndex) {
			this.$router.push({ name: 'ships', params: { shipIdIndex: shipIdIndex }})
		}
	},

	// TODO These hooks feel janky -- there should be a better way make the selection reactive.
	created() {
		var shipId = this.$root.shipIds[this.selectedShipIdIndex];
		this.selectedCustomization = new ShipCustomization(shipId);
	},
	beforeRouteUpdate(to, from, next) {
		var shipId = this.$root.shipIds[to.params.shipIdIndex];
		this.selectedCustomization = new ShipCustomization(shipId);
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
			name: "ships",
			path: '/ships/:shipIdIndex',
			component: shipDetails
		},
		{
			path: "*",
			component: shipList
		}
	]
});

var app = new Vue({
	router,
	el: '#app',
	computed: {
		shipIds: function () {
			var unflattened = Object.values(shipSpecifications).map(n => n.getModificationLoadouts());
			var flattened = unflattened.reduce((total, n) => total.concat(n), []);

			var npcModifications = ["Pirate", "S42", "SQ42", "Dead", "CalMason", "Weak"];
			var filtered = flattened.filter(x => !x.modificationId || !npcModifications.some(n => x.modificationId.includes(n)));

			var npcSpecifications = ["Turret", "Old"];
			var filtered = filtered.filter(x => !npcSpecifications.some(n => x.specificationId.includes(n)));

			return filtered;
		}
	}
}).$mount('#app');