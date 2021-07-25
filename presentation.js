const _numberFormats = {};

const _formatNumber = (value, maxPrecision=undefined, minPrecision=undefined) => {
    if (isNaN(value) || value == null) {
        return undefined;
    }

    if (maxPrecision == undefined) {
        maxPrecision = 2;
    }

    if (minPrecision == undefined) {
        minPrecision = maxPrecision;
    }

    if (value >= 1000) {
        minPrecision = 0;
        maxPrecision = 0;
    }

    const formatKey = minPrecision + "_" + maxPrecision;
    let numberFormat = _numberFormats[formatKey];
    if (!numberFormat) {
        numberFormat = new Intl.NumberFormat(undefined, {
            minimumFractionDigits: minPrecision,
            maximumFractionDigits: maxPrecision
        });

        _numberFormats[formatKey] = numberFormat
    }

    return numberFormat.format(value);
};

const _formatNumberFactory = (precision) => {
    return (value) => _formatNumber(value, precision, precision);
}

const _getDisplayName = (object) => object.displayName || object.name;

const _prefixColumns = [
    {
        name: "name",
        label: "Name",
        field: row => _getDisplayName(row.item),
        align: "left",
        sortable: true
    },
    {
        name: "basePrice",
        label: "Price",
        field: row => row.item.basePrice,
        format: _formatNumberFactory(0),
        sortable: true
    }
];

const _suffixColumns = [
    {
        name: "powerConsumed",
        label: "Power",
        field: row => row.extension.powerConsumed,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "emSignature",
        label: "EM",
        field: row => row.extension.emSignature,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "size",
        label: "Size",
        field: row => row.item.size,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "maxLifetimeHours",
        label: "Lifetime",
        field: row => row.item.maxLifetimeHours,
        format: _formatNumberFactory(0),
        sortable: true
    }
];

const _defaultColumns = _prefixColumns.concat(_suffixColumns);

const _evaluateSummaryPattern = (binding, pattern) => {
    const getValue = (key) => {
        let value = _.get(binding, key);

        if (!isNaN(value)) {
            value = _formatNumber(value, 2, 0);
        }

        return "<span class='summary-value'>" + value + "</span>";
    }
    const combined = pattern.join("<br />");
    return "<span>" + combined.replace(/{[^}]+}/g, n => getValue(n.slice(1, -1))) + "</span>";
};
const _defaultSummaryFactory = (binding) => "No further information available";

