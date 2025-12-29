/**
 * PM5 Device class for Bluetooth Low Energy communication
 */

import { 
    PM5_SERVICES, 
    DEVICE_INFO_CHARACTERISTICS, 
    CONTROL_CHARACTERISTICS,
    ROWING_CHARACTERISTICS,
    PM5_NAME_PATTERN,
    WORKOUT_STATES,
    ROWING_STATES,
    STROKE_STATES
} from './constants.js';

import { 
    parseGeneralStatus, 
    parseAdditionalStatus, 
    parseStrokeData,
    parseSplitIntervalData,
    parseMultiplexedData,
    dataViewToHex 
} from './parsers.js';

import { CSAFECommandBuilder, parseCSAFEResponse } from './csafe.js';

/**
 * Scan for PM5 devices
 */
export async function scanForPM5Devices() {
    if (!navigator.bluetooth) {
        throw new Error('Bluetooth not supported in this browser');
    }

    console.log('Starting PM5 device scan...');
    
    try {
        // Request any Bluetooth device for now, filter by name pattern
        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'PM5' }
            ],
            optionalServices: [
                PM5_SERVICES.DISCOVERY,
                PM5_SERVICES.INFORMATION, 
                PM5_SERVICES.CONTROL,
                PM5_SERVICES.ROWING
            ]
        });

        console.log(`Found potential PM5 device: ${device.name}`);
        
        // Verify it matches our PM5 pattern
        if (PM5_NAME_PATTERN.test(device.name)) {
            console.log(`Confirmed PM5 device: ${device.name}`);
            return device;
        } else {
            throw new Error(`Device ${device.name} does not match PM5 pattern`);
        }
        
    } catch (error) {
        console.error('Error scanning for PM5 devices:', error);
        throw error;
    }
}

/**
 * PM5 Device class
 */
export class PM5Device {
    constructor(bluetoothDevice) {
        this.device = bluetoothDevice;
        this.server = null;
        this.services = {};
        this.characteristics = {};
        this.isConnected = false;
        
        // Device information
        this.deviceInfo = {
            model: null,
            serialNumber: null,
            firmwareVersion: null,
            hardwareRevision: null,
            manufacturerName: null,
            connectedMachineType: null
        };
        
        // Event handlers
        this.onDisconnected = null;
        this.onWorkoutData = null;
        this.onStrokeData = null;
        this.onSplitData = null;
        
        // Bind disconnect handler
        this.device.addEventListener('gattserverdisconnected', this.handleDisconnected.bind(this));
    }

    /**
     * Connect to the PM5 device
     */
    async connect() {
        try {
            console.log(`Connecting to PM5 device: ${this.device.name}`);
            
            this.server = await this.device.gatt.connect();
            this.isConnected = true;
            
            console.log('Connected to PM5 GATT server');
            
            // Discover and cache services
            await this.discoverServices();
            
            // Read device information
            await this.readDeviceInformation();
            
            console.log('PM5 device fully initialized');
            return true;
            
        } catch (error) {
            console.error('Failed to connect to PM5:', error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Disconnect from the device
     */
    async disconnect() {
        if (this.server && this.isConnected) {
            this.server.disconnect();
        }
    }

    /**
     * Handle disconnection event
     */
    handleDisconnected() {
        console.log('PM5 device disconnected');
        this.isConnected = false;
        if (this.onDisconnected) {
            this.onDisconnected();
        }
    }

    /**
     * Discover and cache Bluetooth services
     */
    async discoverServices() {
        console.log('Discovering PM5 services...');
        
        try {
            // Get information service
            this.services.information = await this.server.getPrimaryService(PM5_SERVICES.INFORMATION);
            console.log('Found Information service');
            
            // Get control service
            this.services.control = await this.server.getPrimaryService(PM5_SERVICES.CONTROL);
            console.log('Found Control service');
            
            // Get rowing service
            this.services.rowing = await this.server.getPrimaryService(PM5_SERVICES.ROWING);
            console.log('Found Rowing service');
            
        } catch (error) {
            console.error('Error discovering services:', error);
            throw error;
        }
    }

    /**
     * Read device information characteristics
     */
    async readDeviceInformation() {
        console.log('Reading device information...');
        
        try {
            // Read basic device info
            this.deviceInfo.model = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.MODEL
            );
            
            this.deviceInfo.serialNumber = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.SERIAL_NUMBER
            );
            
            this.deviceInfo.firmwareVersion = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.FIRMWARE_VERSION
            );
            
            this.deviceInfo.hardwareRevision = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.HARDWARE_REVISION
            );
            
            this.deviceInfo.manufacturerName = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.MANUFACTURER_NAME
            );
            
