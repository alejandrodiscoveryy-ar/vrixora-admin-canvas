UPDATE app_private.marketplace_presence_policy_v2 SET inactivity_hours = 24, auto_expire_enabled = true WHERE singleton = true;
