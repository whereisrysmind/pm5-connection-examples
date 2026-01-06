/**
 * Main entry point for PM5 Bluetooth demo
 */

import { scanForPM5Devices, PM5Device } from './device.js';
import { 
    DEVICE_INFO_CHARACTERISTICS, 
    CONTROL_CHARACTERISTICS, 
    ROWING_CHARACTERISTICS 
} from './constants.js';

class PM5Demo {
    constructor() {
        this.pm5Device = null;
        this.isConnected = false;
        this.workoutData = {};
        this.rxNotificationsActive = false;
        this.characteristicSubscriptionActive = false;
        
        // Bind UI event handlers
        this.bindEventHandlers();
    }

    bindEventHandlers() {
        // Connect button
        document.getElementById('connectBtn').addEventListener('click', 
            this.handleConnect.bind(this));
        
        // Disconnect button
        document.getElementById('disconnectBtn').addEventListener('click',
            this.handleDisconnect.bind(this));
        
        // Start notifications button
        document.getElementById('startNotificationsBtn').addEventListener('click',
            this.handleStartNotifications.bind(this));
        
        // Stop notifications button  
        document.getElementById('stopNotificationsBtn').addEventListener('click',
            this.handleStopNotifications.bind(this));
        
        // Control characteristic buttons
        document.getElementById('sendTxBtn').addEventListener('click',
            this.handleSendTx.bind(this));
        
        document.getElementById('toggleRxBtn').addEventListener('click',
            this.handleToggleRx.bind(this));
        
        // Allow Enter key to send TX data
        document.getElementById('txInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !document.getElementById('sendTxBtn').disabled) {
                this.handleSendTx();
            }
        });
        
        // Characteristic monitor buttons
        document.getElementById('toggleCharSubscribeBtn').addEventListener('click',
            this.handleToggleCharacteristicSubscription.bind(this));
        
        document.getElementById('clearCharDataBtn').addEventListener('click',
            this.handleClearCharacteristicData.bind(this));
        
        document.getElementById('characteristicSelect').addEventListener('change',
            this.handleCharacteristicSelectChange.bind(this));
    }

    async handleConnect() {
        try {
            this.updateStatus('Scanning for PM5 devices...');
            
            const bluetoothDevice = await scanForPM5Devices();
            this.pm5Device = new PM5Device(bluetoothDevice);
            
            // Set up event handlers
            this.pm5Device.onDisconnected = this.handleDeviceDisconnected.bind(this);
            this.pm5Device.onWorkoutData = this.handleWorkoutData.bind(this);
            this.pm5Device.onStrokeData = this.handleStrokeData.bind(this);
            this.pm5Device.onSplitData = this.handleSplitData.bind(this);
            this.pm5Device.onControlRxData = this.handleControlRxData.bind(this);
            this.pm5Device.onCharacteristicData = this.handleCharacteristicData.bind(this);
            
            this.updateStatus('Connecting to PM5...');
            await this.pm5Device.connect();
            
            this.isConnected = true;
            this.updateConnectionUI();
            this.displayDeviceInfo();
            
            // Discover notify-capable characteristics
            this.updateStatus('Discovering characteristics...');
            await this.pm5Device.discoverNotifyCapableCharacteristics();
            this.populateCharacteristicDropdown();
            
            this.updateStatus('Connected to PM5 successfully!');
            
        } catch (error) {
            console.error('Connection failed:', error);
            this.updateStatus(`Connection failed: ${error.message}`);
        }
    }

    async handleDisconnect() {
        if (this.pm5Device) {
            await this.pm5Device.disconnect();
        }
    }

    handleDeviceDisconnected() {
        this.isConnected = false;
        this.pm5Device = null;
        this.rxNotificationsActive = false;
        this.characteristicSubscriptionActive = false;
        this.updateConnectionUI();
        this.clearCharacteristicDropdown();
        this.updateStatus('PM5 device disconnected');
    }

    async handleStartNotifications() {
        if (!this.pm5Device) return;
        
        try {
            this.updateStatus('Starting data notifications...');
            await this.pm5Device.startRowingDataNotifications();
            this.updateStatus('Data notifications started');
        } catch (error) {
            console.error('Failed to start notifications:', error);
            this.updateStatus(`Failed to start notifications: ${error.message}`);
        }
    }

    async handleStopNotifications() {
        if (!this.pm5Device) return;
        
        try {
            this.updateStatus('Stopping data notifications...');
            await this.pm5Device.stopRowingDataNotifications();
            this.updateStatus('Data notifications stopped');
        } catch (error) {
            console.error('Failed to stop notifications:', error);
            this.updateStatus(`Failed to stop notifications: ${error.message}`);
        }
    }

    async handleSendTx() {
        if (!this.pm5Device) return;
        
        const input = document.getElementById('txInput');
        const hexString = input.value.trim();
        
        if (!hexString) {
            this.updateStatus('Please enter hex bytes to send');
            return;
        }
        
        try {
            this.updateStatus(`Sending TX: ${hexString}`);
            await this.pm5Device.sendControlBytes(hexString);
            this.updateStatus('TX data sent successfully');
            input.value = '';
        } catch (error) {
            console.error('Failed to send TX data:', error);
            this.updateStatus(`Failed to send TX: ${error.message}`);
        }
    }

    async handleToggleRx() {
        if (!this.pm5Device) return;
        
        try {
            if (this.rxNotificationsActive) {
                this.updateStatus('Stopping RX control notifications...');
                await this.pm5Device.stopControlRxNotifications();
                this.rxNotificationsActive = false;
                this.updateStatus('RX control notifications stopped');
            } else {
                this.updateStatus('Starting RX control notifications...');
                await this.pm5Device.startControlRxNotifications();
                this.rxNotificationsActive = true;
                this.updateStatus('RX control notifications started - listening for data...');
            }
            this.updateConnectionUI();
        } catch (error) {
            console.error('Failed to toggle RX notifications:', error);
            this.updateStatus(`Failed to toggle RX: ${error.message}`);
        }
    }

    handleControlRxData(data) {
        console.log('Control RX data received:', data);
        
        const rxContent = document.getElementById('rxDataContent');
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        
        const dataLine = `<div style="margin-bottom: 5px;">[${timestamp}] ${data.hexString}</div>`;
        
        if (rxContent.textContent === 'No data received yet') {
            rxContent.innerHTML = dataLine;
        } else {
            rxContent.innerHTML += dataLine;
        }
        
        // Auto-scroll to bottom
        const rxDataDiv = document.getElementById('rxData');
        rxDataDiv.scrollTop = rxDataDiv.scrollHeight;
    }

    /**
     * Get characteristic name from UUID
     */
    getCharacteristicName(uuid) {
        // Create a reverse lookup map
        const allChars = {
            ...DEVICE_INFO_CHARACTERISTICS,
            ...CONTROL_CHARACTERISTICS,
            ...ROWING_CHARACTERISTICS
        };
        
        for (const [name, charUuid] of Object.entries(allChars)) {
            if (charUuid === uuid) {
                return name.replace(/_/g, ' ');
            }
        }
        
        return null;
    }

    /**
     * Populate characteristic dropdown with discovered characteristics
     */
    populateCharacteristicDropdown() {
        const select = document.getElementById('characteristicSelect');
        select.innerHTML = '<option value="">Select a characteristic...</option>';
        
        if (!this.pm5Device || !this.pm5Device.notifyCapableCharacteristics) {
            return;
        }
        
        const chars = this.pm5Device.notifyCapableCharacteristics;
        
        for (const charInfo of chars) {
            const name = this.getCharacteristicName(charInfo.uuid);
            
            // Only add if we have a name for it
            if (name) {
                const option = document.createElement('option');
                option.value = charInfo.uuid;
                option.textContent = `${name} (${charInfo.uuid.substring(0, 8)}...)`;
                select.appendChild(option);
            }
        }
        
        select.disabled = false;
        console.log(`Populated dropdown with ${select.options.length - 1} characteristics`);
    }

    /**
     * Clear characteristic dropdown
     */
    clearCharacteristicDropdown() {
        const select = document.getElementById('characteristicSelect');
        select.innerHTML = '<option value="">Connect to device to see characteristics...</option>';
        select.disabled = true;
    }

    /**
     * Handle characteristic selection change
     */
    handleCharacteristicSelectChange() {
        const select = document.getElementById('characteristicSelect');
        const toggleBtn = document.getElementById('toggleCharSubscribeBtn');
        
        if (select.value) {
            toggleBtn.disabled = false;
        } else {
            toggleBtn.disabled = true;
        }
    }

    /**
     * Toggle characteristic subscription
     */
    async handleToggleCharacteristicSubscription() {
        if (!this.pm5Device) return;
        
        const select = document.getElementById('characteristicSelect');
        const uuid = select.value;
        
        if (!uuid) return;
        
        try {
            if (this.characteristicSubscriptionActive) {
                this.updateStatus('Unsubscribing from characteristic...');
                await this.pm5Device.unsubscribeFromCharacteristic();
                this.characteristicSubscriptionActive = false;
                this.updateStatus('Unsubscribed from characteristic');
            } else {
                const name = this.getCharacteristicName(uuid);
                this.updateStatus(`Subscribing to ${name}...`);
                await this.pm5Device.subscribeToCharacteristic(uuid);
                this.characteristicSubscriptionActive = true;
                this.updateStatus(`Subscribed to ${name} - listening for data...`);
            }
            this.updateConnectionUI();
        } catch (error) {
            console.error('Failed to toggle characteristic subscription:', error);
            this.updateStatus(`Failed: ${error.message}`);
        }
    }

    /**
     * Handle characteristic data
     */
    handleCharacteristicData(data) {
        const content = document.getElementById('characteristicRawDataContent');
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const name = this.getCharacteristicName(data.uuid) || data.uuid;
        
        // Format as hex with spaces every 2 bytes
        const formattedHex = data.hexString.match(/.{1,2}/g).join(' ');
        
        const dataLine = `[${timestamp}] ${name}\n  HEX: ${formattedHex}\n  DEC: [${data.bytes.join(', ')}]\n`;
        
        if (content.textContent === 'No characteristic selected') {
            content.textContent = dataLine;
        } else {
            content.textContent += '\n' + dataLine;
        }
        
        // Auto-scroll to bottom
        const container = document.getElementById('characteristicRawData');
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Clear characteristic data display
     */
    handleClearCharacteristicData() {
        const content = document.getElementById('characteristicRawDataContent');
        if (this.characteristicSubscriptionActive) {
            content.textContent = 'Data cleared - still listening...\n';
        } else {
            content.textContent = 'No characteristic selected';
        }
    }


    handleWorkoutData(data) {
        console.log('Workout data received:', data);
        
        // Update the workout data display
        const workoutElement = document.getElementById('workoutData');
        
        if (data.type === 'general_status') {
            workoutElement.innerHTML = `
                <h4>General Status</h4>
                <p><strong>Time:</strong> ${this.formatTime(data.elapsed_time)}</p>
                <p><strong>Distance:</strong> ${data.distance.toFixed(1)} m</p>
                <p><strong>Workout State:</strong> ${this.pm5Device.getWorkoutStateString(data.workout_state)}</p>
                <p><strong>Rowing State:</strong> ${this.pm5Device.getRowingStateString(data.rowing_state)}</p>
                <p><strong>Stroke State:</strong> ${this.pm5Device.getStrokeStateString(data.stroke_state)}</p>
                <p><strong>Drag Factor:</strong> ${data.drag_factor}</p>
            `;
        } else if (data.type === 'additional_status') {
            document.getElementById('additionalData').innerHTML = `
                <h4>Additional Status</h4>
                <p><strong>Speed:</strong> ${data.speed ? data.speed.toFixed(3) : 'N/A'} m/s</p>
                <p><strong>Stroke Rate:</strong> ${data.stroke_rate || 'N/A'} spm</p>
                <p><strong>Heart Rate:</strong> ${data.heart_rate || 'N/A'} bpm</p>
                <p><strong>Current Pace:</strong> ${data.current_pace ? this.formatPace(data.current_pace) : 'N/A'}</p>
                <p><strong>Average Pace:</strong> ${data.average_pace ? this.formatPace(data.average_pace) : 'N/A'}</p>
            `;
        }
    }

    handleStrokeData(data) {
        console.log('Stroke data received:', data);
        
        document.getElementById('strokeData').innerHTML = `
            <h4>Stroke Data</h4>
            <p><strong>Drive Length:</strong> ${data.drive_length ? data.drive_length.toFixed(2) : 'N/A'} m</p>
            <p><strong>Drive Time:</strong> ${data.drive_time ? data.drive_time.toFixed(2) : 'N/A'} s</p>
            <p><strong>Stroke Distance:</strong> ${data.stroke_distance ? data.stroke_distance.toFixed(2) : 'N/A'} m</p>
            <p><strong>Peak Drive Force:</strong> ${data.peak_drive_force ? data.peak_drive_force.toFixed(1) : 'N/A'} N</p>
            <p><strong>Avg Drive Force:</strong> ${data.average_drive_force ? data.average_drive_force.toFixed(1) : 'N/A'} N</p>
            <p><strong>Work per Stroke:</strong> ${data.work_per_stroke ? data.work_per_stroke.toFixed(1) : 'N/A'} J</p>
            <p><strong>Stroke Count:</strong> ${data.stroke_count || 'N/A'}</p>
        `;
    }

    handleSplitData(data) {
        console.log('Split data received:', data);
        
        document.getElementById('splitData').innerHTML = `
            <h4>Split Data</h4>
            <p><strong>Split Number:</strong> ${data.split_number || 'N/A'}</p>
            <p><strong>Split Time:</strong> ${data.split_time ? this.formatTime(data.split_time) : 'N/A'}</p>
            <p><strong>Split Distance:</strong> ${data.split_distance ? data.split_distance.toFixed(1) : 'N/A'} m</p>
            <p><strong>Split Type:</strong> ${data.split_type || 'N/A'}</p>
        `;
    }

    displayDeviceInfo() {
        const info = this.pm5Device.deviceInfo;
        document.getElementById('deviceInfo').innerHTML = `
            <h3>Device Information</h3>
            <p><strong>Model:</strong> ${info.model || 'N/A'}</p>
            <p><strong>Serial Number:</strong> ${info.serialNumber || 'N/A'}</p>
            <p><strong>Firmware Version:</strong> ${info.firmwareVersion || 'N/A'}</p>
            <p><strong>Hardware Revision:</strong> ${info.hardwareRevision || 'N/A'}</p>
            <p><strong>Manufacturer:</strong> ${info.manufacturerName || 'N/A'}</p>
            <p><strong>Machine Type:</strong> ${info.connectedMachineType || 'N/A'}</p>
        `;
    }

    updateConnectionUI() {
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        const startNotificationsBtn = document.getElementById('startNotificationsBtn');
        const stopNotificationsBtn = document.getElementById('stopNotificationsBtn');
        const sendTxBtn = document.getElementById('sendTxBtn');
        const toggleRxBtn = document.getElementById('toggleRxBtn');
        
        if (this.isConnected) {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            startNotificationsBtn.disabled = false;
            stopNotificationsBtn.disabled = false;
            sendTxBtn.disabled = false;
            toggleRxBtn.disabled = false;
            
            // Update toggle button text based on state
            if (this.rxNotificationsActive) {
                toggleRxBtn.textContent = 'Stop RX Notifications';
                toggleRxBtn.style.backgroundColor = '#dc3545';
            } else {
                toggleRxBtn.textContent = 'Start RX Notifications';
                toggleRxBtn.style.backgroundColor = '#28a745';
            }
            
            // Characteristic monitor controls
            const charSelect = document.getElementById('characteristicSelect');
            const toggleCharBtn = document.getElementById('toggleCharSubscribeBtn');
            charSelect.disabled = false;
            
            if (charSelect.value) {
                toggleCharBtn.disabled = false;
                
                if (this.characteristicSubscriptionActive) {
                    toggleCharBtn.textContent = 'Unsubscribe';
                    toggleCharBtn.style.backgroundColor = '#dc3545';
                } else {
                    toggleCharBtn.textContent = 'Subscribe';
                    toggleCharBtn.style.backgroundColor = '#28a745';
                }
            } else {
                toggleCharBtn.disabled = true;
                toggleCharBtn.textContent = 'Subscribe';
                toggleCharBtn.style.backgroundColor = '';
            }
        } else {
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            startNotificationsBtn.disabled = true;
            stopNotificationsBtn.disabled = true;
            sendTxBtn.disabled = true;
            toggleRxBtn.disabled = true;
            toggleRxBtn.textContent = 'Start RX Notifications';
            toggleRxBtn.style.backgroundColor = '';
            
            // Characteristic monitor controls
            const charSelect = document.getElementById('characteristicSelect');
            const toggleCharBtn = document.getElementById('toggleCharSubscribeBtn');
            charSelect.disabled = true;
            toggleCharBtn.disabled = true;
            toggleCharBtn.textContent = 'Subscribe';
            toggleCharBtn.style.backgroundColor = '';
        }
    }

    updateStatus(message) {
        console.log('Status:', message);
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        
        // Add timestamp to log
        const logElement = document.getElementById('log');
        const timestamp = new Date().toLocaleTimeString();
        logElement.innerHTML += `<div>[${timestamp}] ${message}</div>`;
        logElement.scrollTop = logElement.scrollHeight;
    }

    formatTime(seconds) {
        if (!seconds || seconds < 0) return '00:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    formatPace(paceInSeconds) {
        if (!paceInSeconds || paceInSeconds <= 0) return '--:--';
        
        const minutes = Math.floor(paceInSeconds / 60);
        const seconds = Math.floor(paceInSeconds % 60);
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    clearData() {
        document.getElementById('workoutData').innerHTML = '<h4>Workout Data</h4><p>No data</p>';
        document.getElementById('additionalData').innerHTML = '<h4>Additional Data</h4><p>No data</p>';
        document.getElementById('strokeData').innerHTML = '<h4>Stroke Data</h4><p>No data</p>';
        document.getElementById('splitData').innerHTML = '<h4>Split Data</h4><p>No data</p>';
    }
}

// Initialize the demo when the page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('PM5 Bluetooth Demo initialized');
    new PM5Demo();
});

// Export for debugging
window.PM5Demo = PM5Demo;
