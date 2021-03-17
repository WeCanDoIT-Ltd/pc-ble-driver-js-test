'use strict';

const api = require('pc-ble-driver-js');
const path = require('path');

const adapterFactory = api.AdapterFactory.getInstance(undefined, {
  enablePolling: false,
});

const BLE_UUID_BLINKY_SERVICE = '000015231212EFDE1523785FEABCD123';
const LBS_UUID_BLINKY_BUTTON_CHAR = '000015241212EFDE1523785FEABCD123';
const LBS_UUID_BLINKY_LED_CHAR = '000015251212EFDE1523785FEABCD123';

const BLE_UUID_CCCD = '2902';

function discoverBlinkyService(adapter, device) {
  return new Promise((resolve, reject) => {
    adapter.getServices(device.instanceId, (err, services) => {
      if (err) {
        reject(Error(`Error discovering the blinky service: ${err}.`));
        return;
      }

      for (const service in services) {
        if (services[service].uuid === BLE_UUID_BLINKY_SERVICE) {
          resolve(services[service]);
          return;
        }
      }

      reject(Error("Did not discover the blinky service in peripheral's GATT attribute table."));
    });
  });
}

function discoverButtonCharacteristic(adapter, blinkyService) {
  return new Promise((resolve, reject) => {
    adapter.getCharacteristics(blinkyService.instanceId, (err, characteristics) => {
      if (err) {
        reject(Error(`Error discovering the blinky service's characteristics: ${err}.`));
        return;
      }

      for (const characteristic in characteristics) {
        if (characteristics[characteristic].uuid === LBS_UUID_BLINKY_BUTTON_CHAR) {
          resolve(characteristics[characteristic]);
          return;
        }
      }

      reject(Error("Did not discover the blinky button char in peripheral's GATT attribute table."));
    });
  });
}

function discoverButtonCharCCCD(adapter, blinkyButtonCharacteristic) {
  return new Promise((resolve, reject) => {
    adapter.getDescriptors(blinkyButtonCharacteristic.instanceId, (err, descriptors) => {
      if (err) {
        reject(Error(`Error discovering the blinky characteristic's CCCD: ${err}.`));
        return;
      }

      for (const descriptor in descriptors) {
        if (descriptors[descriptor].uuid === BLE_UUID_CCCD) {
          resolve(descriptors[descriptor]);
          return;
        }
      }

      reject(Error("Did not discover the blinky chars CCCD in peripheral's GATT attribute table."));
    });
  });
}

function addUserInputListener(adapter, cccdDescriptor) {
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);

  const notificationsEnabled = [0, 0];

  process.stdin.on('readable', () => {
    const chunk = process.stdin.read();
    if (chunk === null) return;

    if (chunk[0] === 'q' || chunk[0] === 'Q') {
      adapter.close((err) => {
        if (err) {
          console.log(`Error closing the adapter: ${err}.`);
        }

        console.log('Exiting the application...');
        process.exit(1);
      });
    } else if (chunk[0] === 'l' || chunk[0] === 'L') {
    } else {
      if (notificationsEnabled[0]) {
        notificationsEnabled[0] = 0;
        console.log('Disabling notifications on the blinky button characteristic.');
      } else {
        notificationsEnabled[0] = 1;
        console.log('Enabling notifications on the blinky button characteristic.');
      }

      adapter.writeDescriptorValue(cccdDescriptor.instanceId, notificationsEnabled, false, (err) => {
        if (err) {
          console.log(`Error enabling notifications on the blinky button characteristic: ${err}.`);
          process.exit(1);
        }

        console.log('Notifications toggled on the blinky button characteristic.');
      });
    }
  });
}

/**
 * Connects to the desired BLE peripheral.
 *
 * @param {Adapter} adapter Adapter being used.
 * @param {any} connectToAddress Device address of the advertising BLE peripheral to connect to.
 * @returns {Promise} Resolves on successfully connecting to the BLE peripheral.
 *                    If an error occurs, rejects with the corresponding error.
 */
