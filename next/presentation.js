const _format_number = (value) => Math.round(value * 100) / 100;
const _get_display_name = (row) => row.item.displayName || row.item.name;

const _prefixColumns = [
    {
        name: "name",
        label: "Name",
        field: row => _get_display_name(row),
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
        sortable: true
    }
];

const _defaultColumns = _prefixColumns.concat(_suffixColumns);

const _evaluateSummaryPattern = (binding, pattern) => {
    const getValue = (key) => {
        let value = _.get(binding, key);

        if (!isNaN(value)) {
            value = _format_number(value);
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
    FlightController: {
        columns: _defaultColumns,
        summary: _defaultSummaryFactory
    },
    MainThruster: {
        columns: _prefixColumns.concat([
            {
                name: "thrustMn",
                label: "Thrust",
                field: row => row.extension.thrustMn,
                format: _format_number,
                sortable: true
            },
            {
                name: "accelerationGs",
                label: "Acceleration",
                field: row => row.extension.accelerationGs,
                format: _format_number,
                sortable: true
            },
            {
                name: "maxFuelBurn",
                label: "Fuel / Sec",
                field: row => row.extension.maxFuelBurn,
                format: _format_number,
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
                format: _format_number,
                sortable: true
            },
            {
                name: "trackingSignalType",
                label: "Tracking Type",
                field: row => row.item.trackingSignalType,
                sortable: true
            },
            {
                name: "trackingSignalType",
                label: "Tracking Angle",
                field: row => row.item.trackingAngle,
                format: _format_number,
                sortable: true
            },
            {
                name: "trackingDistanceMax",
                label: "Tracking Range",
                field: row => row.item.trackingDistanceMax,
                format: _format_number,
                sortable: true
            },
            {
                name: "lockRangeMin",
                label: "Min Lock Range",
                field: row => row.item.lockRangeMin,
                format: _format_number,
                sortable: true
            },
            {
                name: "lockTime",
                label: "Lock Time",
                field: row => row.item.lockTime,
                format: _format_number,
                sortable: true
            },
            {
                name: "linearSpeed",
                label: "Speed",
                field: row => row.item.linearSpeed,
                format: _format_number,
                sortable: true
            },
            {
                name: "flightTime",
                label: "Flight Time",
                field: row => row.extension.flightTime,
                format: _format_number,
                sortable: true
            },
            {
                name: "flightRange",
                label: "Flight Range",
                field: row => row.extension.flightRange,
                format: _format_number,
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
                format: _format_number,
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
                format: _format_number,
                sortable: true
            },
            {
                name: "fuelPerGm",
                label: "Fuel / Gm",
                field: row => row.extension.fuelPerGm,
                format: _format_number,
                sortable: true
            },
            {
                name: "fuelRangeGm",
                label: "Max Range",
                field: row => row.extension.fuelRangeGm,
                format: _format_number,
                sortable: true
            },
            {
                name: "spoolUpTime",
                label: "Spool Time",
                field: row => row.item.spoolUpTime,
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
                sortable: true
            },
            {
                name: "maxShieldRegen",
                label: "Regeneration",
                field: row => row.item.maxShieldRegen,
                sortable: true
            },
            {
                name: "damagedRegenDelay",
                label: "Damage Delay",
                field: row => row.item.damagedRegenDelay,
                sortable: true
            },
            {
                name: "downedRegenDelay",
                label: "Drop Delay",
                field: row => row.item.downedRegenDelay,
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
            sortable: true
        },
        {
            name: "burstDps",
            label: "Burst DPS",
            field: row => row.extension.burstDps.total,
            format: _format_number,
            sortable: true
        },
        {
            name: "alpha",
            label: "Alpha",
            field: row => row.extension.alpha.total,
            sortable: true
        },
        {
            name: "fireRate",
            label: "Fire Rate",
            field: row => row.item.weaponAction.fireRate,
            sortable: true
        },
        {
            name: "range",
            label: "Range",
            field: row => row.extension.range,
            format: _format_number,
            sortable: true
        },
        {
            name: "speed",
            label: "Speed",
            field: row => row.extension.ammo.speed,
            sortable: true
        },
        {
            name: "lifetime",
            label: "Duration",
            field: row => row.extension.ammo.lifetime,
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
