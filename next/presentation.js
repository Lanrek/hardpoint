const _format_number = (value, row) => Math.round(value * 100) / 100;
const _get_display_name = (row) => row.item.displayName || row.item.name;

const _commonColumns = [
    {
        name: "name",
        label: "Name",
        field: row => _get_display_name(row),
        align: "left",
        sortable: true
    },
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
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    Cooler: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    EMP: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    FlightController: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    FuelTank: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    MainThruster: {
        columns: _commonColumns.concat([
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
            }]),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "Provides {extension.thrustMn} meganewtons thrust for {extension.accelerationGs} G of acceleration",
            "Burns {extension.maxFuelBurn} hydrogen fuel/sec depleting fuel tanks after {extension.maxFuelDurationMinutes} minutes"
        ])
    },
    Missile: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    MissileLauncher: {
        columns: _commonColumns.concat([
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
            }]),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.portCount} size {extension.maxPortSize} missiles"
        ])
    },
    PowerPlant: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    },
    QuantumDrive: {
        columns: _commonColumns.concat([
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
            }]),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.driveSpeedMm} megameter/sec max jump speed with at most {item.cooldownTime} seconds cooldown",
            "Consumes {extension.fuelPerGm} quantum fuel/gigameter for {extension.fuelRangeGm} gigameters max range",
            "Takes {item.spoolUpTime} seconds to spool and at least {extension.minCalibrationTime} seconds to calibrate"
        ])
    },
    Shield: {
        columns: _commonColumns.concat([
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
            }]),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{item.maxShieldHealth} shield capacity with {item.maxShieldRegen} regeneration per second",
            "Regeneration halted for {item.damagedRegenDelay} seconds after taking damage and {item.downedRegenDelay} seconds after dropping"
        ])
    },
    Turret: {
        columns: _commonColumns.concat([
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
            }]),
        summary: (binding) => _evaluateSummaryPattern(binding, [
            "{extension.portCount} size {extension.maxPortSize} item ports"
        ])
    },
    WeaponGun: {
        columns: _commonColumns,
        summary: _defaultSummaryFactory
    }
};

itemProjections.TurretBase = itemProjections.Turret;
itemProjections.ManneuverThruster = itemProjections.MainThruster;
