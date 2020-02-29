var shipAttributeOverrides = {
	"MISC_Reliant": {
		"Size Category": "Small"
	},
	"XIAN_Scout": {
		"Size Category": "Small"
	},
	"VNCL_Scythe": {
		"Size Category": "Medium"
	},
	"VNCL_Glaive_Glaive": {
		"Size Category": "Medium"
	},
	"AEGS_Idris": {
		"Size Category": "Capital"
	},
	"AEGS_Vanguard": {
		"Size Category": "Medium"
	},
	"AEGS_Vanguard_Harbinger": {
		"Size Category": "Medium"
	},
	"AEGS_Vanguard_Hoplite": {
		"Size Category": "Medium"
	}
};

var turretRotations = {
	"AEGS_Avenger": {
		"hardpoint_weapon_class2_nose": {
		},
		"hardpoint_weapon_gun_class1_left_wing": {
		},
		"hardpoint_weapon_gun_class1_right_wing": {
		}
	},
	"AEGS_Eclipse": {
		"hardpoint_weapon_left": {
		},
		"hardpoint_weapon_right": {
		}
	},
	"AEGS_Gladius": {
		"hardpoint_gun_nose": {
		},
		"hardpoint_gun_left_wing": {
		},
		"hardpoint_gun_right_wing": {
		}
	},
	"AEGS_Hammerhead": {
		"turret_side_back_right": {
			"yaw": -90
		},
		"turret_side_back_left": {
			"yaw": 90
		},
		"turret_top": {
		},
		"turret_side_front_left": {
			"yaw": 90
		},
		"turret_side_front_right": {
			"yaw": -90
		},
		"turret_rear": {
			"roll": 180,
			"yaw": 180
		}
	},
	"AEGS_Reclaimer": {
		"hardpoint_turret": {
		},
		"hardpoint_tractor_beam_right": {
		},
		"hardpoint_tractor_beam_left": {
		},
		"hardpoint_remote_turret_front_left": {
			"roll": -90
		},
		"hardpoint_remote_turret_front_right": {
			"roll": 90
		},
		"hardpoint_remote_turret_top": {
		},
		"hardpoint_remote_turret_bottom": {
			"roll": 180,
			"yaw": 180
		},
		"hardpoint_remote_turret_rear_left": {
			"roll": 135,
			"yaw": 180
		},
		"hardpoint_remote_turret_rear_right": {
			"roll": -135,
			"yaw": 180
		},
		"turret_rear": {
		},
		"turret_rear": {
		}
	},
	"AEGS_Retaliator": {
		"hardpoint_turret_frontbottom": {
			"roll": 180
		},
		"hardpoint_turret_fronttop": {
		},
		"hardpoint_turret_backbottom": {
			"roll": 180,
			"yaw": -90
		},
		"hardpoint_turret_backtopleft": {
		},
		"hardpoint_turret_backtopright": {
		}
	},
	"AEGS_Sabre": {
		"hardpoint_weapon_left_nose": {
			"roll": 90
		},
		"hardpoint_weapon_right_nose": {
			"roll": -90
		},
		"hardpoint_weapon_left_wing": {
			"roll": 90
		},
		"hardpoint_weapon_right_wing": {
			"roll": -90
		}
	},
	"AEGS_Vanguard": {
		"hardpoint_weapon_gun_nose": {
		},
		"hardpoint_turret": {
		}
	},
	"ANVL_Arrow": {
		"hardpoint_gimbal_mount": {
			"roll": 180
		},
		"hardpoint_weapon_wing_left": {
		},
		"hardpoint_weapon_wing_right": {
		}
	},
	"ANVL_Carrack": {
		"hardpoint_turret_right": {
			"yaw": -90
		},
		"hardpoint_turret_left": {
			"yaw": 90
		},
		"hardpoint_turret_remote_turret": {
		},
		"hardpoint_turret_back_rear": {
			"yaw": 180
		},
	},
	"ANVL_Gladiator": {
		"hardpoint_class_2_left_wing": {
		},
		"hardpoint_class_2_right_wing": {
		},
		"hardpoint_turret": {
		}
	},
	"ANVL_Hawk": {
		"hardpoint_weapon_nose_left": {
		},
		"hardpoint_weapon_nose_right": {
		},
		"hardpoint_weapon_wing_bottom_left": {
		},
		"hardpoint_weapon_wing_bottom_right": {
		},
		"hardpoint_weapon_wing_top_left": {
		},
		"hardpoint_weapon_wing_top_right": {
		}
	},
	"ANVL_Hornet": {
		"hardpoint_class_4_nose": {
		},
		"hardpoint_class_4_center": {
		},
		"hardpoint_class_2_left_wing": {
		},
		"hardpoint_class_2_right_wing": {
		},
		"hardpoint_gun_center": {
		},
		"hardpoint_gun_wing_left": {
		},
		"hardpoint_gun_nose": {
		},
		"hardpoint_gun_wing_right": {
		}
	},
	"ANVL_Hurricane": {
		"hardpoint_gun_nose_right_s4": {
			"roll": 90
		},
		"hardpoint_gun_nose_left_s4": {
			"roll": -90
		},
		"hardpoint_turret": {
		}
	},
	"ANVL_Terrapin": {
		"hardpoint_seat_support": {
		},
		"hardpoint_weapon_nose": {
		}
	},
	"ANVL_Valkyrie": {
		"hardpoint_turret_bottom": {
		},
		"hardpoint_turret_top": {
		},
		"hardpoint_turret_pilot": {
		},
		"hardpoint_weapon_wing_left": {
		},
		"hardpoint_weapon_wing_right": {
		},
		"hardpoint_turret_door_right": {
			"yaw": -90
		},
		"hardpoint_turret_door_left": {
			"yaw": 90
		}
	},
	"Banu_Defender": {
		"hardpoint_weapon_wing_left": {
		},
		"hardpoint_weapon_wing_right": {
		},
		"hardpoint_weapon_nose_left": {
		},
		"hardpoint_weapon_nose_right": {
		}
	},
	"CNOU_Mustang": {
		"hardpoint_weapon_nose": {
		},
		"hardpoint_weapon_wing_left": {
			"roll": 180
		},
		"hardpoint_weapon_wing_right": {
			"roll": 180
		}
	},
	"DRAK_Buccaneer": {
		"hardpoint_Spinal_S4": {
			"roll": 180
		},
		"hardpoint_Left_Wing_S03": {
		},
		"hardpoint_Right_Wing_S3": {
		}
	},
	"DRAK_Caterpillar": {
		"hardpoint_turret_bottom": {
			"roll": 180
		},
		"hardpoint_turret_top": {
		},
		"hardpoint_weapon_top": {
		},
		"hardpoint_weapon_left": {
			"roll": 90
		},
		"hardpoint_weapon_right": {
			"roll": -90
		}
	},
	"DRAK_Cutlass_Black": {
		"hardpoint_Right_Body_Weapon": {
			"roll": 180
		},
		"hardpoint_Left_Body_Weapon": {
			"roll": 180
		},
		"hardpoint_Right_Wing_Weapon": {
		},
		"hardpoint_Left_Wing_Weapon": {
		},
		"hardpoint_turret": {
		}
	},
	"DRAK_Dragonfly": {
		"hardpoint_weapon_left": {
		},
		"hardpoint_weapon_right": {
		}
	},
	"DRAK_Herald": {
		"hardpoint_weapon_s02_nose": {
		},
		"hardpoint_weapon_s02_left_wing": {
		},
		"hardpoint_weapon_s02_right_wing": {
		}
	},
	"MISC_Freelancer": {
		"hardpoint_sidecannon_left": {
			"roll": -90,
			"flip": true
		},
		"hardpoint_sidecannon_right": {
			"roll": 90
		},
		"hardpoint_rear_turret": {
			"yaw": 180
		}
	},
	"MISC_Prospector": {
		"hardpoint_weapon_left": {
			"roll": 90
		},
		"hardpoint_weapon_right": {
			"roll": 90
		}
	},
	"MISC_Razor": {
		"hardpoint_weapon_left": {
			"roll": 45
		},
		"hardpoint_weapon_right": {
			"roll": -45
		}
	},
	"MISC_Reliant": {
		"Hardpoint_Weapon_Wing_Tip_S3_Left": {
		},
		"Hardpoint_Weapon_Wing_Tip_S3_Right": {
		},
		"Hardpoint_Weapon_Wing_S1_Left": {
		},
		"Hardpoint_Weapon_Wing_S1_Right": {
		}
	},
	"MISC_Starfarer": {
		"hardpoint_sidecannon_right": {
			"roll": 90
		},
		"hardpoint_sidecannon_left": {
			"roll": -90
		},
		"hardpoint_front_turret": {
		},
		"hardpoint_rear_right_turret": {
			"roll": 180,
			"yaw": 180
		},
		"hardpoint_rear_left_turret": {
			"roll": 180,
			"yaw": 180
		}
	},
	"ORIG_300i": {
		"hardpoint_nose_gun": {
		},
		"hardpoint_left_wing_gun_mount": {
			"roll": 90
		},
		"hardpoint_right_wing_gun_mount": {
			"roll": -90
		}
	},
	"ORIG_600i": {
		"hardpoint_weapon_left": {
		},
		"hardpoint_weapon_right": {
		},
		"hardpoint_remote_turret_top": {
		},
		"hardpoint_remote_turret_bottom": {
			"roll": 180
		},
		"hardpoint_weapon_centre": {
		}
	},
	"ORIG_85X": {
		"hardpoint_turret": {
		}
	},
	"RSI_Aurora": {
		"Hardpoint_Weapon_Nose_Right": {
		},
		"Hardpoint_Weapon_Nose_Left": {
		},
		"Hardpoint_Weapon_Wing_Top_Left": {
			"flip": true
		},
		"Hardpoint_Weapon_Wing_Top_Right": {
		}
	},
	"RSI_Constellation": {
		"hardpoint_turret_base_upper": {
			"yaw": 180
		},
		"hardpoint_turret_base_lower": {
			"yaw": 180
		},
		"hardpoint_gun_laser_bottom_left": {
		},
		"hardpoint_gun_laser_bottom_right": {
		},
		"hardpoint_gun_laser_top_left": {
		},
		"hardpoint_gun_laser_top_right": {
		}
	},
	"RSI_Ursa_Rover": {
		"GunMount": {
		}
	},
	"TMBL_Cyclone": {
		"hardpoint_module_attach": {
		}
	},
	"XIAN_Scout": {
		"hardpoint_gun_left": {
			"roll": -90
		},
		"hardpoint_gun_right": {
			"roll": 90
		}
	}
};