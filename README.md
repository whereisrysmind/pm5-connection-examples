# PM5 Bluetooth JavaScript Demo

A comprehensive JavaScript implementation for connecting to Concept2 PM5 rowing machines via Web Bluetooth API. This project demonstrates how to:

- Discover and connect to PM5 devices
- Read device information
- Subscribe to real-time workout data
- Parse telemetry data (distance, time, pace, stroke data, etc.)

## Features

### Device Connection
- **Device Discovery**: Scan for PM5 devices using Web Bluetooth
- **Connection Management**: Connect/disconnect with automatic reconnection handling
- **Device Information**: Read model, serial number, firmware version, etc.

### Real-time Data Streaming
- **General Status**: Elapsed time, distance, workout state, rowing state
- **Additional Status**: Speed, stroke rate, heart rate, pace
- **Stroke Data**: Drive length, force, work per stroke, stroke count
- **Split Data**: Split times, distances, and interval information
- **Multiplexed Data**: Multiple data types in single notifications


## Project Structure

```
js-pm5/
├── src/
│   ├── constants.js      # PM5 UUIDs and state definitions
│   ├── parsers.js        # Data parsing utilities
│   ├── csafe.js          # CSAFE command building
│   ├── device.js         # PM5 device class (simplified)
│   └── index.js          # Main demo application
├── index.html            # Demo web interface
├── server.js            # Local development server
├── package.json         # NPM configuration
└── README.md           # This file
```

## Quick Start

### Prerequisites
- **Modern Browser**: Chrome, Edge, or Opera with Web Bluetooth support
- **HTTPS**: Required for Web Bluetooth (see testing notes below)
- **PM5 Device**: Concept2 rowing machine or SkiErg with Bluetooth enabled

### Installation

1. **Install Dependencies**:
   ```bash
   cd js-pm5-examples
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Open Browser**:
   Navigate to `http://localhost:3000`

### Testing Options

#### Option 1: Local Development (Limited)
- Use the local server for code development
- Web Bluetooth will be restricted due to HTTP
- Good for testing UI and code structure

#### Option 2: HTTPS Tunnel (Recommended)
Use ngrok for HTTPS access:
```bash
# Install ngrok if you haven't already
npm install -g ngrok

# Start the local server
npm run dev

# In another terminal, create HTTPS tunnel
ngrok http 3000
```
Then use the HTTPS URL provided by ngrok.

#### Option 3: Chrome Development Flags
For testing without HTTPS:
```bash
# macOS/Linux
google-chrome --enable-web-bluetooth-new-permissions-backend --ignore-certificate-errors

# Windows
chrome.exe --enable-web-bluetooth-new-permissions-backend --ignore-certificate-errors
```

## Usage

### Basic Connection Flow

1. **Click "Connect to PM5"**: Browser will show device selection dialog
2. **Select Your PM5**: Choose your rowing machine from the list
3. **Device Information**: View device details once connected
4. **Start Data Stream**: Begin receiving real-time workout data

### Real-world Integration

To integrate this code into your app:

```javascript
import { scanForPM5Devices, PM5Device } from './src/device.js';

// Connect to PM5
const bluetoothDevice = await scanForPM5Devices();
const pm5 = new PM5Device(bluetoothDevice);

// Set up event handlers
pm5.onWorkoutData = (data) => {
    console.log('Workout data:', data);
    // Update your app's UI with workout data
};

pm5.onStrokeData = (data) => {
    console.log('Stroke data:', data);
    // Handle stroke-by-stroke data
};

// Connect and start receiving data
await pm5.connect();
await pm5.startRowingDataNotifications();
```

## Data Types

### General Status Data
```javascript
{
    elapsed_time: 120.50,      // seconds
    distance: 485.2,           // meters
    workout_state: 1,          // see WORKOUT_STATES
    rowing_state: 1,           // see ROWING_STATES
    stroke_state: 2,           // see STROKE_STATES
    drag_factor: 115
}
```

### Additional Status Data
```javascript
{
    speed: 4.235,              // m/s
    stroke_rate: 24,           // strokes per minute
    heart_rate: 150,           // beats per minute
    current_pace: 125.5,       // seconds per 500m
    average_pace: 128.2        // seconds per 500m
}
```

### Stroke Data
```javascript
{
    drive_length: 1.25,        // meters
    drive_time: 0.95,          // seconds
    stroke_distance: 8.5,      // meters
    peak_drive_force: 485.2,   // newtons
    average_drive_force: 312.8, // newtons
    work_per_stroke: 285.5,    // joules
    stroke_count: 48
}
```


## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 56+ | ✅ Full | Best support |
| Edge 79+ | ✅ Full | Chromium-based |
| Opera 43+ | ✅ Full | Chromium-based |
| Firefox | ❌ None | No Web Bluetooth support |
| Safari | ❌ None | No Web Bluetooth support |

## PM5 Connection States

### Workout States
- `0`: Waiting to Begin
- `1`: Workout Row
- `2`: Countdown Pause
- `3`: Interval Rest
- `4`: Work Time Interval
- `5`: End of Workout
- `7`: Manual Row

### Rowing States
- `0`: Inactive
- `1`: Active

### Stroke States
- `0`: Waiting for Wheel to Reach Min Speed
- `1`: Waiting for Wheel to Accelerate
- `2`: Driving
- `3`: Dwelling After Drive
- `4`: Recovering

## Testing Instructions

### With a Real PM5 Device

1. **Enable PM5 Bluetooth**:
   - Go to Main Menu → More Options → Turn Wireless On
   - PM5 should show "Bluetooth Smart Ready"

2. **Start the Demo**:
   ```bash
   npm run dev
   # Use ngrok for HTTPS access
   ngrok http 3000
   ```

3. **Test Connection**:
   - Open the ngrok HTTPS URL in Chrome
   - Click "Connect to PM5"
   - Select your PM5 from the list
   - Device info should populate

4. **Test Data Streaming**:
   - Click "Start Data Stream"
   - Begin rowing on the machine
   - Watch real-time data updates in the browser


### Without a PM5 Device

For development without hardware:

1. **Code Structure Testing**:
   - All modules should load without errors
   - UI should be responsive and functional
   - Button states should update correctly

2. **Error Handling**:
   - Test with Bluetooth disabled
   - Test connection timeouts
   - Test with unsupported browsers

## Troubleshooting

### Connection Issues
1. **Bluetooth Not Found**: Ensure PM5 Bluetooth is enabled
2. **Connection Fails**: Try resetting PM5 Bluetooth settings
3. **No Data**: Check that notifications are started
4. **Permission Denied**: Use HTTPS or Chrome flags

### Development Issues
1. **Module Errors**: Ensure you're using a server (not file://)
2. **CORS Errors**: Use the provided Express server
3. **Import Errors**: Check that all files are in correct paths

### PM5 Specific
1. **Device Not Found**: Check PM5 is powered on and Bluetooth enabled
2. **Disconnects Frequently**: Ensure PM5 firmware is up to date
3. **No Workout Data**: Start a workout on the PM5 first

## Performance Considerations

1. **Notification Frequency**: PM5 sends data at ~50Hz, consider throttling UI updates
2. **Memory Usage**: Clear old data regularly for long workouts
3. **Battery Impact**: Bluetooth notifications consume device battery

## Security Notes

- **HTTPS Required**: Web Bluetooth only works over secure connections
- **User Gesture**: Connection must be initiated by user interaction
- **Permissions**: Browser will request permission for each device

## License

MIT License - see project root for details.

