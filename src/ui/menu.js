'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Util = imports.misc.util;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;


const Me = imports.misc.extensionUtils.getCurrentExtension();
const Config = Me.imports.configs;

const Gettext = imports.gettext.domain(Config.PKG_GETTEXT);
const _ = Gettext.gettext;

const CircuitMonitor = Me.imports.ui.cmonitor.CircuitMonitor;

const TorMenu = new Lang.Class({
	Name: 'TorMenu'
	, Extends: PopupMenu.PopupMenuSection

	, _init: function(theme, tor_controller) {
		log("Tor Status: " + _("Creating tor indicator menu"))
		this.parent();

		this._menu = null;
		this._item = null;
		this._cmonitor  = null;
		this._theme = theme;
		this._aggregate = Main.panel.statusArea.aggregateMenu;
		this._tor_controller = tor_controller;
		this._tor_controller.connect('changed-connection-state', Lang.bind(this, this._onChangedConnectionState));
		this._onioncircuits = GLib.find_program_in_path('onioncircuits');

		this.install();
	}

	, install: function() {
		if (this._cmonitor) {
			this._cmonitor.remove();
		}
		this._cmonitor = new CircuitMonitor(this._theme);
		this._cmonitor.install();

		if (!this._menu) {
			this._menu = new PopupMenu.PopupMenuSection();
		}
		this.rebuildMenu();
	}

	, rebuildMenu: function(state, opacity) {
		log("Tor Status: " + _("Building menu"));
		this._menu.removeAll();

		if (state === undefined) {
			return;
		}

		this._item = new PopupMenu.PopupSubMenuMenuItem(Config.PKG_TITLE, true);
		this._item.icon.icon_name = Config.PKG_ICON_SYMBOLIC;
		this._item.icon.opacity = (opacity !== undefined ? opacity : 255)

		switch (state) {
			case 'closed':
				this._item.setSensitive(false);
				break;
			case 'ready':
				this._item.setSubmenuShown(false);
				break;
			case 'bootstrapped':
			default:
				this._itemNewIdentity =
					this._item.menu.addAction(_("New Identity"), Lang.bind(this, this._onMenuNewIdentity));

				if (this._onioncircuits !== null) {
					this._itemOnionCircuits =
						this._item.menu.addAction(_("Tor Circuits and Streams"),
							Lang.bind(this, this._onMenuOnionCircuits));
				}

				if (state !== 'bootstrapped') {
					this._itemNewIdentity.setSensitive(false);
					this._itemOnionCircuits.setSensitive(false);
				}

			if (!Config.PKG_RELEASE) {
				this._itemCircuitMonitor =
					this._item.menu.addAction(_("Circuit Monitor"), Lang.bind(this, function() {
						log("Tor Indicator: " + _("menu circuit monitor"));
						this._cmonitor._toggle();
					}));
				if (state !== 'bootstrapped') {
					this._itemCircuitMonitor.setSensitive(false);
				}
				//this._itemConnectionPrefs =
				//	this._item.menu.addAction(_("Connection Preferences"), Lang.bind(this, function() {
				//		log("Tor Indicator: " + _("menu connection prefs"));
				//	}));
				//if (state !== 'bootstrapped') {
				//	this._itemConnectionPrefs.setSensitive(false);
				//}
			}
		}

		this._menu.addMenuItem(this._item);
	}

	, enable: function() {
		log("Tor Status: " + _("Enable menu"));
		let midx = this.findMenu(this._aggregate._power.menu);
		if(midx >= 0) {
			this._aggregate.menu.addMenuItem(this._menu, midx);
		}
	}

	, destroy: function() {
		if (this._menu) {
			this._menu.destroy();
		}

		if (this._cmonitor) {
			this._cmonitor.remove();
		}
	}

	, findMenu: function(menu) {
		let items = this._aggregate.menu._getMenuItems();
		for(let i = items.length; i >= 0 ; --i) {
			if(items[i] == menu) {
				return i;
			}
		}
		return -1;
	}

	, _onMenuNewIdentity: function() {
		log("Tor Status: " + _("menu switch identity"))
		this._tor_controller.switchIdentity();
	}

	, _onMenuOnionCircuits: function() {
		Util.spawnApp([this._onioncircuits]);
	}

	, _onChangedConnectionState: function(source, state, reason) {
		log("Tor Status: " + _("menu switch state: %s reason: %s.").format(state, reason));
		if (this._menu == null) {
			return
		}
		switch (state) {
			case 'bootstrapped':
				this.rebuildMenu(state, 255);
				break;
			case 'bootstrapping':
				this.rebuildMenu(state, 160);
				break;
			case 'ready':
				this.rebuildMenu(state, 96);
				break;
			case 'closed':
				this.rebuildMenu(state);
				break;
			case 'nonet':
			default:
				this.rebuildMenu()
				break;
		}
	}
});
