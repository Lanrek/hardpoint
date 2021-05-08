const _get_display_name = (object) => object.displayName || object.name;
const _round_number = (value) => Math.round(value * 100) / 100;
const _format_number = (precision) => {
    return (value) => {
        if (isNaN(value)) {
            return undefined;
        }

        return value.toFixed(precision);
    };
};

const _prefixColumns = [
    {
        name: "name",
        label: "Name",
        field: row => _get_display_name(row.item),
        align: "left",
        sortable: true
    },
    {
        name: "basePrice",
        label: "Price",
        field: row => row.item.basePrice,
        sortable: true
    }
];

const _suffixColumns = [
    {
        name: "size",
        label: "Size",
        field: row => row.item.size,
        sortable: true
    },
    {
        name: "maxLifetimeHours",
        label: "Lifetime",
        field: row => row.item.maxLifetimeHours,
        format: _format_number(0),
        sortable: true
    }
];

const _defaultColumns = _prefixColumns.concat(_suffixColumns);

const _evaluateSummaryPattern = (binding, pattern) => {
    const getValue = (key) => {
        let value = _.get(binding, key);

        if (!isNaN(value)) {
            value = _round_number(value);
        }

        return "<span class='summary-value'>" + value + "</span>";
    }
    const combined = pattern.join("<br />");
    return "<span>" + combined.replace(/{[^}]+}/g, n => getValue(n.slice(1, -1))) + "</span>";
};
const _defaultSummaryFactory = (binding) => "No further information available";

