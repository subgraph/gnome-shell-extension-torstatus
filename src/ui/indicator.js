'use strict';

const Gio = imports.gi.Gio;
const Lang = imports.lang;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Tweener = imports.ui.tweener;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Config = Me.imports.configs;

const Gettext = imports.gettext.domain(Config.PKG_GETTEXT);
const _ = Gettext.gettext;

const TorIndicator = new Lang.Class({
	Name: 'TorIndicator'
	, Extends: PanelMenu.SystemIndicator

	, _init: function(theme, tor_controller) {
		log("Tor Status: " + _("Creating tor indicator"))
		this.parent();

		this.theme = theme;
		this._aggregate = Main.panel.statusArea.aggregateMenu;
		this._tor_controller = tor_controller;
		this._tor_controller.connect('changed-connection-state', Lang.bind(this, this._onChangedConnectionState));
	}

	// TODO? Fix icon actor, somehow margin/padding is too big we may no be adding it to the right actor.
	, enable: function() {
		log("Tor Status: " + _("enabling indicator"));
		this._indicator = this._addIndicator();

		this._indicator.icon_name = Config.PKG_ICON_SYMBOLIC;
		//this._indicator.add_style_class_name('screencast-indicator');
		this._indicator.visible = true;
		this._indicator.opacity = 48;

		this._onChangedConnectionState(null, null, null);

		this._aggregate._indicators.add_child(this.indicators);
		this._aggregate._indicators.set_child_below_sibling(this.indicators,
			this.findIndicatorWidget(Main.panel.statusArea.aggregateMenu._network));
			//this.findFirstVisible());
			//this._aggregate._indicators.get_first_child());
	}

	, destroy: function() {
		log("Tor Status: " + _("disabling indicator"));
		if (this._indicator) {
			this._indicator.destroy();
		}
	}

	, findIndicatorWidget: function(widget) {
		let items = this._aggregate._indicators.get_children();
		for (let i = 0, ii = items.length; i < ii; i++) {
			if (items[i] === widget.indicators) {
				return items[i];
			}
		}

		return this._aggregate._indicators.get_first_child();
	}

	, findFirstVisible: function() {
		let items = this._aggregate._indicators.get_children();
		for(let i = 0, ii = items.length; i < ii ; i++) {
			//if(items[i].visible === true) {
			if (items[i].get_paint_visibility() === true) {
				return items[i];
			}
		}
		return this._aggregate._indicators.get_first_child();
	}

	, _onChangedConnectionState: function(source, state, reason) {
		log("Tor Status: " + _("indicator switch state: %s reason: %s").format(state, reason));
		if (this._indicator == null) {
			return
		}
		// TODO: add_effect/Tweener for opacity between Ready and bootstrapping
		switch (state) {
			case 'bootstrapped':
				this._indicator.opacity = 255;
				this._indicator.visible = true;
				//this._indicator.add_style_class_name('tor-bootstrapped-indicator');
				/*
				Tweener.removeTweens(this._indicator);
				let tweenParams = { time: 0.5, transition: 'easeOutQuad', opacity: 255 };
				Tweener.addTween(this._indicator, tweenParams);
				Tweener._addHandler(this._indicator, tweenParams, 'onComplete', function() { log("Tor Status: tween finished.") })
				*/
				break;
			case 'bootstrapping':
				this._indicator.opacity = 160;
				this._indicator.visible = true;
				//this._indicator.add_style_class_name('tor-connected-indicator');
				break;
			case 'ready':
				this._indicator.opacity = 96;
				this._indicator.visible = true;
				//this._indicator.add_style_class_name('tor-disconnected-indicator');
				break;
			case 'closed':
				this._indicator.opacity = 48;
				this._indicator.visible = true;
				//this._indicator.add_style_class_name('tor-none-indicator');
				break;
			case 'nonet':
			default:
				this._indicator.visible = false;
				break;
		}
	}
});
