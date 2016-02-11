'use strict';

const Lang = imports.lang;
const GLib = imports.gi.GLib;

const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const MessageTray = imports.ui.messageTray;
const Util = imports.misc.util;


const Me = imports.misc.extensionUtils.getCurrentExtension();
const Config = Me.imports.configs;

const Gettext = imports.gettext.domain(Config.PKG_GETTEXT);
const _ = Gettext.gettext;

function getDefaultSource() {
	let source = Me.notificationSource;

	if (source && Main.sessionMode.isLocked) {
		source.destroy();
		source = null;
	}

	if (!source) {
		source = new Source();
		let destroyId = source.connect('destroy', Lang.bind(source,
			function(source) {
				if (Me.notificationSource === source) {
					Me.notificationSource = null;
				}

				source.disconnect(destroyId);
			}));

		Me.notificationSource = source;
	}

	return source;
}

const Source = new Lang.Class({
	Name: 'NotificationSource'
	, Extends: MessageTray.Source

	, _init: function() {
		this.parent(Config.PKG_TITLE, Config.PKG_ICON_SYMBOLIC);

		this._idleId = 0;
	}

	// override parent method
	, _createPolicy: function() {
		return new MessageTray.NotificationPolicy({
			showInLockScreen: false
			, detailsInLockScreen: false
		});
	}

	, _lastNotificationRemoved: function() {
		this._idleId = Mainloop.idle_add(Lang.bind(this,
										 function() {
											 if (!this.count) {
												 this.destroy();
											 }

											 return GLib.SOURCE_REMOVE;
										 }));
		GLib.Source.set_name_by_id(this._idleId,
								   '['+Config.PKG_GETTEXT+'] this._lastNotificationRemoved');
	}

	// override parent method
	, _onNotificationDestroy: function(notification) {
		let index = this.notifications.indexOf(notification);
		if (index < 0) {
			return;
		}

		this.notifications.splice(index, 1);
		if (this.notifications.length == 0) {
			this._lastNotificationRemoved();
		}

		this.countUpdated();
	}

	, destroyNotifications: function() {
		let notifications = this.notifications.slice();

		notifications.forEach(
			function(notification) {
				notification.destroy();
			});
	}

	, destroy: function() {
		this.parent();

		if (this._idleId) {
			Mainloop.source_remove(this._idleId);
			this._idleId = 0;
		}
	}
});

const Notification = new Lang.Class({
	Name: 'Notification'
	, Extends: MessageTray.Notification

	, _init: function(title, message, high) {
		this.source = getDefaultSource();
		this.parent(this.source, title, message, { bannerMarkup: true });

		this.setTransient(true);
		if (high === true) {
			this.setUrgency(MessageTray.Urgency.HIGH);
		}

		//this.addAction(_("Action"), Lang.bind(this,
		//	function() {
		//		Util.trySpawnCommandLine('xdg-open ' + GLib.shell_quote(url));
		//		this.destroy();
		//	}));
	}

	, show: function() {
		if (!Main.messageTray.contains(this.source)) {
			Main.messageTray.add(this.source);
		}

		this.source.notify(this);
	}

	, remove:  function() {
		if (!Main.messageTray.contains(this.source)) {
			Main.messageTray.add(this.source);
		}

		this.source.destroyNotifications(this);
	}
});