const itemProjections = {
    Cargo: {
        columns: _defaultColumns,
        summary: _defaultSummaryFactory
    },
    Container: {
        columns: _defaultColumns,
        summary: _defaultSummaryFactory
    },
    Cooler: {
        columns: _defaultColumns,
        summary: _defaultSummaryFactory
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
                format: _format_number(0),
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
                format: _format_number(2),
                sortable: true
            },
            {
                name: "accelerationGs",
                label: "Acceleration",
                field: row => row.extension.accelerationGs,
                format: _format_number(2),
                sortable: true
            },
            {
                name: "maxFuelBurn",
                label: "Fuel / Sec",
                field: row => row.extension.maxFuelBurn,
                format: _format_number(0),
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
                format: _format_number(0),
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
                name: "trackingSignalType",
                label: "Tracking Angle",
                field: row => row.item.trackingAngle,
                sortable: true
            },
            {
                name: "trackingDistanceMax",
                label: "Tracking Range",
                field: row => row.item.trackingDistanceMax,
                sortable: true
            },
            {
                name: "lockRangeMin",
                label: "Min Lock Range",
                field: row => row.item.lockRangeMin,
                sortable: true
            },
            {
                name: "lockTime",
                label: "Lock Time",
                field: row => row.item.lockTime,
                sortable: true
            },
            {
                name: "linearSpeed",
                label: "Speed",
                field: row => row.item.linearSpeed,
                sortable: true
            },
            {
                name: "flightTime",
                label: "Flight Time",
                field: row => row.extension.flightTime,
                sortable: true
            },
            {
                name: "flightRange",
                label: "Flight Range",
                field: row => row.extension.flightRange,
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.damage.total} total damage",
            "{item.trackingSignalType} sensors with {item.trackingAngle} degree view and {item.trackingDistanceMax} meter tracking range",
            "{item.lockTime} seconds lock time with {item.lockRangeMin} meters minimum lock range",
            "{extension.flightRange} meters flight range = {item.linearSpeed} m/s speed for {extension.flightTime} seconds flight time"
        ])
    },
    MissileLauncher: {
        columns: _prefixColumns.concat([
            {
                name: "portCount",
                label: "Missiles",
                field: row => row.extension.portCount,
                sortable: true
            },
            {
                name: "maxPortSize",
                label: "Missile Size",
                field: row => row.extension.maxPortSize,
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
                format: _format_number(0),
                sortable: true
            }],
            _suffixColumns),
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
                format: _format_number(0),
                sortable: true
            },
            {
                name: "fuelPerGm",
                label: "Fuel / Gm",
                field: row => row.extension.fuelPerGm,
                format: _format_number(2),
                sortable: true
            },
            {
                name: "fuelRangeGm",
                label: "Max Range",
                field: row => row.extension.fuelRangeGm,
                format: _format_number(0),
                sortable: true
            },
            {
                name: "spoolUpTime",
                label: "Spool Time",
                field: row => row.item.spoolUpTime,
                format: _format_number(1),
                sortable: true
            },
            {
                name: "minCalibrationTime",
                label: "Min Calibration",
                field: row => row.extension.minCalibrationTime,
                sortable: true
            },
            {
                name: "cooldownTime",
                label: "Cooldown",
                field: row => row.item.cooldownTime,
                format: _format_number(1),
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
                format: _format_number(0),
                sortable: true
            },
            {
                name: "maxShieldRegen",
                label: "Regeneration",
                field: row => row.item.maxShieldRegen,
                format: _format_number(0),
                sortable: true
            },
            {
                name: "damagedRegenDelay",
                label: "Damage Delay",
                field: row => row.item.damagedRegenDelay,
                format: _format_number(1),
                sortable: true
            },
            {
                name: "downedRegenDelay",
                label: "Drop Delay",
                field: row => row.item.downedRegenDelay,
                format: _format_number(1),
                sortable: true
            }],
            _suffixColumns),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{item.maxShieldHealth} shield capacity with {item.maxShieldRegen} regeneration per second",
            "Regeneration halted for {item.damagedRegenDelay} seconds after taking damage and {item.downedRegenDelay} seconds after dropping"
        ])
    },
    Turret: {
        columns: _prefixColumns.concat([
            {
                name: "portCount",
                label: "Ports",
                field: row => row.extension.portCount,
                sortable: true
            },
            {
                name: "maxPortSize",
                label: "Port Size",
                field: row => row.extension.maxPortSize,
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
            format: _format_number(0),
            sortable: true
        },
        {
            name: "alpha",
            label: "Alpha",
            field: row => row.extension.alpha.total,
            format: _format_number(0),
            sortable: true
        },
        {
            name: "fireRate",
            label: "Fire Rate",
            field: row => row.item.weaponAction.fireRate,
            format: _format_number(0),
            sortable: true
        },
        {
            name: "range",
            label: "Range",
            field: row => row.extension.range,
            format: _format_number(0),
            sortable: true
        },
        {
            name: "speed",
            label: "Speed",
            field: row => row.extension.ammo.speed,
            format: _format_number(0),
            sortable: true
        },
        {
            name: "lifetime",
            label: "Duration",
            field: row => row.extension.ammo.lifetime,
            format: _format_number(2),
            sortable: true
        }],
        _suffixColumns),
        summary: (binding) => {
            const patterns = [
                "{extension.burstDps.total} damage/sec = {extension.alpha.total} {extension.alpha.type} damage at {item.weaponAction.fireRate} rounds/minute",
                "{extension.range} meter range = {extension.ammo.speed} m/sec projectile speed for {extension.ammo.lifetime} seconds"
            ];

            if (binding.item.maxAmmoCount) {
                patterns.push("{item.maxAmmoCount} rounds deplete in {extension.magazineDuration} seconds for {extension.magazineDamage.total} potential damage");
            }

            return _evaluateSummaryPattern(binding, patterns)
        }
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
        name: "size",
        label: "Size",
        field: row => row.vehicle.size,
        sortable: true
    },
    {
        name: "crew",
        label: "Crew",
        field: row => row.vehicle.controlSeats,
        sortable: true
    },
    {
        name: "cargo",
        label: "Cargo",
        field: row => row.cargoCapacity,
        sortable: true
    },
    {
        name: "maxTurnRate",
        label: "Turn Rate",
        field: row => row.maxTurnRate,
        format: _format_number(0),
        sortable: true
    },
    {
        name: "scmSpeed",
        label: "SCM",
        field: row => _.get(row, "flightController.item.scmSpeed"),
        format: _format_number(0),
        sortable: true
    },
    {
        name: "maxSpeed",
        label: "Speed",
        field: row => _.get(row, "flightController.item.maxSpeed"),
        format: _format_number(0),
        sortable: true
    },
    {
        name: "mainAccelerationGs",
        label: "Accel",
        field: row => row.mainAccelerationGs,
        format: _format_number(2),
        sortable: true
    },
    {
        name: "damageMin",
        label: "Min HP",
        field: row => row.vehicle.damageMin,
        sortable: true
    },
    {
        name: "damageMax",
        label: "Max HP",
        field: row => row.vehicle.damageMax,
        sortable: true
    },
    {
        name: "shieldCapacity",
        label: "Shields",
        field: row => row.shieldCapacity,
        format: _format_number(0),
        sortable: true
    },
    {
        name: "burstDps",
        label: "DPS",
        field: row => row.burstDps,
        format: _format_number(0),
        sortable: true
    },
    {
        name: "driveSpeedMm",
        label: "Qntm Speed",
        field: row => _.get(row, "quantumDrive.extension.driveSpeedMm"),
        format: _format_number(0),
        sortable: true
    },
    {
        name: "fuelRangeGm",
        label: "Qntm Range",
        field: row => _.get(row, "quantumDrive.extension.fuelRangeGm"),
        format: _format_number(0),
        sortable: true
    }
];