function connect(adapter, connectToAddress) {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to device ${connectToAddress}...`);

    const options = {
      scanParams: {
        active: false,
        interval: 100,
        window: 50,
        timeout: 0,
      },
      connParams: {
        min_conn_interval: 7.5,
        max_conn_interval: 300,
        slave_latency: 0,
        conn_sup_timeout: 4000,
      },
    };

    adapter.connect(connectToAddress, options, (err) => {
      if (err) {
        reject(Error(`Error connecting to target device: ${err}.`));
        return;
      }

      resolve();
    });
  });
}

/**
 * Function to start scanning (GAP Discovery procedure, Observer Procedure).
 *
 * @param {Adapter} adapter Adapter being used.
 * @returns {Promise} Resolves on successfully initiating the scanning procedure.
 *                    If an error occurs, rejects with the corresponding error.
 */
function startScan(adapter) {
  return new Promise((resolve, reject) => {
    console.log('Started scanning...');

    const scanParameters = {
      active: true,
      interval: 100,
      window: 50,
      timeout: 0,
    };

    adapter.startScan(scanParameters, (err) => {
      if (err) {
        reject(new Error(`Error starting scanning: ${err}.`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Handling events emitted by adapter.
 *
 * @param {Adapter} adapter Adapter in use.
 * @returns {void}
 */
function addAdapterListener(adapter) {
  adapter.on('logMessage', (severity, message) => {
    if (severity > 3) console.log(`LOG ${severity} ${message}`);
  });

  adapter.on('error', (error) => {
    console.log(`error: ${JSON.stringify(error, null, 1)}.`);
  });

  adapter.on('deviceConnected', (device) => {
    console.log(`Device ${device.address}/${device.addressType} connected.`);

    discoverBlinkyService(adapter, device)
      .then((service) => {
        console.log('Discovered the blinky service.');

        return discoverButtonCharacteristic(adapter, service)
          .then((characteristic) => {
            console.log('Discovered the blinky button characteristic.');
            return discoverButtonCharCCCD(adapter, characteristic);
          })
          .then((descriptor) => {
            console.log("Discovered the blinky button characteristic's CCCD.");

            console.log('Press any key to toggle notifications on the button characteristic.');
            console.log('Press `l` or `L` to toggle LED on and off.');
            console.log('Press `q` or `Q` to disconnect from the BLE peripheral and quit application.');
            addUserInputListener(adapter, descriptor);
          });
      })
      .catch((error) => {
        console.log(error);
        process.exit(1);
      });
  });

  adapter.on('deviceDisconnected', (device) => {
    console.log(`Device ${device.address} disconnected.`);

    startScan(adapter)
      .then(() => {
        console.log('Successfully initiated the scanning procedure.');
      })
      .catch((error) => {
        console.log(error);
      });
  });

  adapter.on('deviceDiscovered', (device) => {
    if (device.name === 'Nordic_Blinky') {
      console.log(`Discovered device ${device.address}/${device.addressType}.`);
      connect(adapter, device.address)
        .then(() => {
          // no need to do anything here
        })
        .catch((error) => {
          console.log(error);
          process.exit(1);
        });
    }
  });

  adapter.on('scanTimedOut', () => {
    console.log('scanTimedOut: Scanning timed-out. Exiting.');
    process.exit(1);
  });

  adapter.on('characteristicValueChanged', (attribute) => {
    if (attribute.uuid === LBS_UUID_BLINKY_BUTTON_CHAR) {
      console.log(`Received blinky button: ${+attribute.value === 1 ? 'ON' : 'OFF'}.`);
    }
  });
}

/**
 * Opens adapter for use with the default options.
 *
 * @param {Adapter} adapter Adapter to be opened.
 * @returns {Promise} Resolves if the adapter is opened successfully.
 *                    If an error occurs, rejects with the corresponding error.
 */
function openAdapter(adapter) {
  return new Promise((resolve, reject) => {
    const baudRate = 1000000;
    console.log(`Opening adapter with ID: ${adapter.instanceId} and baud rate: ${baudRate}...`);

    adapter.open({ baudRate, logLevel: 'error' }, (err) => {
      if (err) {
        reject(Error(`Error opening adapter: ${err}.`));
      }

      resolve();
    });
  });
}

function help() {
  console.log(`Usage: ${path.basename(__filename)} <PORT> <SD_API_VERSION>`);
  console.log();
  console.log('PORT is the UART for the adapter. For example /dev/ttyS0 on Unix based systems or COM1 on Windows based systems.');
  console.log('SD_API_VERSION can be v2 or v5. nRF51 series uses v2.');
  console.log();
  console.log('It is assumed that the nRF device has been programmed with the correct connectivity firmware.');
}

/**
 * Application main entry.
 */
if (process.argv.length !== 4) {
  help();
  process.exit(-1);
} else {
  const [, , port, apiVersion] = process.argv;

  if (port == null) {
    console.error('PORT must be specified');
    process.exit(-1);
  }

  if (apiVersion == null) {
    console.error('SD_API_VERSION must be provided');
    process.exit(-1);
  } else if (!['v2', 'v5'].includes(apiVersion)) {
    console.error(`SD_API_VERSION must be v2 or v5, argument provided is ${apiVersion}`);
    process.exit(-1);
  }

  const adapter = adapterFactory.createAdapter(apiVersion, port, '');
  addAdapterListener(adapter);

  openAdapter(adapter)
    .then(() => {
      console.log('Opened adapter.');
      return startScan(adapter);
    })
    .then(() => {
      console.log('Scanning.');
    })
    .catch((error) => {
      console.log(error);
      process.exit(-1);
    });
}
