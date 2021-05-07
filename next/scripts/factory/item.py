from .common import _make_item_port


def _make_cargo(components_element):
    params_element = components_element.single("scitemcargogridparams")

    cargo_capacity = 1
    for dimension in ["x", "y", "z"]:
        scu = float(params_element.single("dimensions").get("@" + dimension, 0)) / 1.25
        cargo_capacity *= scu

    return {
        "cargo": cargo_capacity
    }


def _make_cooler(components_element):
    params_element = components_element.single("scitemcoolerparams")
    return {
        "coolingRate": float(params_element.get("@coolingrate", 0))
    }


def _make_damage(damage_component):
    info_element = damage_component.single("damageinfo")
    return {
        "damageDistortion": float(info_element.get("@damagedistortion", 0)),
        "damageEnergy": float(info_element.get("@damageenergy", 0)),
        "damagePhysical": float(info_element.get("@damagephysical", 0)),
        "damageThermal": float(info_element.get("@damagethermal", 0))
    }


def _make_emp(components_element):
    return {
    }


def _make_flight_controller(components_element):
    params_element = components_element.single("ifcsparams")
    return {
        "scmSpeed": float(params_element.get("@maxspeed", 0)),
        "maxSpeed": float(params_element.get("@maxafterburnspeed", 0)),
        "maxAngularVelocityX": float(params_element.single("maxangularvelocity").get("@x", 0)),
        "maxAngularVelocityY": float(params_element.single("maxangularvelocity").get("@y", 0)),
        "maxAngularVelocityZ": float(params_element.single("maxangularvelocity").get("@z", 0))
    }


def _make_fuel_intake(components_element):
    result = {}

    params_element = components_element.single("scitemfuelintakeparams")
    if params_element:
        result["fuelPushRate"] = float(params_element.get("@fuelpushrate", 0))

    return result


def _make_fuel_tank(components_element):
    params_element = components_element.single("scitemfueltankparams")
    return {
        "capacity": float(params_element.get("@capacity", 0))
    }


def _make_missile(components_element):
    params_element = components_element.single("scitemmissileparams")
    targeting_element = params_element.single("targetingparams")
    gcs_element = params_element.single("gcsparams")
    explosion_element = params_element.single("explosionparams")

    result = {
        "trackingDistanceMax": float(targeting_element.get("@trackingdistancemax", 0)),
        "trackingSignalType": targeting_element.get("@trackingsignaltype"),
        "trackingAngle": float(targeting_element.get("@trackingangle", 0)),
        "lockTime": float(targeting_element.get("@locktime", 0)),
        "lockRangeMin": float(targeting_element.get("@lockrangemin", 0))
    }

    if gcs_element:
        result.update({
            "linearSpeed": float(gcs_element.get("@linearspeed", 0)),
            "interceptTime": float(gcs_element.get("@intercepttime", 0)),
            "terminalTime": float(gcs_element.get("@terminaltime", 0))
        })

    if explosion_element:
        result["damage"] = _make_damage(explosion_element.single("damage"))

    return result


def _make_missile_launcher(components_element):
    return {
    }


def _make_power_plant(components_element):
    return {
    }


def _make_quantum_drive(components_element):
    params_element = components_element.single("scitemquantumdriveparams")
    return {
        "jumpRange": float(params_element.get("@jumprange", 0)),
        "quantumFuelRequirement": float(params_element.get("@quantumfuelrequirement", 0)),
        "driveSpeed": float(params_element.single("params").get("@drivespeed", 0)),
        "cooldownTime": float(params_element.single("params").get("@cooldowntime", 0)),
        "spoolUpTime": float(params_element.single("params").get("@spooluptime", 0)),
        "maxCalibrationRequirement": float(params_element.single("params").get("@maxcalibrationrequirement", 0)),
        "calibrationRate": float(params_element.single("params").get("@calibrationrate", 0))
    }


