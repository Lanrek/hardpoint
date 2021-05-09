// Ensure there's a turret rotation entry for any port that can mount a turret.
var turretRotationsDefined = {};
for (const loadout of Object.values(defaultLoadouts)) {
	const turretTypes = ["Turret", "TurretBase"];
	const turrets = Object.values(loadout.bindings).filter(
		b => b.port.types.some(b => turretTypes.some(t => t == b.type)));

	const overrideIds = turrets.map(b => loadout.vehicle.baseName + "." + b.port.name);
	const missing = overrideIds.filter(n => _.get(turretRotations, n) == undefined);
	if (missing.length == 0) {
		turretRotationsDefined[loadout.vehicle.name] = true;
	}
	else {
		console.log("Warning: Missing turret rotations for " + loadout.vehicle.name);
		missing.forEach(n => console.log("  " + n));
	}
}

class TurretCoverage {
    constructor(binding) {
        this._binding = binding;
    }

    get range() {
        return _.max(Object.values(this._binding.bindings).filter(n => n.extension).map(n => n.extension.range));
    };

    get minYaw() {
		let candidates = [-180];
		candidates.push(this._binding.port.yawMin);
		candidates.push(this._binding.item.yawLimits.standardLimit.lowestAngle);

		candidates.sort((a, b) => b - a);
		return candidates[0];
	}

	get maxYaw() {
		let candidates = [180];
		candidates.push(this._binding.port.yawMax);
		candidates.push(this._binding.item.yawLimits.standardLimit.highestAngle);

		candidates.sort((a, b) => a - b);
		return candidates[0];
	}

    get minPitch() {
		let candidates = [-90];
		candidates.push(this._binding.port.pitchMin);
		candidates.push(_.get(this, "_binding.item.pitchLimits.standardLimit.lowestAngle"));

		candidates.sort((a, b) => b - a);
		return candidates[0];
	}

	get maxPitch() {
		let candidates = [90];
		candidates.push(this._binding.port.pitchMax);
		candidates.push(_.get(this, "_binding.item.pitchLimits.standardLimit.highestAngle"));

		candidates.sort((a, b) => a - b);
		return candidates[0];
	}

    get customPitchLimits() {
        const pitchLimits = this._binding.item.pitchLimits.customLimit;

        if (pitchLimits != undefined && pitchLimits.length > 1) {
			// Duplicate the first entry but wrapped around 360 degrees.
			let expanded = pitchLimits.slice();
			let wrapped = _.cloneDeep(expanded[0]);
			wrapped.turretRotation += 360;
			expanded.push(wrapped);
			return expanded;
		}

		return [];
    }

    get inflections() {
		const inflections = this.customPitchLimits.slice(0, -1).map(x => x.turretRotation);

		// Normalize to [-180, 180] which appear to be the bounds used elsewhere.
		return inflections.map(x => ((x + 180) % 360) - 180);
	}

	getPitchRange(yaw) {
		let result = {
			min: this.minPitch,
			max: this.maxPitch
		};

        const pitchLimits = this.customPitchLimits;
		if (pitchLimits.length) {
			// Limits in game data appear normalized to [0, 360].
			const normalizedYaw = (360 + yaw % 360) % 360;

			const upperIndex = _.findIndex(pitchLimits, x => x.turretRotation > normalizedYaw);
			const upper = pitchLimits[upperIndex];
			const lower = pitchLimits[upperIndex - 1];

			// Interpolate between the surrounding points.
			const alpha = (normalizedYaw - lower.turretRotation) / (upper.turretRotation - lower.turretRotation);
			const lowerLimit = lower.lowestAngle * (1 - alpha) + upper.lowestAngle * alpha;
			const upperLimit = lower.highestAngle * (1 - alpha) + upper.highestAngle * alpha;

			result.min = Math.max(result.min, lowerLimit);
			result.max = Math.min(result.max, upperLimit);
		}

		return result;
	}
}

