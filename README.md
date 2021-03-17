# Test pc-ble-driver-js

## Install

```shell
nvm use 12
yarn install
```

## Program

```shell
nrfjprog --program node_modules/pc-ble-driver-js/build/Release/pc-ble-driver/hex/connectivity_4.1.2_usb_with_s132_5.1.0.hex --chiperase --reset
```

## Run

```shell
node central.js <comport> v5
```