const itemProjections = {
    Container: {
        columns: _prefixColumns.concat([
            {
                name: "cargo",
                label: "Cargo",
                field: row => row.extension.cargo,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.cargo} SCUs cargo capacity"
        ])
    },
    Cooler: {
        columns: _prefixColumns.concat([
            {
                name: "coolingRate",
                label: "Cooling Rate",
                field: row => row.item.coolingRate,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "Provides {item.coolingRate} cooling / second"
        ])
    },
    EMP: {
        columns: _defaultColumns,
        summary: _defaultSummaryFactory
    },
    FuelIntake: {
        columns: _prefixColumns.concat([
            {
                name: "fuelPushRate",
                label: "Intake Rate",
                field: row => row.item.fuelPushRate,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "Produces {item.fuelPushRate} hydrogen fuel / second"
        ])
    },
    MainThruster: {
        columns: _prefixColumns.concat([
            {
                name: "thrustMn",
                label: "Thrust",
                field: row => row.extension.thrustMn,
                format: _formatNumberFactory(2),
                sortable: true
            },
            {
                name: "accelerationGs",
                label: "Acceleration",
                field: row => row.extension.accelerationGs,
                format: _formatNumberFactory(2),
                sortable: true
            },
            {
                name: "maxFuelBurn",
                label: "Fuel / Sec",
                field: row => row.extension.maxFuelBurn,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "Provides {extension.thrustMn} meganewtons thrust for {extension.accelerationGs} G of acceleration",
            "Burns {extension.maxFuelBurn} hydrogen fuel/sec depleting fuel tanks after {extension.maxFuelDurationMinutes} minutes"
        ])
    },
    Missile: {
        columns: _prefixColumns.concat([
            {
                name: "damageTotal",
                label: "Damage",
                field: row => row.extension.damage.total,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "trackingSignalType",
                label: "Tracking Type",
                field: row => row.item.trackingSignalType,
                align: "left",
                sortable: true
            },
            {
                name: "lockingAngle",
                label: "Locking Angle",
                field: row => row.item.lockingAngle,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "lockRangeMax",
                label: "Max Lock Range",
                field: row => row.item.lockRangeMax,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "lockRangeMin",
                label: "Min Lock Range",
                field: row => row.item.lockRangeMin,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "lockTime",
                label: "Lock Time",
                field: row => row.item.lockTime,
                format: _formatNumberFactory(1),
                sortable: true
            },
            {
                name: "linearSpeed",
                label: "Speed",
                field: row => row.item.linearSpeed,
                format: _formatNumberFactory(0),
                sortable: true
            }]),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.damage.total} total damage; {item.linearSpeed} m/s max speed",
            "{item.trackingSignalType} sensors with {item.lockingAngle} degree locking angle",
            "{item.lockTime} seconds lock time with {item.lockRangeMin} to {item.lockRangeMax} meters lock range"
        ])
    },
    MissileLauncher: {
        columns: _prefixColumns.concat([
            {
                name: "portCount",
                label: "Missiles",
                field: row => row.extension.portCount,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "maxPortSize",
                label: "Missile Size",
                field: row => row.extension.maxPortSize,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.portCount} size {extension.maxPortSize} missiles"
        ])
    },
    PowerPlant: {
        columns: _prefixColumns.concat([
            {
                name: "powerDraw",
                label: "Power",
                field: row => row.item.power.powerDraw,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns.filter(n => n.name != "powerConsumed")),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "Generates {item.power.powerDraw} power"
        ])
    },
    QuantumDrive: {
        columns: _prefixColumns.concat([
            {
                name: "driveSpeedMm",
                label: "Max Speed",
                field: row => row.extension.driveSpeedMm,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "fuelPerGm",
                label: "Fuel / Gm",
                field: row => row.extension.fuelPerGm,
                format: _formatNumberFactory(2),
                sortable: true
            },
            {
                name: "fuelRangeGm",
                label: "Max Range",
                field: row => row.extension.fuelRangeGm,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "spoolUpTime",
                label: "Spool Time",
                field: row => row.item.spoolUpTime,
                format: _formatNumberFactory(1),
                sortable: true
            },
            {
                name: "minCalibrationTime",
                label: "Min Calibration",
                field: row => row.extension.minCalibrationTime,
                format: _formatNumberFactory(1),
                sortable: true
            },
            {
                name: "cooldownTime",
                label: "Cooldown",
                field: row => row.item.cooldownTime,
                format: _formatNumberFactory(1),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.driveSpeedMm} megameter/sec max jump speed with at most {item.cooldownTime} seconds cooldown",
            "Consumes {extension.fuelPerGm} quantum fuel/gigameter for {extension.fuelRangeGm} gigameters max range",
            "Takes {item.spoolUpTime} seconds to spool and at least {extension.minCalibrationTime} seconds to calibrate"
        ])
    },
    Shield: {
        columns: _prefixColumns.concat([
            {
                name: "maxShieldHealth",
                label: "Capacity",
                field: row => row.item.maxShieldHealth,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "maxShieldRegen",
                label: "Regeneration",
                field: row => row.item.maxShieldRegen,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "damagedRegenDelay",
                label: "Damage Delay",
                field: row => row.item.damagedRegenDelay,
                format: _formatNumberFactory(1),
                sortable: true
            },
            {
                name: "downedRegenDelay",
                label: "Drop Delay",
                field: row => row.item.downedRegenDelay,
                format: _formatNumberFactory(1),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{item.maxShieldHealth} shield capacity with {item.maxShieldRegen} regeneration per second",
            "Regeneration halted for {item.damagedRegenDelay} seconds after damage and {item.downedRegenDelay} seconds after dropping"
        ])
    },
    Turret: {
        columns: _prefixColumns.concat([
            {
                name: "portCount",
                label: "Ports",
                field: row => row.extension.portCount,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "maxPortSize",
                label: "Port Size",
                field: row => row.extension.maxPortSize,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.portCount} size {extension.maxPortSize} item ports"
        ])
    },
    WeaponGun: {
        columns: _prefixColumns.concat([
        {
            name: "type",
            label: "Type",
            field: row => row.extension.alpha.type,
            align: "left",
            sortable: true
        },
        {
            name: "burstDps",
            label: "Burst DPS",
            field: row => row.extension.burstDps.total,
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "alpha",
            label: "Alpha",
            field: row => row.extension.alpha.total,
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "ammoCount",
            label: "Ammo",
            field: row => row.extension.ammoCount,
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "fireRate",
            label: "Fire Rate",
            field: row => _.get(row, "item.weaponAction.fireRate"),
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "minSpread",
            label: "Spread",
            field: row => _.get(row, "item.weaponAction.spread.min"),
            format: _formatNumberFactory(1),
            sortable: true
        },
        {
            name: "dropStartRange",
            label: "Falloff",
            field: row => row.extension.dropStartRange,
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "range",
            label: "Range",
            field: row => row.extension.range,
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "speed",
            label: "Speed",
            field: row => _.get(row, "extension.ammo.speed"),
            format: _formatNumberFactory(0),
            sortable: true
        },
        {
            name: "lifetime",
            label: "Duration",
            field: row => _.get(row, "extension.ammo.lifetime"),
            format: _formatNumberFactory(2),
            sortable: true
        }],
        _suffixColumns),
        summary: (binding) => {
            if (!binding.item.weaponAction) {
                return _defaultSummaryFactory(binding);
            }

            const patterns = [
                "{extension.burstDps.total} damage/sec = {extension.alpha.total} {extension.alpha.type} damage at {item.weaponAction.fireRate} rounds/minute",
                "{extension.range} meter range = {extension.ammo.speed} m/sec projectile speed for {extension.ammo.lifetime} seconds"
            ];

            if (binding.extension.dropStartRange > 0) {
                patterns.push("{extension.droppedDps.total} damage/sec at {extension.dropEndRange} meters; falloff starts at {extension.dropStartRange} meters");
            }

            if (binding.item.weaponAction.spread && binding.item.weaponAction.spread.min > 0) {
                patterns.push("{item.weaponAction.spread.min} to {item.weaponAction.spread.max} deg spread increasing at {item.weaponAction.spread.attack} deg/shot and recovering at {item.weaponAction.spread.decay} deg/sec");
            }

            if (binding.item.maxAmmoCount) {
                patterns.push("{item.maxAmmoCount} rounds deplete in {extension.magazineDuration} seconds for {extension.magazineDamage.total} potential damage");
            }

            if (binding.item.requestedAmmoLoad) {
                patterns.push("Energy for {extension.energyLoad} shots that deplete in {extension.energyLoadDuration} seconds for {extension.energyLoadDamage.total} potential damage")
                patterns.push("Regenerates full energy in {extension.energyLoadRegen} seconds after a {item.regenerationCooldown} second delay")
            }

            return _evaluateSummaryPattern(binding, patterns)
        }
    },
    WeaponRegenPool: {
        columns: _prefixColumns.concat([
            {
                name: "ammoLoad",
                label: "Capacity",
                field: row => row.item.ammoLoad,
                format: _formatNumberFactory(0),
                sortable: true
            },
            {
                name: "regenFillRate",
                label: "Regeneration",
                field: row => row.item.regenFillRate,
                format: _formatNumberFactory(0),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "Holds {item.ammoLoad} weapon energy and regenerates {item.regenFillRate} per second"
        ])
    }
};

itemProjections.TurretBase = itemProjections.Turret;
itemProjections.ManneuverThruster = itemProjections.MainThruster;

const vehicleColumns = [
    {
        name: "edit",
        label: "",
        field: row => row.vehicle.name,
        align: "left"
    },
    {
        name: "manufacturerDisplayName",
        label: "Mnfr",
        field: row => row.manufacturerDisplayName,
        align: "left",
        sortable: true
    },
    {
        name: "vehicleDisplayName",
        label: "Vehicle",
        field: row => row.vehicleDisplayName,
        align: "left",
        sortable: true
    },
    {
        name: "loadoutName",
        label: "Loadout",
        field: row => _.get(row, "metadata.loadoutName"),
        align: "left",
        sortable: true
    },
    {
        name: "type",
        label: "Type",
        field: row => row.vehicleType,
        sortable: true
    },
    {
        name: "size",
        label: "Size",
        field: row => row.sizeCategory,
        sortable: true
    },
    {
        name: "crew",
        label: "Crew",
        field: row => row.vehicle.controlSeats,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "cargo",
        label: "Cargo",
        field: row => row.cargoCapacity,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "maxTurnRate",
        label: "Turn Rate",
        field: row => row.maxTurnRate,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "scmSpeed",
        label: "SCM",
        field: row => _.get(row, "flightController.item.scmSpeed"),
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "maxSpeed",
        label: "Speed",
        field: row => _.get(row, "flightController.item.maxSpeed"),
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "mainAccelerationGs",
        label: "Accel",
        field: row => row.mainAccelerationGs,
        format: _formatNumberFactory(2),
        sortable: true
    },
    {
        name: "damageMin",
        label: "Min HP",
        field: row => row.vehicle.damageMin,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "damageMax",
        label: "Max HP",
        field: row => row.vehicle.damageMax,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "shieldCapacity",
        label: "Shields",
        field: row => row.shieldCapacity,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "burstDps",
        label: "DPS",
        field: row => row.burstDps,
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "driveSpeedMm",
        label: "Qntm Speed",
        field: row => _.get(row, "quantumDrive.extension.driveSpeedMm"),
        format: _formatNumberFactory(0),
        sortable: true
    },
    {
        name: "fuelRangeGm",
        label: "Qntm Range",
        field: row => _.get(row, "quantumDrive.extension.fuelRangeGm"),
        format: _formatNumberFactory(0),
        sortable: true
    }
];

const groundSummaryCards = {
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
    ],
    "Travel": [
        {
            name: "Hydrogen Fuel",
            value: "hydrogenFuelCapacity",
            units: "units"
        },
        {
            name: "Quantum Fuel",
            value: "quantumFuelCapacity",
            units: "units"
        },
        {
            name: "Cargo Capacity",
            value: "cargoCapacity",
            units: "SCU"
        }
    ],
    "Power": [
        {
            name: "Power Usage",
            value: "powerUsagePercent",
            units: "%"
        },
        {
            name: "EM Signature",
            value: "emSignature",
            units: ""
        }
    ]
};

const spaceSummaryCards = {
    "Maneuver": [
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
            name: "Forward Acceleration",
            value: "mainAccelerationGs",
            units: "Gs"
        },
        {
            name: "Roll Rate",
            value: "flightController.item.maxAngularVelocityY",
            units: "deg/sec"
        }
    ],
};
Object.assign(spaceSummaryCards, groundSummaryCards);