const actualMaterial = new THREE.MeshLambertMaterial({
	side: THREE.DoubleSide,
	depthTest: false,
	color: 0x7b7b7b,
	opacity: 0.25,
	transparent: true
});

const hoverMaterial = new THREE.MeshLambertMaterial({
	side: THREE.DoubleSide,
	depthTest: false,
	color: 0x2d8cf0,
	opacity: 0.25,
	transparent: true
});

const stencilMaterial = new THREE.MeshLambertMaterial({
	colorWrite: false,
	depthWrite: false,
	side: THREE.DoubleSide
});

app.component("coverage-display", {
	template: "#coverage-display",
	props: {
        loadout: VehicleLoadout
    },
	data: function() {
		return {
			selectedView: "Side",

			hoveredBindings: hoveredBindings
		}
	},
	watch: {
		loadout: {
			handler: function(value) {
				this.makeCoverageSegments();
				this.renderScene();
			},
			deep: true
		},
		hoveredBindings: {
			handler: function(value) {
				this.makeCoverageSegments();
				this.renderScene();
			},
			deep: true
		},
		selectedView: function(value) {
			if (this.selectedView != "Free") {
				this.positionCamera();
				this.renderScene();
			}
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
		onResize: function(event) {
			this.$refs.canvas.width = this.$refs.container.offsetWidth;
			this.$refs.canvas.height = this.$refs.canvas.width;

			this.camera.updateProjectionMatrix();

			this.renderer.setSize(this.$refs.canvas.width, this.$refs.canvas.height);

			this.controls.handleResize();

			this.renderScene();
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

			const turretTypes = ["Turret", "TurretBase"];
			const turrets = Object.values(this.loadout.bindings).filter(
				n => n.item && turretTypes.includes(n.item.type)).map(
                n => new TurretCoverage(n));

			const maxRange = _.max(turrets.map(n => n.range));
			for (const turret of turrets) {
				// Exclude turrets without guns attached.
				if (turret.range) {
					this.makeCoverageSegment(turret, turret.range / maxRange);
				}
			}
		},
		makeCoverageSegment: function(turret, relativeDistance) {
			const distance = this.sceneRadius * relativeDistance;

			const minYaw = turret.minYaw;
			const maxYaw = turret.maxYaw;

			const yawSlices = Math.ceil(Math.abs((maxYaw - minYaw) / 10));
			const pitchSlices = yawSlices;

			const yawIncrement = (maxYaw - minYaw) / yawSlices;
			let yawSamples = Array.from({length: yawSlices + 1}, (v, i) => minYaw + yawIncrement * i);
			const inflections = turret.inflections.filter(i => i > minYaw && i < minYaw);
			yawSamples = yawSamples.concat(inflections);
			yawSamples.sort((a, b) => a - b);

			var geometry = new THREE.Geometry();
			geometry.vertices.push(
				new THREE.Vector3(0, 0, 0));

			let lastVertex = 0;
			for (let yawIndex = 0; yawIndex < yawSamples.length; yawIndex += 1) {
				const pitchRange = turret.getPitchRange(yawSamples[yawIndex]);
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

			const overrideId = this.loadout.vehicle.baseName + "." + turret._binding.port.name;
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
			if (this.hoveredBindings.values.some(b => b == turret._binding || b.parent == turret._binding)) {
				material = hoverMaterial;
			}

			result.actual.add(new THREE.Mesh(geometry, material));
			result.actual.add(new THREE.AmbientLight());
			result.stencil.add(new THREE.Mesh(geometry, stencilMaterial));

			this.segments[turret._binding.port.name] = result;
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
		this.controls.rotateSpeed = 4;
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

		this.onResize(undefined);

		this.updateControls();

		window.addEventListener("resize", this.onResize);
	},
	beforeUnmount() {
		window.removeEventListener("resize", this.onResize);

		this.controls.dispose();

		this.renderer.dispose();
		this.renderer.forceContextLoss();
		this.renderer = undefined;
	}
});