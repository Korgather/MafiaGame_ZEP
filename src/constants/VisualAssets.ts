import { Role, type Role as RoleId } from "../types/Game.types.ts";

/**
 * Production artwork shipped with the game.
 *
 * Keeping every filename in one typed manifest gives widgets and tests the same
 * source of truth. ZEP serves files from the flat `res` directory, so values are
 * filenames rather than relative paths.
 */
export interface VisualAsset {
	readonly file: string;
	readonly kind: "role-icon" | "cut" | "ability" | "ui" | "game-icon" | "background";
	readonly alpha?: boolean;
}

const asset = (file: string, kind: VisualAsset["kind"], alpha = false): VisualAsset => ({
	file,
	kind,
	...(alpha ? { alpha: true } : {}),
});

export const ROLE_ICONS: Record<RoleId, VisualAsset> = {
	[Role.MAFIA]: asset("art_role_mafia.png", "role-icon", true),
	[Role.DOCTOR]: asset("art_role_doctor.png", "role-icon", true),
	[Role.POLICE]: asset("art_role_police.png", "role-icon", true),
	[Role.POLITICIAN]: asset("art_role_politician.png", "role-icon", true),
	[Role.SHAMAN]: asset("art_role_shaman.png", "role-icon", true),
	[Role.SPY]: asset("art_role_spy.png", "role-icon", true),
	[Role.VIGILANTE]: asset("art_role_vigilante.png", "role-icon", true),
	[Role.SOLDIER]: asset("art_role_soldier.png", "role-icon", true),
	[Role.THUG]: asset("art_role_thug.png", "role-icon", true),
	[Role.REPORTER]: asset("art_role_reporter.png", "role-icon", true),
	[Role.BEAST]: asset("art_role_beast.png", "role-icon", true),
	[Role.CITIZEN]: asset("art_role_citizen.png", "role-icon", true),
};

export const CUT_ART = {
	"game-start": asset("art_cut_game_start.png", "cut"),
	"role-reveal": asset("art_cut_role_reveal.png", "cut"),
	"night-start": asset("art_cut_night_start.png", "cut"),
	"night-result": asset("art_cut_night_result.png", "cut"),
	"day-start": asset("art_cut_day_start.png", "cut"),
	"discussion-start": asset("art_cut_discussion_start.png", "cut"),
	"vote-start": asset("art_cut_vote_start.png", "cut"),
	execution: asset("art_cut_execution.png", "cut"),
	"citizen-win": asset("art_cut_citizen_win.png", "cut"),
	"mafia-win": asset("art_cut_mafia_win.png", "cut"),
} as const;

export type CutScene = keyof typeof CUT_ART;

export const ABILITY_ART = {
	attack: asset("art_ability_attack.png", "ability"),
	heal: asset("art_ability_heal.png", "ability"),
	investigate: asset("art_ability_investigate.png", "ability"),
	silence: asset("art_ability_silence.png", "ability"),
	scoop: asset("art_ability_scoop.png", "ability"),
} as const;

export type AbilityArt = keyof typeof ABILITY_ART;

export const UI_ART = {
	"panel-texture": asset("art_ui_panel_texture.png", "ui"),
	"popup-frame": asset("art_ui_popup_frame.png", "ui", true),
	"card-front": asset("art_ui_card_front.png", "ui"),
	"card-back": asset("art_ui_card_back.png", "ui"),
	"button-primary": asset("art_ui_button_primary.png", "ui", true),
	"button-secondary": asset("art_ui_button_secondary.png", "ui", true),
	"button-danger": asset("art_ui_button_danger.png", "ui", true),
	"vote-frame": asset("art_ui_vote_frame.png", "ui", true),
	"chat-frame": asset("art_ui_chat_frame.png", "ui", true),
	"ability-frame": asset("art_ui_ability_frame.png", "ui", true),
	"notification-banner": asset("art_ui_notification_banner.png", "ui", true),
	"victory-frame": asset("art_ui_victory_frame.png", "ui", true),
	"loading-emblem": asset("art_ui_loading_emblem.png", "ui", true),
	"tutorial-frame": asset("art_ui_tutorial_frame.png", "ui", true),
} as const;

export const GAME_ICONS = {
	// The pack is complete even where the current game has no matching control yet
	// (settings, sound toggle, restart). Keep those assets registered without
	// inventing non-functional buttons merely to display them.
	vote: asset("art_icon_vote.png", "game-icon", true),
	skip: asset("art_icon_skip.png", "game-icon", true),
	confirm: asset("art_icon_confirm.png", "game-icon", true),
	cancel: asset("art_icon_cancel.png", "game-icon", true),
	time: asset("art_icon_time.png", "game-icon", true),
	player: asset("art_icon_player.png", "game-icon", true),
	dead: asset("art_icon_dead.png", "game-icon", true),
	alive: asset("art_icon_alive.png", "game-icon", true),
	mute: asset("art_icon_mute.png", "game-icon", true),
	settings: asset("art_icon_settings.png", "game-icon", true),
	sound: asset("art_icon_sound.png", "game-icon", true),
	exit: asset("art_icon_exit.png", "game-icon", true),
	restart: asset("art_icon_restart.png", "game-icon", true),
} as const;

export const BACKGROUND_ART = {
	lobby: asset("art_bg_lobby.png", "background"),
	"village-day": asset("art_bg_village_day.png", "background"),
	"village-night": asset("art_bg_village_night.png", "background"),
	"vote-hall": asset("art_bg_vote_hall.png", "background"),
	prison: asset("art_bg_prison.png", "background"),
	graveyard: asset("art_bg_graveyard.png", "background"),
	title: asset("art_bg_title.png", "background"),
	result: asset("art_bg_result.png", "background"),
} as const;

export const ALL_VISUAL_ASSETS: readonly VisualAsset[] = [
	...Object.values(ROLE_ICONS),
	...Object.values(CUT_ART),
	...Object.values(ABILITY_ART),
	...Object.values(UI_ART),
	...Object.values(GAME_ICONS),
	...Object.values(BACKGROUND_ART),
];
