'use strict';

const api = require('pc-ble-driver-js');
const path = require('path');
const prompt = require('prompt-sync')({ sigint: true });

const adapterFactory = api.AdapterFactory.getInstance(undefined, {
  enablePolling: false,
});

const BLE_DEVICE_NAME = 'Nordic_UART';

const BLE_UUID_NUS_SERVICE = '6E400001B5A3F393E0A9E50E24DCCA9E'; // NUS Service
const LBS_UUID_NUS_TX_CHAR = '6E400003B5A3F393E0A9E50E24DCCA9E'; // NUS TX
const LBS_UUID_NUS_RX_CHAR = '6E400002B5A3F393E0A9E50E24DCCA9E'; // NUS RX

const BLE_UUID_CCCD = '2902';

const notificationsEnabled = [1, 0]; // Start with notifications enabled

// FIXME: https://github.com/NordicSemiconductor/pc-ble-driver-js/issues/76
const connectionsPararms = {
  min_conn_interval: 7.5,
  minConnectionInterval: 7.5,
  max_conn_interval: 300,
  maxConnectionInterval: 300,
  slave_latency: 0,
  slaveLatency: 0,
  conn_sup_timeout: 4000,
  connectionSupervisionTimeout: 4000,
};

function discoverNusService(adapter, device) {
  return new Promise((resolve, reject) => {
    adapter.getServices(device.instanceId, (err, services) => {
      if (err) {
        reject(Error(`Error discovering the NUS service: ${err}.`));
        return;
      }

      for (const service in services) {
        if (services[service].uuid === BLE_UUID_NUS_SERVICE) {
          resolve(services[service]);
          return;
        }
      }

      reject(Error("Did not discover the NUS service in peripheral's GATT attribute table."));
    });
  });
}

function discoverTxCharacteristic(adapter, NusService) {
  return new Promise((resolve, reject) => {
    adapter.getCharacteristics(NusService.instanceId, (err, characteristics) => {
      if (err) {
        reject(Error(`Error discovering the NUS service's characteristics: ${JSON.stringify(err)}.`));
        return;
      }

      for (const characteristic in characteristics) {
        if (characteristics[characteristic].uuid === LBS_UUID_NUS_TX_CHAR) {
          resolve(characteristics[characteristic]);
          return;
        }
      }

      reject(Error("Did not discover the NUS TX char in peripheral's GATT attribute table."));
    });
  });
}

function discoverTxCharCCCD(adapter, NusTxCharacteristic) {
  return new Promise((resolve, reject) => {
    adapter.getDescriptors(NusTxCharacteristic.instanceId, (err, descriptors) => {
      if (err) {
        reject(Error(`Error discovering the NUS characteristic's CCCD: ${JSON.stringify(err)}.`));
        return;
      }

      for (const descriptor in descriptors) {
        if (descriptors[descriptor].uuid === BLE_UUID_CCCD) {
          resolve(descriptors[descriptor]);
          return;
        }
      }

      reject(Error("Did not discover the NUS chars CCCD in peripheral's GATT attribute table."));
    });
  });
}

function addUserPrompt(adapter, cccdDescriptor) {
  console.log('Type `s` or `S` to toggle notifications on the TX characteristic.');
  console.log('Type `q` or `Q` to disconnect from the BLE peripheral and quit application.');

  while (true) {
    const input = prompt('Enter command:').toLocaleLowerCase();

    if (input === 'q') {
      adapter.close((err) => {
        if (err) {
          console.log(`Error closing the adapter: ${err}.`);
        }

        console.log('Exiting the application...');
        process.exit(1);
      });
    } else if (input === 's') {
      if (notificationsEnabled[0]) {
        notificationsEnabled[0] = 0;
        console.log('Disabling notifications on the NUS TX characteristic.');
      } else {
        notificationsEnabled[0] = 1;
        console.log('Enabling notifications on the NUS TX characteristic.');
      }
      adapter.writeDescriptorValue(cccdDescriptor.instanceId, notificationsEnabled, false, (err) => {
        if (err) {
          console.log(`Error enabling notifications on the NUS TX characteristic: ${err}.`);
          process.exit(1);
        }

        console.log('Notifications toggled on the NUS TX characteristic.');
      });
    }
  }
}

function addUserInputListener(adapter, cccdDescriptor) {
  console.log('Press any key to toggle notifications on the TX characteristic.');
  console.log('Press `q` or `Q` to disconnect from the BLE peripheral and quit application.');

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);

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
    } else {
      if (notificationsEnabled[0]) {
        notificationsEnabled[0] = 0;
        console.log('Disabling notifications on the NUS TX characteristic.');
      } else {
        notificationsEnabled[0] = 1;
        console.log('Enabling notifications on the NUS TX characteristic.');
      }

      adapter.writeDescriptorValue(cccdDescriptor.instanceId, notificationsEnabled, false, (err) => {
        if (err) {
          console.log(`Error enabling notifications on the NUS TX characteristic: ${err}.`);
          process.exit(1);
        }

        console.log('Notifications toggled on the NUS TX characteristic.');
      });
    }
  });
}

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
      connParams: connectionsPararms,
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

function handleConnectedDevice(adapter, device) {
  discoverNusService(adapter, device)
    .then((service) => {
      console.log('Discovered the NUS service.');

      return discoverTxCharacteristic(adapter, service)
        .then((characteristic) => {
          console.log('Discovered the NUS TX characteristic.');
          return discoverTxCharCCCD(adapter, characteristic);
        })
        .then((descriptor) => {
          console.log("Discovered the NUS TX characteristic's CCCD.");

          console.log('Enabling notifications on the NUS TX characteristic.');

          adapter.writeDescriptorValue(descriptor.instanceId, notificationsEnabled, false, (err) => {
            if (err) {
              console.log(`Error enabling notifications on the NUS TX characteristic: ${err}.`);
              process.exit(1);
            }

            console.log('Notifications toggled on the NUS TX characteristic.');
          });

          // INFO: Not used right now, notifications are enabled by default
          // addUserInputListener(adapter, descriptor);
          // addUserPrompt(adapter, descriptor);
        });
    })
    .catch((error) => {
      console.log(error);
      process.exit(1);
    });
}

function addAdapterListener(adapter) {
  adapter.on('logMessage', (severity, message) => {
    if (severity > 3) console.log(`LOG ${severity} ${message}`);
  });

  adapter.on('error', (error) => {
    console.log(`error: ${JSON.stringify(error, null, 1)}.`);
  });

  adapter.on('deviceConnected', (device) => {
    console.log(`Device ${device.address}/${device.addressType} connected.`);
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
    if (device.name === BLE_DEVICE_NAME) {
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
    console.log(`Received Data: ${attribute.uuid} ${attribute.value}`);
  });

  adapter.on('connParamUpdateRequest', (device, connectionParameters) => {
    console.log(`connParamUpdateRequest: ${JSON.stringify(connectionParameters)}.`);

    adapter.updateConnectionParameters(device.instanceId, connectionParameters, (err) => {
      if (err) {
        console.log(`updateConnectionParameters Failed: ${err.message}.`);
        return;
      }

      handleConnectedDevice(adapter, device);
    });
  });

  adapter.on('connParamUpdate', (device, connectionParameters) => {
    console.log(`connParamUpdate: ${JSON.stringify(connectionParameters)}.`);
  });
}

function openAdapter(adapter) {
  return new Promise((resolve, reject) => {
    const baudRate = 1000000;
    console.log(`Opening adapter with ID: ${adapter.instanceId} and baud rate: ${baudRate}...`);

    adapter.open({ baudRate, logLevel: 'debug' }, (err) => {
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
