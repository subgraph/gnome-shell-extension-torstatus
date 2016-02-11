/*
Copyright 2015, 2016 Frank Ploss <frank@fqxp.de>.
Copyright 2016 Subgraph <info@subgraph.com>.

This file is part of gnome-shell-extension-torstatus.

gnome-shell-extension-tor is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

gnome-shell-extension-tor is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with gnome-shell-extension-tor.  If not, see <http://www.gnu.org/licenses/>.
*/
'use strict';

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
//const Log = Me.imports.log.Log;

const TorConnectionError = new Lang.Class({
	Name: 'TorConnectionError',

	_init: function(message) {
		this.message = message;
	}
})

const TorProtocolError = new Lang.Class({
	Name: 'TorProtocolError',

	_init: function(message, statusCode) {
		this.message = message;
		this.statusCode = statusCode;
	}
});

const TorControlClient = new Lang.Class({
	Name: 'TorControlClient'

	, _init: function(host, port, autoRetry) {
		this._host = host;
		this._port = port;
		this._autoRetry = autoRetry;
		this._autoRetryTimerId = null;
		this._autoBootstrapStatusTimerId = null;
		this.bootstrap_percent = 0;
		this.bootstrap_summary = '';
	}

	, destroy: function() {
		this.stopAutoRetry();
		this._stopCheckStatus();
		this.closeConnection(null, true);
	}

	, openConnection: function() {
		log("Tor Status: " + _("Trying to reconnect..."));
		try {
			this._connect(this._host, this._port);
			this._updateProtocolInfo();
			this._ensureProtocolCompatibility();
			this._authenticate();
			this.emit('changed-connection-state', 'ready');
			this.stopAutoRetry();
			log("Tor Status: " + _("Connected to Tor control port"));
			this._startCheckStatus();
		} catch (e if e instanceof TorConnectionError) {
			log("Tor Status: " + _("Could not connect to Tor control port"));
			this.closeConnection(e.message);
			this.startAutoRetry();
		} catch (e if e instanceof TorProtocolError) {
			log("Tor Status: " + _("Tor control protocol error: ") + e.message);
			this.closeConnection(e.message);
			this.startAutoRetry();
		}
	}

	, closeConnection: function(reason, noemit) {
		this._stopCheckStatus();
		if (this._connection && this._connection.is_connected()) {
			this._connection.close(null);
		}

		this._connection = null;

		if (noemit === true) {
			this.emit('changed-connection-state', 'closed', reason);
		}
	}

	, startAutoRetry: function() {
		if (!this._autoRetry)
			return;

		if (this._autoRetryTimerId !== null)
			return;

		this._autoRetryTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, Lang.bind(this, function() {
			this.openConnection();
			return this._connection === null || !this._connection.is_connected();
		}));

		log("Tor Status: " + _("Started auto retry (timer id=%s)").format(this._autoRetryTimerId));
	}

	, stopAutoRetry: function() {
		if (this._autoRetryTimerId === null)
			return;

		log("Tor Status: " + _("Stopping auto retry (timer id=%s)").format(this._autoRetryTimerId));

		GLib.source_remove(this._autoRetryTimerId);
		this._autoRetryTimerId = null;
	}

	, _stopCheckStatus: function() {
		if (this._autoBootstrapStatusTimerId === null)
			return;

		GLib.source_remove(this._autoBootstrapStatusTimerId);
		this._autoBootstrapStatusTimerId = null;

		log("Tor Status: " + _("Stopping bootstrap check (timer id=%s)").format(this._autoBootstrapStatusTimerId));
	}

	, _checkStatus: function() {
		//log("Tor Status: " + _("Checking bootstrap..."));
		if (this._connection === null || !this._connection.is_connected()) {
			this._old_percent = null;
			return false;
		}

		let reply = this._runCommand('GETINFO status/bootstrap-phase');

		if (reply.statusCode != 250) {
			throw new TorProtocolError(
				_("Could not read bootstrap status: ") + reply.replyLines.join('\n'),
				reply.statusCode
			);
		}

		try {
			let lines = reply.replyLines.join('\n');
			this._old_percent = this.bootstrap_percent;
			this.bootstrap_percent = parseInt(lines.split('PROGRESS=')[1].split(' ')[0]);
			this.bootstrap_summary = lines.split('SUMMARY="')[1].split('"')[0];

			if (this._old_percent != this.bootstrap_percent) {
				log("Tor Status: " + _("Bootstrap state: %s (%s)").format(this.bootstrap_summary, this.bootstrap_percent));
				let phase = (this.bootstrap_percent < 100) ? 'boostrapping' : 'bootstrapped';
				this.emit('changed-connection-state', phase, this.bootstrap_summary);
			}
		} catch (e) {
			throw new TorProtocolError(
				_("Could not parse bootsrap status: %s (%s)").format(lines, e.message), reply.statusCode
			);
		}

		return true;
	}

	, _startCheckStatus: function() {
		log("Tor Status: " + _("Starting bootstrap check."));
		if (this._autoBootstrapStatusTimerId !== null) {
			return;
		}

		if (!this._checkStatus()) {
			return;
		}
		this._autoBootstrapStatusTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, Lang.bind(this, function() {
			return this._checkStatus();
		}));
	}

	, switchIdentity: function() {
		let reply = this._runCommand('SIGNAL NEWNYM');

		if (reply.statusCode == 250) {
			this.emit('switched-tor-identity');
		} else {
			this.emit(
				'protocol-error',
				_("Could not switch Tor identity: ") + reply.replyLines.join('\n'),
				reply.statusCode
			);
		}
	}

	, _connect: function(host, port) {
		let socketClient = new Gio.SocketClient();

		try {
			this._connection = socketClient.connect_to_host(host + ':' + port, null, null);
		} catch (e if e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CONNECTION_REFUSED)) {
			throw new TorConnectionError(
					_("Could not connect to Tor control port (Tor is not listening on %s:%s").format(host, port));
		}

		this._inputStream = new Gio.DataInputStream({base_stream: this._connection.get_input_stream()});
		this._outputStream = new Gio.DataOutputStream({base_stream: this._connection.get_output_stream()});
	}

	, _updateProtocolInfo: function() {
		let reply = this._runCommand('PROTOCOLINFO');

		if (reply.statusCode != 250) {
			throw new TorProtocolError(
					_("Could not read protocol info, reason: ") + reply.replyLines.join('\n'),
					reply.statusCode);
		}

		let protocolInfoVersion;
		let authMethods = [];
		let authCookieFile;

		for (let i = 0, ii = reply.replyLines.length; i < ii; i++) {
			let tokens = reply.replyLines[i].split(' ');

			switch (tokens[0]) {
				case 'PROTOCOLINFO':
					protocolInfoVersion = tokens[1];
					break;
				case 'AUTH':
					let methodsArg = tokens[1].split('=');
					authMethods = methodsArg[1].split(',');

					if (authMethods.indexOf('COOKIE') != -1 || authMethods.indexOf('SAFECOOKIE') != -1) {
						let cookieArg = tokens[2].split('=');
						authCookieFile = cookieArg[1].substr(1, cookieArg[1].length - 2);   // strip quotes
					}
					break;
			}
		}

		this._protocolInfo = {
			protocolInfoVersion: protocolInfoVersion,
			authMethods: authMethods,
			authCookieFile: authCookieFile
		}
	}

	, _ensureProtocolCompatibility: function() {
		if (this._protocolInfo.protocolInfoVersion != 1) {
			throw new TorProtocolError(_("Cannot handle tor protocol version: ") + this._protocolInfo.protocolInfoVersion);
		}
	}

	, _authenticate: function() {
		let cookie;
		try {
			cookie = this._readAuthCookie();
		} catch (e) {
			cookie = '';
		}
		let reply = this._runCommand('AUTHENTICATE ' + cookie);

		if (reply.statusCode != 250) {
			throw new TorProtocolError(
				_("Could not authenticate, reason: ") + reply.replyLines.join('\n'),
				statusCode
			);
		}
	}

	, _runCommand: function(cmd) {
		this._outputStream.put_string(cmd + '\n', null);
		this._outputStream.flush(null);

		let statusCode;
		let replyLines = [];

		do {
			let line = this._readLine();

			if (line === null) {
				let reason = _("Lost connection to Tor server");
				this.closeConnection(reason);
				this.startAutoRetry();
				return {replyLines: [reason]};
			}

			let reply = this._parseLine(line);
			statusCode = reply.statusCode;
			replyLines.push(reply.replyLine);
		} while (reply.isMidReplyLine);

		return {
			statusCode: statusCode,
			replyLines: replyLines
		};
	}

	, _readLine: function() {
		[line, length] = this._inputStream.read_line(null, null);

		return (line !== null) ? line.toString().trim() : null;
	}

	, _parseLine: function(line) {
		return {
			statusCode: parseInt(line.substr(0, 3)),
			isMidReplyLine: (line[3] == '-'),
			replyLine: line.substring(4)
		}
	}

	, _readAuthCookie: function(force) {
		let file = Gio.File.new_for_path(this._protocolInfo.authCookieFile);
		let inputStream = file.read(null);
		let cookieData = inputStream.read_bytes(32, null, null).get_data();
		inputStream.close(null);

		let authCookie = '';
		for (let i = 0; i < cookieData.length; i++) {
			let hexByte = cookieData[i].toString(16);
			if (hexByte.length == 1) {
				hexByte = '0' + hexByte;
			}
			authCookie += hexByte;
		}

		return authCookie;
	}
});

Signals.addSignalMethods(TorControlClient.prototype);