def _make_shield(components_element):
    params_element = components_element.single("scitemshieldgeneratorparams")
    return {
        "maxShieldHealth": float(params_element.get("@maxshieldhealth", 0)),
        "maxShieldRegen": float(params_element.get("@maxshieldregen", 0)),
        "damagedRegenDelay": float(params_element.get("@damagedregendelay", 0)),
        "downedRegenDelay": float(params_element.get("@downedregendelay", 0))
    }


def _make_thruster(components_element):
    params_element = components_element.single("scitemthrusterparams")
    return {
        "thrusterType": params_element.get("@thrustertype"),
        "thrustCapacity": params_element.get("@thrustcapacity"),
        "fuelBurnRatePer10KNewton": params_element.get("@fuelburnrateper10knewton")
    }


def _make_turret(components_element):
    def make_angle_limit(angle_element):
        result = {
            "lowestAngle": float(angle_element.get("@lowestangle", 0)),
            "highestAngle": float(angle_element.get("@highestangle", 0))
        }

        if "@turretrotation" in angle_element:
            result["turretRotation"] = float(angle_element["@turretrotation"])

        return result;

    def make_axis_limit(axis_element):
        limits_element = axis_element.single("scitemturretjointmovementaxisparams").single("anglelimits")

        standard_element = limits_element.single("scitemturretstandardanglelimitparams")
        custom_element = limits_element.single("scitemturretcustomanglelimitparams")

        if standard_element:
            return {
                "standardLimit": make_angle_limit(standard_element)
            }

        if custom_element:
            custom_limits_list = custom_element.single("anglelimits").get("scitemturretcustomanglelimit")
            return {
                "customLimit": [make_angle_limit(x) for x in custom_limits_list]
            }

    params_element = components_element.single("scitemturretparams")

    result = {}

    if params_element:
        for joint_params in params_element.single("movementlist").get("scitemturretjointmovementparams"):
            pitch_element = joint_params.single("pitchaxis")
            yaw_element = joint_params.single("yawaxis")

            if pitch_element:
                result["pitchLimits"] = make_axis_limit(pitch_element)

            if yaw_element:
                result["yawLimits"] = make_axis_limit(yaw_element)

    return result


def _make_weapon_gun(components_element):
    def make_action_params(action_params_element):
        result = {
            "fireRate": float(action_params_element.get("@firerate", 0)),
            "heatPerShot": float(action_params_element.get("@heatpershot", 0))
        }

        launch_element = action_params_element.single("launchparams")
        if launch_element:
            result["pelletCount"] = int(launch_element.single("sprojectilelauncher").get("@pelletcount", 0))

        return result

    def make_weapon_action(weapon_action_element):
        simple_params = [
            "sweaponactionfiresingleparams",
            "sweaponactionfirerapidparams",
            "sweaponactionfirechargedparams",
            "sweaponactionfirebeamparams"]
        
        action_params = next(
            (make_action_params(weapon_action_element.single(x)) for x in simple_params if x in weapon_action_element),
            None)
        if action_params:
            return action_params

        sequence_element = weapon_action_element.single("sweaponactionsequenceparams")
        if sequence_element:
            # TODO Need to unpack what's happening inside weapon sequences.
            entry_element = sequence_element.single("sequenceentries").single("sweaponsequenceentryparams")

            inner_element = entry_element.single("weaponaction")
            if inner_element:
                return make_weapon_action(inner_element)

    result = {}
    
    params_element = components_element.single("scitemweaponcomponentparams")
    if params_element:
        connection_element = params_element.single("connectionparams")
        if connection_element:
            result["heatRateOnline"] = float(connection_element.get("@heatrateonline", 0))

        weapon_action_element = params_element.single("fireactions")
        result["weaponAction"] = make_weapon_action(weapon_action_element)

    ammo_container_element = components_element.single("sammocontainercomponentparams")
    if ammo_container_element:
        result["ammoParamsReference"] = ammo_container_element.get("@ammoparamsrecord")
        result["maxAmmoCount"] = int(ammo_container_element.get("@maxammocount", 0))

    return result


