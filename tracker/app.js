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
    paces: [],
    startTime: null,
    pauseTime: null,
    totalPausedTime: 0,
    status: 'stopped',
    lastRecordedTime: null,
    backgroundPositions: []
};

let positionMarker = null;
let pathLine = null;
let watchId = null;
let updateInterval = null;
let paceChart = null;

// DOM elements
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusElement = document.getElementById('status');
const currentSpeedElement = document.getElementById('currentSpeed');
const avgSpeedElement = document.getElementById('avgSpeed');
const currentPaceElement = document.getElementById('currentPace');
const distanceElement = document.getElementById('distance');
const durationElement = document.getElementById('duration');

// Page Visibility API
let documentHidden = false;
document.addEventListener('visibilitychange', () => {
    documentHidden = document.hidden;
    if (!documentHidden && runData.backgroundPositions.length > 0) {
        processBackgroundPositions();
    }
});

// Initialize pace chart
function initPaceChart() {
    const ctx = document.getElementById('paceChart').getContext('2d');
    paceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Pace (min/km)',
                data: [],
                borderColor: 'rgb(79, 70, 229)',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    reverse: true,
                    title: {
                        display: true,
                        text: 'min/km'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                }
            }
        }
    });
}

// Update pace chart
function updatePaceChart() {
    if (!paceChart) return;
    
    const labels = runData.timestamps.map((ts, index) => {
        const elapsed = (ts - runData.startTime - runData.totalPausedTime) / 1000;
        return `${Math.floor(elapsed / 60)}:${Math.floor(elapsed % 60).toString().padStart(2, '0')}`;
    });
    
    paceChart.data.labels = labels;
    paceChart.data.datasets[0].data = runData.paces;
    paceChart.update();
}

// Calculate pace (minutes per kilometer)
function calculatePace(speedKmh) {
    if (speedKmh <= 0) return 0;
    const minutesPerKm = 60 / speedKmh;
    const minutes = Math.floor(minutesPerKm);
    const seconds = Math.round((minutesPerKm - minutes) * 60);
    return parseFloat(`${minutes}.${seconds.toString().padStart(2, '0')}`);
}

// Event listeners
startBtn.addEventListener('click', startRun);
pauseBtn.addEventListener('click', pauseRun);
resumeBtn.addEventListener('click', resumeRun);
stopBtn.addEventListener('click', stopRun);
downloadBtn.addEventListener('click', downloadData);

// Initialize the app
initPaceChart();

// [Rest of your existing functions (calculateDistance, calculateSmoothedSpeed, 
// processBackgroundPositions, handlePosition, updateStats, updateMap, 
// startRun, pauseRun, resumeRun, stopRun, downloadData, updateButtonStates)
// with the following modifications:]

// Modified updateStats function
function updateStats() {
    if (runData.positions.length === 0) return;
    
    let currentSpeed = 0;
    let currentPace = 0;
    if (runData.speeds.length > 0) {
        currentSpeed = runData.speeds[runData.speeds.length - 1];
        currentPace = calculatePace(currentSpeed);
        runData.paces.push(currentPace);
    }
    const averageSpeed = calculateSmoothedSpeed();
    
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
    
    // Update DOM elements
    currentSpeedElement.textContent = currentSpeed.toFixed(1);
    avgSpeedElement.textContent = averageSpeed.toFixed(1);
    currentPaceElement.textContent = isFinite(currentPace) ? currentPace.toFixed(2).replace('.', ':') : '0:00';
    distanceElement.textContent = totalDistance.toFixed(2);
    durationElement.textContent = formattedTime;
    
    // Update chart
    updatePaceChart();
}

// Modified startRun function to reset chart
function startRun() {
    if (runData.status !== 'stopped') return;
    
    runData = {
        positions: [],
        timestamps: [],
        distances: [],
        speeds: [],
        paces: [],
        startTime: new Date(),
        pauseTime: null,
        totalPausedTime: 0,
        status: 'running',
        lastRecordedTime: null,
        backgroundPositions: []
    };
    
    statusElement.textContent = "Running...";
    updateButtonStates();
    
    // Reset chart
    if (paceChart) {
        paceChart.data.labels = [];
        paceChart.data.datasets[0].data = [];
        paceChart.update();
    }
    
    // Start watching position
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
            handlePosition,
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
    
    // Request persistent storage (for background GPS collection)
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().then(granted => {
            console.log('Persistent storage granted:', granted);
        });
    }
}