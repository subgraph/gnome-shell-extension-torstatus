'use strict';

const Gio = imports.gi.Gio;
const Lang = imports.lang;

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

		this.install();
	}

	, install: function() {
		if (this._cmonitor) {
			this._cmonitor.remove();
		}
		this._cmonitor = new CircuitMonitor(this._theme);
		this._cmonitor.install();

		this.buildMenu(true);
	}

	, buildMenu: function(disabled) {
		log("Tor Status: " + _("Building menu"));
		if (!this._menu) {
			//this._menu.destroy();
			this._menu = new PopupMenu.PopupMenuSection();
		} else {
			this.menu.removeAll();
		}

		this._item = new PopupMenu.PopupSubMenuMenuItem(_("Tor Network"), true);
		this._item.icon.icon_name = 'tor-simple-symbolic';
		//this._item.icon.opacity = 64;

		this._itemNewIdentity =
			this._item.menu.addAction(_("New Identity"), Lang.bind(this, this._onMenuNewIdentity));
		this._itemCircuitMonitor =
			this._item.menu.addAction(_("Circuit Monitor"), Lang.bind(this, function() {
				log("Tor Indicator: " + _("menu circuit monitor"));
				this.cmonitor._toggle();
			}));
		this._itemConnectionPrefs =
			this._item.menu.addAction(_("Connection Preferences"), Lang.bind(this, function() {
				log("Tor Indicator: " + _("menu connection prefs"));
			}));

		this._menu.addMenuItem(this._item);
	}

	, enable: function() {
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

	, _onChangedConnectionState: function(source, state, reason) {
		log("Tor Status: " + _("menu switch state: %s reason: %s.").format(state, reason));
		if (this._indicator == null) {
			return
		}
		//state = 'bootstrapping';
		switch (state) {
			case 'bootstrapped':
				this._itemNewIdentity.visible = true;
				//this._itemNewIdentity.visible = true;
				//this.buildMenu(255);
				//this._itemNewIdentity.setSensitive(true);
				break;
			case 'bootstrapping':
				this._itemNewIdentity.visible = false;
				//this.buildMenu(192);
				//this._itemNewIdentity.setSensitive(false);
				break;
			case 'ready':
				this._itemNewIdentity.visible = false;
				//this.buildMenu(128);
				//this._itemNewIdentity.setSensitive(false);
				break;
			case 'closed':
			default:
				this._itemNewIdentity.visible = false;
				//this.buildMenu(255);
				//this._itemNewIdentity.setSensitive(false);
				break;
		}
	}
});
