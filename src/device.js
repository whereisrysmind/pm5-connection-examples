/**
 * PM5 Device class for Bluetooth Low Energy communication
 */

import { 
    PM5_SERVICES, 
    DEVICE_INFO_CHARACTERISTICS, 
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
            console.log('Connecting to GATT server...');
            this.server = await this.device.gatt.connect();
            
            console.log('Getting services...');
            await this.getServices();
            
            console.log('Reading device information...');
            await this.readDeviceInformation();
            
            this.isConnected = true;
            console.log('PM5 device connected successfully');
            
        } catch (error) {
            console.error('Error connecting to PM5:', error);
            throw error;
        }
    }

    /**
     * Disconnect from the PM5 device
     */
    async disconnect() {
        if (this.server && this.server.connected) {
            this.server.disconnect();
        }
    }

    /**
     * Handle device disconnection
     */
    handleDisconnected() {
        console.log('PM5 device disconnected');
        this.isConnected = false;
        this.server = null;
        this.services = {};
        this.characteristics = {};
        
        if (this.onDisconnected) {
            this.onDisconnected();
        }
    }

    /**
     * Get all required services
     */
    async getServices() {
        try {
            // Get information service
            this.services.information = await this.server.getPrimaryService(PM5_SERVICES.INFORMATION);
            
            // Get rowing service
            this.services.rowing = await this.server.getPrimaryService(PM5_SERVICES.ROWING);
            
            console.log('All services obtained');
            
        } catch (error) {
            console.error('Error getting services:', error);
            throw error;
        }
    }

    /**
     * Read device information
     */
    async readDeviceInformation() {
        try {
            // Read all device information characteristics
            const infoPromises = Object.entries(DEVICE_INFO_CHARACTERISTICS).map(async ([key, uuid]) => {
                try {
                    const characteristic = await this.services.information.getCharacteristic(uuid);
                    const value = await characteristic.readValue();
                    const text = new TextDecoder().decode(value);
                    
                    const fieldName = key.toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                    this.deviceInfo[fieldName] = text.trim();
                    
                    console.log(`${key}: ${text.trim()}`);
                } catch (error) {
                    console.warn(`Could not read ${key}:`, error.message);
                }
            });
            
            await Promise.all(infoPromises);
            
        } catch (error) {
            console.error('Error reading device information:', error);
            // Don't throw - device info is not critical for basic functionality
        }
    }

    /**
     * Start rowing data notifications
     */
    async startRowingDataNotifications() {
        try {
            // Start general status notifications
            const generalStatusChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.GENERAL_STATUS
            );
            
            await generalStatusChar.startNotifications();
            generalStatusChar.addEventListener('characteristicvaluechanged', (event) => {
                console.log('General status notification received:', event.target.value.byteLength, 'bytes');
                try {
                    const data = parseGeneralStatus(event.target.value);
                    data.type = 'general_status';
                    console.log('Parsed general status:', data);
                    if (this.onWorkoutData) {
                        this.onWorkoutData(data);
                    }
                } catch (error) {
                    console.error('Error parsing general status:', error);
                }
            });

            // Start additional status notifications
            const additionalStatusChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.ADDITIONAL_STATUS
            );
            
            await additionalStatusChar.startNotifications();
            additionalStatusChar.addEventListener('characteristicvaluechanged', (event) => {
                console.log('Additional status notification received:', event.target.value.byteLength, 'bytes');
                try {
                    const data = parseAdditionalStatus(event.target.value);
                    data.type = 'additional_status';
                    console.log('Parsed additional status:', data);
                    if (this.onWorkoutData) {
                        this.onWorkoutData(data);
                    }
                } catch (error) {
                    console.error('Error parsing additional status:', error);
                }
            });

            // Start stroke data notifications
            const strokeDataChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.STROKE_DATA
            );
            
            await strokeDataChar.startNotifications();
            strokeDataChar.addEventListener('characteristicvaluechanged', (event) => {
                console.log('Stroke data notification received:', event.target.value.byteLength, 'bytes');
                try {
                    const data = parseStrokeData(event.target.value);
                    console.log('Parsed stroke data:', data);
                    if (this.onStrokeData) {
                        this.onStrokeData(data);
                    }
                } catch (error) {
                    console.error('Error parsing stroke data:', error);
                }
            });

            // Start split interval data notifications
            const splitDataChar = await this.services.rowing.getCharacteristic(
                ROWING_CHARACTERISTICS.SPLIT_INTERVAL_DATA
            );
            
            await splitDataChar.startNotifications();
            splitDataChar.addEventListener('characteristicvaluechanged', (event) => {
                console.log('Split data notification received:', event.target.value.byteLength, 'bytes');
                try {
                    const data = parseSplitIntervalData(event.target.value);
                    console.log('Parsed split data:', data);
                    if (this.onSplitData) {
                        this.onSplitData(data);
                    }
                } catch (error) {
                    console.error('Error parsing split data:', error);
                }
            });

            console.log('Started rowing data notifications');
            
        } catch (error) {
            console.error('Error starting notifications:', error);
            throw error;
        }
    }

    /**
     * Stop rowing data notifications
     */
    async stopRowingDataNotifications() {
        try {
            const characteristics = [
                ROWING_CHARACTERISTICS.GENERAL_STATUS,
                ROWING_CHARACTERISTICS.ADDITIONAL_STATUS,
                ROWING_CHARACTERISTICS.STROKE_DATA,
                ROWING_CHARACTERISTICS.SPLIT_INTERVAL_DATA
            ];

            for (const charUuid of characteristics) {
                try {
                    const char = await this.services.rowing.getCharacteristic(charUuid);
                    await char.stopNotifications();
                } catch (error) {
                    console.warn(`Could not stop notifications for ${charUuid}:`, error.message);
                }
            }

            console.log('Stopped rowing data notifications');
            
        } catch (error) {
            console.error('Error stopping notifications:', error);
            throw error;
        }
    }


    /**
     * Get workout state string
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
     * Get rowing state string
     */
    getRowingStateString(state) {
        const states = {
            [ROWING_STATES.INACTIVE]: 'Inactive',
            [ROWING_STATES.ACTIVE]: 'Active'
        };
        return states[state] || `Unknown (${state})`;
    }

    /**
     * Get stroke state string
     */
    getStrokeStateString(state) {
        const states = {
            [STROKE_STATES.WAITING_FOR_WHEEL_TO_REACH_MIN_SPEED]: 'Waiting for Wheel',
            [STROKE_STATES.WAITING_FOR_WHEEL_TO_ACCELERATE]: 'Waiting to Accelerate',
            [STROKE_STATES.DRIVING]: 'Driving',
            [STROKE_STATES.DWELLING_AFTER_DRIVE]: 'Dwelling',
            [STROKE_STATES.RECOVERING]: 'Recovering'
        };
        return states[state] || `Unknown (${state})`;
    }
}