            try {
                this.deviceInfo.connectedMachineType = await this.readStringCharacteristic(
                    this.services.information, DEVICE_INFO_CHARACTERISTICS.CONNECTED_MACHINE_TYPE
                );
            } catch (error) {
                console.log('Connected machine type not available (this is normal)');
                this.deviceInfo.connectedMachineType = null;
            }
            
            console.log('Device Information:', this.deviceInfo);
            
        } catch (error) {
            console.error('Error reading device information:', error);
            throw error;
        }
    }

    /**
     * Helper to read string characteristics
     */
    async readStringCharacteristic(service, characteristicUuid) {
        try {
            const characteristic = await service.getCharacteristic(characteristicUuid);
            const value = await characteristic.readValue();
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(value).replace(/\0/g, '').trim();
        } catch (error) {
            console.warn(`Failed to read characteristic ${characteristicUuid}:`, error);
            return null;
        }
    }

    /**
     * Start notifications for rowing data
     */
    async startRowingDataNotifications() {
        console.log('Starting rowing data notifications...');
        
        try {
            // General status (most important - contains time, distance, pace, etc.)
            const generalStatusChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.GENERAL_STATUS
            );
            await generalStatusChar.startNotifications();
            generalStatusChar.addEventListener('characteristicvaluechanged', 
                this.handleGeneralStatusUpdate.bind(this));
            console.log('Started general status notifications');

            // Additional status (pace, power, heart rate)  
            const additionalStatusChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.ADDITIONAL_STATUS
            );
            await additionalStatusChar.startNotifications();
            additionalStatusChar.addEventListener('characteristicvaluechanged',
                this.handleAdditionalStatusUpdate.bind(this));
            console.log('Started additional status notifications');

            // Stroke data
            const strokeDataChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.STROKE_DATA
            );
            await strokeDataChar.startNotifications();
            strokeDataChar.addEventListener('characteristicvaluechanged',
                this.handleStrokeDataUpdate.bind(this));
            console.log('Started stroke data notifications');

            // Split/interval data
            const splitDataChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.SPLIT_INTERVAL_DATA
            );
            await splitDataChar.startNotifications();
            splitDataChar.addEventListener('characteristicvaluechanged',
                this.handleSplitDataUpdate.bind(this));
            console.log('Started split data notifications');

            // Multiplexed data (optional - contains multiple data types)
            try {
                const multiplexedChar = await this.services.rowing.getCharacteristic(
                    ROWING_CHARACTERISTICS.MULTIPLEXED_INFORMATION
                );
                await multiplexedChar.startNotifications();
                multiplexedChar.addEventListener('characteristicvaluechanged',
                    this.handleMultiplexedDataUpdate.bind(this));
                console.log('Started multiplexed data notifications');
            } catch (error) {
                console.log('Multiplexed data not available (this is normal on some PM5 versions)');
            }
            
        } catch (error) {
            console.error('Error starting rowing data notifications:', error);
            throw error;
        }
    }

    /**
     * Stop all notifications
     */
    async stopRowingDataNotifications() {
        console.log('Stopping rowing data notifications...');
        
        try {
            const charUuids = [
                ROWING_CHARACTERISTICS.GENERAL_STATUS,
                ROWING_CHARACTERISTICS.ADDITIONAL_STATUS,
                ROWING_CHARACTERISTICS.STROKE_DATA,
                ROWING_CHARACTERISTICS.SPLIT_INTERVAL_DATA,
                ROWING_CHARACTERISTICS.MULTIPLEXED_INFORMATION
            ];

            for (const uuid of charUuids) {
                try {
                    const char = await this.services.rowing.getCharacteristic(uuid);
                    await char.stopNotifications();
                } catch (error) {
                    // Ignore errors for characteristics that might not be available
                }
            }
            
            console.log('Stopped all rowing data notifications');
        } catch (error) {
            console.error('Error stopping notifications:', error);
        }
    }

    /**
     * Handle general status updates
     */
    handleGeneralStatusUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseGeneralStatus(dataView);
            
            console.log('General Status:', data);
            
            if (this.onWorkoutData) {
                this.onWorkoutData({
                    type: 'general_status',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing general status:', error);
        }
    }

    /**
     * Handle additional status updates  
     */
    handleAdditionalStatusUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseAdditionalStatus(dataView);
            
            console.log('Additional Status:', data);
            
            if (this.onWorkoutData) {
                this.onWorkoutData({
                    type: 'additional_status',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing additional status:', error);
        }
    }

    /**
     * Handle stroke data updates
     */
    handleStrokeDataUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseStrokeData(dataView);
            
            console.log('Stroke Data:', data);
            
            if (this.onStrokeData) {
                this.onStrokeData({
                    type: 'stroke_data',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing stroke data:', error);
        }
    }

    /**
     * Handle split/interval data updates
     */
    handleSplitDataUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseSplitIntervalData(dataView);
            
            console.log('Split Data:', data);
            
            if (this.onSplitData) {
                this.onSplitData({
                    type: 'split_data',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing split data:', error);
        }
    }

    /**
     * Handle multiplexed data updates
     */
    handleMultiplexedDataUpdate(event) {
        try {
            const dataView = event.target.value;
            const parsedData = parseMultiplexedData(dataView);
            
            console.log('Multiplexed Data:', parsedData);
            
            // Route to appropriate handler based on data type
            if (parsedData.type === 'general_status' && this.onWorkoutData) {
                this.onWorkoutData({
                    type: 'general_status',
                    timestamp: Date.now(),
                    ...parsedData.data
                });
            } else if (parsedData.type === 'stroke_data' && this.onStrokeData) {
                this.onStrokeData({
                    type: 'stroke_data',
                    timestamp: Date.now(),
                    ...parsedData.data
                });
            }
            
        } catch (error) {
            console.error('Error parsing multiplexed data:', error);
        }
    }

    /**
     * Send CSAFE command to PM5
     */
    async sendCSAFECommand(commandBuilder) {
        try {
            const command = commandBuilder.build();
            
            console.log('Sending CSAFE command:', Array.from(command, b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            
            // Get control characteristics
            const transmitChar = await this.services.control.getCharacteristic(
                CONTROL_CHARACTERISTICS.TRANSMIT
            );
            
            // Send command
            await transmitChar.writeValue(command);
            
            // Read response
            const receiveChar = await this.services.control.getCharacteristic(
                CONTROL_CHARACTERISTICS.RECEIVE
            );
            
            const response = await receiveChar.readValue();
            const parsedResponse = parseCSAFEResponse(response);
            
            console.log('CSAFE Response:', parsedResponse);
            return parsedResponse;
            
        } catch (error) {
            console.error('Error sending CSAFE command:', error);
            throw error;
        }
    }

    /**
     * Get device status
     */
    async getStatus() {
        const command = new CSAFECommandBuilder().addGetStatus();
        return await this.sendCSAFECommand(command);
    }

    /**
     * Reset the PM5
     */
    async reset() {
        const command = new CSAFECommandBuilder().addReset();
        return await this.sendCSAFECommand(command);
    }

    /**
     * Get device version
     */
    async getVersion() {
        const command = new CSAFECommandBuilder().addGetVersion();
        return await this.sendCSAFECommand(command);
    }

    /**
     * Format workout state for display
     */
    getWorkoutStateString(state) {
        const states = {
            [WORKOUT_STATES.WAITING_TO_BEGIN]: 'Waiting to Begin',
            [WORKOUT_STATES.WORKOUT_ROW]: 'Workout Row',
            [WORKOUT_STATES.COUNTDOWN_PAUSE]: 'Countdown Pause',
            [WORKOUT_STATES.INTERVAL_REST]: 'Interval Rest',
            [WORKOUT_STATES.WORK_TIME_INTERVAL]: 'Work Time Interval',
            [WORKOUT_STATES.END_OF_WORKOUT]: 'End of Workout',
            [WORKOUT_STATES.MANUAL_ROW]: 'Manual Row'
        };
        return states[state] || `Unknown (${state})`;
    }

    /**
     * Format rowing state for display
     */
    getRowingStateString(state) {
        const states = {
            [ROWING_STATES.INACTIVE]: 'Inactive',
            [ROWING_STATES.ACTIVE]: 'Active'
        };
        return states[state] || `Unknown (${state})`;
    }

    /**
     * Format stroke state for display
     */
    getStrokeStateString(state) {
        const states = {
            [STROKE_STATES.WAITING_FOR_WHEEL_TO_REACH_MIN_SPEED]: 'Waiting for Min Speed',
            [STROKE_STATES.WAITING_FOR_WHEEL_TO_ACCELERATE]: 'Waiting to Accelerate',
            [STROKE_STATES.DRIVING]: 'Driving',
            [STROKE_STATES.DWELLING_AFTER_DRIVE]: 'Dwelling After Drive',
            [STROKE_STATES.RECOVERING]: 'Recovering'
        };
        return states[state] || `Unknown (${state})`;
    }
} = null;
        this.onSplitData = null;
        
        // Bind disconnect handler
        this.device.addEventListener('gattserverdisconnected', this.handleDisconnected.bind(this));
    }

    /**
     * Connect to the PM5 device
     */
    async connect() {
        try {
            console.log(`Connecting to PM5 device: ${this.device.name}`);
            
            this.server = await this.device.gatt.connect();
            this.isConnected = true;
            
            console.log('Connected to PM5 GATT server');
            
            // Discover and cache services
            await this.discoverServices();
            
            // Read device information
            await this.readDeviceInformation();
            
            console.log('PM5 device fully initialized');
            return true;
            
        } catch (error) {
            console.error('Failed to connect to PM5:', error);
            this.isConnected = false;
            throw error;
        }
    }

    /**
     * Disconnect from the device
     */
    async disconnect() {
        if (this.server && this.isConnected) {
            this.server.disconnect();
        }
    }

    /**
     * Handle disconnection event
     */
    handleDisconnected() {
        console.log('PM5 device disconnected');
        this.isConnected = false;
        if (this.onDisconnected) {
            this.onDisconnected();
        }
    }

    /**
     * Discover and cache Bluetooth services
     */
    async discoverServices() {
        console.log('Discovering PM5 services...');
        
        try {
            // Get information service
            this.services.information = await this.server.getPrimaryService(PM5_SERVICES.INFORMATION);
            console.log('Found Information service');
            
            // Get control service
            this.services.control = await this.server.getPrimaryService(PM5_SERVICES.CONTROL);
            console.log('Found Control service');
            
            // Get rowing service
            this.services.rowing = await this.server.getPrimaryService(PM5_SERVICES.ROWING);
            console.log('Found Rowing service');
            
        } catch (error) {
            console.error('Error discovering services:', error);
            throw error;
        }
    }

    /**
     * Read device information characteristics
     */
    async readDeviceInformation() {
        console.log('Reading device information...');
        
        try {
            // Read basic device info
            this.deviceInfo.model = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.MODEL
            );
            
            this.deviceInfo.serialNumber = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.SERIAL_NUMBER
            );
            
            this.deviceInfo.firmwareVersion = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.FIRMWARE_VERSION
            );
            
            this.deviceInfo.hardwareRevision = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.HARDWARE_REVISION
            );
            
            this.deviceInfo.manufacturerName = await this.readStringCharacteristic(
                this.services.information, DEVICE_INFO_CHARACTERISTICS.MANUFACTURER_NAME
            );
            
            try {
                this.deviceInfo.connectedMachineType = await this.readStringCharacteristic(
                    this.services.information, DEVICE_INFO_CHARACTERISTICS.CONNECTED_MACHINE_TYPE
                );
            } catch (error) {
                console.log('Connected machine type not available (this is normal)');
                this.deviceInfo.connectedMachineType = null;
            }
            
            console.log('Device Information:', this.deviceInfo);
            
        } catch (error) {
            console.error('Error reading device information:', error);
            throw error;
        }
    }

    /**
     * Helper to read string characteristics
     */
    async readStringCharacteristic(service, characteristicUuid) {
        try {
            const characteristic = await service.getCharacteristic(characteristicUuid);
            const value = await characteristic.readValue();
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(value).replace(/\0/g, '').trim();
        } catch (error) {
            console.warn(`Failed to read characteristic ${characteristicUuid}:`, error);
            return null;
        }
    }

    /**
     * Start notifications for rowing data
     */
    async startRowingDataNotifications() {
        console.log('Starting rowing data notifications...');
        
        try {
            // General status (most important - contains time, distance, pace, etc.)
            const generalStatusChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.GENERAL_STATUS
            );
            await generalStatusChar.startNotifications();
            generalStatusChar.addEventListener('characteristicvaluechanged', 
                this.handleGeneralStatusUpdate.bind(this));
            console.log('Started general status notifications');

            // Additional status (pace, power, heart rate)  
            const additionalStatusChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.ADDITIONAL_STATUS
            );
            await additionalStatusChar.startNotifications();
            additionalStatusChar.addEventListener('characteristicvaluechanged',
                this.handleAdditionalStatusUpdate.bind(this));
            console.log('Started additional status notifications');

            // Stroke data
            const strokeDataChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.STROKE_DATA
            );
            await strokeDataChar.startNotifications();
            strokeDataChar.addEventListener('characteristicvaluechanged',
                this.handleStrokeDataUpdate.bind(this));
            console.log('Started stroke data notifications');

            // Split/interval data
            const splitDataChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.SPLIT_INTERVAL_DATA
            );
            await splitDataChar.startNotifications();
            splitDataChar.addEventListener('characteristicvaluechanged',
                this.handleSplitDataUpdate.bind(this));
            console.log('Started split data notifications');

            // Multiplexed data (optional - contains multiple data types)
            try {
                const multiplexedChar = await this.services.rowing.getCharacteristic(
                    ROWING_CHARACTERISTICS.MULTIPLEXED_INFORMATION
                );
                await multiplexedChar.startNotifications();
                multiplexedChar.addEventListener('characteristicvaluechanged',
                    this.handleMultiplexedDataUpdate.bind(this));
                console.log('Started multiplexed data notifications');
            } catch (error) {
                console.log('Multiplexed data not available (this is normal on some PM5 versions)');
            }
            
        } catch (error) {
            console.error('Error starting rowing data notifications:', error);
            throw error;
        }
    }

    /**
     * Stop all notifications
     */
    async stopRowingDataNotifications() {
        console.log('Stopping rowing data notifications...');
        
        try {
            const charUuids = [
                ROWING_CHARACTERISTICS.GENERAL_STATUS,
                ROWING_CHARACTERISTICS.ADDITIONAL_STATUS,
                ROWING_CHARACTERISTICS.STROKE_DATA,
                ROWING_CHARACTERISTICS.SPLIT_INTERVAL_DATA,
                ROWING_CHARACTERISTICS.MULTIPLEXED_INFORMATION
            ];

            for (const uuid of charUuids) {
                try {
                    const char = await this.services.rowing.getCharacteristic(uuid);
                    await char.stopNotifications();
                } catch (error) {
                    // Ignore errors for characteristics that might not be available
                }
            }
            
            console.log('Stopped all rowing data notifications');
        } catch (error) {
            console.error('Error stopping notifications:', error);
        }
    }

    /**
     * Handle general status updates
     */
    handleGeneralStatusUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseGeneralStatus(dataView);
            
            console.log('General Status:', data);
            
            if (this.onWorkoutData) {
                this.onWorkoutData({
                    type: 'general_status',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing general status:', error);
        }
    }

    /**
     * Handle additional status updates  
     */
    handleAdditionalStatusUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseAdditionalStatus(dataView);
            
            console.log('Additional Status:', data);
            
            if (this.onWorkoutData) {
                this.onWorkoutData({
                    type: 'additional_status',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing additional status:', error);
        }
    }

    /**
     * Handle stroke data updates
     */
    handleStrokeDataUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseStrokeData(dataView);
            
            console.log('Stroke Data:', data);
            
            if (this.onStrokeData) {
                this.onStrokeData({
                    type: 'stroke_data',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing stroke data:', error);
        }
    }

    /**
     * Handle split/interval data updates
     */
    handleSplitDataUpdate(event) {
        try {
            const dataView = event.target.value;
            const data = parseSplitIntervalData(dataView);
            
            console.log('Split Data:', data);
            
            if (this.onSplitData) {
                this.onSplitData({
                    type: 'split_data',
                    timestamp: Date.now(),
                    ...data
                });
            }
            
        } catch (error) {
            console.error('Error parsing split data:', error);
        }
    }

    /**
     * Handle multiplexed data updates
     */
    handleMultiplexedDataUpdate(event) {
        try {
            const dataView = event.target.value;
            const parsedData = parseMultiplexedData(dataView);
            
            console.log('Multiplexed Data:', parsedData);
            
            // Route to appropriate handler based on data type
            if (parsedData.type === 'general_status' && this.onWorkoutData) {
                this.onWorkoutData({
                    type: 'general_status',
                    timestamp: Date.now(),
                    ...parsedData.data
                });
            } else if (parsedData.type === 'stroke_data' && this.onStrokeData) {
                this.onStrokeData({
                    type: 'stroke_data',
                    timestamp: Date.now(),
                    ...parsedData.data
                });
            }
            
        } catch (error) {
            console.error('Error parsing multiplexed data:', error);
        }
    }

    /**
     * Send CSAFE command to PM5
     */
    async sendCSAFECommand(commandBuilder) {
        try {
            const command = commandBuilder.build();
            
            console.log('Sending CSAFE command:', Array.from(command, b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            
            // Get control characteristics
            const transmitChar = await this.services.control.getCharacteristic(
                CONTROL_CHARACTERISTICS.TRANSMIT
            );
            
            // Send command
            await transmitChar.writeValue(command);
            
            // Read response
            const receiveChar = await this.services.control.getCharacteristic(
                CONTROL_CHARACTERISTICS.RECEIVE
            );
            
            const response = await receiveChar.readValue();
            const parsedResponse = parseCSAFEResponse(response);
            
            console.log('CSAFE Response:', parsedResponse);
            return parsedResponse;
            
        } catch (error) {
            console.error('Error sending CSAFE command:', error);
            throw error;
        }
    }

    /**
     * Get device status
     */
    async getStatus() {
        const command = new CSAFECommandBuilder().addGetStatus();
        return await this.sendCSAFECommand(command);
    }

    /**
     * Reset the PM5
     */
    async reset() {
        const command = new CSAFECommandBuilder().addReset();
        return await this.sendCSAFECommand(command);
    }

    /**
     * Get device version
     */
    async getVersion() {
        const command = new CSAFECommandBuilder().addGetVersion();
        return await this.sendCSAFECommand(command);
    }

    /**
     * Format workout state for display
     */
    getWorkoutStateString(state) {
        const states = {
            [WORKOUT_STATES.WAITING_TO_BEGIN]: 'Waiting to Begin',
            [WORKOUT_STATES.WORKOUT_ROW]: 'Workout Row',
            [WORKOUT_STATES.COUNTDOWN_PAUSE]: 'Countdown Pause',
            [WORKOUT_STATES.INTERVAL_REST]: 'Interval Rest',
            [WORKOUT_STATES.WORK_TIME_INTERVAL]: 'Work Time Interval',
            [WORKOUT_STATES.END_OF_WORKOUT]: 'End of Workout',
            [WORKOUT_STATES.MANUAL_ROW]: 'Manual Row'
        };
        return states[state] || `Unknown (${state})`;
    }

    /**
     * Format rowing state for display
     */
    getRowingStateString(state) {
        const states = {
            [ROWING_STATES.INACTIVE]: 'Inactive',
            [ROWING_STATES.ACTIVE]: 'Active'
        };
        return states[state] || `Unknown (${state})`;
    }

    /**
     * Format stroke state for display
     */
    getStrokeStateString(state) {
        const states = {
            [STROKE_STATES.WAITING_FOR_WHEEL_TO_REACH_MIN_SPEED]: 'Waiting for Min Speed',
            [STROKE_STATES.WAITING_FOR_WHEEL_TO_ACCELERATE]: 'Waiting to Accelerate',
            [STROKE_STATES.DRIVING]: 'Driving',
            [STROKE_STATES.DWELLING_AFTER_DRIVE]: 'Dwelling After Drive',
            [STROKE_STATES.RECOVERING]: 'Recovering'
        };
        return states[state] || `Unknown (${state})`;
    }
}
