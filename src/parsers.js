/**
 * Data parsing utilities for PM5 Bluetooth characteristics
 */

/**
 * Read 16-bit little-endian integer from DataView
 */
export function readInt16LE(dataView, offset) {
    return dataView.getUint16(offset, true); // true = little endian
}

/**
 * Read 24-bit little-endian integer from DataView
 */
export function readInt24LE(dataView, offset) {
    return dataView.getUint8(offset) + 
           (dataView.getUint8(offset + 1) << 8) + 
           (dataView.getUint8(offset + 2) << 16);
}

/**
 * Read 32-bit little-endian integer from DataView  
 */
export function readInt32LE(dataView, offset) {
    return dataView.getUint32(offset, true); // true = little endian
}

/**
 * Parse general status data (19 bytes)
 * This is the most important characteristic for real-time workout data
 */
export function parseGeneralStatus(dataView, isMultiplexed = false) {
    const offset = isMultiplexed ? 1 : 0;
    
    if (dataView.byteLength < (19 + offset)) {
        throw new Error(`Invalid data length for general status: ${dataView.byteLength}, expected ${19 + offset}`);
    }

    return {
        elapsed_time: readInt24LE(dataView, offset + 0) * 0.01, // centiseconds to seconds
        distance: readInt24LE(dataView, offset + 3) * 0.1,      // decimeters to meters
        workout_type: dataView.getUint8(offset + 6),
        interval_type: dataView.getUint8(offset + 7), 
        workout_state: dataView.getUint8(offset + 8),
        rowing_state: dataView.getUint8(offset + 9),
        stroke_state: dataView.getUint8(offset + 10),
        total_work_distance: readInt24LE(dataView, offset + 11),
        workout_duration: readInt24LE(dataView, offset + 14),
        workout_duration_type: dataView.getUint8(offset + 17),
        drag_factor: dataView.getUint8(offset + 18)
    };
}

/**
 * Parse additional status data (16 bytes)
 * Contains pace, power, calories, heart rate
 */
export function parseAdditionalStatus(dataView, isMultiplexed = false) {
    const offset = isMultiplexed ? 1 : 0;
    
    if (dataView.byteLength < (16 + offset)) {
        throw new Error(`Invalid data length for additional status: ${dataView.byteLength}, expected ${16 + offset}`);
    }

    return {
        elapsed_time: readInt24LE(dataView, offset + 0) * 0.01,
        speed: readInt16LE(dataView, offset + 3) * 0.001,       // mm/s to m/s
        stroke_rate: dataView.getUint8(offset + 5),            // strokes per minute
        heart_rate: dataView.getUint8(offset + 6),             // beats per minute
        current_pace: readInt16LE(dataView, offset + 7) * 0.01, // centiseconds per 500m
        average_pace: readInt16LE(dataView, offset + 9) * 0.01,
        rest_distance: readInt16LE(dataView, offset + 11),
        rest_time: readInt24LE(dataView, offset + 13) * 0.01
    };
}

/**
 * Parse stroke data (20 bytes)
 * Contains detailed per-stroke information
 */
export function parseStrokeData(dataView, isMultiplexed = false) {
    const offset = isMultiplexed ? 1 : 0;
    
    if (dataView.byteLength < (20 + offset)) {
        throw new Error(`Invalid data length for stroke data: ${dataView.byteLength}, expected ${20 + offset}`);
    }

    return {
        elapsed_time: readInt24LE(dataView, offset + 0) * 0.01,
        distance: readInt24LE(dataView, offset + 3) * 0.1,
        drive_length: dataView.getUint8(offset + 6) * 0.01,    // cm to meters
        drive_time: dataView.getUint8(offset + 7) * 0.01,      // centiseconds to seconds  
        stroke_recovery_time: readInt16LE(dataView, offset + 8) * 0.01,
        stroke_distance: readInt16LE(dataView, offset + 10) * 0.01, // cm to meters
        peak_drive_force: readInt16LE(dataView, offset + 12) * 0.1, // newtons
        average_drive_force: readInt16LE(dataView, offset + 14) * 0.1,
        work_per_stroke: readInt16LE(dataView, offset + 16) * 0.1, // joules
        stroke_count: readInt16LE(dataView, offset + 18)
    };
}

/**
 * Parse split/interval data (18 bytes)
 * Contains information when splits or intervals complete
 */
export function parseSplitIntervalData(dataView, isMultiplexed = false) {
    const offset = isMultiplexed ? 1 : 0;
    
    if (dataView.byteLength < (18 + offset)) {
        throw new Error(`Invalid data length for split data: ${dataView.byteLength}, expected ${18 + offset}`);
    }

    return {
        elapsed_time: readInt24LE(dataView, offset + 0) * 0.01,
        distance: readInt24LE(dataView, offset + 3) * 0.1,
        split_time: readInt24LE(dataView, offset + 6) * 0.1,    // deciseconds to seconds
        split_distance: readInt24LE(dataView, offset + 9) * 0.1,
        rest_time: readInt16LE(dataView, offset + 12),
        rest_distance: readInt16LE(dataView, offset + 14),
        split_type: dataView.getUint8(offset + 16),
        split_number: dataView.getUint8(offset + 17)
    };
}

/**
 * Parse multiplexed data
 * PM5 can send multiple data types in a single notification
 */
export function parseMultiplexedData(dataView) {
    const uuid = dataView.getUint8(0);
    
    switch(uuid) {
        case 0x31: // General status
            return {
                type: 'general_status',
                data: parseGeneralStatus(dataView, true)
            };
        case 0x32: // Additional status  
            return {
                type: 'additional_status',
                data: parseAdditionalStatus(dataView, true)
            };
        case 0x35: // Stroke data
            return {
                type: 'stroke_data', 
                data: parseStrokeData(dataView, true)
            };
        case 0x37: // Split data
            return {
                type: 'split_data',
                data: parseSplitIntervalData(dataView, true)
            };
        default:
            console.warn(`Unknown multiplexed UUID: 0x${uuid.toString(16)}`);
            return {
                type: 'unknown',
                uuid: uuid,
                data: null
            };
    }
}

/**
 * Convert DataView to hex string for debugging
 */
export function dataViewToHex(dataView) {
    const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(' ');
}