_item_type_methods = {
    "Cargo": _make_cargo,
    "Cooler": _make_cooler,
    "EMP": _make_emp,
    "FlightController": _make_flight_controller,
    "FuelIntake": _make_fuel_intake,
    "FuelTank": _make_fuel_tank,
    "MainThruster": _make_thruster,
    "ManneuverThruster": _make_thruster,
    "Missile": _make_missile,
    "MissileLauncher": _make_missile_launcher,
    "PowerPlant": _make_power_plant,
    "QuantumDrive": _make_quantum_drive,
    "QuantumFuelTank": _make_fuel_tank,
    "Shield": _make_shield,
    "Turret": _make_turret,
    "TurretBase": _make_turret,
    "WeaponGun": _make_weapon_gun
}


def make_item(item_element):
    components_element = item_element.single("components")
    if components_element:
        attachable_element = components_element.single("sattachablecomponentparams")
        if attachable_element:
            attachdef_element = attachable_element.single("attachdef")
            item_type = attachdef_element["@type"]

            baseline = {
                "displayName": attachdef_element.single("localization").get("@name"),
                "type": item_type,
                "subtype": attachdef_element.get("@subtype"),
                "size": int(attachdef_element.get("@size", 0)),
                "requiredTags": attachdef_element.get("@requiredtags"),
                "ports": {}
            }

            if baseline["subtype"] == "UNDEFINED":
                baseline["subtype"] = None

            # TODO Also need to split tags but the delimiter is unknown; no examples.
            if baseline["requiredTags"] == "":
                baseline["requiredTags"] = None

            degradation_element = components_element.single("sdegradationparams")
            if degradation_element:
                baseline["maxLifetimeHours"] = float(degradation_element.get("@maxlifetimehours", 0))

            power_element = components_element.single("entitycomponentpowerconnection")
            if power_element:
                baseline["power"] = {
                    "powerBase": float(power_element.get("@powerbase", 0)),
                    "powerDraw": float(power_element.get("@powerdraw", 0)),
                    "powerToEM": float(power_element.get("@powertoem", 0))
                }

            port_container_element = components_element.single("sitemportcontainercomponentparams")
            if port_container_element:
                for item_port_element in port_container_element.single("ports").get("sitemportdef", []):
                    types = []
                    for def_types_element in item_port_element.single("types").get("sitemportdeftypes", []):
                        port_type = def_types_element.get("@type")
                        port_subtypes = []

                        subtype_element = def_types_element.single("subtypes")
                        if subtype_element:
                            port_subtypes = [x.get("@value") for x in subtype_element.get("enum", [])]
                            port_subtypes = [x for x in port_subtypes if x != "UNDEFINED"]

                        if not port_subtypes:
                            port_subtypes = [None]

                        for subtype in port_subtypes:
                            types.append({
                                "type": port_type,
                                "subtype": subtype})

                    port = _make_item_port(item_port_element, None, types)
                    baseline["ports"][port["name"]] = port

                # TODO Doesn't handle containers with mixed types of ports.
                prefix = [baseline["type"], str(len(baseline["ports"]))]
                sizes = [str(x["minSize"]) + "-" + str(x["maxSize"]) for x in baseline["ports"].values()]
                baseline["container_hash"] = "_".join(prefix + sizes)

            # TODO Default loadouts for items! That'll handle the Hornet cargo container.

            heat_element = components_element.single("entitycomponentheatconnection")
            if heat_element:
                baseline["heat"] = {
                    "temperatureToIR": float(heat_element.get("@temperaturetoir", 0)),
                    "overheatTemperature": float(heat_element.get("@overheattemperature", 0)),
                    "specificHeatCapacity": float(heat_element.get("@specificheatcapacity", 0)),
                    "mass": float(heat_element.get("@mass", 0)),
                    "maxCoolingRate": float(heat_element.get("@maxcoolingrate", 0)),
                    "thermalEnergyBase": float(heat_element.get("@thermalenergybase", 0)),
                    "thermalEnergyDraw": float(heat_element.get("@thermalenergydraw", 0)),
                    "startCoolingTemperature": float(heat_element.get("@startcoolingtemperature", 0))
                }

            if item_type in _item_type_methods:
                baseline.update(_item_type_methods[item_type](components_element))
                return baseline

    return None
