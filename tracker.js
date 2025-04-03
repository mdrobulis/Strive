// Initialize the map
const map = L.map('map').setView([0, 0], 15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Run tracking variables
let runData = {
    positions: [],
    timestamps: [],
    distances: [],
    speeds: [],
    startTime: null,
    pauseTime: null,
    totalPausedTime: 0,
    status: 'stopped' // 'stopped', 'running', 'paused'
};

let positionMarker = null;
let pathLine = null;
let watchId = null;
let updateInterval = null;

// DOM elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusElement = document.getElementById('status');
const statsElement = document.getElementById('stats');

// Event listeners
startBtn.addEventListener('click', startRun);
pauseBtn.addEventListener('click', pauseRun);
resumeBtn.addEventListener('click', resumeRun);
stopBtn.addEventListener('click', stopRun);
downloadBtn.addEventListener('click', downloadData);

// Functions
function startRun() {
    if (runData.status !== 'stopped') return;
    
    runData = {
        positions: [],
        timestamps: [],
        distances: [],
        speeds: [],
        startTime: new Date(),
        pauseTime: null,
        totalPausedTime: 0,
        status: 'running'
    };
    
    statusElement.textContent = "Running...";
    updateButtonStates();
    
    // Start watching position
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            position => {
                const { latitude, longitude } = position.coords;
                const timestamp = new Date();
                
                // Add new position to data
                runData.positions.push([latitude, longitude]);
                runData.timestamps.push(timestamp);
                
                // Calculate distance and speed if we have at least 2 points
                if (runData.positions.length >= 2) {
                    const lastPos = runData.positions[runData.positions.length - 2];
                    const currentPos = runData.positions[runData.positions.length - 1];
                    const distance = calculateDistance(lastPos[0], lastPos[1], currentPos[0], currentPos[1]);
                    runData.distances.push(distance);
                    
                    const timeDiff = (timestamp - runData.timestamps[runData.timestamps.length - 2]) / 1000; // in seconds
                    const speed = distance / (timeDiff / 3600); // km/h
                    runData.speeds.push(speed);
                }
                
                // Update map
                updateMap([latitude, longitude]);
                updateStats();
            },
            error => {
                console.error("Geolocation error:", error);
                statusElement.textContent = "Error getting location: " + error.message;
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );
    } else {
        statusElement.textContent = "Geolocation is not supported by your browser";
    }
    
    // Start updating stats every second
    updateInterval = setInterval(updateStats, 1000);
}

function pauseRun() {
    if (runData.status !== 'running') return;
    
    runData.status = 'paused';
    runData.pauseTime = new Date();
    statusElement.textContent = "Run paused";
    
    // Clear the watch position
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    updateButtonStates();
}

function resumeRun() {
    if (runData.status !== 'paused') return;
    
    // Calculate total paused time
    runData.totalPausedTime += new Date() - runData.pauseTime;
    runData.status = 'running';
    runData.pauseTime = null;
    statusElement.textContent = "Running...";
    
    // Restart watching position
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            position => {
                const { latitude, longitude } = position.coords;
                const timestamp = new Date();
                
                runData.positions.push([latitude, longitude]);
                runData.timestamps.push(timestamp);
                
                if (runData.positions.length >= 2) {
                    const lastPos = runData.positions[runData.positions.length - 2];
                    const currentPos = runData.positions[runData.positions.length - 1];
                    const distance = calculateDistance(lastPos[0], lastPos[1], currentPos[0], currentPos[1]);
                    runData.distances.push(distance);
                    
                    const timeDiff = (timestamp - runData.timestamps[runData.timestamps.length - 2]) / 1000;
                    const speed = distance / (timeDiff / 3600);
                    runData.speeds.push(speed);
                }
                
                updateMap([latitude, longitude]);
                updateStats();
            },
            error => {
                console.error("Geolocation error:", error);
                statusElement.textContent = "Error getting location: " + error.message;
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );
    }
    
    updateButtonStates();
}

function stopRun() {
    runData.status = 'stopped';
    statusElement.textContent = "Run stopped. Ready to start a new run.";
    
    // Clear the watch position
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    // Clear the update interval
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
    
    // Enable download button if we have data
    if (runData.positions.length > 0) {
        downloadBtn.disabled = false;
    }
    
    updateButtonStates();
}

function updateMap(position) {
    // Update or create marker
    if (!positionMarker) {
        positionMarker = L.marker(position).addTo(map);
    } else {
        positionMarker.setLatLng(position);
    }
    
    // Update or create path line
    if (runData.positions.length > 1) {
        if (!pathLine) {
            pathLine = L.polyline(runData.positions, {color: 'blue'}).addTo(map);
        } else {
            pathLine.setLatLngs(runData.positions);
        }
    }
    
    // Center map on current position
    map.setView(position, map.getZoom());
}

function updateStats() {
    if (runData.positions.length === 0) return;
    
    let currentSpeed = 0;
    if (runData.speeds.length > 0) {
        currentSpeed = runData.speeds[runData.speeds.length - 1];
    }
    
    let totalDistance = runData.distances.reduce((sum, dist) => sum + dist, 0);
    
    let elapsedTime = 0;
    if (runData.startTime) {
        elapsedTime = new Date() - runData.startTime - runData.totalPausedTime;
        if (runData.pauseTime) {
            elapsedTime -= new Date() - runData.pauseTime;
        }
    }
    
    // Format time as HH:MM:SS
    const hours = Math.floor(elapsedTime / 3600000);
    const minutes = Math.floor((elapsedTime % 3600000) / 60000);
    const seconds = Math.floor((elapsedTime % 60000) / 1000);
    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    statsElement.textContent = `Speed: ${currentSpeed.toFixed(2)} km/h | Distance: ${totalDistance.toFixed(3)} km | Duration: ${formattedTime}`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula to calculate distance in kilometers
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function downloadData() {
    if (runData.positions.length === 0) return;
    
    // Prepare data for download
    const dataToExport = {
        startTime: runData.startTime,
        endTime: new Date(),
        totalPausedTime: runData.totalPausedTime,
        positions: runData.positions.map((pos, index) => ({
            latitude: pos[0],
            longitude: pos[1],
            timestamp: runData.timestamps[index],
            distance: index > 0 ? runData.distances[index - 1] : 0,
            speed: index > 0 ? runData.speeds[index - 1] : 0
        })),
        totalDistance: runData.distances.reduce((sum, dist) => sum + dist, 0),
        averageSpeed: runData.speeds.length > 0 ? 
            runData.speeds.reduce((sum, speed) => sum + speed, 0) / runData.speeds.length : 0
    };
    
    // Create download link
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `run_data_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function updateButtonStates() {
    startBtn.disabled = runData.status !== 'stopped';
    pauseBtn.disabled = runData.status !== 'running';
    resumeBtn.disabled = runData.status !== 'paused';
    stopBtn.disabled = runData.status === 'stopped';
}