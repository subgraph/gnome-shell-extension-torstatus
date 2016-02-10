'use strict';

const Lang = imports.lang;

const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const MessageTray = imports.ui.messageTray;
const St = imports.gi.St;

const Gettext = imports.gettext.domain('gnome-shell-extension-torstatus');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const statusIndicator = Me.imports.ui.indicator.TorIndicator;
const statusMenu = Me.imports.ui.menu.TorMenu;

const TorControlClient = Me.imports.tor_control_client.TorControlClient;

const TORSTATUS_SETTINGS_SCHEMA = 'org.gnome.shell.extensions.torstatus';
const TORSTATUS_KEY_ENABLEMENU = 'menu-enabled';

const TorConnectedIcon = 'tor-simple-symbolic';
const TorDisconnectedIcon = 'tor-disconnected-symbolic';

const TorStatusIndicator = new Lang.Class({
	Name: 'TorStatusIndicator'

	, _init: function(extensionMeta) {
		this.parent();
		this.theme = Gtk.IconTheme.get_default();
		this.theme.append_search_path(extensionMeta.path + '/icons');

		//this.settings = Convenience.getSettings(TORSTATUS_SETTINGS_SCHEMA);

		this.indicator = null;
		this.menu = null;
		this.torController = null;
	}

	, enable: function() {
		this.torController = new TorControlClient('127.0.0.1', 9051, true);
		this.torController.connect('protocol-error', Lang.bind(this, this._onProtocolError));
		this.torController.connect('switched-tor-identity', Lang.bind(this, this._onSwitchedTorIdentity));
		this.torController.connect('changed-connection-state', Lang.bind(this, this._onTorStateChanged));

		this.indicator = new statusIndicator(this.theme, this.torController);
		this.indicator.enable();

		//if (this.settings.get_bool(TORSTATUS_KEY_ENABLEMENU)) {
		//	this.menu = new statusMenu(this.theme, this.torController);
		//	this.menu.enable();
		//}

		this.torController.openConnection();
	}

	, disable: function() {
		if (this.indicator) {
			this.indicator.destroy();
		}

		if (this.menu) {
			this.menu.destroy();
		}

		if (this.torController) {
			this.torController.destroy();
		}

		if (this.settings) {
			this.settings.run_dispose();
		}
	}

	, _onTorStateChanged: function(source, state, reason) {
		if (state === 'bootstrapped') {
			this._tor_bootstrap = true;
			Main.notify(_("Tor Network"), _("Tor network bootstrapped successfully!"));
		} else if (this._tor_bootstrap === true) {
			this._tor_bootstrap = false;
			Main.notify(_("Tor Network"), _("Tor network disconnected!"));
		}
	}

	, _onSwitchedTorIdentity: function() {
		//this._notification = new MessageTray.Notification(this, header, text);
		/*
		let gicon = new Gio.ThemedIcon({ name: 'tor-simple-symbolic' });
		let title = _("Tor Network");
		let text = _("Switched to a new Tor identity!");

		let notification = new MessageTray.Notification(this, title, text, { gicon: gicon });
		notification.setTransient(true);
		Main.notify(notification);
		*/
		Main.notify(_("Tor Network"), _("Switched to a new Tor identity!"));
	}

	, _onProtocolError: function(source, message, statusCode) {
		var msg = _("Tor control protocol error") + ': ' + message + ' (' + _("status code") + statusCode + ')';
		Main.notifyError(_("Tor Network"), msg);
	}
});

function init(extensionMeta) {
	//Convenience.initTranslations('torbutton');
	return new TorStatusIndicator(extensionMeta);
}
