from .item import _make_damage


def make_ammo_params(ammo_params_element):
    result = {
        "reference": ammo_params_element["@__ref"],
        "speed": float(ammo_params_element.get("@speed", 0)),
        "lifetime": float(ammo_params_element.get("@lifetime", 0))
    }

    projectile_element = ammo_params_element.single("projectileparams").single("bulletprojectileparams")
    if projectile_element:
        result["damage"] = _make_damage(projectile_element.single("damage"))

        detonation_element = projectile_element.single("detonationparams").single("projectiledetonationparams")
        if detonation_element:
            result["explosionDamage"] = _make_damage(detonation_element.single("explosionparams").single("damage"))
            
        drop_element = projectile_element.single("damagedropparams").single("bulletdamagedropparams")
        if drop_element:
            result["damageDrop"] = {
                "minDistance": _make_damage(drop_element.single("damagedropmindistance")),
                "dropPerMeter": _make_damage(drop_element.single("damagedroppermeter")),
                "minDamage": _make_damage(drop_element.single("damagedropmindamage"))
            }
    return result
