"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const hp = require("./lib/heatingpump");
const fetch = require("node-fetch");
const timeouts = require('timers/promises');

class Kebawp extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "kebawp",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("unload", this.onUnload.bind(this));

	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		try {
			// Reset the connection indicator during startup
			this.setState("info.connection", false, true);

			// The adapters config (in the instance object everything under the attribute "native") is accessible via
			// this.config:
			this.log.info("config IPAddress: " + this.config.IPAddress);
			this.log.info("config Polltime: " + this.config.Polltime);

			if (!this.config.IPAddress.match("^[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}")) {
				this.log.error("Keine gültige IP Adresse.");
				return;
			}

			// Erstelle benötigte Adapter Struktur.
			this.createAllStates();

			// Starte Hauptroutine.
			this.updateData();

			this.setState("info.connection", true, true);
		} catch (err) {
			this.log.error("Fehler beim Starten von adapter: " + err.message);
		}
		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		// await this.setObjectNotExistsAsync("testVariable", {
		// 	type: "state",
		// 	common: {
		// 		name: "testVariable",
		// 		type: "boolean",
		// 		role: "indicator",
		// 		read: true,
		// 		write: true,
		// 	},
		// 	native: {},
		// });

		// // In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		// this.subscribeStates("testVariable");
		// // You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// // this.subscribeStates("lights.*");
		// // Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// // this.subscribeStates("*");

		// /*
		// 	setState examples
		// 	you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		// */
		// // the variable testVariable is set to true as command (ack=false)
		// await this.setStateAsync("testVariable", true);

		// // same thing, but the value is flagged "ack"
		// // ack should be always set to true if the value is received from or acknowledged from the target system
		// await this.setStateAsync("testVariable", { val: true, ack: true });

		// // same thing, but the state is deleted after 30s (getState will return null afterwards)
		// await this.setStateAsync("testVariable", { val: true, ack: true, expire: 30 });

		// // examples for the checkPassword/checkGroup functions
		// let result = await this.checkPasswordAsync("admin", "iobroker");
		// this.log.info("check user admin pw iobroker: " + result);

		// result = await this.checkGroupAsync("admin", "admin");
		// this.log.info("check group user admin group admin: " + result);
		// this.log.debug(hp.getAllParams);

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	/**
	 * Hauptroutine Datenabruf von Wärmepumpe.
	 */
	async updateData() {
		this.log.info("Start Cycle to collect Data.");
		try {
			// Hole alle Daten und update die states.
			var data = await this.getWpData();
			this.log.debug("Received data: " + JSON.stringify(data));
			await this.updateAllStates(data);
			this.log.debug("Cycle is done.");
			await timeouts.setTimeout(parseInt(this.config.Polltime) * 1000);
			this.updateData();
		}
		catch (err) {
			this.log.error(err.message);
		}
	}

	/**
	 * Get the WP Data.
	 * @returns {Promise<any>} Return JSON Object form Request.
	 */
	async getWpData() {
		this.log.debug("Start Fetch Request.");
		const response = await fetch(
			"http://" + this.config.IPAddress + "/var/readWriteVars?languageCode=de",
			{
				method: 'Post',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(hp.getAllParamNames)
			}
		);
		return response.json(); // Extracting data as a JSON Object from the response
	}

	/**
	 * Create all needed states.
	 */
	async createAllStates() {
		this.log.debug("Create all statess");
		for (const obj of hp.AllParams) {
			this.log.silly(`create state: ${obj.sid}.${obj.name}`);

			switch (obj.type) {
				case 'number':
					await this.setObjectNotExistsAsync(`${obj.sid}.${obj.friendlyName}`, {
						common: {
							name: obj.friendlyName,
							role: "value",
							write: false,
							read: true,
							type: "number",
							unit: obj.unit
						},
						type: 'state',
						native: {}
					});
					break;
				case 'boolean':
					await this.setObjectNotExistsAsync(`${obj.sid}.${obj.friendlyName}`, {
						common: {
							name: obj.friendlyName,
							role: "state",
							write: false,
							read: true,
							type: "boolean"
						},
						type: 'state',
						native: {}
					});
					break;
				default:
					await this.setObjectNotExistsAsync(`${obj.sid}.${obj.friendlyName}`, {
						common: {
							name: obj.friendlyName,
							role: "state",
							write: false,
							read: true,
							type: "string"
						},
						type: 'state',
						native: {}
					});
					break;
			}
		}
	}

	/**
	 * Updates all states.
	 * @param {object} data JSON Data Array
	 */
	async updateAllStates(data) {
		// Zahlen und Boolen zum richtigen Typen konvertieren!
		try {
			this.log.debug("Start with Update all States.");
			for (var i = 0; i < data.length; i++) {
				var obj = data[i];
				for (var prop in obj) {
					if (obj.hasOwnProperty(prop) && (!isNaN(obj[prop]) || obj[prop] === "false" || obj[prop] === "false")) {
						obj[prop] = JSON.parse(obj[prop]);
					}
				}
			}

			for (const obj of data) {
				var item = hp.AllParams.find(f => f.name === obj.name);
				if (item != undefined) {
					this.log.silly(`update state: ${item.sid}.${item.friendlyName} mit Value: ${obj.value}`);
					await this.setStateAsync(`${item.sid}.${item.friendlyName}`, obj.value, true);
				}
			}
		} catch (err) {
			this.log.error("Can't update states. " + err.message);
		}
	}

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Kebawp(options);
} else {
	// otherwise start the instance directly
	new Kebawp();
}